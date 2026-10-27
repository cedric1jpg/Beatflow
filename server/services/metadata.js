import { getProfile } from './profile.js';

/**
 * Normalize and trim a user-provided text value for safe display.
 */
export function sanitizeText(value) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENRE_DISPLAY = {
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
  pop: 'Pop'
};

function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeBeatInput(beatData = {}) {
  const genres = beatData.genres
    ?? beatData.genreTags
    ?? [];
  const licenseRaw = String(beatData.license ?? beatData.licenseType ?? 'free').toLowerCase();

  return {
    artistA: sanitizeText(beatData.artistA),
    artistB: sanitizeText(beatData.artistB),
    genres: Array.isArray(genres) ? genres : [genres].filter(Boolean),
    bpm: beatData.bpm,
    key: sanitizeText(beatData.key),
    keyType: beatData.keyType ?? beatData.scale ?? 'Minor',
    beatName: sanitizeText(beatData.beatName),
    license: licenseRaw,
    price: beatData.price,
    beatstarsUrl: sanitizeText(beatData.beatstarsUrl ?? beatData.beatstarsLink),
    producerTag: sanitizeText(beatData.producerTag ?? 'Prod. by Beatflow'),
    year: new Date().getFullYear()
  };
}

/**
 * Build the optimised YouTube title.
 * Format: [FREE] Artist A x Artist B Genre Type Beat | Year
 */
export function buildTitle({ artistA, artistB, genres }) {
  const year = new Date().getFullYear();
  const genreRaw = String(genres?.[0] ?? '').toLowerCase().trim();
  const genreLabel = GENRE_DISPLAY[genreRaw] ?? (toTitleCase(genreRaw) || 'Type');

  const artistPart = artistB
    ? `${artistA.trim()} x ${artistB.trim()}`
    : artistA.trim();

  let title = `[FREE] ${artistPart} ${genreLabel} Type Beat | ${year}`;

  if (title.length > 100) {
    title = `[FREE] ${artistA.trim()} ${genreLabel} Type Beat | ${year}`;
    console.warn('[metadata] Title exceeded 100 chars — Artist B dropped.');
  }
  if (title.length > 100) {
    title = `${title.slice(0, 97)}...`;
    console.warn('[metadata] Title still over 100 chars — hard truncated.');
  }

  return title;
}

/**
 * Build the full YouTube description. Redesigned for readability —
 * the first visible lines read as plain sentences for an average viewer,
 * with producer contact info now included, and the SEO tag block pushed
 * to the bottom since it serves the algorithm, not the viewer's eyes.
 *
 * @param {object} beat - beat metadata (same shape as before)
 * @param {object} profile - { instagramHandle, email, channelTagline } from getProfile()
 * @returns {string}
 */
export function buildDescription({ artistA, artistB, genres, bpm, key, keyType,
                                   beatName, license, price, beatstarsUrl,
                                   producerTag, year }, profile = {}) {
  const currentYear = year || new Date().getFullYear();
  const artistStr = artistB ? `${artistA} x ${artistB}` : artistA;
  const genreRaw  = (genres ?? [])[0] ?? '';
  const genreStr  = GENRE_DISPLAY[genreRaw.toLowerCase()] ?? toTitleCase(genreRaw);
  const keyStr    = `${key} ${keyType ?? 'Minor'}`;

  const licenseLine = license === 'free' || license === 'Free'
    ? 'Free to use for non-profit projects — just tag the producer in your upload.'
    : license === 'premium'
      ? `Lease available for $${price}. Link below for full rights and stems.`
      : `Exclusive rights available for $${price}. Link below for details.`;

  const lines = [];

  // --- Opening: a real sentence, not a label block ---
  lines.push(`A ${genreStr || 'dancehall'} type beat for ${artistStr}, ${bpm} BPM in ${keyStr}.`);
  lines.push(licenseLine);
  lines.push('');

  // --- Purchase link, if present, kept near the top since it's the main CTA ---
  if (beatstarsUrl) {
    lines.push(`Full beat + stems: ${beatstarsUrl}`);
    lines.push('');
  }

  // --- Connect section: Instagram + email, simple and scannable ---
  const hasContact = profile.instagramHandle || profile.email;
  if (hasContact) {
    lines.push('Connect:');
    if (profile.instagramHandle) lines.push(`Instagram — instagram.com/${profile.instagramHandle}`);
    if (profile.email)           lines.push(`Bookings/contact — ${profile.email}`);
    lines.push('');
  }

  if (profile.channelTagline) {
    lines.push(profile.channelTagline);
    lines.push('');
  }

  if (producerTag) {
    lines.push(producerTag);
    lines.push('');
  }

  // Append hashtags and footer tags
  lines.push(buildHashtags({ artistA, artistB, genres, license }).join(' '));
  lines.push('');
  lines.push('—');
  lines.push(buildHiddenTags({ artistA, artistB, genres, bpm, key, year: currentYear }).join(' '));

  return lines.join('\n');
}

/**
 * Curated hashtags categorized by tier:
 * - anchor: Highly specific to the style (slot 1)
 * - genre: Broader genre categories (slots 2-3)
 * - community: General discovery tags (slots 4-5)
 */
const HASHTAG_POOLS = {

  // ── Genre pools ─────────────────────────────────────────────────────────────
  genres: {
    dancehall: {
      anchor:    ['#DancehallTypeBeat', '#DancehallBeat', '#DancehallRiddim'],
      genre:     ['#Dancehall', '#Reggae', '#Riddim', '#JamaicanMusic', '#Caribbean'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#Instrumental'],
    },
    trap: {
      anchor:    ['#TrapTypeBeat', '#TrapBeat', '#TrapInstrumental'],
      genre:     ['#Trap', '#TrapMusic', '#HipHop', '#Rap'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#FreeTypeBeat'],
    },
    drill: {
      anchor:    ['#DrillTypeBeat', '#DrillBeat', '#DrillInstrumental'],
      genre:     ['#Drill', '#UKDrill', '#BrooklynDrill', '#HipHop'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#Instrumental'],
    },
    'uk drill': {
      anchor:    ['#UKDrillTypeBeat', '#UKDrillBeat', '#UKDrill'],
      genre:     ['#Drill', '#UKRap', '#UKHipHop', '#BritishRap'],
      community: ['#FreeBeat', '#TypeBeat', '#MusicProducer', '#BeatStars', '#Instrumental'],
    },
    afrobeats: {
      anchor:    ['#AfrobeatsTypeBeat', '#AfrobeatsBeat', '#Afrobeats'],
      genre:     ['#Afropop', '#AfricanMusic', '#Afroswing', '#Amapiano'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#Instrumental'],
    },
    rb: {
      anchor:    ['#RnBTypeBeat', '#RnBBeat', '#SoulBeat'],
      genre:     ['#RnB', '#Soul', '#NeoSoul', '#AlternativeRnB'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#Instrumental'],
    },
    melodic: {
      anchor:    ['#MelodicTypeBeat', '#MelodicTrap', '#MelodicBeat'],
      genre:     ['#MelodicRap', '#Emo', '#Rap', '#HipHop'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#Instrumental'],
    },
    pop: {
      anchor:    ['#PopTypeBeat', '#PopBeat', '#PopInstrumental'],
      genre:     ['#Pop', '#PopMusic', '#IndependentArtist'],
      community: ['#FreeBeat', '#TypeBeat', '#BeatStars', '#MusicProducer', '#Instrumental'],
    },
    // Fallback for any genre not explicitly listed above
    _default: {
      anchor:    ['#TypeBeat', '#FreeTypeBeat', '#Instrumental'],
      genre:     ['#HipHop', '#Rap', '#MusicProducer'],
      community: ['#FreeBeat', '#BeatStars', '#Beatmaker', '#MusicProduction'],
    },
  },

  // ── Artist-tier pools ────────────────────────────────────────────────────────
  // Pre-built artist-specific hashtag strings.
  // Key: lowercase artist name exactly as it would appear in the beat form.
  // Value: the hashtag string to use in position 1 (anchor, most specific).
  // Only add artists with verified active YouTube hashtag pages.
  // Format: PascalCase, no spaces, '#' prefix always.
  artists: {
    // Dancehall
    'popcaan':         '#PopcaanTypeBeat',
    'vybz kartel':     '#VybzKartelTypeBeat',
    'alkaline':        '#AlkalineTypeBeat',
    'kranium':         '#KraniumTypeBeat',
    'busy signal':     '#BusySignalTypeBeat',
    'i octane':        '#IOctaneTypeBeat',
    'mavado':          '#MavadoTypeBeat',
    'beenie man':      '#BeenieManTypeBeat',
    'sean paul':       '#SeanPaulTypeBeat',
    'shaggy':          '#ShaggyTypeBeat',
    'spice':           '#SpiceTypeBeat',
    'koffee':          '#KoffeeTypeBeat',
    'shenseea':        '#ShenseeaTypeBeat',
    'skillibeng':      '#SkillibengTypeBeat',
    'masicka':         '#MasickaTypeBeat',
    'jahvillani':      '#JahvillaniTypeBeat',
    'teejay':          '#TeejayTypeBeat',
    'squash':          '#SquashTypeBeat',
    '6ix':             '#6ixTypeBeat',
    'intence':         '#IntenceTypeBeat',
    'chronic law':     '#ChronicLawTypeBeat',
    'tommy lee sparta':'#TommyLeeTypeBeat',
    'govana':          '#GovanaTypeBeat',
    'aidonia':         '#AidoniaTypeBeat',
    'dexta daps':      '#DextaDapsTypeBeat',
    // Trap / Hip-Hop (common crossover artists on dancehall beats)
    'drake':           '#DrakeTypeBeat',
    'future':          '#FutureTypeBeat',
    'travis scott':    '#TravisScottTypeBeat',
    'lil baby':        '#LilBabyTypeBeat',
    'gunna':           '#GunnaTypeBeat',
    'weeknd':          '#WeekndTypeBeat',
    'the weeknd':      '#WeekndTypeBeat',
    '21 savage':       '#21SavageTypeBeat',
    'roddy ricch':     '#RoddyRicchTypeBeat',
    'polo g':          '#PoloGTypeBeat',
    // Afrobeats crossovers
    'burna boy':       '#BurnaBoyTypeBeat',
    'wizkid':          '#WizkidTypeBeat',
    'davido':          '#DavidoTypeBeat',
    'afrobeats':       '#AfrobeatsTypeBeat',
    // UK Drill crossovers
    'central cee':     '#CentralCeeTypeBeat',
    'dave':            '#DaveTypeBeat',
    'headie one':      '#HeadieOneTypeBeat',
    'stormzy':         '#StormzyTypeBeat',
  },
};

/**
 * Convert an artist name to a best-effort hashtag string.
 * Used when the artist is not in the curated HASHTAG_POOLS.artists map.
 * E.g. "busy signal" → "#BusySignalTypeBeat"
 *
 * @param {string} artistName
 * @returns {string} hashtag string with '#' prefix
 */
export function artistNameToHashtag(artistName) {
  if (!artistName) return null;
  // Convert to PascalCase and remove non-alphanumeric characters
  const pascalCase = artistName
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  return `#${pascalCase}TypeBeat`;
}

/**
 * Generates an optimized set of up to 5 visible hashtags for the video description.
 * YouTube displays the first 3 above the title and ignores all hashtags if more than 15 exist.
 */
export function buildHashtags({ artistA, artistB, genres, license }) {
  const genreKey = (genres?.[0] ?? '').toLowerCase().trim();
  const pool = HASHTAG_POOLS.genres[genreKey] ?? HASHTAG_POOLS.genres._default;

  const artistAKey = (artistA ?? '').toLowerCase().trim();
  const artistBKey = (artistB ?? '').toLowerCase().trim();

  // Position 1: Artist-specific anchor
  const pos1 = HASHTAG_POOLS.artists[artistAKey]
    ?? (artistBKey ? HASHTAG_POOLS.artists[artistBKey] : null)
    ?? artistNameToHashtag(artistA)
    ?? pool.anchor[0];

  // Position 2: Primary genre anchor
  const pos2 = pos1 === pool.anchor[0]
    ? (pool.anchor[1] ?? pool.genre[0])
    : pool.anchor[0];

  // Position 3: Genre broad signal
  const pos3 = pool.genre[0];

  // Position 4: Licensing tag
  const pos4 = (license === 'free' || license == null) ? '#FreeBeat' : '#BeatStars';

  // Position 5: General discovery tag
  const pos5 = '#TypeBeat';

  const hashtags = [pos1, pos2, pos3, pos4, pos5].filter(Boolean);

  // Deduplicate while preserving rank order
  const seen = new Set();
  const deduped = hashtags.filter((h) => {
    const key = h.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // YouTube ignores all tags if there are > 15; keep strictly to the top 5
  const capped = deduped.slice(0, 5);

  return capped.map((h) => {
    const formatted = h.startsWith('#') ? h : `#${h}`;
    return formatted.replace(/\s+/g, '');
  });
}

/**
 * Builds hidden tags for YouTube's search indexing (snippet.tags).
 * Does not use '#' and respects the 500-character total limit.
 */

/**
 * Build the hidden tags array for the YouTube API snippet.tags field.
 *
 * @param {object} beat
 * @returns {string[]} Array of plain-text tag strings, no '#', ≤500 chars total
 */
export function buildHiddenTags({ artistA, artistB, genres, bpm, key, year }) {
  const currentYear = year || new Date().getFullYear();
  const genreRaw    = (genres?.[0] ?? '').toLowerCase().trim();

  const candidates = [
    `${artistA} type beat`,
    `${artistA} type beat ${currentYear}`,
    `free ${artistA} type beat`,
    artistB ? `${artistA} x ${artistB} type beat` : null,
    artistB ? `${artistB} type beat` : null,
    `${genreRaw} type beat`,
    `free ${genreRaw} type beat`,
    `${genreRaw} beat`,
    `type beat ${currentYear}`,
    `free type beat`,
    ...generateMisspellings(artistA),
    ...(artistB ? generateMisspellings(artistB) : []),
    `${bpm} bpm beat`,
    `${key?.toLowerCase()} type beat`,
  ].filter(Boolean);

  return enforceTagBudget(candidates, 500);
}

/**
 * Generate common misspelling variants of an artist or genre name.
 */
function generateMisspellings(name) {
  if (!name || name.length < 3) return [];
  const lower = name.toLowerCase().trim();
  const variants = new Set();

  if (lower.length > 4) variants.add(lower.slice(0, -1) + ' type beat');
  if (lower.length > 3) {
    variants.add(lower[1] + lower[0] + lower.slice(2) + ' type beat');
  }

  const phonetic = lower
    .replace(/k/g, 'c')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k');
  if (phonetic !== lower) variants.add(phonetic + ' type beat');

  const spaceInsert = lower.replace(/([a-z]{3})([A-Z])/g, '$1 $2');
  if (spaceInsert !== lower) variants.add(spaceInsert + ' type beat');

  return [...variants].filter(v => v !== lower + ' type beat');
}

/**
 * Enforce the 500-character budget for hidden tags.
 */
function enforceTagBudget(candidates, budget) {
  const seen  = new Set();
  const result = [];
  let total = 0;

  for (const tag of candidates) {
    const clean = tag.toLowerCase().trim();
    if (seen.has(clean)) continue;
    const cost = clean.length + 1; // +1 for separator
    if (total + cost > budget) break;
    seen.add(clean);
    result.push(clean);
    total += cost;
  }

  return result;
}

export function generateYouTubeMetadata(beatData) {
  const profile = getProfile();
  const beat = normalizeBeatInput(beatData);
  const title = buildTitle(beat);
  const hashtags = buildHashtags(beat);
  const hiddenTags = buildHiddenTags(beat);
  
  const totalChars = hiddenTags.reduce((acc, tag) => acc + tag.length, 0);

  console.log(`[metadata] Hashtags for "${title}": ${hashtags.join(' ')}`);
  console.log(`[metadata] Hidden tags: ${hiddenTags.length} entries, ${totalChars} chars`);

  return {
    title,
    description: buildDescription(beat, profile),
    hashtags,
    hiddenTags,
    categoryId: '10',
    madeForKids: false,
    defaultLanguage: 'en'
  };
}

