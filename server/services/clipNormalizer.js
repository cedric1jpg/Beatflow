import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

const NORMALIZED_WIDTH  = 1920;
const NORMALIZED_HEIGHT = 1080;
const NORMALIZED_FPS    = 30;

/**
 * Normalize a single uploaded clip to a shared format so it can be safely
 * concatenated with other clips regardless of original resolution, codec,
 * or frame rate.
 *
 * - Scales + pads to 1920x1080 without distortion
 * - Forces 30fps constant frame rate
 * - Re-encodes to H.264 / yuv420p
 * - Strips audio entirely (-an) — the beat audio replaces it later
 *
 * @param {string} inputPath  - absolute path to the raw uploaded clip
 * @param {string} outputPath - absolute path to write the normalized clip
 * @returns {Promise<string>} resolves with outputPath on success
 */
export function normalizeClip(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Clip not found: ${inputPath}`));
    }

    ffmpeg(inputPath)
      .outputOptions([
        '-vf', `scale=${NORMALIZED_WIDTH}:${NORMALIZED_HEIGHT}:force_original_aspect_ratio=decrease,pad=${NORMALIZED_WIDTH}:${NORMALIZED_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
        '-r', String(NORMALIZED_FPS),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-an',                  // strip audio — beat audio replaces it
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log('[clipNormalizer] Starting:', path.basename(inputPath)))
      .on('end', () => {
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
          return reject(new Error(`Normalization produced an invalid file for ${inputPath}`));
        }
        console.log('[clipNormalizer] Done:', path.basename(outputPath));
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[clipNormalizer] Failed:', inputPath, err.message);
        console.error('[clipNormalizer] stderr:', stderr?.slice(-2000));
        reject(new Error(`Could not process clip "${path.basename(inputPath)}": ${err.message}`));
      })
      .run();
  });
}

/**
 * Get the duration of a clip in seconds using ffprobe.
 * @param {string} filePath
 * @returns {Promise<number>}
 */
export function getClipDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata?.format?.duration;
      if (!duration || !isFinite(duration)) {
        return reject(new Error(`Could not read duration for ${filePath}`));
      }
      resolve(parseFloat(duration));
    });
  });
}

/**
 * Normalize a batch of clips in sequence (not parallel — avoids overwhelming
 * CPU on the user's machine with many simultaneous ffmpeg processes).
 *
 * @param {string[]} inputPaths
 * @param {string} outputDir
 * @param {function} onProgress - (current: number, total: number) => void
 * @returns {Promise<Array<{ id: string, path: string, duration: number }>>}
 */
export async function normalizeClipBatch(inputPaths, outputDir, onProgress) {
  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];

  for (let i = 0; i < inputPaths.length; i++) {
    const input = inputPaths[i];
    const id = `clip_${i}_${Date.now()}`;
    const outputPath = path.join(outputDir, `${id}.mp4`);

    onProgress?.(i, inputPaths.length);

    try {
      await normalizeClip(input, outputPath);
      const duration = await getClipDuration(outputPath);
      results.push({ id, path: outputPath, duration });
    } catch (err) {
      console.warn(`[clipNormalizer] Skipping clip ${i} due to error:`, err.message);
      // Skip broken clips rather than failing the entire batch —
      // one corrupt upload shouldn't block the whole montage.
    }
  }

  onProgress?.(inputPaths.length, inputPaths.length);

  if (results.length === 0) {
    throw new Error('None of the uploaded clips could be processed. Please check the file formats and try again.');
  }

  return results;
}
