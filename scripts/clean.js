import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tempDir = path.join(rootDir, 'temp');

if (fs.existsSync(tempDir)) {
  for (const entry of fs.readdirSync(tempDir)) {
    const entryPath = path.join(tempDir, entry);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
}
