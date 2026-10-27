// public/js/overlayPreview.js
//
// Renders a live canvas preview of the text overlay layout.
// Uses approximate browser fonts (Impact ≈ Anton, Arial ≈ Raleway).
// The preview shows correct POSITION and EFFECT — not pixel-perfect typography.
// The actual ffmpeg render will look noticeably better (proper display fonts).
//
// IMPORTANT: The LAYOUT constants here MUST mirror the server-side values in
// server/services/textOverlay.js. If you change font sizes or spacing on the
// server, update the matching values here too, or the preview will be misleading.

const CANVAS_W      = 640;
const CANVAS_H      = 360;
const SCALE         = CANVAS_W / 1920;   // preview is 1/3 scale of final render

// Mirror of server-side constants, scaled for the preview canvas
const SIZE_BEAT_NAME    = Math.round(200 * SCALE);  // ~37px on preview canvas
const SIZE_PRODUCER_TAG = Math.round(58 * SCALE);   // ~12px on preview canvas
const PRODUCER_TAG_Y_OFFSET = Math.round(80 * SCALE);

function getFormValues() {
  return {
    beatName:    document.getElementById('beat-name')?.value?.trim()    || '',
    producerTag: document.getElementById('producer-tag')?.value?.trim() || '',
  };
}

function buildLines(values) {
  return {
    beatName:    values.beatName    || 'BEAT NAME',
    producerTag: values.producerTag || '',
  };
}

export function renderOverlayPreview() {
  const canvas = document.getElementById('overlay-preview-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const lines = buildLines(getFormValues());
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // ── Background: dark video frame simulation ───────────────────────────────
  ctx.fillStyle = '#0d0d18';
  ctx.fillRect(0, 0, W, H);

  // Subtle vertical texture to suggest video clip content
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  for (let x = 0; x < W; x += 30) ctx.fillRect(x, 0, 15, H);

  // ── Element 1: Beat Name (centered, with simulated glow) ─────────────────
  // Approximate Anton with Impact (closest available browser font).
  // The preview will not be pixel-perfect — Anton is heavier and more
  // condensed than Impact. Final render will look noticeably bolder.
  // ── Beat name overflow protection for preview ─────────────────────────────
  // Mirror of server-side calculateSafeFontSize(), adapted for the 640px canvas.
  // Anton is approximated by Impact in the browser — use the same 0.52 ratio.
  let previewBeatSize = SIZE_BEAT_NAME;
  const PREVIEW_SAFETY_MARGIN  = 0.88;
  const PREVIEW_MAX_TEXT_WIDTH = W * PREVIEW_SAFETY_MARGIN;
  const AVG_CHAR_RATIO         = 0.52;

  const estimatedPreviewWidth = lines.beatName.length * previewBeatSize * AVG_CHAR_RATIO;
  if (estimatedPreviewWidth > PREVIEW_MAX_TEXT_WIDTH) {
    previewBeatSize = Math.max(
      Math.floor(PREVIEW_MAX_TEXT_WIDTH / (lines.beatName.length * AVG_CHAR_RATIO)),
      Math.round(80 * SCALE) // minimum readable size on preview canvas
    );
  }

  const beatFont = `900 ${previewBeatSize}px "Impact","Arial Narrow",sans-serif`;
  ctx.font = beatFont;

  const beatW = ctx.measureText(lines.beatName).width;
  const beatX = (W - beatW) / 2;
  const beatY = H / 2 + SIZE_BEAT_NAME * 0.35; // approximate vertical center

  // Simulated glow — 3 passes at increasing offset/decreasing opacity
  const glowLayers = [
    { offset: 6, alpha: 0.06 },
    { offset: 3, alpha: 0.18 },
    { offset: 1, alpha: 0.45 },
  ];
  for (const g of glowLayers) {
    ctx.font      = beatFont;
    ctx.fillStyle = `rgba(255,255,255,${g.alpha})`;
    ctx.fillText(lines.beatName, beatX + g.offset, beatY + g.offset);
    ctx.fillText(lines.beatName, beatX - g.offset, beatY - g.offset);
    ctx.fillText(lines.beatName, beatX + g.offset, beatY - g.offset);
    ctx.fillText(lines.beatName, beatX - g.offset, beatY + g.offset);
  }
  // Main text on top
  ctx.font      = beatFont;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(lines.beatName, beatX, beatY);

  // ── Element 2: Producer Tag (centered near bottom) ────────────────────────
  if (lines.producerTag) {
    const tagFont = `700 ${SIZE_PRODUCER_TAG}px "Arial",sans-serif`;
    ctx.font = tagFont;

    const tagW = ctx.measureText(lines.producerTag).width;
    const tagX = (W - tagW) / 2;
    const tagY = H - PRODUCER_TAG_Y_OFFSET - SIZE_PRODUCER_TAG;

    // Subtle glow
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText(lines.producerTag, tagX + 2, tagY + 2);
    ctx.fillText(lines.producerTag, tagX - 2, tagY - 2);

    // Main text
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(lines.producerTag, tagX, tagY);
  }
}

// ── Event wiring ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Toggle show/hide overlay controls
  document.getElementById('overlay-enabled')?.addEventListener('change', (e) => {
    document.getElementById('overlay-controls').style.display =
      e.target.checked ? 'block' : 'none';
  });

  // Re-render preview on any form change
  const formFields = ['beat-name', 'artist-a', 'artist-b', 'bpm', 'key', 'producer-tag'];
  formFields.forEach(id => {
    const field = document.getElementById(id);
    field?.addEventListener('input', renderOverlayPreview);
  });

  // Initial render
  renderOverlayPreview();
});

// Theme selector removed — design now uses a single intentional treatment.
// This export is kept for compatibility with uploader.js which still appends
// overlayTheme to FormData. The value is ignored by buildOverlayFiltergraph().
export function getOverlayTheme() {
  return 'default';
}
export function isOverlayEnabled()  {
  return document.getElementById('overlay-enabled')?.checked ?? true;
}
