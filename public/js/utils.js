export const GENRE_DISPLAY_MAP = {
  trap: 'Trap',
  drill: 'Drill',
  'uk drill': 'UK Drill',
  afrobeats: 'Afrobeats',
  rb: 'R&B',
  'r&b': 'R&B',
  melodic: 'Melodic',
  dark: 'Dark',
  chill: 'Chill',
  aggressive: 'Aggressive',
  emotional: 'Emotional',
  hard: 'Hard',
  pop: 'Pop',
  dancehall: 'Dancehall'
};

export function genreLabelFromRaw(genreRaw) {
  const key = String(genreRaw ?? '').toLowerCase().trim();
  if (!key) return 'Type';
  return GENRE_DISPLAY_MAP[key] ?? key.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build preview title matching server format.
 */
export function buildPreviewTitle({ artistA, artistB, genres }) {
  const year = new Date().getFullYear();
  const genre = genreLabelFromRaw(genres?.[0]);
  const left = (artistA || 'Artist A').trim();
  const right = (artistB || '').trim();
  const artistPart = right ? `${left} x ${right}` : left;
  return `[FREE] ${artistPart} ${genre} Type Beat | ${year}`;
}
