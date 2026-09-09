// AudioContext ownership, master gain, the room, and the autoplay unlock.

import { SPACES, DEFAULT_SPACE, impulse } from './space.js';
//
// Autoplay policy is not an edge case: no sound exists until a user gesture
// resumes the context. The original hid this behind a Chrome version sniff.
// Here it is part of the public API — call unlock() from a click handler.

/**
 * A tanh transfer curve, sampled for a WaveShaper.
 *
 * `k` sets how hard the bend is. At 2.2 the curve is within a percent of the
 * identity below 0.35, which is where nearly every sample sits, so quiet
 * material passes through untouched and only the peaks are shaped.
 */
function softClipCurve(points = 8192, k = 2.2) {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export class AudioEngine {
  constructor({ volume = 0.7, latencyHint = 'interactive', space = DEFAULT_SPACE } = {}) {
    this._volume = volume;
    this._muted = false;
    this._latencyHint = latencyHint;
    this._ctx = null;
    this._master = null;
    this._limiter = null;
    this._ceiling = null;
    this._watchdog = 0;
    // How many times the context had to be brought back. Exposed rather than
    // hidden: a page that keeps recovering is a page with a real problem.
    this.recoveries = 0;
    this._capture = null;
    // The room. Instruments connect to a bus, the bus goes two ways --
    // straight through, and through a convolver -- and both arrive at the
    // master. Nothing an instrument does needs to know about any of it.
    this._space = SPACES[space] ? space : DEFAULT_SPACE;
    this._bus = null;
    this._dry = null;
    this._send = null;
    this._wet = null;
    this._convolver = null;
  }

  get ctx() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not available in this browser');
      this._ctx = new AC({ latencyHint: this._latencyHint });
      this._master = this._ctx.createGain();
      this._master.gain.value = this._muted ? 0 : this._volume;
      // A limiter between the master and the speakers, and it is not a polish
      // item. Measured through the real engine at the rate Bluesky actually
      // produces -- thirty events a second, sixteen voices, a cathedral --
      // the output peaked at 25.1 with 8.6% of samples hard-clipped, and on
      // Gongs 14.3%. That is the "saturation, and then the sound gives up"
      // this was reported as: the destination clips everything past 1.0, and
      // an audio thread asked to render that on an old machine falls behind
      // and stops.
      //
      // Settings are a limiter's rather than a compressor's: no knee, a high
      // ratio, and a fast attack, so it does nothing at all until the sum
      // actually exceeds the threshold. Below that it is a wire.
      this._limiter = this._ctx.createDynamicsCompressor();
      this._limiter.threshold.value = -6;
      this._limiter.knee.value = 0;
      this._limiter.ratio.value = 20;
      this._limiter.attack.value = 0.002;
      // Long enough not to pump on a bell's decay, short enough to recover
      // between bursts.
      this._limiter.release.value = 0.25;

      // And a soft clip after it, because a compressor is not a guarantee.
      // With the limiter alone the same measurement still peaked at 3.5 --
      // a two-millisecond attack lets the front of a transient through, and
      // a ratio of twenty is not infinity. This curve is a tanh: it is a
      // straight wire under about a third of full scale, bends above it, and
      // cannot return a value outside [-1, 1] whatever it is handed. Hard
      // clipping is what a speaker does with anything past 1.0 and it is the
      // ugliest sound in digital audio; this is the same job done gently.
      this._ceiling = this._ctx.createWaveShaper();
      this._ceiling.curve = softClipCurve();
      this._ceiling.oversample = '2x';

      this._master.connect(this._limiter);
      this._limiter.connect(this._ceiling);
      this._ceiling.connect(this._ctx.destination);
      this._buildBus();
    }
    return this._ctx;
  }

  /**
   * bus -> dry -> master
   *     -> send -> convolver -> wet -> master
   *
   * The dry path is never touched. A reverb that reduces the direct sound as
   * it is turned up moves the instrument away from you instead of putting a
   * room around it, and that is the commonest way to make one sound bad.
   */
  _buildBus() {
    const ctx = this._ctx;
    this._bus = ctx.createGain();
    this._dry = ctx.createGain();
    this._send = ctx.createGain();
    this._wet = ctx.createGain();
    this._convolver = ctx.createConvolver();
    this._convolver.normalize = false;    // the impulses are normalised already
    this._dry.gain.value = 1;
    this._wet.gain.value = 1;
    this._bus.connect(this._dry).connect(this._master);
    this._bus.connect(this._send).connect(this._convolver).connect(this._wet).connect(this._master);
    this._applySpace();
  }

  _applySpace() {
    if (!this._ctx) return;
    const spec = SPACES[this._space] || SPACES[DEFAULT_SPACE];
    const ir = impulse(this._ctx, this._space);
    const t = this._ctx.currentTime;
    if (ir) this._convolver.buffer = ir;
    // Ramped, not set: changing the room under a ringing note should be a
    // door opening, not a click.
    this._send.gain.cancelScheduledValues(t);
    this._send.gain.setTargetAtTime(ir ? (spec.wet ?? 0.25) : 0, t, 0.08);
  }

  /** The room everything is played into. */
  get space() {
    return this._space;
  }

  set space(name) {
    if (!SPACES[name] || name === this._space) return;
    this._space = name;
    this._applySpace();
  }

  /** Node that instruments should connect to. */
  get destination() {
    this.ctx;
    return this._bus;
  }

  get locked() {
    return this.ctx.state !== 'running';
  }

  /** Must be called from inside a user gesture. Resolves true when audible. */
  /**
   * The synchronous half of unlocking, and the half that must not be deferred.
   *
   * A browser grants the right to start audio only while a user gesture is
   * being handled, and on iOS that right does not survive an `await`. Anything
   * asynchronous before this call -- loading a kit, for instance -- spends the
   * tap before it is used, and resume() is then refused. Call this first,
   * synchronously, from the handler itself.
   */
  resumeSync() {
    const ctx = this.ctx;

    // iOS routes Web Audio through the "ambient" session by default, which the
    // hardware ring/silent switch mutes -- the page looks alive and plays
    // nothing. Declaring playback intent opts out of that. Safari 16.4+; the
    // guard keeps every other browser unaffected.
    try {
      if (typeof navigator !== 'undefined' && navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch (e) {
      /* not supported here; nothing is lost */
    }

    try {
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      /* reported by the state, not by throwing */
    }

    // iOS additionally wants a buffer actually started during the gesture.
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {}

    return ctx.state;
  }

  async unlock() {
    const ctx = this.ctx;
    this.resumeSync();

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        return false;
      }
    }

    // Mobile browsers suspend the context whenever the tab is backgrounded,
    // and do not always resume it on return.
    if (!this._watchingVisibility && typeof document !== 'undefined') {
      this._watchingVisibility = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this._ctx && this._ctx.state === 'suspended') {
          this._ctx.resume().catch(() => {});
        }
      });
    }

    // A context can also stop while the tab is in front, and nothing tells
    // the page when it does: an audio thread that misses its deadlines often
    // enough is suspended by the browser, the device it was playing to can be
    // taken away, and on some machines it simply stops. All of them are felt
    // the same way -- the sound gives up and never comes back, with nothing on
    // screen admitting it. Two seconds is often enough to be unnoticeable and
    // rare enough to cost nothing.
    if (!this._watchdog) {
      this._watchdog = setInterval(() => {
        const c = this._ctx;
        if (!c || this._muted) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (c.state === 'suspended' || c.state === 'interrupted') {
          this.recoveries++;
          c.resume().catch(() => {});
        }
      }, 2000);
    }
    return ctx.state === 'running';
  }

  get volume() {
    return this._volume;
  }

  set volume(v) {
    this._volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this._master && !this._muted) {
      const t = this._ctx.currentTime;
      this._master.gain.cancelScheduledValues(t);
      this._master.gain.setTargetAtTime(this._volume, t, 0.02);
    }
  }

  get muted() {
    return this._muted;
  }

  set muted(on) {
    this._muted = Boolean(on);
    if (this._master) {
      const t = this._ctx.currentTime;
      this._master.gain.cancelScheduledValues(t);
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._volume, t, 0.02);
    }
  }

  /** MediaStream carrying the master bus, for MediaRecorder. */
  captureStream() {
    if (!this._capture) {
      this._capture = this.ctx.createMediaStreamDestination();
      // After the limiter, not before it. A recording has to carry the room,
      // so it cannot be taken from the bus -- and it has to carry what you
      // actually heard, so it cannot be taken from the master either: tapped
      // there it would keep every peak the limiter had just held back, and a
      // recording of a busy feed would clip where the speakers did not.
      (this._ceiling || this._limiter || this._master).connect(this._capture);
    }
    return this._capture.stream;
  }
}
