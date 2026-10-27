import express from 'express';
import { suggestPostTime } from '../services/scheduling.js';
import { getChannelBaseline } from '../services/analytics.js';
import { attachOAuthClient } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(attachOAuthClient);

router.get('/suggest', async (req, res) => {
  const timezone = req.query.timezone || 'UTC';
  const genre     = req.query.genre || null;

  const baseline = req.oauth2Client
    ? await getChannelBaseline(req.oauth2Client)
    : { available: false };

  const suggestion = suggestPostTime({ timezone, channelBaseline: baseline, genre });
  res.json(suggestion);
});

export default router;
