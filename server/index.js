import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import youtubeRoutes from './routes/youtube.js';
import metadataRoutes from './routes/metadata.js';
import draftsRoutes from './routes/drafts.js';
import analyticsRoutes from './routes/analytics.js';
import schedulingRoutes from './routes/scheduling.js';
import videosRoutes from './routes/videos.js';
import profileRouter from './routes/profile.js';
import { createJobHub } from './jobs.js';
import { loadTokens, storeTokensInSession, isOAuthConfigured } from './services/oauth.js';
import { FFMPEG_PATH, FFPROBE_PATH } from './services/ffmpeg.js';
import { snapshotViewsJob } from './jobs/snapshotViews.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const tempDir = path.join(rootDir, 'temp');
const assetsDir = path.join(rootDir, 'assets');
const defaultVisualizerPath = path.join(assetsDir, 'default-visualizer.jpg');

fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(path.join(tempDir, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(tempDir, 'videos'), { recursive: true });
fs.mkdirSync(path.join(tempDir, 'artwork'), { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(path.join(rootDir, 'data'), { recursive: true });
fs.mkdirSync(path.join(rootDir, 'data', 'drafts'), { recursive: true });

function cleanStaleTempFiles() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  
  // Clean files in standard temp subdirectories
  for (const sub of ['', 'uploads', 'videos', 'artwork']) {
    const dir = sub ? path.join(tempDir, sub) : tempDir;
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && now - stat.mtimeMs > TWO_HOURS && /\.(mp4|mp3|wav|flac|aiff|jpg|jpeg|png)$/i.test(file)) {
          fs.unlinkSync(filePath);
          console.log('[startup] Cleaned stale temp file:', file);
        }
      } catch {
        // ignore
      }
    }
  }

  // Clean orphaned montage_* directories (from clip montage feature)
  if (fs.existsSync(tempDir)) {
    for (const entry of fs.readdirSync(tempDir)) {
      if (!entry.startsWith('montage_')) continue;
      const montageDir = path.join(tempDir, entry);
      try {
        const stat = fs.statSync(montageDir);
        if (stat.isDirectory() && now - stat.mtimeMs > TWO_HOURS) {
          // Recursively remove the directory and its contents
          fs.rmSync(montageDir, { recursive: true, force: true });
          console.log('[startup] Cleaned stale montage directory:', entry);
        }
      } catch (err) {
        console.warn('[startup] Could not clean montage directory:', entry, err.message);
      }
    }
  }
}

cleanStaleTempFiles();

if (!fs.existsSync(defaultVisualizerPath)) {
  const canvas = createCanvas(1920, 1080);
  const context = canvas.getContext('2d');

  const background = context.createLinearGradient(0, 0, 1920, 1080);
  background.addColorStop(0, '#05050a');
  background.addColorStop(0.55, '#10111a');
  background.addColorStop(1, '#07070d');
  context.fillStyle = background;
  context.fillRect(0, 0, 1920, 1080);

  const glow = context.createRadialGradient(1440, 320, 60, 1440, 320, 460);
  glow.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
  glow.addColorStop(0.6, 'rgba(124, 58, 237, 0.16)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 1920, 1080);

  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.lineWidth = 1;
  for (let x = 160; x < 1920; x += 160) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 1080);
    context.stroke();
  }
  for (let y = 120; y < 1080; y += 120) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(1920, y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(168,85,247,0.9)';
  context.lineWidth = 8;
  context.lineCap = 'round';
  for (let index = 0; index < 14; index += 1) {
    const x = 170 + index * 40;
    const top = 760 - Math.abs(Math.sin(index * 0.55)) * 160;
    context.beginPath();
    context.moveTo(x, 760);
    context.lineTo(x, top);
    context.stroke();
  }

  context.fillStyle = '#f8fafc';
  context.font = 'bold 112px sans-serif';
  context.fillText('BEATFLOW', 170, 350);
  context.fillStyle = '#cbd5e1';
  context.font = 'bold 56px sans-serif';
  context.fillText('Default Visualizer', 170, 450);
  context.fillStyle = '#64748b';
  context.font = '32px sans-serif';
  context.fillText('Ready for beat upload, metadata, and YouTube publish.', 170, 520);

  fs.writeFileSync(defaultVisualizerPath, canvas.toBuffer('image/jpeg'));
}

const app = express();
const jobHub = createJobHub();
const port = Number(process.env.PORT || 3000);

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'beatflow-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Middleware to restore persisted tokens to session
app.use((req, res, next) => {
  if (!req.session.youtubeAuth) {
    const tokens = loadTokens();
    if (tokens) {
      storeTokensInSession(req.session, tokens);
    }
  }
  next();
});

app.use((req, res, next) => {
  req.jobHub = jobHub;
  next();
});

app.use('/assets', express.static(path.join(rootDir, 'assets')));
app.use(express.static(publicDir));

app.use('/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/drafts', draftsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/profile', profileRouter);

app.get('/api/jobs/:jobId/events', (req, res) => {
  const { jobId } = req.params;
  const channel = jobHub.get(jobId);

  if (!channel) {
    return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const unsubscribe = channel.subscribe((event) => {
    res.write(`event: ${event.event}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    if (event.event === 'complete' || event.event === 'error') {
      unsubscribe();
      res.end();
    }
  });

  req.on('close', unsubscribe);
  channel.publish('connected', { jobId });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'ready' });
});

app.get('/api/status', (req, res) => {
  res.json({ ok: true, status: 'ready' });
});

if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/ffmpeg', async (req, res) => {
    const { execFile } = await import('node:child_process');
    const checks = {};

    await new Promise((resolve) => {
      execFile(FFMPEG_PATH, ['-version'], (err, stdout) => {
        checks.ffmpeg = err
          ? { ok: false, error: err.message, path: FFMPEG_PATH }
          : { ok: true, version: stdout.split('\n')[0], path: FFMPEG_PATH };
        resolve();
      });
    });

    await new Promise((resolve) => {
      execFile(FFPROBE_PATH, ['-version'], (err, stdout) => {
        checks.ffprobe = err
          ? { ok: false, error: err.message, path: FFPROBE_PATH }
          : { ok: true, version: stdout.split('\n')[0], path: FFPROBE_PATH };
        resolve();
      });
    });

    checks.tempDir = fs.existsSync(tempDir) ? 'exists' : 'MISSING';
    checks.assetsDir = fs.existsSync(assetsDir) ? 'exists' : 'MISSING';

    res.json(checks);
  });
}

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File too large. Maximum size is 200 MB.',
      code: 'FILE_TOO_LARGE'
    });
  }
  if (err.message?.startsWith('Unsupported file type')) {
    return res.status(415).json({
      error: err.message,
      code: 'UNSUPPORTED_TYPE'
    });
  }

  const statusCode = err.statusCode || 500;
  const isApiRequest = req.path.startsWith('/api') || req.path.startsWith('/auth');
  if (!isApiRequest) {
    return next(err);
  }
  console.error('[server] Unhandled error:', err);
  res.status(statusCode).json({
    error: err.message || 'Unexpected server error',
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Beatflow running on http://localhost:${port}`);
  if (!isOAuthConfigured()) {
    console.log('[setup] Google OAuth is not configured yet.');
    console.log('[setup] Beat video rendering and previews work locally. To enable YouTube publishing, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.');
  }
});

// Periodic background job to capture 48-hour view velocity for published beats
async function startSnapshotJob() {
  try {
    if (!isOAuthConfigured()) return;
    const tokens = loadTokens();
    if (tokens?.access_token) {
      const { createOAuthClient } = await import('./services/oauth.js');
      const client = createOAuthClient();
      client.setCredentials(tokens);
      snapshotViewsJob(client);
      setInterval(() => snapshotViewsJob(client), 6 * 60 * 60 * 1000);
      console.log('[scheduling] 48-hour view snapshot job active');
    }
  } catch (err) {
    console.warn('[scheduling] View snapshot job not initialized:', err.message);
  }
}

startSnapshotJob();
