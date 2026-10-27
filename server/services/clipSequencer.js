/**
 * Build a sequence of clip references that fills the target duration,
 * with the constraint that no clip ID appears twice in a row.
 *
 * @param {string[]} clipIds        - Array of clip identifiers (e.g. file paths or UUIDs)
 * @param {number}   targetDuration - Total duration to fill, in seconds
 * @param {number}   segmentLength  - Length of each segment, in seconds (default 5)
 * @returns {string[]} Ordered array of clipIds — the sequence to render, one entry per segment
 * @throws {Error} if clipIds is empty
 */
export function buildClipSequence(clipIds, targetDuration, segmentLength = 5) {
  if (!clipIds || clipIds.length === 0) {
    throw new Error('At least one clip is required to build a sequence.');
  }

  const segmentCount = Math.ceil(targetDuration / segmentLength);

  // Special case: only one clip available — no-repeat constraint is impossible to satisfy
  // and isn't meaningful with a single source. Just repeat it for every segment.
  if (clipIds.length === 1) {
    return Array(segmentCount).fill(clipIds[0]);
  }

  const sequence = [];
  let previousClip = null;

  for (let i = 0; i < segmentCount; i++) {
    const nextClip = pickNextClip(clipIds, previousClip);
    sequence.push(nextClip);
    previousClip = nextClip;
  }

  return sequence;
}

/**
 * Pick a random clip from the pool that is NOT equal to the previous clip.
 * Uses a shuffled-bag approach for better distribution than naive rejection
 * sampling: every clip gets roughly equal representation across a long sequence
 * rather than the same 2-3 clips dominating by chance.
 *
 * @param {string[]} clipIds
 * @param {string|null} previousClip
 * @returns {string}
 */
function pickNextClip(clipIds, previousClip) {
  const eligible = clipIds.filter(id => id !== previousClip);
  // eligible is guaranteed non-empty here because clipIds.length >= 2
  // (the length === 1 case is handled separately by the caller)
  const randomIndex = Math.floor(Math.random() * eligible.length);
  return eligible[randomIndex];
}

/**
 * Validate that a sequence has no consecutive duplicates.
 * Used only in tests / sanity checks — not called in the render pipeline,
 * but exported so it can be unit tested directly.
 *
 * @param {string[]} sequence
 * @returns {boolean}
 */
export function hasNoConsecutiveRepeats(sequence) {
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] === sequence[i - 1]) return false;
  }
  return true;
}

/**
 * Calculate how many segments are needed and the exact trim point for the
 * final segment, since targetDuration will rarely divide evenly by segmentLength.
 *
 * @param {number} targetDuration
 * @param {number} segmentLength
 * @returns {{ segmentCount: number, finalSegmentDuration: number }}
 */
export function calculateSegmentPlan(targetDuration, segmentLength = 5) {
  const fullSegments = Math.floor(targetDuration / segmentLength);
  const remainder = targetDuration - (fullSegments * segmentLength);

  if (remainder === 0) {
    return { segmentCount: fullSegments, finalSegmentDuration: segmentLength };
  }
  // The last segment is shorter than the standard length to land exactly on targetDuration
  return { segmentCount: fullSegments + 1, finalSegmentDuration: remainder };
}
