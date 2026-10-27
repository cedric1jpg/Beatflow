import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const PROFILE_FILE = path.join(ROOT_DIR, 'data', 'producer_profile.json');

const DEFAULT_PROFILE = {
  instagramHandle: '',
  email: '',
  channelTagline: ''
};

/**
 * Loads the stored producer profile, falling back to empty fields if uninitialized.
 */
export function getProfile() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
      return { ...DEFAULT_PROFILE, ...data };
    }
  } catch (err) {
    console.warn('[profile] Could not read profile file, using defaults:', err.message);
  }
  return { ...DEFAULT_PROFILE };
}

/**
 * Merges updates into the producer profile and persists to disk.
 */
export function saveProfile(updates = {}) {
  fs.mkdirSync(path.dirname(PROFILE_FILE), { recursive: true });
  const current = getProfile();
  const merged = { ...current, ...updates };
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

