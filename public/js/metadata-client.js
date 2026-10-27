import { buildPreviewTitle } from './utils.js';

function clean(value) {
  return String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeBeatData(beatData) {
  const genres = beatData.genres ?? beatData.genreTags ?? [];
  const licenseRaw = String(beatData.license ?? beatData.licenseType ?? 'free').toLowerCase();
  return {
    artistA: clean(beatData.artistA || 'Artist A'),
    artistB: clean(beatData.artistB || ''),
    genres: Array.isArray(genres) ? genres : [genres].filter(Boolean),
    bpm: clean(beatData.bpm || '0'),
    key: clean(beatData.key || 'C'),
    keyType: beatData.keyType ?? beatData.scale ?? 'Minor',
    beatName: clean(beatData.beatName || 'Untitled Beat'),
    license: licenseRaw,
    price: beatData.price,
    beatstarsUrl: clean(beatData.beatstarsUrl ?? beatData.beatstarsLink),
    producerTag: clean(beatData.producerTag || 'Prod. by Beatflow'),
    year: new Date().getFullYear()
  };
}

const HASHTAG_POOLS = {
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
    _default: {
      anchor:    ['#TypeBeat', '#FreeTypeBeat', '#Instrumental'],
      genre:     ['#HipHop', '#Rap', '#MusicProducer'],
      community: ['#FreeBeat', '#BeatStars', '#Beatmaker', '#MusicProduction'],
    },
  },
  artists: {
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
    'burna boy':       '#BurnaBoyTypeBeat',
    'wizkid':          '#WizkidTypeBeat',
    'davido':          '#DavidoTypeBeat',
    'afrobeats':       '#AfrobeatsTypeBeat',
    'central cee':     '#CentralCeeTypeBeat',
    'dave':            '#DaveTypeBeat',
    'headie one':      '#HeadieOneTypeBeat',
    'stormzy':         '#StormzyTypeBeat',
  },
};

function artistNameToHashtag(artistName) {
  if (!artistName) return null;
  const pascalCase = artistName
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  return `#${pascalCase}TypeBeat`;
}

function buildHashtags({ artistA, artistB, genres, license }) {
  const genreKey   = (genres?.[0] ?? '').toLowerCase().trim();
  const pool       = HASHTAG_POOLS.genres[genreKey] ?? HASHTAG_POOLS.genres._default;

  const artistAKey = (artistA ?? '').toLowerCase().trim();
  const artistBKey = (artistB ?? '').toLowerCase().trim();

  const pos1 = HASHTAG_POOLS.artists[artistAKey]
    ?? (artistBKey ? HASHTAG_POOLS.artists[artistBKey] : null)
    ?? artistNameToHashtag(artistA)
    ?? pool.anchor[0];

  const pos2 = pos1 === pool.anchor[0]
    ? (pool.anchor[1] ?? pool.genre[0])
    : pool.anchor[0];

  const pos3 = pool.genre[0];
  const pos4 = (license === 'free' || license == null) ? '#FreeBeat' : '#BeatStars';
  const pos5 = '#TypeBeat';

  const hashtags = [pos1, pos2, pos3, pos4, pos5].filter(Boolean);

  const seen = new Set();
  const deduped = hashtags.filter(h => {
    const key = h.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const capped = deduped.slice(0, 5);

  return capped.map((h) => {
    const formatted = h.startsWith('#') ? h : `#${h}`;
    return formatted.replace(/\s+/g, '');
  });
}

function generateMisspellings(name) {
  if (!name || name.length < 3) return [];
  const lower = name.toLowerCase().trim();
  const variants = new Set();

  if (lower.length > 4) variants.add(lower.slice(0, -1) + ' type beat');
  if (lower.length > 3) variants.add(lower[1] + lower[0] + lower.slice(2) + ' type beat');

  const phonetic = lower.replace(/k/g, 'c').replace(/ph/g, 'f').replace(/ck/g, 'k');
  if (phonetic !== lower) variants.add(phonetic + ' type beat');

  const spaceInsert = lower.replace(/([a-z]{3})([A-Z])/g, '$1 $2');
  if (spaceInsert !== lower) variants.add(spaceInsert + ' type beat');

  return [...variants].filter(v => v !== lower + ' type beat');
}

function enforceTagBudget(candidates, budget) {
  const seen  = new Set();
  const result = [];
  let total = 0;

  for (const tag of candidates) {
    const clean = tag.toLowerCase().trim();
    if (seen.has(clean)) continue;
    const cost = clean.length + 1;
    if (total + cost > budget) break;
    seen.add(clean);
    result.push(clean);
    total += cost;
  }
  return result;
}

function buildHiddenTags({ artistA, artistB, genres, bpm, key, year }) {
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

function buildDescription({ artistA, artistB, genres, bpm, key, keyType,
                                   beatName, license, price, beatstarsUrl,
                                   producerTag, year }, profile = {}) {
  const currentYear = year || new Date().getFullYear();
  const artistStr = artistB ? `${artistA} x ${artistB}` : artistA;
  const genreRaw  = (genres ?? [])[0] ?? '';
  const genreStr  = genreRaw.replace(/\b\w/g, (c) => c.toUpperCase());
  const keyStr    = `${key} ${keyType ?? 'Minor'}`;

  const licenseLine = license === 'free' || license === 'Free'
    ? 'Free to use for non-profit projects — just tag the producer in your upload.'
    : license === 'premium'
      ? `Lease available for $${price || '29.99'}. Link below for full rights and stems.`
      : `Exclusive rights available for $${price || '199.99'}. Link below for details.`;

  const lines = [];

  // --- Opening: a real sentence, not a label block ---
  lines.push(`A ${genreStr || 'Dancehall'} type beat for ${artistStr}, ${bpm} BPM in ${keyStr}.`);
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

  // --- Visible Hashtags ---
  lines.push(buildHashtags({ artistA, artistB, genres, license }).join(' '));
  lines.push('');

  // --- De-emphasized SEO block at the very bottom ---
  lines.push('—');
  lines.push(buildHiddenTags({ artistA, artistB, genres, bpm, key, year: currentYear }).join(' '));

  return lines.join('\n');
}

export function generateClientMetadata(beatData, profile = {}) {
  const beat = normalizeBeatData(beatData);
  const title = buildPreviewTitle({
    artistA: beat.artistA,
    artistB: beat.artistB,
    genres: beat.genres
  });
  
  const hashtags = buildHashtags(beat);
  const hiddenTags = buildHiddenTags(beat);

  return {
    title,
    description: buildDescription(beat, profile),
    hashtags,
    tags: hiddenTags // Keeping property name as "tags" for compatibility if form.js expects tags
  };
}

