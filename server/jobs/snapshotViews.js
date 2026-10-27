import { google } from 'googleapis';
import { getAllVideoHistory, updateVideoRecord } from '../services/videoHistory.js';

/**
 * For every published video that is between 47-49 hours old and doesn't yet
 * have a viewsAt48h snapshot, fetch its current view count and record it.
 * This builds the dataset that suggestPostTime() depends on.
 *
 * @param {OAuth2Client} oauth2Client - must be a currently-valid authenticated client
 */
export async function snapshotViewsJob(oauth2Client) {
  const history = getAllVideoHistory();
  const now = Date.now();

  const candidates = history.filter(v => {
    if (v.status !== 'published' || !v.publishedAt || v.viewsAt48h !== undefined) return false;
    const ageHours = (now - new Date(v.publishedAt).getTime()) / (1000 * 60 * 60);
    return ageHours >= 47 && ageHours <= 49;
  });

  if (candidates.length === 0) return;

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  for (const video of candidates) {
    try {
      const res = await youtube.videos.list({ part: ['statistics'], id: [video.videoId] });
      const stats = res.data.items?.[0]?.statistics;
      if (stats) {
        updateVideoRecord(video.videoId, { viewsAt48h: parseInt(stats.viewCount, 10) });
        console.log(`[scheduling] Snapshotted 48h views for ${video.videoId}: ${stats.viewCount}`);
      }
    } catch (err) {
      console.warn(`[scheduling] Could not snapshot views for ${video.videoId}:`, err.message);
    }
  }
}
