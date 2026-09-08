// AudioContext ownership, master gain, the room, and the autoplay unlock.

import { SPACES, DEFAULT_SPACE, impulse } from './space.js';
//
// Autoplay policy is not an edge case: no sound exists until a user gesture
// resumes the context. The original hid this behind a Chrome version sniff.
// Here it is part of the public API — call unlock() from a click handler.

export class AudioEngine {
  constructor({ volume = 0.7, latencyHint = 'interactive', space = DEFAULT_SPACE } = {}) {
    this._volume = volume;
    this._muted = false;
    this._latencyHint = latencyHint;
    this._ctx = null;
    this._master = null;
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
      this._master.connect(this._ctx.destination);
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
      // The master, not the bus: a recording has to carry the room, and the
      // bus is upstream of it.
      this._master.connect(this._capture);
    }
    return this._capture.stream;
  }
}
