import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');
const FONTCONFIG_DIR = path.join(ROOT, 'fontconfig');
const FONTCONFIG_FILE = path.join(FONTCONFIG_DIR, 'fonts.conf');
const FONTCONFIG_CACHE_DIR = path.join(ROOT, 'temp', 'fontconfig-cache');

fs.mkdirSync(FONTCONFIG_CACHE_DIR, { recursive: true });

if (!process.env.FONTCONFIG_FILE && fs.existsSync(FONTCONFIG_FILE)) {
  process.env.FONTCONFIG_FILE = FONTCONFIG_FILE;
}

if (!process.env.FONTCONFIG_PATH && fs.existsSync(FONTCONFIG_FILE)) {
  process.env.FONTCONFIG_PATH = FONTCONFIG_DIR;
}

// ── Font paths ─────────────────────────────────────────────────────────────────
// Absolute paths to bundled TTF files in assets/fonts/.
// Run "npm run setup:fonts" if either file is missing.
//
// Anton-Regular  → beat name (heavy, condensed — high readability over video)
// Raleway variable → producer tag, selected at bold weight via fontconfig
const FONT_PATHS = {
  beatName:    path.join(FONTS_DIR, 'Anton-Regular.ttf'),
  producerTag: path.join(FONTS_DIR, 'Raleway-Bold.ttf'),
};

/**
 * Verify both required fonts exist before attempting any render.
 * Throws with a clear actionable message if they are missing.
 */
export function assertFontsExist() {
  for (const [role, fontPath] of Object.entries(FONT_PATHS)) {
    if (!fs.existsSync(fontPath)) {
      throw new Error(
        `[textOverlay] Required font missing (${role}): ${fontPath}\n` +
        `Run "npm run setup:fonts" to download the required fonts, then try again.\n` +
        `Expected: Anton-Regular.ttf and Raleway-Bold.ttf in assets/fonts/`
      );
    }
  }
}

// Pixel metrics for standard 1080p (1920x1080) video output
const SIZE_BEAT_NAME = 200;
const SIZE_PRODUCER_TAG = 58;
const PRODUCER_TAG_Y_OFFSET = 80;

/**
 * Escapes characters that have special syntactic meaning inside ffmpeg drawtext filters:
 * colons, quotes, slashes, brackets, and format percentage symbols.
 */
function escapeDrawtext(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%');
}

function formatFfmpegPath(filePath) {
  return String(filePath)
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, '$1\\:');
}

/**
 * Dynamically scales down font size for long titles so they do not clip off frame edges.
 */
function calculateSafeFontSize(text, desiredSize, frameWidth = 1920) {
  if (!text || text.length === 0) return desiredSize;

  const AVG_CHAR_WIDTH_RATIO = 0.52; // Approximate width-to-height ratio for Anton condensed
  const SAFETY_MARGIN = 0.88; // Keep within central 88% of screen
  const MAX_TEXT_WIDTH = frameWidth * SAFETY_MARGIN;

  const estimatedWidth = text.length * desiredSize * AVG_CHAR_WIDTH_RATIO;
  if (estimatedWidth <= MAX_TEXT_WIDTH) {
    return desiredSize;
  }

  const scaledSize = Math.floor(MAX_TEXT_WIDTH / (text.length * AVG_CHAR_WIDTH_RATIO));
  const MINIMUM_SIZE = 80; // Keep readable floor
  return Math.max(scaledSize, MINIMUM_SIZE);
}

function buildOverlayFiltergraph(overlay) {
  // escapeDrawtext() handles: \ ' : [ ] % — do not bypass it
  const beatName    = escapeDrawtext(overlay.beatName    || 'UNTITLED');
  const producerTag = escapeDrawtext(overlay.producerTag || '');

  // Calculate safe font size — scales down automatically for long beat names
  // to prevent text from overflowing the frame edges at large sizes.
  // Uses raw (unescaped) beat name for character count accuracy.
  const safeBeatNameSize = calculateSafeFontSize(
    overlay.beatName || 'UNTITLED',  // raw value — length measurement, not filter string
    SIZE_BEAT_NAME                   // 200px target
  );

  // Font file paths — absolute, confirmed present before this function is called
  const fontBeat = formatFfmpegPath(FONT_PATHS.beatName);
  const fontTag  = formatFfmpegPath(FONT_PATHS.producerTag);

  const filters = [];

  // ──────────────────────────────────────────────────────────────────────────
  // ELEMENT 1: BEAT NAME — 17 drawtext nodes (16 glow + 1 solid)
  // Render order: outermost glow first → inner glow → solid text last
  // ──────────────────────────────────────────────────────────────────────────

  // Helper: build one drawtext node for the beat name
  // dx, dy = pixel offset from center; alpha = opacity (0.0–1.0 or 'white')
  const beatNode = (dx, dy, color) =>
    `drawtext=fontfile='${fontBeat}':text='${beatName}':fontsize=${safeBeatNameSize}:` +
    `fontcolor=${color}:x=(w-text_w)/2${dx >= 0 ? '+' : ''}${dx}:y=(h-text_h)/2${dy >= 0 ? '+' : ''}${dy}`;

  // Layer 1 — outermost spread (8px, very transparent)
  filters.push(beatNode(+8, +8, 'white@0.08'));
  filters.push(beatNode(-8, -8, 'white@0.08'));
  filters.push(beatNode(+8, -8, 'white@0.08'));
  filters.push(beatNode(-8, +8, 'white@0.08'));

  // Layer 2 — mid glow (5px)
  filters.push(beatNode(+5, +5, 'white@0.15'));
  filters.push(beatNode(-5, -5, 'white@0.15'));
  filters.push(beatNode(+5, -5, 'white@0.15'));
  filters.push(beatNode(-5, +5, 'white@0.15'));

  // Layer 3 — inner glow (3px)
  filters.push(beatNode(+3, +3, 'white@0.25'));
  filters.push(beatNode(-3, -3, 'white@0.25'));
  filters.push(beatNode(-3, +3, 'white@0.25'));
  filters.push(beatNode(+3, -3, 'white@0.25'));

  // Layer 4 — tight glow (1px, near-solid edge)
  filters.push(beatNode(+1, +1, 'white@0.60'));
  filters.push(beatNode(-1, -1, 'white@0.60'));
  filters.push(beatNode(+1, -1, 'white@0.60'));
  filters.push(beatNode(-1, +1, 'white@0.60'));

  // Layer 5 — solid white text, drawn last (sits on top of all glow layers)
  filters.push(beatNode(0, 0, 'white'));

  // ──────────────────────────────────────────────────────────────────────────
  // ELEMENT 2: PRODUCER TAG — 3 drawtext nodes (2 glow + 1 solid)
  // Only added if a non-empty producer tag was provided.
  // Y position: h - SIZE_PRODUCER_TAG - PRODUCER_TAG_Y_OFFSET
  // ──────────────────────────────────────────────────────────────────────────
  if (overlay.producerTag) {
    const tagY = `h-${SIZE_PRODUCER_TAG + PRODUCER_TAG_Y_OFFSET}`;

    const tagNode = (dx, dy, color) =>
      `drawtext=fontfile='${fontTag}':text='${producerTag}':fontsize=${SIZE_PRODUCER_TAG}:` +
      `fontcolor=${color}:x=(w-text_w)/2${dx >= 0 ? '+' : ''}${dx}:y=${tagY}${dy >= 0 ? '+' : ''}${dy}`;

    // Subtle glow (2 offset nodes)
    filters.push(tagNode(+3, +3, 'white@0.20'));
    filters.push(tagNode(-3, -3, 'white@0.20'));

    // Solid tag text at 85% opacity
    filters.push(tagNode(0, 0, 'white@0.85'));
  }

  // Join all nodes with commas — this is the complete -vf string
  return filters.join(',');
}

/**
 * Apply the beat text overlay to an already-assembled montage video.
 * This is the FINAL step in the video pipeline — called after
 * buildClipMontage() or convertBeatToVideo() has produced a finished MP4.
 *
 * @param {object} opts
 * @param {string}   opts.inputPath    - path to the assembled montage MP4
 * @param {string}   opts.outputPath   - path for the final output with text
 * @param {object}   opts.overlayData  - { beatName, artistLine, metaLine, producerTag, theme }
 * @param {function} [opts.onProgress] - (percent: number, label: string) => void
 * @returns {Promise<string>} resolves with outputPath on success
 */
export async function applyTextOverlay({ inputPath, outputPath, overlayData, onProgress }) {
  assertFontsExist();

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input video not found for text overlay: ${inputPath}`);
  }

  onProgress?.(2, 'Applying text overlay...');

  const filtergraph = buildOverlayFiltergraph(overlayData);

  return new Promise((resolve, reject) => {
    let stderrLines = [];

    ffmpeg(inputPath)
      .outputOptions([
        '-vf', filtergraph,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',         // audio passthrough — no quality loss
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', (cmd) => {
        console.log('[textOverlay] Starting render');
        onProgress?.(5, 'Rendering text overlay...');
      })
      .on('stderr', (line) => {
        stderrLines.push(line);
        // Only log non-progress lines
        if (!line.startsWith('frame=') && !line.startsWith('size=')) {
          console.log('[textOverlay stderr]', line);
        }
      })
      .on('progress', (p) => {
        if (p.percent && isFinite(p.percent)) {
          const pct = Math.min(Math.floor(p.percent), 98);
          onProgress?.(pct, `Rendering text... ${pct}%`);
        }
      })
      .on('end', () => {
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 5000) {
          const lastStderr = stderrLines.slice(-15).join('\n');
          return reject(new Error(`Text overlay render produced invalid output.\n\nffmpeg stderr:\n${lastStderr}`));
        }
        console.log('[textOverlay] Done:', outputPath);
        onProgress?.(100, 'Done');
        resolve(outputPath);
      })
      .on('error', (err) => {
        const lastStderr = stderrLines.slice(-20).join('\n');
        console.error('[textOverlay] Error:', err.message);
        console.error('[textOverlay] stderr:\n', lastStderr);

        // Surface a human-readable hint for the most common failure
        let hint = err.message;
        if (lastStderr.includes('No such file') && lastStderr.includes('font')) {
          hint = 'Font file not found. Run "npm run setup:fonts" and try again.';
        } else if (lastStderr.includes('Invalid argument') || lastStderr.includes('drawtext')) {
          hint = 'Text overlay filter failed. This may be caused by special characters in the beat name or artist name. Check the ffmpeg stderr above for the exact filter that failed.';
        }

        reject(new Error(hint));
      })
      .run();
  });
}

/**
 * Build the overlayData object from the beat's form fields.
 * Handles missing fields gracefully — every field is optional,
 * but at minimum the beat name should be present.
 *
 * @param {object} beatData - fields from the upload form
 * @param {object} profile  - producer profile (from getProfile())
 * @param {string} theme    - 'dark' | 'light' | 'accent'
 * @returns {object} overlayData
 */
export function buildOverlayData(beatData, profile = {}, theme = 'dark') {
  const { beatName, artistA, artistB, bpm, key, keyType, producerTag, genres } = beatData;

  const artistLine = artistA
    ? artistB
      ? `${artistA} x ${artistB} Type Beat`
      : `${artistA} Type Beat`
    : '';

  const keyStr  = key ? `${key} ${keyType ?? 'Minor'}` : '';
  const bpmStr  = bpm ? `${bpm} BPM` : '';
  const metaLine = [keyStr, bpmStr].filter(Boolean).join(' · ');

  const tag = producerTag !== undefined ? producerTag.trim() : (profile.producerTag ?? '');

  return {
    beatName:    beatName || '',
    artistLine,
    metaLine,
    producerTag: tag,
    theme,
  };
}
