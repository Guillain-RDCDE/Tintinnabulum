# Reference

[← Back to the README](../README.md) · [How it works](HOW-IT-WORKS.md)

---

## Worth trying

Open the sandbox and change one thing at a time.

| | |
|---|---|
| **Sound → Water** | The same events as drops in a cavity. Twelve of the fifteen kits are pure synthesis, with no audio files at all. |
| **Sound → Gongs** | Pair it with Earthquakes. Long, slow, inharmonic. |
| **Sound → Scale → pentatonic** | Notes snap to five. It stops sounding arbitrary and starts sounding composed. |
| **Sound → Restraint** | Space between notes. On a fast feed, only the most significant event in each gap sounds, and the rest are passed over. |
| **Coinbase** | Buys ring, sells pluck. The one feed where direction means something on its own. |
| **Several Wikipedias at once** | Pick them from the flag grid. Four together are denser than one, and more musical. |
| **Look** | Twenty-one visualisations and seventeen palettes. Marks already on screen recolour at once. |
| **Record** | Captures what you are hearing to an audio file. |
| **Untick "Large events sound low"** | Inverts the mapping. Large edits turn shrill. Worse, and instructive. |

Everything lives on one page, in six sections you can fold away. Each says
what it is set to. Each keeps the rest behind **Advanced**. No setting exists
twice.

---

A sonification engine with no dependencies.

Anything that reduces to **(magnitude, polarity, identity)** can be heard and
seen. Latencies. Commits. Build results. Queue depths. Sensor readings.

No build step. No bundler. No `npm install`. ES modules and `node:http`.

### The event contract

`magnitude` is the only required field.

| Field | Type | Meaning |
|---|---|---|
| `magnitude` | number | Size of the event. Drives pitch and radius. A negative value implies `polarity: -1`. |
| `polarity` | `1` / `-1` / `0` | Instrument choice: bell, pluck, neutral. |
| `id` | string | Stable identity. Seeds the on-screen position, so the same id always lands in the same place — an article edited twice pulses in one spot. |
| `category` | string | Colour and instrument override (`user`, `anon`, `bot`, `alert`, or your own). |
| `accent` | boolean | Rare, notable event: plays the swell, shows a banner, bypasses voice stealing. |
| `label` / `url` | string | Shown on hover; clicking the circle opens the url. |
| `ts` | number | Epoch ms, defaults to now. |
| `data` | any | Your original payload, passed through untouched. |

### Library use

```js
import { Sonifier, CanvasSink, wikipedia } from './src/index.js';

const son = new Sonifier({
  kit: 'synth',                       // or 'hatnote' for the sampled bells
  mapping: { mode: 'adaptive', scale: 'pentatonic', range: 27 },
  voices: { maxVoices: 16, maxPerSecond: 25 },
});

son.use(new CanvasSink('#canvas', { palette: 'bronze' }));
await son.unlock();                   // must be called from a click handler
son.connect(wikipedia({ langs: ['en', 'fr'] }));

son.emit({ magnitude: 512, id: 'anything', category: 'alert' });
```

### Musical rules

Five controls decide how a stream of numbers becomes music.

| Control | Effect |
|---|---|
| **Scale** | Nineteen of them: modes, pentatonics, blues, whole-tone, octatonic, the Japanese *hirajoshi*, *in-sen* and *kumoi*, and bare fourths, fifths and octaves. Pitches snap to the set, so nothing lands outside it. |
| **Key** | Transposes the whole thing. |
| **Humanise** | Up to ±2 semitones of wobble. Repeated values stop sounding mechanical. |
| **Tempo** | Events arrive whenever the world produces them, which is arrhythmic by definition. A tempo holds each note until the next quarter, eighth or sixteenth. The same data turns metrical. |
| **Restraint** | Space between notes. See below. |

```js
son.mapper.setScale('hirajoshi');
son.mapper.root = 5;          // transpose to F
son.mapper.jitter = 0.8;      // semitones of humanising
son.audio.setTempo(96, 8);    // eighth notes at 96bpm; 0 for free time
son.audio.setRestraint(700);  // ms between notes; 0 sounds everything
```

Quantising costs a little synchronisation. A note waits at most one
subdivision, so at a slow tempo the picture leads the sound.

### Restraint

Wikipedia produces a couple of edits a second. Each note is a bell with a
two-second decay, and the silence between them is filled by resonance. That is
most of why it is pleasant to listen to.

Point the same engine at a feed running thirty a second and there is no silence
left. Every note is masked by the next. The result is a texture, not a rhythm.

A rate cap does not fix this. The voice pool has one, and it spends its token
on whichever event happens to arrive while a token is free — so what comes out
is an arbitrary sample of the stream at a constant rate. Which is what
undifferentiated noise sounds like.

`setRestraint(ms)` chooses instead of thinning. Events arriving inside a gap are
held. When the gap elapses, the most significant of them sounds and the rest are
passed over. Accents outrank significance, because the point of marking an event
notable is that a burst of ordinary ones must not bury it.

The peaks survive. The filler does not. The rhythm becomes the shape of the
data rather than the shape of the network.

It costs latency: a note can wait one gap. The visuals are not held back, so at
a long gap the picture leads the sound.

### Pitch that calibrates itself

Most sonification code carries a constant tuned to one dataset, which makes it
useless for any other. The default `adaptive` mapping instead ranks each
magnitude against a rolling window of the last 500, so an unfamiliar source
finds its own range within about sixteen events.

The test suite pins down the difference. Given latencies clustered between 40
and 60 ms, a fixed logarithmic curve tuned for Wikipedia's byte counts collapses
into **one semitone**, while the adaptive mapping still spans the full **27**.
Use `log` or `linear` with an explicit `domain` when the range is known in
advance.

### Voice allocation

Under load, a note may steal the weakest sounding voice rather than being
dropped in arrival order, so a burst of small events never masks the one large
event inside it. `maxPerSecond` adds a token-bucket ceiling on top.

### Sources

Eight live feeds are built in. All public, all keyless, all reachable over TLS
from a static page.

| Feed | What you hear | Rate |
|---|---|---|
| `wikipedia({langs})` | Edits across 42 Wikipedia editions, pitched by bytes changed | busy |
| `bitcoin()` | Unconfirmed transactions, pitched by value. **The feed the idea began with:** Listen to Wikipedia was built after BitListen, which sonified exactly this | steady |
| `coinbase({product})` | Trades as they execute — **buys ring, sells pluck**, the one feed that supplies a meaningful polarity of its own | busy |
| `earthquakes()` | USGS seismic events. The only feed where *magnitude* is already the field's own word | a handful an hour |
| `bluesky()` | The public post firehose, pitched by post length | very busy |
| `github()` | Pushes, pull requests, releases and stars across GitHub | polled once a minute |
| `noaaAlerts()` | Active US severe-weather alerts, pitched by severity. Each carries the moment it was issued, so the replay keeps the shape of the day | a few hundred standing |
| `hackerNews()` | Front-page stories, pitched by score and comments. A new story always scores one, so the front page is used instead: it spans three orders of magnitude | slow |

Bluesky labels carry the size of a post rather than its text: an unfiltered
firehose is not something to put on someone's screen unasked. The full record
stays in `event.data`.

And the generic adapters:

| Factory | Use |
|---|---|
| `wikipedia({langs, backend})` | `'eventstreams'` (Wikimedia's own HTTPS SSE) or `'wikimon'` (adds `geo_ip`, `hashtags`, `mentions`) |
| `sseSource({url, map})` | Any Server-Sent Events feed |
| `websocketSource({url, map})` | Any WebSocket, with exponential-backoff reconnect |
| `pollSource({url, interval, map})` | Any JSON endpoint, with de-duplication by id |
| `ingestSource({url})` | The bundled ingest server |
| `manualSource()` | Push events in by hand |
| `randomSource({rate})` | Synthetic traffic, for tuning without a network |

A source is any object with `{ name, start(emit), stop() }`, so writing your own
takes a dozen lines.

### Sending your own data

Run the ingest server, which also serves the page:

```bash
node server/ingest.mjs           # http://localhost:8080/demo/
```

```
POST /emit          {"magnitude": 1200, "id": "build-42"}     — or an array
GET  /emit?magnitude=42&id=quick-test                          — convenient from curl
GET  /events[?replay=20]                                       — SSE fan-out
GET  /stats
```

Query parameters name the target fields. A value beginning with `$.` is a path
into the posted body; anything else is a literal. That single rule is what
allows arbitrary JSON to be piped in without writing an adapter:

```bash
# request latency, straight from your own logs
curl -X POST "localhost:8080/emit?magnitude=\$.duration_ms&id=\$.route&category=\$.level" \
     -H 'Content-Type: application/json' \
     -d '{"route":"/api/users","duration_ms":312,"level":"warn"}'

# a repository's history: one note per commit, pitched by lines changed
git log --format='%H' -n 200 | while read sha; do
  n=$(git show --numstat --format= "$sha" | awk '{s+=$1+$2} END {print s+0}')
  curl -s -o /dev/null "localhost:8080/emit?magnitude=$n&id=$sha"
done
```

Fan-out uses Server-Sent Events rather than WebSocket: the browser only ever
consumes this stream, `EventSource` reconnects on its own, and SSE requires
nothing beyond `node:http`.

### Instruments

Implement `load(ctx)` and `play(ctx, dest, {semitone, velocity})` and you have a
new instrument.

Fifteen kits ship, selectable at runtime. Three of them are places rather than instruments.

| Kit | Sound |
|---|---|
| **Bells** | The recorded celesta and clavichord — the original sound |
| **Synth bell** | An FM bell and a plucked string, generated |
| **Water** | Drops in a cavity; the rising pitch is what makes it read as water |
| **Music box** | Plucked metal tines, bright and short |
| **Marimba** | Tuned wooden bars, the least tiring over a long session |
| **Gongs** | Large, slow, deliberately inharmonic. Best with a sparse feed |
| **Glass** | Long and ringing; turns a busy feed into a wash |
| **Wind chimes** | Tubes rather than bars, with a long tail |
| **Steel pan** | Nearly harmonic partials, so it sings where a gong clangs |
| **Plucked strings** | Harp above, deep pizzicato below. The warmest of the set |
| **Dawn chorus** | Birdsong, built from swept whistles rather than recordings |
| **Night** | Crickets and low wind. The quietest thing here |

Only the first uses audio files. **Twelve of the fifteen are pure synthesis: nothing to download, nothing
to license, and they work offline.** Three carry recordings — the celesta, and
the animal calls in the two ambiences, all public domain or CC0.

- `SampleInstrument` plays recorded banks, resampled through `playbackRate`, so
  pitch is continuous rather than limited to the number of recorded notes.
- `SynthInstrument` needs no audio files. FM and subtractive engines, with a
  `sweep` parameter that bends the pitch during the attack — that bend is the
  entire difference between a water drop and a beep.

```js
son.setKit('water');            // or any name in KITS
```

`hatnoteKit()`, `synthKit()` and `makeKit(name)` return `{add, sub, accent}`
sets and are interchangeable at runtime; nothing is swapped in until it can
actually play. Sample banks resolve relative to the library itself, so the
project runs from any mount point.

### Synthesis engines

Five, and the preset table is the only thing that chooses between them.

| | |
|---|---|
| `fm` | An operator pair. Cheap, and the honest way to get the inharmonic clang of struck metal out of two oscillators. |
| `sub` | An oscillator through a filter. Everything pitched and ordinary. |
| `noise` | Filtered noise. Surf, fire, wind: things with no pitch at all. |
| `modal` | A struck body, as the sum of its modes. |
| `string` | Karplus-Strong. A real plucked string. |

**Modal** ([`src/audio/modal.js`](../src/audio/modal.js)) is what a bell, a bar
or a clay pot actually is: a set of frequencies belonging to the shape rather
than to a fundamental, each dying at its own rate. Write that down and it is

```
s(t) = Σ aᵢ · e^(−t/τᵢ) · sin(2π fᵢ t + φᵢ)
```

The ratios are measured properties of the objects. A tuned bell's tierce is a
**minor** third above its prime, which founders have tuned in since the
seventeenth century and is the whole reason a bell sounds like grief. A tubular
bell is a free-free bar: 1 : 2.76 : 5.40 : 8.93, nothing near a harmonic
series. A marimba bar has its underside cut in an arch to pull the second and
third modes to exactly four and ten times the first, which is why a marimba
sings where a xylophone knocks.

The obvious Web Audio implementation — a noise burst through a bank of high-Q
bandpass filters — was tried first and **does not work**, which is worth
recording because it looks right. A biquad rings for about `Q / (π f)` seconds,
so a three-second bell at 300 Hz needs a Q near three thousand: past the API's
limit of a thousand, and unstable well before it. Measured, that version gave a
peak of 0.002 and a quarter-second ring where three and a half were asked for.
Summing the sinusoids directly is exact rather than an approximation of the
exact thing, and it can be cached.

**String** ([`src/audio/string.js`](../src/audio/string.js)) fills a buffer one
wavelength long with noise and reads it round, averaging each sample with the
one before. The noise is the pluck; the averaging is the string losing its high
partials first, which is what a real one does. Where along the string it was
plucked is a comb filter on the excitation and is most of the character —
near the bridge thin and bright, near the middle round.

It is rendered into a buffer rather than built from a `DelayNode` with
feedback, which is the obvious way and also does not work: a feedback loop
through a `DelayNode` is quantised to one render quantum in every browser, so
the shortest loop is 128 samples and the highest note about 340 Hz.

### How loud is each kit

Twenty-two kits written at different times were not the same loudness and were
not close. Measured through the real engine on one stream of events, Handbells
came out **forty-seven times quieter** than the Hatnote bells, and the Hatnote
bells peaked at 3.2 — clipping hard. Choosing a kit meant choosing the volume
too, and two of them could not be heard after it.

Each kit now carries a `level`, and none of them was chosen by ear:
[`tools/level-kits.mjs`](../tools/level-kits.mjs) plays every kit the same
seeded stream through the same engine, measures it, and writes the correction.

```bash
node tools/level-kits.mjs            # measure and print
node tools/level-kits.mjs --write    # measure and write the levels in
```

**Two constraints, and whichever binds wins.** Matching loudness alone was the
first attempt and it made things worse: RMS says nothing about crest factor, so
a kit of sharp transients — water drops, clay, a koto — has a low RMS and tall
peaks, and multiplying it up to the loudness target pushed twelve kits past
one. They were level with each other and clipping. A kit is brought to the
loudness target unless that would put its peaks over the ceiling, in which case
the ceiling decides, and a peaky kit ends up quieter than the target. That is
correct: it is what a peaky kit is.

The measured spread went from fourteen to one down to about three to one, with
nothing clipping. A kit added later starts at 1 and is measured with the rest.

### The room

Everything plays into a bus that goes two ways: straight through, and through a
convolver. The dry path is never touched — a reverb that lowers the direct
sound as it comes up moves the instrument away from you instead of putting a
room around it, and that is the commonest way to make one sound bad.

| | |
|---|---|
| **Dry** | No room at all. |
| **Room** | Small and soft, with the walls close enough to hear. |
| **Hall** | Long enough to notice, short enough to stay out of the way of the next note. |
| **Cathedral** | Five seconds of stone. Everything above two kilohertz is gone within one. |
| **Cistern** | Hard wet walls very close: the early reflections are nearly as loud as the sound. |
| **Plate** | A sheet of steel under tension, as the studios of the 1960s used. No early reflections at all, deliberately — there are no walls. |
| **Canyon** | Reflections far enough apart to be heard one at a time. |

```js
son.space = 'cathedral';
```

The impulse responses are **built, not recorded**
([`src/audio/space.js`](../src/audio/space.js)), which for this purpose is not
a compromise: an impulse response is noise with an envelope on it plus a
handful of discrete early reflections, and both are two loops. Recordings would
be large files with awkward licences and this project ships neither.

Three things separate a room from a wash of noise, and all three are in there:
the **early reflections**, whose spacing tells the ear how big the place is;
**frequency-dependent decay**, because air absorbs treble faster than bass, so
a cathedral goes dark as it dies; and **two different channels**, because the
same noise in both ears is a sound inside your head rather than a space around
it.

They are normalised **by energy, not by peak**, and the difference is not
academic. Convolution sums the whole impulse, so a five-second tail has ten
times the energy of a half-second one at the same peak. The first version
normalised the peak and measured output peaks of 7.9 against a dry 0.48: every
room clipped, and the long ones clipped hardest, so the reverb got worse
exactly as the room got bigger.

### Granular

`GranularInstrument` ([`src/audio/granular.js`](../src/audio/granular.js)) cuts
a sample bank into fifty-millisecond grains and scatters them in time, pitch
and stereo position. It is the one technique that turns a small set of
recordings into an unbounded amount of sound, which is exactly this project's
constraint: twelve field recordings become a hedgerow rather than a queue of
birds.

The envelope matters more than anything else. A grain cut with hard edges is a
click at each end, and a cloud of clicks is not a texture — so each is faded in
over a third of its length and out over the rest. The grains are spread with a
bias towards the start, because a cloud spread evenly has no onset, and an
event with no onset is not heard as an event at all.

### Tunings

Thirteen of the scales are selections from the twelve equal semitones. Three
are not: **just**, **harmonic** and **bell** have degrees that are fractions of
a semitone, because they come from whole-number frequency ratios rather than
from dividing an octave into twelve equal parts. A degree may be a float and
always could be — the mapper only ever raises two to it.

Equal temperament is a compromise that lets a keyboard play in every key.
Nothing here changes key, so there is nothing to buy with it, and what it costs
is real: an equal-tempered major third is fourteen cents sharp of the 5:4 the
ear is listening for, and on a long-ringing bell that is a beat you can count.

### Palettes

Seventeen, selectable at runtime and stored as plain data in
[`src/visual/palettes.js`](../src/visual/palettes.js):

| | | |
|---|---|---|
| **Marine** — deep water, the default | **Blueprint** — technical, calmest | **Nocturne** — slate blue, the original |
| **Bronze** — brass and copper | **Aurora** — mint and violet | **Ember** — banked fire |
| **Ultraviolet** — magenta and cyan | **Sakura** — blossom on plum | **Nordic** — ice and steel |
| **Lacquer** — vermilion and gold on black | **Solar** — daylight on deep navy | **Sunset** — coral, teal and gold |
| **Neon** — arcade colours on black | **Rust** — weathered iron and sand | **Daylight** — ink on paper |
| **Papyrus** — a warmer light option | **Monochrome** — lightness only | |

```js
new CanvasSink('#canvas', { palette: 'bronze' });
sink.setPalette('aurora');                    // circles already drawn recolour
sink.setPalette({ anon: '#00ffcc' });         // or override individual roles
```

Adding one means adding an entry to that file. The test suite holds them to
measured standards rather than taste: label text must clear WCAG AA (4.5:1)
against its background, circles must remain visible at their 50 % fill opacity,
and the categories must be perceptually distinct — **CIELAB ΔE ≥ 22**, not
luminance contrast, because two colours can differ obviously to the eye while
sharing a luminance band. *Monochrome* is the deliberate exception, held to a
lightness floor instead, since its purpose is to remain readable without colour
vision.

### Colour variety

A palette names one colour per category. For a long time that meant a screen
carried four.

That is not what made it look flat. The commonest category in a live feed is
`user`, and in fifteen of the seventeen palettes `user` was a near-white. Most
of a running screen was white, whichever palette you chose. Every palette now
gives that category a real hue.

On top of that, each event takes its own shade of its category's colour.

```js
new CanvasSink('#canvas', { richness: 0.45, depth: true });
sink.setRichness(0);   // one exact colour per category
sink.setRichness(1);   // shades spread far enough to drift in hue
```

The variation is computed in OKLab, not HSL. Darken a teal in HSL and it slides
towards green, so one category would read as several
([`src/visual/color.js`](../src/visual/color.js)). Colours that fall outside the
gamut lose chroma rather than being clipped channel by channel, which is what
turns a dark ink into pure red.

Lightness varies first, hue last. Depth in a dense field comes from value.
Spreading hue early is how a visualisation turns into confetti.

`richness: 0` is an exact identity. It is the honest setting whenever colour is
meant to *identify* a category rather than decorate it.

`depth` adds a shallow gradient and an outline. The outline is the part that
matters: a pile of translucent marks with no edges averages into one pale wash.

### Keeping a burst from taking the machine

Feeds are not polite. Bluesky runs to a couple of thousand posts a minute, and
a backlogged poll can deliver a day at once. A surge has to cost frames, never
the tab.

```js
new CanvasSink('#canvas', { maxParticles: 800 });
sink.setMaxParticles(3000);   // longer history, more work per frame
sink.setMaxParticles(300);    // for a machine that is struggling
```

One number bounds everything that accumulates.

That was not always true. The marks were capped, but each scene also kept
collections of its own — falling drops, flow-field trails, spiral seeds,
skyline bars — behind private hard-coded limits. Raising the ceiling governed
the marks and nothing else. They now size against a shared budget
([`src/visual/scenes/budget.js`](../src/visual/scenes/budget.js)), by a factor per
scene: a trail costs sixty line segments, a spiral seed costs one disc.

Two collections had no ceiling at all, and neither depended on how many marks
were on screen.

- The banner queue was drawn newest-first and stopped at the first one still
  alive. On any feed with a steady trickle of accent events that one was always
  fresh, so the loop broke immediately and every stale banner behind it was
  never examined again. Expiry and drawing are now separate passes.
- The list of event timestamps behind the rate counter was trimmed inside the
  counter's own draw call, so switching the counter off left it growing by one
  entry per event for as long as the page stayed open.

The test suite floods the renderer with thousands of events per scene and
asserts that nothing exceeds its budget.

### Ambiences

Twelve of the kits are instruments: one event, one note. Six are not.

| | |
|---|---|
| **Seashore** | A swell that rises with the feed, waves breaking on the large events, foam on the small ones. A gull, rarely. |
| **Forest fire** | A rumble that grows, cracks on every event, a log giving way on the large ones, wind through the tops. |
| **Camargue night** | Crickets, a low warmth off the marsh, frogs on the events, reeds on the small ones. A heron, once in a long while. |

Three more are not places but pieces: ways of building music out of a rate,
with the feed as the performer. Nothing in them is triggered and nothing is
sequenced, and neither was the music they come from.

| | |
|---|---|
| **Cathedral** | A wall of low brass. Six sawtooth partials over a root of 41 Hz -- an octave below, the fifth, and up to the fourth harmonic -- through a filter low enough that at rest you hear the fundamental and almost nothing else. The crescendo is the filter opening, which is how a brass section actually gets louder and is why turning up a gain never sounds the same. A fifth two octaves above enters only when the feed is busy, and it is what turns the drone into a chord. |
| **Airports** | Five held notes on loops of 17.3, 20.9, 25.1, 31.7 and 37.3 seconds, after the tape pieces of 1978. No two lengths share a factor, so the combination has a period of hours and what you hear has almost certainly not been heard before. There is tape hiss, because every one of those loops was quarter-inch tape and without it the piece sounds like a synthesiser pretending. |
| **Glacier** | A sub at 32 Hz that you feel rather than hear, ice singing three octaves above it, and deliberately nothing in between: the gap is what makes the two ends sound far apart. |

The loop envelope is one oscillator, not a sequencer. A sine would swell and
fade symmetrically and every voice would sound like a hand on a fader, so the
envelope -- in over two seconds, out over ten -- is computed as a Fourier series
and handed to the oscillator as a `PeriodicWave`
([`src/audio/loop-wave.js`](../src/audio/loop-wave.js)). One node per voice, no
scheduling, and it runs for as long as the piece does.

Their event voices have attacks measured in **seconds** rather than
milliseconds. That is the only way a single event can join a piece that is
already sounding instead of interrupting it: anything under about half a second
reads as an onset, and an onset is an interruption.

An ambience reads the data **twice**, and that is the whole idea rather than a
costume over the old one.

- **The bed** answers *density*: how much is happening, measured over a rolling
  ten seconds. A quiet feed is a distant swell; a busy one is a sea getting up.
  Nothing about it is triggered — it runs continuously, and only its loudness
  and colour move, over seconds rather than instantly. A bed that jumped with
  the rate would be a volume control being turned; one that takes four seconds
  to answer is weather.
- **The voices** answer single *events*, exactly as an instrument kit does.

So the aggregate becomes texture and the individual event stays a detail inside
it. The bed is told about every event, including ones restraint or voice
stealing will not sound: a note that was dropped still happened, and the weather
should know.

**The animals are recordings; the weather is not.** Synthesis is convincing for
surf, fire and wind, because they are filtered noise and nothing else. It is
unconvincing for a gull, which is a resonant body with a vocal tract, and the
synthesised one was frankly unpleasant. So the gull, the frog and the heron are
real field recordings — a herring gull at Carolles, edible frogs in Poland, a
heron — all public domain or CC0, cut to the call and encoded small. Seven
clips, 76 kB in total, credited in [NOTICE](../NOTICE).

Crickets, surf and fire were available only under CC BY-SA, whose share-alike
term would attach to any adaptation. Those stay synthesised, which is the half
synthesis does well anyway.

This needed a third synthesis engine. Everything before it came from an
oscillator — which is why the old `breeze` is a detuned sawtooth under a filter,
a *pitched* approximation of wind. Surf, fire, rain and reeds are not pitched at
all; they are filtered noise ([`src/audio/noise.js`](../src/audio/noise.js)).
White, pink and brown buffers are generated once per context and looped, because
two seconds of noise is a few million random numbers and making one per note
would be heard as a stutter.

```js
son.setKit('shore');            // starts the bed with the kit
son.audio.bed.density;          // 0..1, what the sea currently thinks
son.setKit('bells');            // and silences it again
```

### Visualisations

A scene decides what a moment of data looks like. Forty ship, and
twenty-three of them are constructions anyone can look up: nodal figures, polar
curves, space-filling curves, recursive packings, growths and physics. None of that is anyone's
property and none of it is engineering, so what each scene actually has to
decide is the part that belongs to this project -- which of the construction's
parameters the live data turns.

Five come from the canon of generative art:

| | |
|---|---|
| **Chladni** | The nodal lines of a vibrating plate, after Ernst Chladni, 1787 — sand settles where the plate is still. The literal image of sound, which is what this project is. Each event retunes the plate and the figure walks to its new shape. |
| **10 PRINT** | `PRINT CHR$(205.5+RND(1))` — one line of Commodore BASIC from 1982, and the maze it draws forever. Truchet's sibling: each event flips one tile. |
| **Substrate** | Cracks that travel until they meet another, then split off at right angles. After Jared Tarbell, 2003. The longer it runs the more it looks like a city nobody planned. |
| **Reaction** | Gray-Scott: two substances, one feeding on the other. Turing's 1952 account of how a uniform thing becomes a patterned one. Each event drops reagent in and the pattern eats outward. |
| **Wave field** | A grid of short strokes turned by a noise field, in the manner of the flow-field studies of the 1970s onward. Each event bends the field near where it lands, so the whole grid leans towards the news. |

They were chosen on one criterion. Truchet is the scene people stop on, and the
reason is that it **accumulates**: the picture is the history of the feed rather
than its present moment, so leaving it running produces something. A scene that
fades only ever shows the last few seconds.

Two of them paint through an offscreen canvas rather than stroking every frame —
a plate mode is a hundred thousand samples and a reaction grid is thirty
thousand cells, and neither can be redrawn sixty times a second in this budget.
They are computed when they change and blitted when they do not.

The others:

| Scene | What it draws |
|---|---|
| **Pile** | Events fall, bounce and settle into a heap, so sheer volume becomes visible |
| **Threads** | Level threads pushed aside by each event, weaving a fabric |
| **Lissajous** | Each event draws a figure whose two frequencies come from its size |
| **Nebula** | Soft glows added on top of one another, so busy moments burn bright |


#### Drawing machines

Six figures that are a formula and a pen, and every one of them predates the
computer. A spirograph is a toothed wheel inside a ring, sold as a toy in 1965
and known as a hypotrochoid for a century before that. A harmonograph is two
pendulums and a pen, a Victorian parlour instrument. Guilloche is the
engine-turning on the back of a pocket watch and the border of a banknote.
Times-table string art is a nail-and-thread exercise from a school hall.

| | |
|---|---|
| **Supershape** | Gielis's superformula, 1997: one polar equation whose four numbers give circles, stars, petals and shards. Every event on screen gets a cell of a plate and draws its own. |
| **Maurer rose** | Peter Maurer, 1987: walk a rose curve in fixed angular strides and join the stops with straight lines. The rose is the ghost; the web across it is what the walk leaves. |
| **Spirograph** | A wheel rolling inside a ring with a pen through one of its holes. Each event sends a pen round, and each pen draws its whole closed figure. |
| **Harmonograph** | Two pendulums per axis, swinging down. Most events push the pendulum; only one that has had time to develop is replaced. |
| **Times table** | Mark N points round a circle and join each to its multiple. Two gives a cardioid, three a nephroid, and every whole number after that its own figure. |
| **Guilloche** | A rosette cut by a machine whose two gears run at a fixed ratio. The moire between neighbouring passes is the whole effect. |

The choice that matters in each is not the formula, which is anybody's, but
which of its parameters the data turns.

#### Recursion, packing and tiling

The family the drawing machines are not: these have no natural length, and what
they draw at minute ten is not what they drew at minute one.

| | |
|---|---|
| **Hilbert curve** | David Hilbert, 1891: one unbroken line that reaches every cell of a grid and never crosses itself. An event's position becomes a distance along it, and that stretch lights up. |
| **Dragon curve** | Fold a strip of paper in half repeatedly, then open every crease to a right angle. Events pay out more of the strip, so a quiet feed leaves it half unfolded. |
| **Chaos game** | Jump part of the way to a random corner, mark the spot, repeat. The rule mentions no triangle and a triangle is what appears. Sierpinski, 1915. |
| **Subdivision** | Every event splits the rectangle it lands in, across its longer side. Nothing decides where the lines go except the data. |
| **Circle packing** | Each event drops a circle where it landed and lets it grow until it touches another. What is left is the shape of the space nothing has used. |
| **Quasicrystal** | Plane waves at angles that share no common measure, so the interference never repeats. Shechtman, 1982, and a Nobel eight years after the ridicule. |


#### Systems

Six that are run rather than drawn. A drawing machine traces a curve and stops;
these are simulations, and the feed is not choosing a picture from them but
disturbing something that then goes on by itself.

| | |
|---|---|
| **Coral** | Diffusion-limited aggregation, after Witten and Sander, 1981. A particle wanders until it touches what is there, and sticks. It is how frost, soot, copper and coral all grow, and the branching is not in the rule — it emerges because the tips reach the wanderers first. |
| **Sandpile** | Drop grains on a square; any square holding four gives one to each neighbour, which may push those over too. Bak, Tang and Wiesenfeld called it self-organised criticality in 1987: the next grain may do nothing, or set off an avalanche across the whole field. |
| **Ripple tank** | The wave equation on a grid. Two events near each other interfere, and what is between them is what a ripple tank makes in a lecture theatre. |
| **Attractor** | Clifford Pickover's map, iterated. Four numbers decide the whole of it, and events move them. |
| **Voronoi** | Every point takes the colour of the nearest event. The boundary is where the first and second nearest are equally far, so it needs no edge detection — it falls out of the distance. |
| **Burin** | The canvas engraved, with event density as the tone, cut by the same engine as the kit cards. |

The sandpile topples in **sweeps over the whole grid** rather than from a work
queue, and that is not an optimisation. A queue is the obvious way and it is
unbounded: one avalanche pushes a cell for every topple, and a busy feed
measured twenty thousand entries against a ceiling of eight hundred. A sweep is
O(cells) and costs less — and because the pile is Abelian, toppling every ready
cell at once reaches exactly the same final state as toppling them one at a
time.

#### Dials

Twenty-eight scenes declare their own controls -- a hundred and three dials
between them -- and the panel draws whatever it finds --
adding a visualisation with three sliders needs no interface change. A dial is
a range with a default; values are clamped, held per scene, and forgotten only
when you ask:

```js
sink.paramsOf('truchet');        // [{ name, label, min, max, step, value }, ...]
sink.setParam('weight', 0.28);   // clamped into range
sink.param('weight');            // 0.28
sink.resetParams('truchet');     // back to the declared defaults
```

A scene declares them beside its drawing code and reads them through `api`:

```js
registerScene('truchet', {
  params: {
    cell:   { label: 'Tile size', min: 18, max: 140, step: 2, default: 64, rebuild: true },
    weight: { label: 'Line weight', min: 0.04, max: 0.34, step: 0.01, default: 0.16 },
  },
  frame(ctx, api) { ctx.lineWidth = api.param('cell') * api.param('weight'); },
});
```

`rebuild: true` marks a dial that changes the structure rather than the
drawing -- a tile size is a different grid, not a different colour -- so
turning it re-runs `init`. Those commit when the slider is released; the rest
follow the finger.

The full set:

| Scene | What it draws |
|---|---|
| **Bloom** | The original: each event opens once and fades, with a shockwave in its own shape |
| **Constellation** | Events become stars and join to their neighbours; bursts draw themselves as clusters |
| **Flow field** | Each event releases a mote into a slowly turning noise field, and it draws where it drifts |
| **Ripples** | Concentric wavefronts that cross and interfere |
| **Grid** | An ordered grid that each event knocks out of true, settling back — after Vera Molnár |
| **Truchet** | Quarter-arc tiles that flip as events land, so unbroken curves wander the field |
| **Orbits** | Each event is captured into an orbit; small ones fast and close, large ones slow and wide |
| **Rain** | Events fall, gather speed and break on a surface. The partner to the Water kit |
| **Radar** | A sweep that lights each event as it passes, so the field is read once a turn |
| **Spiral** | Events laid on a golden-angle spiral in arrival order, so the sequence becomes the form |
| **Tree rings** | A clock face: arrival sets the angle, size the distance out |
| **Terrain** | A ridgeline pushed up by each event and scrolling away, leaving a profile of what happened |
| **Skyline** | A scrolling record: one bar per event, height by size |

**Thumbnails are drawn, not stored.** Each card runs the real scene against
synthetic events for a hundred frames, which is what stops a card from ever
disagreeing with the canvas — a stored image would be stale the moment a
palette or a dial changed. That is affordable for a card you are looking at and
not for a panel full of them: painting all of them on load cost eleven seconds
before the page would respond, and the panels start folded, so not one of those
cards was on screen. Cards inside a folded panel are skipped and painted when
the panel is opened.

**Adding one is adding an object** to
one of the families in [`src/visual/scenes/`](../src/visual/scenes), or registering it from
outside:

```js
import { registerScene } from './src/index.js';

registerScene('rain', {
  label: 'Rain',
  positional: false,             // marks are not at their event's position
  init(api)      { api.scene.drops = []; },
  event(p, api)  { api.scene.drops.push({ x: p.x, y: 0, v: p.r }); },
  frame(ctx, api) { /* draw with the Canvas 2D context */ },
});
```

`api` carries `{ w, h, palette, particles, shape, now, dt, scene, param }`. Every
scene reads the same particle model, so lifetimes, hit-testing and the event
contract stay in one place.

**On p5.js:** it is a friendly wrapper over the Canvas 2D API this already
uses, so importing it would cost about a megabyte and the offline guarantee
while buying no capability. What was missing was not a library but this
extension point.

### The projection window

An exhibition puts the work on a projector and the controls on a laptop, which
are two screens. **Project** opens a second window that carries the picture and
nothing else: the controls in it fade after three seconds of stillness, `f` is
full screen, `c` clears.

It runs **its own renderer** rather than mirroring the first. A mirror would
mean copying a canvas between windows every frame -- slow, soft, and locked to
the source's aspect ratio. Forwarding the events instead means a 4:3 projector,
a portrait panel in a gallery and a 32:9 screen each get a composition made for
their own shape, and re-lay it out when the window changes. The marks also live
longer and run larger there, because a projection is watched from across a room.

The channel is a `BroadcastChannel`, so it needs no server and works from a
static host; it is same-origin, which is the whole intended scope. Events cross
it stripped of `data` -- the producer's original payload can be a kilobyte of
JSON per event and is of no use to a picture. Settings cross it too, so choosing
a palette on the laptop changes the wall, and a window that has just opened asks
for them rather than sitting on defaults.

### The kit plates

Each kit card carries an engraved vignette, cut by
[`src/visual/engrave.js`](../src/visual/engrave.js) at the moment it is drawn.

They were pictograms before -- an arc for a bell, a sine for a synth, a teardrop
for water. Accurate, and flat: eighteen of them side by side looked like a
stationery catalogue, and nothing in them said this was a tool for making
anything.

Engraving is the right answer, and not for nostalgia. An engraving is built from
exactly what a canvas is good at: one ink, one line at a time, and every tone in
the picture made by how thick that line runs and how close it lies to its
neighbour. It is sharp at any size, it costs nothing to ship, and it takes the
palette like everything else here.

**The one detail that matters more than the rest is that a burin line swells and
tapers.** A comb of even lines reads as a screen door; a line that thickens
where the form turns from the light and thins to nothing where it faces the
light reads as a solid object. So nothing here is stroked — every line is a
filled polygon whose width follows the tone underneath it, and a highlight is
made by the line stopping rather than by painting anything white.

| | |
|---|---|
| `burin` | one line, cut along a path, its width taken from the tone |
| `hatch` | parallel lines across a box |
| `crossHatch` | a second set, over the dark passages only — everywhere turns a picture into tartan |
| `contour` | lines that follow the form, which is what gives volume |
| `stipple` | dots between the lines, so mid-tones are not mechanical |
| `whiteLine` | cutting light out of a dark ground, after Bewick — the right technique for flame and water, whose subject *is* light |

A `tone` is a function `(x, y) -> 0..1`. Marks ask it what to do; a composition
only says where the form is. Two rules hold the set together: **one ink**, with
the accent used for at most one thing per card, and **the light always comes
from the upper left** — nothing looks more like clip art than a collection of
objects each lit from its own direction.

**Two sets of plates, and both are here.** The twenty-two in
[`demo/plates/`](../demo/plates) were made by an image model and are what the
cards show; the same twenty-two subjects are also cut by the burin, and that is
what they fall back to. [`tools/make-plates.mjs`](../tools/make-plates.mjs) is
what made them:

```bash
OPENAI_API_KEY=sk-... node tools/make-plates.mjs        # all twenty-two
OPENAI_API_KEY=sk-... node tools/make-plates.mjs koto   # or a few
node tools/make-plates.mjs --dry                        # the prompts, no calls
```

One style paragraph is shared by every subject, verbatim. Describing the style
differently per plate is exactly how a set of generated images stops being a
set, and it is the only thing worth being strict about here.

**What is stored is a mask, not a picture.** The model is asked for black line
work on plain white; what is saved is white pixels carrying the drawing in
their *alpha* channel. At draw time the mask is filled with the palette's ink,
so a generated plate follows the palette exactly as a cut one does. Without
that, seventeen palettes would have one set of colours for the cards and
another for everything else — which was the whole objection to generated art
here, and this is what answers it.

**It is printed dark on light**, as an engraving is: the paper and the ink are
both derived from the palette, so a warm scheme prints on warm paper. Filling
the mask with a light ink over the dark ground was the first version, and every
subject glowed white out of the dark — a photographic negative, which is the
one thing an engraving never looks like.

**It is fitted, not cropped.** The model returns 3:2 and the card is 16:9, so
covering the card cut fifteen per cent off the top and the bottom: it took the
heads off the birds and the top off the rose window. The plate is padded to the
card's shape instead, and because the padding is white it becomes transparent
in the mask and nothing shows. `--remask` redoes that step from the images
already downloaded, so adjusting how a plate is fitted never means buying the
images again.

**The burin stays, and stays the fallback.** A kit with no generated plate is
cut as before. So a kit added tomorrow is never blocked on an API key, the
project still works offline with none of this installed, and a missing folder
or a file that will not decode costs that one card its picture and nothing
else. A project that needs somebody else's service to draw its own buttons is
a project that stops working when that service does.

### Shapes

Used by the **Bloom** scene, which draws one mark per event. Eight marks are
available, plus `mixed`,
which assigns one per event from its identity — so a given article keeps the
same shape as well as the same place on screen.

| | | | |
|---|---|---|---|
| **Circle** — area tracks size directly | **Star** — five points | **Sparkle** — four-point twinkle | **Diamond** |
| **Hexagon** | **Burst** — eight thin rays | **Ring** — hollow, stays readable when crowded | **Petal** — six rounded lobes |

```js
new CanvasSink('#canvas', { shape: 'star', starfield: true });
sink.setShape('mixed');
sink.setStarfield(true);
```

The shockwave that expands from each event takes the shape of the mark that
produced it. `starfield` adds a fixed, slowly breathing field of stars behind
everything, drawn from a stable seed so it never crawls.

Shapes are pure geometry in [`src/visual/shapes.js`](../src/visual/shapes.js): a
`draw(ctx, x, y, r, rot)` that builds a path, nothing more. The swatches in the
sandbox are drawn with the same function as the canvas, so a preview can never
drift from what you actually get.

### Tests

```bash
npm test              # core logic and the ingest server
npm run test:browser  # headless Chromium, if playwright-core is installed
```

The browser suite verifies audio by rendering instruments through an
`OfflineAudioContext` and measuring peak amplitude, so a silent instrument
fails rather than passing quietly.

### Layout

Everything public is re-exported from [`src/index.js`](../src/index.js), so the
files below can be split or renamed without breaking a caller.

```
spec/                   the published input standard: three JSON Schemas and a page
profiles/               shipped mapping profiles, one JSON document each
sources/                shipped source descriptors: where live data comes from
src/core/               event contract, adaptive mapper, voice allocator, Sonifier facade
  expr.js               the mapping expression language: closed, bounded, total
  profile.js            compiling and applying a mapping profile
  source.js             descriptors: transport, extraction, secrets
src/audio/
  engine.js             AudioContext, unlock, the iOS synchronous resume
  instrument.js         the note-playing contract
  sample-instrument.js  sampled banks, resampled by playback rate
  synth-instrument.js   FM and subtractive engines, vibrato, pitch bend
  presets.js            timbres as data
  kits.js               named kits, and makeKit for your own
  noise.js              white, pink and brown buffers, made once per context
  loop-wave.js          the repeating swell, as a Fourier series
  string.js             Karplus-Strong, rendered to a buffer
  modal.js              a struck body, as the sum of its modes
  granular.js           a recording taken apart and put back as a cloud
  space.js              the room: impulse responses, built not recorded
  bed.js                the continuous layer, driven by event density
  ambiences.js          the three places, described as layers
  instruments.js        the barrel the rest of the library imports
  audio-sink.js         routing events to voices
  recorder-sink.js      offline rendering to WAV
src/visual/
  canvas-sink.js        the canvas loop
  engrave.js            the burin: hatching, contour, stipple, white line
  kit-art.js            twenty-two cut plates, one per kit
  kit-plates.js         generated plates, if any are installed
  scenes/               marks, fields, structures, physical, generative,
                        geometry, recursive, systems, budget, paint
  palettes.js           colour schemes
  color.js              OKLab shading, gamut fitting, per-event variation
  shapes.js             mark geometry
  kit-art.js            the drawn signature on each kit card
src/sources/
  transports.js         WebSocket, SSE, poll, manual, random, ingest
  feeds.js              Bitcoin, Coinbase, earthquakes, Bluesky, GitHub, NOAA, HN
  wikimedia.js          Wikipedia and its editions
server/
  ingest.mjs            zero-dependency ingest, fan-out and static server
  runner.mjs            drives descriptors: fetch or listen, de-duplicate, pace
sounds/                 the original sampled banks, and:
  field/                real animal calls, public domain and CC0
tools/
  render.mjs            drive the real visualiser headless, out to PNG
  contact-sheet.mjs     every scene on one sheet, to look at them
  level-kits.mjs        measure every kit and write the loudness corrections
  make-plates.mjs       the kit plates, from an image model, as masks
  make-social-preview.mjs  regenerate the card in .github/, from the engine
demo/
  demo.js               the sandbox page
  project.html/.js      the projection window: the picture, full screen, alone
  broadcast.js          forwarding events to that window
  connect.js            the "Your data" panel: the standard, without a server
  look.js               scenes, palettes, shapes, colour variety, the ceiling
  dom.js                picker, canvas sizing and caption helpers
  store.js              guarded local storage
  feed-catalog.js       what the sandbox can listen to, as data
test/                   core, server and browser checks
```

