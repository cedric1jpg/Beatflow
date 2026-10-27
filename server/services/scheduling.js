import { getAllVideoHistory } from './videoHistory.js';

/**
 * Baseline scheduling targets by genre when a channel lacks upload history.
 * Windows are structured around peak leisure hours in the creator's local timezone.
 */
const GENRE_SCHEDULE_DEFAULTS = {
  dancehall: {
    weekday: [17, 18], // 5-6 PM local (catches evening diaspora and Caribbean audiences)
    weekend: [11, 17], // Late morning and late afternoon
    fridayBoost: 15,   // Friday 3 PM early weekend release
  },
};

/**
 * Generic baseline posting windows for channels without historical performance data.
 */
const DEFAULT_SCHEDULE_BY_TIMEZONE_HOUR = {
  weekday: [17, 18, 19, 20], // 5-8 PM local
  weekend: [12, 13, 19, 20], // Noon and evening
};

/**
 * Suggest the best upload time. Uses real channel history once at least
 * 5 published videos have recorded view data; otherwise falls back to a
 * genre-aware default (dancehall has its own; other genres use the general default).
 *
 * @param {object} opts
 * @param {string} opts.timezone
 * @param {object} opts.channelBaseline
 * @param {string} [opts.genre] - the primary genre of the beat being scheduled, e.g. 'dancehall'
 */
export function suggestPostTime({ timezone, channelBaseline, genre }) {
  const history = getAllVideoHistory().filter(v => v.status === 'published');

  if (history.length < 5) {
    return buildDefaultSuggestion(timezone, null, genre);
  }

  // With real history: find which hour-of-day, among this channel's own
  // published videos, correlates with the highest early view velocity.
  // (Velocity = views recorded in the video_history snapshot closest to 48h post-publish.)
  const hourPerformance = {};
  for (const video of history) {
    if (!video.publishedAt || typeof video.viewsAt48h !== 'number') continue;
    const hour = new Date(video.publishedAt).getHours();
    hourPerformance[hour] = hourPerformance[hour] || [];
    hourPerformance[hour].push(video.viewsAt48h);
  }

  const hoursWithData = Object.keys(hourPerformance);
  if (hoursWithData.length < 3) {
    // Not enough hour diversity yet to draw a real conclusion
    return buildDefaultSuggestion(timezone, 'Not enough varied posting times in your history yet — using general defaults until more data is available.');
  }

  let bestHour = null;
  let bestAvg  = -1;
  for (const hour of hoursWithData) {
    const avg = average(hourPerformance[hour]);
    if (avg > bestAvg) { bestAvg = avg; bestHour = parseInt(hour, 10); }
  }

  const nextSlot = nextOccurrenceOfHour(bestHour, timezone);
  return {
    recommendation: nextSlot,
    confidence: 'high',
    basis: `Based on ${history.length} of your own published videos, uploads around ${formatHour(bestHour)} local time have historically performed best on your channel.`,
  };
}

/**
 * Build a fallback time suggestion when the channel doesn't have enough
 * upload history yet. Uses a genre-specific default if one exists and a
 * genre was provided; otherwise falls back to the general default.
 *
 * @param {string} timezone - IANA timezone string
 * @param {string} [overrideNote] - optional custom basis message
 * @param {string} [genre] - lowercase genre tag, e.g. 'dancehall'
 */
function buildDefaultSuggestion(timezone, overrideNote, genre) {
  const now = new Date();
  const isWeekend = [0, 6].includes(now.getDay());
  const isFriday  = now.getDay() === 5;

  const genreConfig = genre ? GENRE_SCHEDULE_DEFAULTS[genre.toLowerCase()] : null;
  const schedule = genreConfig || DEFAULT_SCHEDULE_BY_TIMEZONE_HOUR;

  let candidateHours = isWeekend ? schedule.weekend : schedule.weekday;

  // Apply the Friday boost if this genre config defines one
  if (isFriday && genreConfig?.fridayBoost) {
    candidateHours = [genreConfig.fridayBoost, ...candidateHours];
  }

  const currentHour = now.getHours();
  let chosenHour = candidateHours.find(h => h > currentHour);
  let daysAhead = 0;
  if (!chosenHour) {
    chosenHour = candidateHours[0];
    daysAhead = 1;
  }

  const slot = nextOccurrenceOfHour(chosenHour, timezone, daysAhead);

  const basis = overrideNote
    ?? (genreConfig
      ? `Using recommended posting windows for ${genre || 'your genre'}. `
        + `As you publish more beats, this will automatically calibrate to your channel's real view velocity.`
      : `Using standard peak music engagement hours. Once you have at least 5 uploads with metrics, `
        + `recommendations will adapt to your channel's actual audience behavior.`);

  return {
    recommendation: slot,
    confidence: 'low',
    basis,
  };
}

function nextOccurrenceOfHour(hour, timezone, daysAhead = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  if (date < new Date()) date.setDate(date.getDate() + 1);
  return date; // Caller is responsible for timezone display conversion in the UI
}

function formatHour(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
