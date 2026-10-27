import { google } from 'googleapis';

/**
 * Build an authenticated YouTube Analytics client using the same OAuth2Client
 * instance already used for uploads.
 * @param {OAuth2Client} oauth2Client - shared, authenticated client
 * @returns {object} youtubeAnalytics API client
 */
function getAnalyticsClient(oauth2Client) {
  return google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
}

/**
 * Fetch core performance metrics for a specific video.
 * NOTE: YouTube Analytics API has a documented 48-72 hour data delay.
 * Data for videos published in the last 2 days will be incomplete or missing.
 *
 * @param {OAuth2Client} oauth2Client
 * @param {string} videoId
 * @param {string} startDate - 'YYYY-MM-DD', defaults to 30 days ago
 * @param {string} endDate   - 'YYYY-MM-DD', defaults to today
 * @returns {Promise<object>} { views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage, likes, comments, shares, subscribersGained }
 */
export async function getVideoMetrics(oauth2Client, videoId, startDate, endDate) {
  const analytics = getAnalyticsClient(oauth2Client);

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const start = startDate || thirtyDaysAgo.toISOString().split('T')[0];
  const end   = endDate   || today.toISOString().split('T')[0];

  try {
    const response = await analytics.reports.query({
      ids: 'channel==MINE',
      startDate: start,
      endDate: end,
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained',
      filters: `video==${videoId}`,
    });

    const row = response.data.rows?.[0];
    if (!row) {
      return {
        available: false,
        reason: 'No analytics data yet — videos published in the last 48-72 hours have a reporting delay.',
      };
    }

    const headers = response.data.columnHeaders.map(h => h.name);
    const values  = row;
    const metrics = {};
    headers.forEach((name, i) => { metrics[name] = values[i]; });

    return { available: true, ...metrics };

  } catch (err) {
    console.error('[analytics] getVideoMetrics failed:', err.message);
    return { available: false, reason: 'Could not fetch analytics. ' + err.message };
  }
}

/**
 * Fetch channel-wide rolling averages for comparison baselines.
 * Used to judge whether a specific video is over- or under-performing.
 *
 * @param {OAuth2Client} oauth2Client
 * @param {number} lookbackDays - default 90
 * @returns {Promise<object>} { avgCtr, avgViewPercentage, avgViewsPerVideo, sampledVideoCount }
 */
export async function getChannelBaseline(oauth2Client, lookbackDays = 90) {
  const analytics = getAnalyticsClient(oauth2Client);

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - lookbackDays);

  try {
    const response = await analytics.reports.query({
      ids: 'channel==MINE',
      startDate: start.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      metrics: 'views,averageViewPercentage,averageViewDuration',
      dimensions: 'video',
      sort: '-views',
      maxResults: 50,
    });

    const rows = response.data.rows ?? [];
    if (rows.length === 0) {
      return { available: false, reason: 'Not enough upload history yet to build a baseline.' };
    }

    const avgViewPercentage = average(rows.map(r => r[2]));
    const avgViewDuration   = average(rows.map(r => r[3]));
    const avgViews          = average(rows.map(r => r[1]));

    return {
      available: true,
      avgViewPercentage,
      avgViewDuration,
      avgViewsPerVideo: avgViews,
      sampledVideoCount: rows.length,
    };

  } catch (err) {
    console.error('[analytics] getChannelBaseline failed:', err.message);
    return { available: false, reason: 'Could not fetch channel baseline. ' + err.message };
  }
}

/**
 * Fetch channel CTR data. NOTE: CTR (impressions-based) is NOT available via the
 * public YouTube Analytics API for most channels — `cardClickRate` and impression
 * metrics require YouTube Partner Program / Content Owner access in many cases.
 * This function attempts the query and gracefully reports unavailability rather
 * than failing silently or fabricating a number.
 */
export async function getChannelCTR(oauth2Client, videoId) {
  const analytics = getAnalyticsClient(oauth2Client);
  try {
    const response = await analytics.reports.query({
      ids: 'channel==MINE',
      startDate: '2026-01-01',
      endDate: new Date().toISOString().split('T')[0],
      metrics: 'impressions,impressionsClickThroughRate',
      filters: `video==${videoId}`,
    });
    const row = response.data.rows?.[0];
    if (!row) return { available: false, reason: 'CTR data not available for this video yet.' };
    return { available: true, impressions: row[0], ctr: row[1] };
  } catch (err) {
    // This metric is commonly restricted — fail gracefully, do not crash the dashboard
    return { available: false, reason: 'CTR data requires extended analytics access and may not be available for all channels.' };
  }
}

function average(arr) {
  const nums = arr.filter(n => typeof n === 'number');
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
