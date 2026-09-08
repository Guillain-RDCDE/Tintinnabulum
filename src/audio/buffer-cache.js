// A cache for rendered notes, bounded by MEMORY rather than by entries.
//
// Karplus-Strong and modal synthesis both render a whole note into an
// AudioBuffer, and both cache it so a repeated pitch is free. The first
// version of each capped the cache at 240 entries, which sounded careful and
// was not: an entry is a few seconds of audio, so 240 of them is a quarter of
// a gigabyte. Measured, thirty seconds of play across five kits reached
// 163 MB of AudioBuffers and was still climbing linearly. That memory lives in
// the audio process, so what it takes down is the sound, which is exactly what
// happened: the audio renderer died mid-session.
//
// Two things were wrong and both are fixed here.
//
//   The bound was the wrong quantity. It is bytes now, and eviction is by age.
//
//   The key was far too fine. A cache keyed to a twentieth of a hertz has a
//   different entry for every pitch the mapper ever produces, so it never hits
//   and only ever grows. Notes are keyed by pitch quantised to an eighth of a
//   semitone -- twelve cents, which nobody can hear on a struck bell -- and a
//   whole twenty-seven-semitone range then needs a couple of hundred entries.

const MB = 1048576;

export class BufferCache {
  /** @param {number} budgetMB how much audio to keep, in megabytes */
  constructor(budgetMB = 12) {
    this.budget = budgetMB * MB;
    this.bytes = 0;
    // A Map keeps insertion order, which is all the ageing this needs.
    this.map = new Map();
  }

  get(key) {
    return this.map.get(key);
  }

  set(key, buf) {
    if (this.map.has(key)) return buf;
    const size = buf.length * buf.numberOfChannels * 4;
    this.map.set(key, buf);
    this.bytes += size;
    // Oldest out until it fits. A buffer still playing keeps itself alive
    // through its source node, so evicting one is safe: it only means the
    // next note at that pitch is rendered again.
    while (this.bytes > this.budget && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      const gone = this.map.get(oldest);
      this.map.delete(oldest);
      this.bytes -= gone.length * gone.numberOfChannels * 4;
    }
    return buf;
  }

  clear() {
    this.map.clear();
    this.bytes = 0;
  }

  get megabytes() {
    return this.bytes / MB;
  }
}

/**
 * A pitch, as a cache key.
 *
 * Quantised to an eighth of a semitone. Two notes twelve cents apart are the
 * same note for this purpose -- on a bell or a plucked string nobody hears the
 * difference, and the alternative is a cache that never hits.
 */
export function pitchKey(freq) {
  return Math.round(Math.log2(Math.max(1, freq) / 27.5) * 12 * 8);
}
