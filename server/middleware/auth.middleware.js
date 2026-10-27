import { isYouTubeConnected, getAuthedYouTubeClient } from '../services/oauth.js';

export function requireYouTubeAuth(req, res, next) {
  if (!isYouTubeConnected(req.session)) {
    return res.status(401).json({ error: 'Connect YouTube before publishing', code: 'YOUTUBE_NOT_CONNECTED' });
  }
  return next();
}

/**
 * Middleware to attach OAuth2Client to req for analytics/scheduling routes.
 * Does not require authentication to be present — routes should check req.oauth2Client.
 */
export async function attachOAuthClient(req, res, next) {
  if (isYouTubeConnected(req.session)) {
    try {
      const { client } = await getAuthedYouTubeClient(req.session);
      req.oauth2Client = client;
    } catch {
      // Token refresh failed — proceed without client, routes will handle
      req.oauth2Client = null;
    }
  } else {
    req.oauth2Client = null;
  }
  next();
}
