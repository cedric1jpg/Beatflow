import { Router } from 'express';
import { generateYouTubeMetadata } from '../services/metadata.js';

const router = Router();

router.post('/generate', (req, res) => {
  const metadata = generateYouTubeMetadata(req.body || {});
  res.json(metadata);
});

export default router;
