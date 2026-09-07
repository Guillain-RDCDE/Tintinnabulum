// Sending the work to a second screen.
//
// The projection window runs its own renderer rather than mirroring this one.
// Mirroring would mean copying a canvas between windows every frame -- slow,
// soft, and locked to this window's aspect ratio. Forwarding the events instead
// means a 4:3 projector, a portrait screen in a gallery and an ultrawide panel
// each get a composition made for their own shape.
//
// BroadcastChannel needs no server, so this works from a static host. It is
// same-origin only, which is exactly the scope wanted: the wall is another
// window of the same page, not a stranger's.

const CHANNEL = 'tintinnabulum';

/**
 * @param {object} io
 * @param {() => object} io.settings  the current look, whenever it is asked for
 */
export function createProjector({ settings }) {
  const supported = typeof BroadcastChannel === 'function';
  const channel = supported ? new BroadcastChannel(CHANNEL) : null;
  let listeners = 0;
  let onChange = () => {};
  let handle = null;

  if (channel) {
    channel.onmessage = (m) => {
      const msg = m.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'hello') {
        // A window that has just opened knows nothing. Tell it everything
        // rather than leaving it on defaults until somebody moves a slider.
        listeners++;
        channel.postMessage({ type: 'settings', settings: settings() });
        onChange(listeners);
      }
      if (msg.type === 'goodbye') {
        listeners = Math.max(0, listeners - 1);
        onChange(listeners);
      }
    };
  }

  return {
    supported,
    get listeners() {
      return listeners;
    },

    /** Called for every event the engine accepts. */
    send(ev) {
      if (!channel || !listeners) return;
      // Only what a renderer needs. `data` is the producer's whole original
      // payload, which can be a kilobyte of JSON per event and is of no use to
      // a picture; sending it would put a firehose through a message port.
      channel.postMessage({
        type: 'event',
        event: {
          magnitude: ev.magnitude,
          polarity: ev.polarity,
          id: ev.id,
          category: ev.category,
          accent: ev.accent,
          label: ev.label,
          url: ev.url,
          ts: ev.ts,
          dimmed: ev.dimmed,
          map: ev.map,
        },
      });
    },

    /** Push the current look across, after anything visual changes. */
    sync() {
      if (!channel || !listeners) return;
      channel.postMessage({ type: 'settings', settings: settings() });
    },

    clear() {
      if (channel) channel.postMessage({ type: 'clear' });
    },

    /**
     * Open the projection window.
     *
     * Deliberately a real window rather than a fullscreen overlay on this one:
     * an exhibition puts the work on a projector and the controls on a laptop,
     * and those are two displays. A blocked pop-up is reported rather than
     * failing quietly, because the failure is invisible otherwise.
     */
    open() {
      const url = new URL('project.html', location.href).href;
      handle = window.open(url, 'tintinnabulum-projection', 'width=1280,height=800');
      return Boolean(handle);
    },

    get isOpen() {
      return Boolean(handle && !handle.closed);
    },

    onListeners(fn) {
      onChange = fn;
    },
  };
}
