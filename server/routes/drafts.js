import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DRAFTS_DIR = path.join(path.resolve(__dirname, '..', '..'), 'data', 'drafts');
const MAX_DRAFTS = 50;

const router = express.Router();

fs.mkdirSync(DRAFTS_DIR, { recursive: true });

function readAllDrafts() {
  const files = fs.readdirSync(DRAFTS_DIR).filter((f) => f.endsWith('.json'));
  return files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DRAFTS_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function isValidId(id) {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
}

function sanitizeName(name) {
  return String(name ?? 'Untitled Beat').trim().slice(0, 120).replace(/[<>"'`]/g, '');
}

router.get('/', (req, res) => {
  try {
    const drafts = readAllDrafts().map(({ id, name, createdAt, updatedAt, data }) => ({
      id,
      name,
      createdAt,
      updatedAt,
      preview: {
        artistA: data?.artistA || 'Untitled',
        artistB: data?.artistB || '',
        genres: data?.genres || [],
        bpm: data?.bpm || ''
      }
    }));
    res.json({ drafts });
  } catch (err) {
    console.error('[drafts] Read error:', err.message);
    res.status(500).json({ error: 'Could not load drafts', code: 'DRAFTS_READ_ERROR' });
  }
});

router.get('/:id', (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid draft ID', code: 'INVALID_DRAFT_ID' });
  }
  const filePath = path.join(DRAFTS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Draft not found', code: 'DRAFT_NOT_FOUND' });
  }
  try {
    const draft = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ draft });
  } catch {
    res.status(500).json({ error: 'Could not read draft', code: 'DRAFT_READ_ERROR' });
  }
});

router.post('/', (req, res) => {
  const { name, data } = req.body ?? {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Draft data is required', code: 'MISSING_DATA' });
  }

  const existing = readAllDrafts();
  if (existing.length >= MAX_DRAFTS) {
    const oldest = existing[existing.length - 1];
    fs.unlinkSync(path.join(DRAFTS_DIR, `${oldest.id}.json`));
    console.log('[drafts] Auto-deleted oldest draft:', oldest.name);
  }

  const draft = {
    id: randomUUID(),
    name: sanitizeName(name ?? data.beatName ?? data.artistA ?? 'Untitled Beat'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data
  };

  fs.writeFileSync(path.join(DRAFTS_DIR, `${draft.id}.json`), JSON.stringify(draft, null, 2));
  res.status(201).json({ draft: { id: draft.id, name: draft.name, createdAt: draft.createdAt } });
});

router.put('/:id', (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid draft ID', code: 'INVALID_DRAFT_ID' });
  }
  const filePath = path.join(DRAFTS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Draft not found', code: 'DRAFT_NOT_FOUND' });
  }

  try {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const updated = {
      ...existing,
      name: req.body.name ? sanitizeName(req.body.name) : existing.name,
      data: req.body.data ? { ...existing.data, ...req.body.data } : existing.data,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    res.json({ draft: { id: updated.id, name: updated.name, updatedAt: updated.updatedAt } });
  } catch {
    res.status(500).json({ error: 'Could not update draft', code: 'DRAFT_WRITE_ERROR' });
  }
});

router.delete('/:id', (req, res) => {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid draft ID', code: 'INVALID_DRAFT_ID' });
  }
  const filePath = path.join(DRAFTS_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Draft not found', code: 'DRAFT_NOT_FOUND' });
  }
  fs.unlinkSync(filePath);
  res.json({ deleted: true });
});

export default router;
