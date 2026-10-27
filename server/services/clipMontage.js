import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { buildClipSequence, calculateSegmentPlan } from './clipSequencer.js';
import { normalizeClipBatch } from './clipNormalizer.js';

const SEGMENT_LENGTH_SECONDS = 5; // default; could later be exposed as a user setting

/**
 * Build a single segment file: a chunk of the given clip exactly `duration` 
 * seconds long, looping the source clip internally if it's shorter than needed.
 *
 * @param {string} clipPath    - normalized clip to pull from
 * @param {number} clipDuration - known duration of the source clip, in seconds
 * @param {number} segmentDuration - desired output duration for this segment
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
function buildSegment(clipPath, clipDuration, segmentDuration, outputPath) {
  return new Promise((resolve, reject) => {
    const needsLoop = clipDuration < segmentDuration;

    const cmd = ffmpeg(clipPath);

    if (needsLoop) {
      // -stream_loop -1 loops the input indefinitely; -t caps the output duration
      cmd.inputOptions(['-stream_loop', '-1']);
    }

    cmd
      .outputOptions([
        '-t', String(segmentDuration),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-an',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Segment build failed for ${clipPath}: ${err.message}`)))
      .run();
  });
}

/**
 * Concatenate an ordered list of segment files using the ffmpeg concat demuxer.
 * This step is fast because all segments already share an identical format
 * (guaranteed by normalization in Task 2) — no re-encoding happens here.
 *
 * @param {string[]} segmentPaths - in final playback order
 * @param {string} outputPath
 * @param {string} tempDir - for the concat list file
 * @returns {Promise<string>}
 */
function concatSegments(segmentPaths, outputPath, tempDir) {
  return new Promise((resolve, reject) => {
    const listFile = path.join(tempDir, `concat_list_${Date.now()}.txt`);
    const listContent = segmentPaths
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`) // escape single quotes for ffmpeg concat syntax
      .join('\n');
    fs.writeFileSync(listFile, listContent);

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy']) // no re-encode — segments already match format
      .output(outputPath)
      .on('end', () => {
        fs.unlinkSync(listFile);
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
        reject(new Error(`Concatenation failed: ${err.message}`));
      })
      .run();
  });
}

/**
 * Mux the beat audio onto the silent video montage, trimming the video to
 * match the beat's exact duration (videos built from fixed-length segments
 * will rarely land on an exact match without this trim).
 *
 * @param {string} silentVideoPath
 * @param {string} audioPath
 * @param {number} targetDuration
 * @param {string} outputPath
 * @returns {Promise<string>}
 */
function muxAudio(silentVideoPath, audioPath, targetDuration, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(silentVideoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v', 'copy',         // video already correctly encoded — just copy
        '-c:a', 'aac',
        '-b:a', '320k',
        '-t', String(targetDuration),
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Audio mux failed: ${err.message}`)))
      .run();
  });
}

/**
 * Full pipeline: raw clip uploads + beat audio -> final montage MP4.
 *
 * @param {object} opts
 * @param {string[]} opts.clipPaths   - raw uploaded clip file paths
 * @param {string}   opts.audioPath   - beat audio file path
 * @param {number}   opts.beatDuration - total duration to fill, in seconds
 * @param {string}   opts.workDir     - scratch directory for intermediate files
 * @param {string}   opts.outputPath  - final MP4 destination
 * @param {function} opts.onProgress  - (percent: number, label: string) => void
 * @returns {Promise<{ outputPath: string, skippedClips: string[] }>}
 */
export async function buildClipMontage({ clipPaths, audioPath, beatDuration, workDir, outputPath, onProgress }) {
  fs.mkdirSync(workDir, { recursive: true });

  // --- Step 1: Normalize all clips ---
  onProgress?.(5, 'Preparing clips...');
  const normalized = await normalizeClipBatch(
    clipPaths,
    path.join(workDir, 'normalized'),
    (i, total) => onProgress?.(5 + Math.floor((i / total) * 25), `Preparing clip ${i + 1} of ${total}...`)
  );

  const skippedCount = clipPaths.length - normalized.length;
  const skippedClips = skippedCount > 0 ? [`${skippedCount} clip(s) could not be processed and were skipped.`] : [];

  // --- Step 2: Build the sequence plan ---
  onProgress?.(32, 'Planning sequence...');
  const { segmentCount, finalSegmentDuration } = calculateSegmentPlan(beatDuration, SEGMENT_LENGTH_SECONDS);
  const clipIds = normalized.map(c => c.id);
  const sequence = buildClipSequence(clipIds, beatDuration, SEGMENT_LENGTH_SECONDS);
  const clipById = Object.fromEntries(normalized.map(c => [c.id, c]));

  // --- Step 3: Render each segment ---
  onProgress?.(35, 'Building segments...');
  const segmentDir = path.join(workDir, 'segments');
  fs.mkdirSync(segmentDir, { recursive: true });
  const segmentPaths = [];

  for (let i = 0; i < sequence.length; i++) {
    const clipId = sequence[i];
    const clip = clipById[clipId];
    const isLastSegment = i === sequence.length - 1;
    const segmentDuration = isLastSegment ? finalSegmentDuration : SEGMENT_LENGTH_SECONDS;

    const segOutput = path.join(segmentDir, `seg_${String(i).padStart(4, '0')}.mp4`);
    await buildSegment(clip.path, clip.duration, segmentDuration, segOutput);
    segmentPaths.push(segOutput);

    const pct = 35 + Math.floor(((i + 1) / sequence.length) * 40);
    onProgress?.(pct, `Building segment ${i + 1} of ${sequence.length}...`);
  }

  // --- Step 4: Concatenate all segments (fast — no re-encode) ---
  onProgress?.(78, 'Joining segments...');
  const silentMontagePath = path.join(workDir, 'silent_montage.mp4');
  await concatSegments(segmentPaths, silentMontagePath, workDir);

  // --- Step 5: Mux in the beat audio, trim to exact duration ---
  onProgress?.(90, 'Adding audio...');
  await muxAudio(silentMontagePath, audioPath, beatDuration, outputPath);

  onProgress?.(100, 'Done');

  // --- Cleanup intermediate files ---
  cleanupDir(segmentDir);
  cleanupDir(path.join(workDir, 'normalized'));
  safeUnlink(silentMontagePath);

  return { outputPath, skippedClips };
}

function cleanupDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(f => fs.unlinkSync(path.join(dir, f)));
      fs.rmdirSync(dir);
    }
  } catch (err) {
    console.warn('[clipMontage] Cleanup warning:', err.message);
  }
}

function safeUnlink(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
}
