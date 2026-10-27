import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const HISTORY_FILE = path.join(ROOT_DIR, 'data', 'video_history.json');

function ensureFile() {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
  }
}

/**
 * Record a newly published or scheduled video to the local history list.
 */
export function recordVideo(entry) {
  ensureFile();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const history = JSON.parse(raw || '[]');
    history.unshift({ ...entry, recordedAt: new Date().toISOString() });
    
    // Retain up to 500 records to prevent unbounded file growth
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(0, 500), null, 2), 'utf8');
  } catch (err) {
    console.error('[videoHistory] Could not record video entry:', err.message);
  }
}

/**
 * Update an existing video entry (e.g., when 48h view metrics are recorded).
 */
export function updateVideoRecord(videoId, updates = {}) {
  ensureFile();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const history = JSON.parse(raw || '[]');
    const index = history.findIndex((v) => v.videoId === videoId);
    if (index !== -1) {
      history[index] = { ...history[index], ...updates };
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[videoHistory] Could not update video entry:', err.message);
  }
}

/**
 * Retrieve all recorded video uploads.
 */
export function getAllVideoHistory() {
  ensureFile();
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.warn('[videoHistory] Could not read video history file:', err.message);
    return [];
  }
}

