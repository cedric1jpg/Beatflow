import express from 'express';
import { getProfile, saveProfile } from '../services/profile.js';

const router = express.Router();

router.get('/', (req, res) => res.json({ profile: getProfile() }));

router.put('/', express.json(), (req, res) => {
  const { instagramHandle, email, channelTagline } = req.body ?? {};

  // Basic sanitation — strip leading @ from IG handle for consistent storage,
  // and validate email loosely (don't over-engineer real RFC validation here)
  const cleanIg    = (instagramHandle ?? '').trim().replace(/^@/, '').slice(0, 60);
  const cleanEmail = (email ?? '').trim().slice(0, 120);
  const cleanTag   = (channelTagline ?? '').trim().slice(0, 150);

  if (cleanEmail && !cleanEmail.includes('@')) {
    return res.status(400).json({ error: 'Email address looks invalid', code: 'INVALID_EMAIL' });
  }

  const updated = saveProfile({ instagramHandle: cleanIg, email: cleanEmail, channelTagline: cleanTag });
  res.json({ profile: updated });
});

export default router;
