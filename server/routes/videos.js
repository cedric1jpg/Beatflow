import express from 'express';
import { getAllVideoHistory } from '../services/videoHistory.js';

const router = express.Router();

router.get('/history', (req, res) => {
  res.json({ history: getAllVideoHistory() });
});

export default router;
