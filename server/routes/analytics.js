import express from 'express';
import { getVideoMetrics, getChannelBaseline, getChannelCTR } from '../services/analytics.js';
import { attachOAuthClient } from '../middleware/auth.middleware.js';

const router = express.Router();

// Apply OAuth client attachment middleware to all routes
router.use(attachOAuthClient);

// GET /api/analytics/video/:videoId
router.get('/video/:videoId', async (req, res) => {
  if (!req.oauth2Client) {
    return res.status(401).json({ error: 'YouTube not connected', code: 'NOT_AUTHENTICATED' });
  }
  const metrics = await getVideoMetrics(req.oauth2Client, req.params.videoId);
  res.json({ metrics });
});

// GET /api/analytics/baseline
router.get('/baseline', async (req, res) => {
  if (!req.oauth2Client) {
    return res.status(401).json({ error: 'YouTube not connected', code: 'NOT_AUTHENTICATED' });
  }
  const baseline = await getChannelBaseline(req.oauth2Client);
  res.json({ baseline });
});

// GET /api/analytics/ctr/:videoId
router.get('/ctr/:videoId', async (req, res) => {
  if (!req.oauth2Client) {
    return res.status(401).json({ error: 'YouTube not connected', code: 'NOT_AUTHENTICATED' });
  }
  const ctr = await getChannelCTR(req.oauth2Client, req.params.videoId);
  res.json({ ctr });
});

export default router;
