import { Router } from 'express';
import {
  exchangeCodeForTokens,
  getAuthUrl,
  getConnectedChannel,
  isOAuthConfigured,
  isYouTubeConnected,
  storeTokensInSession,
  saveTokens,
  clearTokens
} from '../services/oauth.js';

const router = Router();

router.get('/login', (req, res) => {
  if (!isOAuthConfigured()) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>OAuth Configuration Required - Beatflow</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0f111a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; }
          .card { max-width: 580px; background: #161926; border: 1px solid #2d3148; border-radius: 12px; padding: 32px; line-height: 1.6; }
          h2 { margin-top: 0; color: #a855f7; }
          code { background: #090a10; padding: 2px 6px; border-radius: 4px; color: #38bdf8; font-size: 0.9em; }
          pre { background: #090a10; padding: 14px; border-radius: 8px; overflow-x: auto; color: #cbd5e1; }
          a { color: #a855f7; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .btn { display: inline-block; margin-top: 20px; background: #a855f7; color: white; padding: 10px 18px; border-radius: 6px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Google OAuth Not Configured</h2>
          <p>To connect YouTube and enable automated uploading, you need to add your Google API credentials:</p>
          <ol>
            <li>Go to the <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a>.</li>
            <li>Enable <strong>YouTube Data API v3</strong> and <strong>YouTube Analytics API</strong>.</li>
            <li>Create an <strong>OAuth 2.0 Client ID</strong> (Web Application).</li>
            <li>Set Authorized redirect URI to <code>http://localhost:3000/auth/callback</code>.</li>
            <li>Add the generated keys to your local <code>.env</code> file:</li>
          </ol>
          <pre>GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here</pre>
          <p>After saving <code>.env</code>, restart Beatflow and try connecting again.</p>
          <a href="/" class="btn">&larr; Return to Beatflow</a>
        </div>
      </body>
      </html>
    `);
  }

  try {
    res.redirect(getAuthUrl());
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'OAUTH_INIT_FAILED' });
  }
});

router.get('/callback', async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Missing OAuth authorization code', code: 'OAUTH_CODE_MISSING' });
    }
    const tokens = await exchangeCodeForTokens(code);
    storeTokensInSession(req.session, tokens);
    saveTokens(tokens);
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect('/?connected=1');
    });
  } catch (err) {
    console.error('[auth] OAuth callback error:', err.message);
    next(err);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const configured = isOAuthConfigured();
    if (!configured) {
      return res.json({ configured: false, connected: false, profile: null });
    }
    if (!isYouTubeConnected(req.session)) {
      return res.json({ configured: true, connected: false, profile: null });
    }
    const profile = await getConnectedChannel(req.session);
    res.json({ configured: true, connected: true, profile });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.youtubeAuth = null;
  clearTokens();
  res.json({ ok: true });
});

export default router;

