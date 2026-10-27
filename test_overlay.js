import fs from 'node:fs';
import path from 'node:path';
import { applyTextOverlay, assertFontsExist, buildOverlayData } from './server/services/textOverlay.js';

async function runTests() {
  console.log('[test] Verifying font assets...');
  try {
    assertFontsExist();
    console.log('[test] Font assets verified (Anton-Regular & Raleway-Bold found).');
  } catch (err) {
    console.error(`[test] Font check failed: ${err.message}`);
    process.exit(1);
  }

  console.log('[test] Testing buildOverlayData helper...');
  const sampleOverlay = buildOverlayData(
    { beatName: "Kartel's Wrath", bpm: '140', key: 'C#', scale: 'Minor', artistA: 'Artist A' },
    { producerTag: 'Prod. by FlowBeats' }
  );
  if (!sampleOverlay.beatName || !sampleOverlay.metaLine) {
    throw new Error('buildOverlayData output was missing expected fields');
  }
  console.log('[test] buildOverlayData passed.');

  const sampleVideo = path.resolve('temp/sample_test.mp4');
  if (!fs.existsSync(sampleVideo)) {
    console.log('[test] To run end-to-end ffmpeg overlay rendering, place an MP4 file at temp/sample_test.mp4');
    console.log('[test] Unit checks passed successfully.');
    return;
  }

  console.log(`[test] Running ffmpeg overlay render on ${sampleVideo}...`);
  const output = path.resolve('temp/out_test_overlay.mp4');
  await applyTextOverlay({
    inputPath: sampleVideo,
    outputPath: output,
    overlayData: sampleOverlay
  });

  if (fs.existsSync(output)) {
    console.log(`[test] Successfully rendered overlay test video to ${output}`);
  }
}

runTests().catch((err) => {
  console.error('[test] Test encountered an error:', err.message);
  process.exit(1);
});

