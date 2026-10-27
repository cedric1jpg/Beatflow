import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const TOKEN_FILE = path.join(ROOT_DIR, 'data', 'tokens.json');

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];

/**
 * Checks whether Google OAuth environment variables are set and not placeholders.
 */
export function isOAuthConfigured() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return Boolean(
    clientId &&
    clientSecret &&
    !clientId.includes('your_google_client_id') &&
    !clientSecret.includes('your_google_client_secret')
  );
}

/**
 * Initialize a Google OAuth client from environment configuration.
 * Throws a helpful error if credentials are missing or unconfigured.
 */
export function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback';

  if (!isOAuthConfigured()) {
    const error = new Error(
      'Google OAuth credentials are missing or set to placeholder values. ' +
      'Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file (see .env.example).'
    );
    error.statusCode = 500;
    error.code = 'OAUTH_NOT_CONFIGURED';
    throw error;
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

/**
 * Generates the Google OAuth authorization URL for offline access (refresh tokens).
 */
export function getAuthUrl() {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: OAUTH_SCOPES
  });
}

/**
 * Exchanges the one-time authorization code received from Google for tokens.
 */
export async function exchangeCodeForTokens(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Saves authenticated tokens in the current user session.
 */
export function storeTokensInSession(session, tokens) {
  session.youtubeAuth = {
    tokens,
    storedAt: new Date().toISOString()
  };
}

/**
 * Quick check if session currently holds an active YouTube token.
 */
export function isYouTubeConnected(session) {
  return Boolean(session?.youtubeAuth?.tokens?.access_token);
}

/**
 * Builds an authenticated YouTube Data API client using current session tokens.
 * Handles token refresh automatically when possible.
 */
export async function getAuthedYouTubeClient(session) {
  if (!isYouTubeConnected(session)) {
    const error = new Error('YouTube is not connected. Please connect your account first.');
    error.statusCode = 401;
    error.code = 'YOUTUBE_NOT_CONNECTED';
    throw error;
  }

  const client = createOAuthClient();
  client.setCredentials(session.youtubeAuth.tokens);

  try {
    const accessToken = await client.getAccessToken();
    if (!accessToken?.token) {
      throw new Error('Empty token received on refresh');
    }
  } catch (err) {
    const error = new Error('Could not refresh YouTube access token. Please re-authenticate.');
    error.statusCode = 401;
    error.code = 'TOKEN_REFRESH_FAILED';
    error.cause = err;
    throw error;
  }

  const youtube = google.youtube({ version: 'v3', auth: client });
  return { client, youtube };
}

/**
 * Persist tokens to data/tokens.json for cross-session survival in local dev.
 */
export function saveTokens(tokens) {
  try {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.warn('[oauth] Could not save tokens to disk:', err.message);
  }
}

/**
 * Load persisted tokens from disk if present and non-empty.
 */
export function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const content = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (!content || content === '{}') return null;
      const parsed = JSON.parse(content);
      return parsed?.access_token ? parsed : null;
    }
  } catch {
    // If the file is corrupted or empty, gracefully ignore
  }
  return null;
}

/**
 * Remove persisted tokens from disk on logout.
 */
export function clearTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch {
    // Ignore file removal errors
  }
}

/**
 * Retrieves the connected channel's basic snippet for display in the UI.
 */
export async function getConnectedChannel(session) {
  if (!isYouTubeConnected(session)) {
    return null;
  }

  try {
    const { youtube } = await getAuthedYouTubeClient(session);
    const response = await youtube.channels.list({
      part: ['snippet', 'brandingSettings'],
      mine: true,
      maxResults: 1
    });

    const channel = response.data.items?.[0];
    if (!channel) return null;

    return {
      id: channel.id,
      title: channel.snippet?.title || 'Connected channel',
      thumbnail: channel.snippet?.thumbnails?.default?.url || channel.snippet?.thumbnails?.medium?.url || '',
      description: channel.snippet?.description || ''
    };
  } catch (err) {
    console.warn('[oauth] Failed to retrieve channel profile:', err.message);
    return null;
  }
}

