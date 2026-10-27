import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const ARTWORK_DIR = path.join(TEMP_DIR, 'artwork');

const STALL_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_DURATION_MS = 30 * 60 * 1000;

fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(ARTWORK_DIR, { recursive: true });

/**
 * Resolve the absolute path to ffmpeg/ffprobe binaries.
 * Node child_process does not inherit shell PATH on all platforms.
 */
function resolveBinaryPath(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;

  for (const candidate of [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    `/snap/bin/${name}`,
    `C:\\ffmpeg\\bin\\${exe}`,
    `C:\\ProgramData\\chocolatey\\bin\\${exe}`
  ]) {
    try {
      execFileSync(candidate, ['-version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try next candidate
    }
  }

  const wingetRoot = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(wingetRoot)) {
    for (const entry of fs.readdirSync(wingetRoot)) {
      if (!entry.toLowerCase().includes('ffmpeg')) continue;
      const binDir = path.join(wingetRoot, entry);
      const versionDirs = fs.readdirSync(binDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith('ffmpeg-'))
        .map((d) => path.join(binDir, d.name, 'bin', exe));
      for (const candidate of versionDirs) {
        try {
          execFileSync(candidate, ['-version'], { stdio: 'ignore' });
          return candidate;
        } catch {
          // try next
        }
      }
    }
  }

  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = execFileSync(cmd, [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split(/\r?\n/)[0];
    if (result && fs.existsSync(result)) {
      return result;
    }
  } catch {
    // which failed
  }

  console.warn(`[ffmpeg] Could not locate ${name} binary. Using bare name — may fail.`);
  console.warn('[ffmpeg] Install with: brew install ffmpeg   OR   sudo apt install ffmpeg   OR   winget install ffmpeg');
  return name;
}

export const FFMPEG_PATH = resolveBinaryPath('ffmpeg');
export const FFPROBE_PATH = resolveBinaryPath('ffprobe');

console.log(`[ffmpeg] Binary: ${FFMPEG_PATH}`);
console.log(`[ffprobe] Binary: ${FFPROBE_PATH}`);

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

/**
 * Parse HH:MM:SS.ms timemark into total seconds for manual progress calculation.
 */
function timemarkToSeconds(timemark) {
  if (!timemark || typeof timemark !== 'string') return 0;
  const parts = timemark.split(':').map(parseFloat);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parseFloat(timemark) || 0;
}

function isProgressSpam(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('frame=')
    || trimmed.startsWith('size=')
    || trimmed.startsWith('time=');
}

/**
 * Probe audio duration via ffprobe JSON output before encoding starts.
 */
export async function getAudioDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(FFPROBE_PATH, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ]);
    const info = JSON.parse(stdout);
    const duration = parseFloat(info?.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Invalid duration');
    }
    return duration;
  } catch (err) {
    console.warn('[ffprobe] Could not read duration:', err.message);
    return 0;
  }
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function formatArtistLine(artistA, artistB) {
  const left = artistA || 'Artist A';
  const right = artistB ? ` x ${artistB}` : '';
  return `${left}${right} Type Beat`;
}

function formatKey(key, scale) {
  return `${key || 'C'} ${scale || 'Minor'}`.trim();
}

function drawGlow(context, width, height) {
  const glow = context.createRadialGradient(width * 0.72, height * 0.3, 60, width * 0.72, height * 0.3, 460);
  glow.addColorStop(0, 'rgba(168, 85, 247, 0.42)');
  glow.addColorStop(0.5, 'rgba(124, 58, 237, 0.18)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawWaveform(context, width, height) {
  context.save();
  context.translate(0, height * 0.72);
  context.strokeStyle = 'rgba(124, 58, 237, 0.58)';
  context.lineWidth = 4;
  for (let index = 0; index < 90; index += 1) {
    const x = 160 + index * 16;
    const barHeight = 40 + Math.abs(Math.sin(index * 0.42)) * 130 + (index % 7) * 12;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, -barHeight);
    context.stroke();
  }
  context.restore();
}

async function createDefaultArtwork(metadata = {}) {
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const width = 1920;
    const height = 1080;
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#06060b');
    background.addColorStop(0.5, '#10111a');
    background.addColorStop(1, '#09090f');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    drawGlow(context, width, height);
    drawWaveform(context, width, height);

    context.fillStyle = 'rgba(17, 17, 24, 0.82)';
    roundRect(context, 130, 170, width - 260, height - 340, 42);
    context.fill();

    context.strokeStyle = 'rgba(255,255,255,0.08)';
    context.lineWidth = 2;
    roundRect(context, 130, 170, width - 260, height - 340, 42);
    context.stroke();

    context.fillStyle = '#f8fafc';
    context.font = 'bold 96px sans-serif';
    context.fillText(metadata.beatName || 'Untitled Beat', 220, 390);

    context.fillStyle = '#cbd5e1';
    context.font = 'bold 56px sans-serif';
    context.fillText(formatArtistLine(metadata.artistA, metadata.artistB), 220, 495);

    context.fillStyle = '#7dd3fc';
    context.font = '44px sans-serif';
    context.fillText(`${metadata.bpm || '---'} BPM • ${formatKey(metadata.key, metadata.scale)}`, 220, 580);

    context.fillStyle = '#a855f7';
    context.font = '36px sans-serif';
    context.fillText(metadata.producerTag || 'Prod. by Beatflow', 220, 650);

    context.fillStyle = 'rgba(6, 182, 212, 0.18)';
    context.beginPath();
    context.arc(width - 360, 320, 230, 0, Math.PI * 2);
    context.fill();

    const artworkPath = path.join(ARTWORK_DIR, `beatflow-art-${Date.now()}.jpg`);
    fs.writeFileSync(artworkPath, canvas.toBuffer('image/jpeg'));
    return artworkPath;
  } catch (canvasErr) {
    console.warn('[ffmpeg] Canvas artwork failed, using fallback image:', canvasErr.message);
    return writeMinimalFallbackImage();
  }
}

function writeMinimalFallbackImage() {
  const fallback = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARC' +
    'AABAAEDASIA/8QAFgABAQEAAAAAAAAAAAAAAAAABQMG/8QAIRABAAICAgIDAAAAAAAAAAAAAQIDBBESITFBUWH/xAAWAQEBAQAAAAAAAAAAAAAAAAADBAX/xAAZ' +
    'EQEBAQEBAQAAAAAAAAAAAAABAgMREiH/2gAMAwEAAhEDEQA/ALt5bFqulzGW1k61atdnJSpTrGMYxlKUpSgACoqKAAAAAAAAAAAAAAAAAAAA//Z',
    'base64'
  );
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const fallbackPath = path.join(ASSETS_DIR, 'default-visualizer.jpg');
  if (!fs.existsSync(fallbackPath)) {
    fs.writeFileSync(fallbackPath, fallback);
  }
  return fallbackPath;
}

async function resolveImage(customImagePath, metadata) {
  if (customImagePath && fs.existsSync(customImagePath)) {
    return customImagePath;
  }

  const defaultJpg = path.join(ASSETS_DIR, 'default-visualizer.jpg');
  const defaultPng = path.join(ASSETS_DIR, 'default-visualizer.png');
  if (fs.existsSync(defaultJpg)) return defaultJpg;
  if (fs.existsSync(defaultPng)) return defaultPng;

  return createDefaultArtwork(metadata);
}

/**
 * Convert audio to YouTube-ready MP4 with a static image backdrop.
 */
export async function convertBeatToVideo(audioPath, imagePath, outputPath, metadata, onProgress) {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const emit = (percent, label, status = 'converting') => {
    if (onProgress) {
      onProgress({ percent, label, status });
    }
  };

  emit(2, 'Analysing audio...');
  const totalDuration = await getAudioDuration(audioPath);
  console.log('[ffmpeg] Audio duration:', totalDuration, 'seconds');

  const artworkPath = await resolveImage(imagePath, metadata);
  console.log('[ffmpeg] Using image:', artworkPath);
  console.log('[ffmpeg] Input audio:', audioPath);
  console.log('[ffmpeg] Output path:', outputPath);

  emit(5, 'Starting conversion...');

  await new Promise((resolve, reject) => {
    let progressReceived = false;
    let lastPercent = 5;
    let syntheticHeartbeat;
    let stallWatchdog = null;
    let absoluteTimer = null;
    let conversionDone = false;
    let stderrCapture = [];
    let cmd;

    const resetStallWatchdog = () => {
      clearTimeout(stallWatchdog);
      if (conversionDone) return;
      stallWatchdog = setTimeout(() => {
        if (!conversionDone) {
          cmd.kill('SIGKILL');
          const msg = 'Conversion stalled — no output for 3 minutes. '
            + 'Check that ffmpeg is installed correctly: run `ffmpeg -version` in your terminal.';
          reject(new Error(msg));
        }
      }, STALL_TIMEOUT_MS);
    };

    const finishTimers = () => {
      conversionDone = true;
      clearInterval(syntheticHeartbeat);
      clearTimeout(stallWatchdog);
      clearTimeout(absoluteTimer);
    };

    syntheticHeartbeat = setInterval(() => {
      if (!progressReceived && lastPercent < 90) {
        lastPercent = Math.min(lastPercent + 5, 90);
        emit(lastPercent, 'Converting...');
        resetStallWatchdog();
      }
    }, 2000);

    absoluteTimer = setTimeout(() => {
      if (!conversionDone) {
        cmd.kill('SIGKILL');
        reject(new Error('Conversion exceeded 30 minutes. The file may be extremely long or the system is overloaded.'));
      }
    }, MAX_DURATION_MS);

    resetStallWatchdog();

    cmd = ffmpeg()
      .input(artworkPath)
      .inputOptions(['-loop 1', '-framerate 1'])
      .input(audioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('192k')
      .outputOptions([
        '-preset ultrafast',
        '-crf 23',
        '-tune stillimage',
        '-pix_fmt yuv420p',
        '-profile:v baseline',
        '-level 3.1',
        '-vf scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
        '-r 1',
        '-movflags +faststart',
        '-shortest'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('[ffmpeg] Command:', commandLine);
        emit(8, 'Encoding video...');
        resetStallWatchdog();
      })
      .on('stderr', (stderrLine) => {
        stderrCapture.push(stderrLine);
        if (!isProgressSpam(stderrLine)) {
          console.log('[ffmpeg stderr]', stderrLine);
        }
        resetStallWatchdog();
      })
      .on('progress', (progress) => {
        progressReceived = true;
        clearInterval(syntheticHeartbeat);
        resetStallWatchdog();

        let percent;
        if (totalDuration > 0 && progress.timemark) {
          const elapsed = timemarkToSeconds(progress.timemark);
          percent = Math.min(Math.floor((elapsed / totalDuration) * 92) + 8, 98);
        } else if (progress.percent && Number.isFinite(progress.percent)) {
          percent = Math.min(Math.floor(progress.percent), 98);
        } else {
          percent = lastPercent;
        }

        if (percent > lastPercent) {
          lastPercent = percent;
          emit(percent, `Encoding... ${percent}%`);
        }
      })
      .on('end', () => {
        finishTimers();

        if (!fs.existsSync(outputPath)) {
          reject(new Error('ffmpeg reported success but output file was not created.'));
          return;
        }

        const stats = fs.statSync(outputPath);
        if (stats.size < 10000) {
          reject(new Error(`Output file is too small (${stats.size} bytes). Conversion may have failed.`));
          return;
        }

        console.log('[ffmpeg] Done. Output size:', stats.size, 'bytes');
        emit(100, 'Done');
        resolve();
      })
      .on('error', (err, _stdout, stderr) => {
        finishTimers();
        const lastStderr = stderrCapture.slice(-10).join('\n');
        const fullMessage = `Conversion failed: ${err.message}\n\nffmpeg output:\n${lastStderr || stderr || ''}`;
        console.error('[ffmpeg] Full error context:\n', fullMessage);
        const isMissingFfmpeg = err.message?.includes('Cannot find ffmpeg') || err.message?.includes('ENOENT');
        const hint = isMissingFfmpeg
          ? ' FFmpeg binary not found. Please install ffmpeg and make sure it is in your system PATH (macOS: brew install ffmpeg | Windows: winget install ffmpeg | Linux: sudo apt install ffmpeg).'
          : '';
        reject(new Error(`Conversion failed: ${err.message}.${hint}`));
      });

    cmd.run();
  });

  return { outputPath, duration: totalDuration, artworkPath };
}

export function tempFilePath(ext) {
  return path.join(TEMP_DIR, `${randomUUID()}${ext}`);
}

export function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}
