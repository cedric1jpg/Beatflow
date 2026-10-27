import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = path.join(ROOT, 'assets', 'fonts');

const FONTS = [
  {
    name:   'Anton-Regular.ttf',
    urlTTF: 'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf',
  },
  {
    name:   'Raleway-Bold.ttf',
    urlTTF: 'https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway[wght].ttf',
  },
];

async function downloadFont(font) {
  const dest = path.join(FONTS_DIR, font.name);
  if (fs.existsSync(dest)) {
    const header = fs.readFileSync(dest).subarray(0, 4).toString('ascii');
    if (header === 'ttcf' || header === '\u0000\u0001\u0000\u0000' || header === 'OTTO') {
      console.log(`[fonts] Already exists: ${font.name}`);
      return;
    }

    fs.unlinkSync(dest);
    console.log(`[fonts] Replacing invalid cached file: ${font.name}`);
  }
  console.log(`[fonts] Downloading ${font.name}...`);
  return new Promise((resolve, reject) => {
    let file = fs.createWriteStream(dest);
    https.get(font.urlTTF, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        https.get(res.headers.location, (res2) => {
          file = fs.createWriteStream(dest);
          res2.pipe(file);
          file.on('finish', () => { file.close(); console.log(`[fonts] Saved: ${font.name}`); resolve(); });
        }).on('error', reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); console.log(`[fonts] Saved: ${font.name}`); resolve(); });
    }).on('error', (err) => {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

fs.mkdirSync(FONTS_DIR, { recursive: true });
for (const font of FONTS) await downloadFont(font);
console.log('[fonts] All fonts ready.');
