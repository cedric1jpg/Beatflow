import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { convertBeatToVideo, cleanupFile, getAudioDuration } from '../services/ffmpeg.js';
import { sanitizeText } from '../services/metadata.js';
import { buildClipMontage } from '../services/clipMontage.js';
import { applyTextOverlay, buildOverlayData } from '../services/textOverlay.js';
import { getProfile } from '../services/profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const tempDir = path.join(rootDir, 'temp');
const uploadDir = path.join(tempDir, 'uploads');
const videoDir = path.join(tempDir, 'videos');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

const router = Router();

function makeError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const suffix = `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
      cb(null, suffix);
    }
  }),
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE_MB || 200) * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const audioOk = ['.mp3', '.wav', '.flac', '.aiff'].includes(ext)
      && (file.mimetype.startsWith('audio/') || ext === '.mp3' || ext === '.wav');
    const imageOk = ['.jpg', '.jpeg', '.png'].includes(ext)
      && (file.mimetype.startsWith('image/') || ext === '.jpg' || ext === '.jpeg' || ext === '.png');
    const videoOk = ['.mp4', '.mov', '.webm'].includes(ext)
      && (file.mimetype.startsWith('video/') || ext === '.mp4' || ext === '.mov' || ext === '.webm');
    if (audioOk || imageOk || videoOk) {
      cb(null, true);
      return;
    }
    cb(makeError(`Unsupported file type: ${ext}. Allowed audio: .mp3, .wav, .flac, .aiff. Allowed video: .mp4, .mov, .webm`, 'UNSUPPORTED_FILE_TYPE', 415));
  }
});

function getBeatData(body) {
  const genres = Array.isArray(body.genres) ? body.genres : body.genres ? [body.genres] : [];
  return {
    beatName: sanitizeText(body.beatName),
    bpm: Number(body.bpm || 0),
    key: sanitizeText(body.key),
    scale: body.scale === 'major' ? 'Major' : 'Minor',
    artistA: sanitizeText(body.artistA),
    artistB: sanitizeText(body.artistB),
    genreTags: genres.map(sanitizeText).filter(Boolean),
    licenseType: sanitizeText(body.licenseType || 'Free'),
    beatstarsLink: sanitizeText(body.beatstarsLink),
    producerTag: sanitizeText(body.producerTag || 'Prod. by Beatflow')
  };
}

/**
 * Applies optional text overlay to a generated MP4 if requested.
 * Falls back to the raw video if font rendering or drawtext encounters an issue.
 */
async function applyOverlayIfEnabled({ inputPath, beatData, body, channel }) {
  const overlayEnabled = body.overlayEnabled !== 'false';
  if (!overlayEnabled) {
    return { outputPath: inputPath, outputFile: path.basename(inputPath) };
  }

  try {
    const profile = getProfile();
    const theme = body.overlayTheme || 'dark';
    const overlayData = buildOverlayData(body, profile, theme);
    const overlayOutputPath = inputPath.replace('.mp4', '_overlay.mp4');

    await applyTextOverlay({
      inputPath,
      outputPath: overlayOutputPath,
      overlayData,
      onProgress: (percent, label) => {
        channel.publish('progress', {
          status: 'converting',
          progress: percent,
          label,
          beatData
        });
      }
    });

    cleanupFile(inputPath);
    return { outputPath: overlayOutputPath, outputFile: path.basename(overlayOutputPath) };
  } catch (err) {
    console.warn('[upload] Text overlay skipped:', err.message);
    channel.publish('warning', {
      message: `Text overlay could not be applied (${err.message}). Defaulting to video without overlay.`
    });
    return { outputPath: inputPath, outputFile: path.basename(inputPath) };
  }
}

router.post('/', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'clips', maxCount: 20 }
]), async (req, res, next) => {
  try {
    const audioFile = req.files?.audio?.[0];
    if (!audioFile) {
      throw makeError('Audio file is required', 'AUDIO_FILE_REQUIRED');
    }

    const beatData = getBeatData(req.body);
    if (!beatData.beatName || !beatData.artistA || !beatData.bpm || !beatData.key) {
      throw makeError('Missing required beat metadata', 'VALIDATION_ERROR');
    }

    const jobId = crypto.randomUUID();
    const channel = req.jobHub.create(jobId);
    const thumbnailFile = req.files?.thumbnail?.[0] || null;
    const clipFiles = req.files?.clips ?? [];
    const outputPath = path.join(videoDir, `${jobId}.mp4`);

    channel.publish('progress', { status: 'converting', progress: 2, label: 'Queued...', beatData });

    if (clipFiles.length > 0) {
      // Montage pipeline: multiple artist clips stitched together
      const beatDuration = await getAudioDuration(audioFile.path);
      const workDir = path.join(tempDir, `montage_${Date.now()}`);

      buildClipMontage({
        clipPaths: clipFiles.map((f) => f.path),
        audioPath: audioFile.path,
        beatDuration,
        workDir,
        outputPath,
        onProgress: (percent, label) => {
          channel.publish('progress', {
            status: 'converting',
            progress: percent,
            label,
            beatData
          });
        }
      })
        .then(async ({ outputPath: montageOutput, skippedClips }) => {
          if (skippedClips.length > 0) {
            channel.publish('warning', { message: skippedClips.join(' ') });
          }

          const final = await applyOverlayIfEnabled({
            inputPath: montageOutput,
            beatData,
            body: req.body,
            channel
          });

          channel.publish('complete', {
            status: 'ready',
            progress: 100,
            label: 'Done',
            beatData,
            audioPath: audioFile.path,
            thumbnailPath: thumbnailFile?.path || null,
            outputPath: final.outputPath,
            outputFile: final.outputFile,
            duration: beatDuration
          });

          cleanupFile(audioFile.path);
          clipFiles.forEach((f) => cleanupFile(f.path));
          if (thumbnailFile) cleanupFile(thumbnailFile.path);
        })
        .catch((error) => {
          console.error('[upload] Montage rendering error:', error.message);
          channel.publish('error', {
            error: error.message,
            code: error.code || 'MONTAGE_FAILED',
            beatData
          });
          cleanupFile(audioFile.path);
          clipFiles.forEach((f) => cleanupFile(f.path));
          if (thumbnailFile) cleanupFile(thumbnailFile.path);
          cleanupFile(outputPath);
        });
    } else {
      // Static visualizer pipeline: audio + artwork/backdrop
      convertBeatToVideo(
        audioFile.path,
        thumbnailFile?.path || null,
        outputPath,
        beatData,
        ({ percent, label }) => {
          channel.publish('progress', {
            status: 'converting',
            progress: percent,
            label,
            beatData
          });
        }
      )
        .then(async ({ duration, artworkPath }) => {
          const final = await applyOverlayIfEnabled({
            inputPath: outputPath,
            beatData,
            body: req.body,
            channel
          });

          channel.publish('complete', {
            status: 'ready',
            progress: 100,
            label: 'Done',
            beatData,
            audioPath: audioFile.path,
            thumbnailPath: thumbnailFile?.path || artworkPath,
            outputPath: final.outputPath,
            outputFile: final.outputFile,
            duration
          });

          cleanupFile(audioFile.path);
          if (thumbnailFile) cleanupFile(thumbnailFile.path);
        })
        .catch((error) => {
          console.error('[upload] Video conversion error:', error.message);
          channel.publish('error', {
            error: error.message,
            code: error.code || 'FFMPEG_FAILED',
            beatData
          });
          cleanupFile(audioFile.path);
          if (thumbnailFile) cleanupFile(thumbnailFile.path);
          cleanupFile(outputPath);
        });
    }

    res.json({ jobId, status: 'queued', beatData });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs/:jobId', (req, res) => {
  const channel = req.jobHub.get(req.params.jobId);
  if (!channel) {
    return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  }
  res.json(channel.state);
});

/**
 * Stream a converted MP4 from temp/ for in-browser preview.
 */
router.get('/preview/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.resolve(videoDir, filename);

  if (!filePath.startsWith(path.resolve(videoDir))) {
    return res.status(403).json({ error: 'Access denied', code: 'ACCESS_DENIED' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' });
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(filePath).pipe(res);
});

export default router;
