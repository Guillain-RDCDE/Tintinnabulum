// Generate the kit plates as engravings, with an image model.
//
//   OPENAI_API_KEY=sk-... node tools/make-plates.mjs
//   OPENAI_API_KEY=sk-... node tools/make-plates.mjs handbells koto
//   ... --dry            print the prompts and call nothing
//   ... --force          regenerate plates that already exist
//   ... --remask         redo the masks from art/plates-raw/, calling nothing
//
// The plates cut by src/visual/engrave.js are honest engravings and they read
// as diagrams. This asks a model for the same subjects instead, with one style
// paragraph shared by all of them so the set holds together -- which is the
// whole difficulty with generated art, and the only thing worth being strict
// about here.
//
// WHAT IS STORED, AND WHY IT IS NOT A PICTURE
//
// The model is asked for black line work on plain white. What is saved is not
// that image: it is white pixels carrying the drawing in their ALPHA channel,
// so the plate is a mask rather than a picture. At draw time the mask is
// filled with the palette's ink, which means a generated plate follows the
// palette exactly as a cut one does. Without that, seventeen palettes would
// have one set of colours for the cards and another for everything else.
//
// The cut plates remain, and remain the fallback: a kit with no generated
// plate is engraved as before, so adding a kit is never blocked on an API key
// and the project still works offline with nothing installed.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RAW = join(ROOT, 'art', 'plates-raw');
const OUT = join(ROOT, 'demo', 'plates');

// The card is 148 by 84 CSS pixels and drawn at up to twice that. Three times
// gives a plate that is still sharp if the cards are ever made larger, and the
// files are a mask rather than a photograph, so they compress hard.
const W = 444;
const H = 252;

// --- the one paragraph every plate shares ---------------------------------
//
// Style is stated once and repeated verbatim. Describing it differently per
// subject is how a set of images stops being a set.
const STYLE = [
  'A nineteenth-century steel engraving.',
  'Pure black line work on a plain white background.',
  'Tone is made only by fine parallel hatching and cross-hatching, with the lines',
  'swelling and tapering as a burin cuts them; no grey wash, no shading, no gradients.',
  'Light falls from the upper left on every object.',
  'One centred subject, drawn small within generous white space, in the manner of a',
  'Victorian scientific plate or a book headpiece.',
  'Monochrome. No colour whatsoever. No text, no letters, no numerals, no signature,',
  'no border, no frame, no cartouche, no background scenery beyond what is named.',
  'Landscape format.',
].join(' ');

// --- what each plate shows -------------------------------------------------
//
// The same subjects the cut plates carry, so the two sets are alternatives to
// one another rather than two different ideas.
const SUBJECTS = {
  hatnote: 'A single cast bronze bell hanging from its headstock, seen from the side, with its clapper visible inside the mouth.',
  synth: 'A laboratory oscillograph trace: one clean sine wave drawn across a ruled measuring grid, as in a physics plate.',
  water: 'A single water droplet falling towards a still pool, with three concentric rings spreading on the surface below it.',
  musicbox: 'The steel comb of a cylinder music box, its graduated tines seen from slightly above, mounted on its bedplate.',
  marimba: 'A row of six tuned wooden marimba bars of decreasing length, resting on two rails, seen at a slight angle.',
  gongs: 'A large hammered bronze gong hanging in a frame, with a soft-headed beater resting beside it.',
  glassy: 'A single stemmed wine glass, empty, with the highlights left as bare white paper.',
  chimes: 'Five hanging metal wind-chime tubes of decreasing length, suspended from a bar.',
  steelpan: 'A Caribbean steel pan drum seen from above, its concave face beaten into distinct tuned note areas.',
  strings: 'The f-hole of a violin with four strings crossing it, seen close.',
  handbells: 'Two brass handbells with leather handles, one upright and one on its side.',
  clay: 'A thrown earthenware pot beside a single tuned wooden bar hanging on two cords.',
  koto: 'A Japanese koto seen down its length, its long strings passing over movable bridges.',
  aviary: 'A flock of eleven small birds in flight, scattered at different distances across the plate.',
  birds: 'A single songbird perched on a bare twig, its head raised in song.',
  night: 'A crescent moon above a bank of cloud, with a small owl silhouetted on a branch below.',
  shore: 'A breaking wave curling over, with spray thrown from its crest, seen along the shore.',
  fire: 'A campfire of crossed logs with flames rising from it, cut as white flame against dark hatching.',
  camargue: 'A grey heron standing among tall marsh reeds, seen from the side.',
  cathedral: 'The rose window of a Gothic cathedral, its stone tracery seen straight on.',
  airports: 'Two open reels of quarter-inch magnetic tape on a studio tape machine, the tape running between them.',
  glacier: 'The face of a glacier: angular planes of ice with a deep crevasse running down it.',
};

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const wanted = argv.filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted.filter((n) => SUBJECTS[n]) : Object.keys(SUBJECTS);

const unknown = wanted.filter((n) => !SUBJECTS[n]);
if (unknown.length) {
  console.error('no subject for: ' + unknown.join(', '));
  console.error('known: ' + Object.keys(SUBJECTS).join(', '));
  process.exit(2);
}

const promptFor = (name) => `${SUBJECTS[name]}\n\n${STYLE}`;

if (flag('dry')) {
  for (const n of names) console.log('\n=== ' + n + ' ===\n' + promptFor(n));
  console.log(`\n${names.length} prompts. Nothing was called.`);
  process.exit(0);
}

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && !flag('remask')) {
  console.error('OPENAI_API_KEY is not set.');
  console.error('');
  console.error('  OPENAI_API_KEY=sk-... node tools/make-plates.mjs');
  console.error('');
  console.error('Nothing else is needed: the cut plates in src/visual/kit-art.js');
  console.error('remain the fallback, so the project works with none of this installed.');
  console.error('Run with --dry to see the prompts without a key.');
  process.exit(2);
}

await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

/** Ask the model for one plate. Returns the PNG bytes. */
async function generate(name) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.PLATE_MODEL || 'gpt-image-1',
      prompt: promptFor(name),
      // Landscape, which is the shape of the card. A square image cropped to
      // a card loses the composition the model was asked for.
      size: '1536x1024',
      n: 1,
      quality: process.env.PLATE_QUALITY || 'high',
      background: 'opaque',
      output_format: 'png',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const item = (json.data || [])[0];
  if (!item) throw new Error('no image in the response');
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error('could not fetch the image: HTTP ' + img.status);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('the response carried neither b64_json nor url');
}

/**
 * Turn black-on-white line work into a white mask carrying the drawing in its
 * alpha channel.
 *
 * ffmpeg rather than a decoder of our own: it is already a build dependency
 * for the field recordings, and this is four filters.
 *
 *   scale/crop   to the card's shape, cropping rather than squashing
 *   format=gray  luminance only; the model was asked for monochrome anyway
 *   negate       ink was black and must become opaque, ground white and clear
 *   alphamerge   that greyscale becomes the alpha of a plain white image
 *
 * `eq` before the negate pulls the near-whites of the paper down to nothing.
 * Without it the ground carries a few per cent of alpha and every card sits on
 * a faint rectangle, which is the one artefact that would give the whole thing
 * away.
 */
async function toMask(from, to) {
  const chain = [
    // FIT, not fill. The model returns 3:2 and the card is 16:9, so covering
    // the card meant cutting fifteen per cent off the top and the bottom --
    // which took the heads off the birds and the top off the rose window.
    // Padding with white costs a margin at the sides; the padding is white, so
    // after the negate it is alpha zero and nothing shows.
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white`,
    'format=gray',
    'eq=contrast=1.35:brightness=-0.06',
    'negate[a]',
    `;color=white:s=${W}x${H}[c]`,
    '[c][a]alphamerge',
  ].join(',').replace(',;', ';');
  await run('ffmpeg', ['-v', 'error', '-y', '-i', from, '-filter_complex', chain, '-frames:v', '1', to]);
}

const made = [];
const failed = [];
for (const name of names) {
  const raw = join(RAW, name + '.png');
  const out = join(OUT, name + '.png');
  try {
    if (!flag('force') && !flag('remask') && (await exists(out))) {
      console.log(name.padEnd(12) + 'already there, skipped');
      made.push(name);
      continue;
    }
    if (flag('remask')) {
      // Redo the mask from the image already downloaded. The masking is the
      // part that gets adjusted -- how it is fitted, how hard the contrast is
      // -- and adjusting it must not mean buying the images again.
      if (!(await exists(raw))) {
        console.log(name.padEnd(12) + 'no original in art/plates-raw/, skipped');
        continue;
      }
    } else if (flag('force') || !(await exists(raw))) {
      const bytes = await generate(name);
      await writeFile(raw, bytes);
    }
    await toMask(raw, out);
    const size = (await readFile(out)).length;
    console.log(name.padEnd(12) + 'ok  ' + Math.round(size / 1024) + ' kB');
    made.push(name);
  } catch (e) {
    failed.push(name + ': ' + e.message);
    console.error(name.padEnd(12) + 'FAILED  ' + e.message);
  }
}

// The manifest is what the renderer reads. A kit absent from it is cut rather
// than drawn, so a half-finished run degrades to the engine instead of to
// missing cards.
//
// Built from what is ON DISK, not from what this run produced. Running for one
// kit is a normal thing to do -- one plate came back truncated and needed
// redoing -- and the first version then rewrote the manifest with just that
// kit, quietly unlisting the other twenty-one. Reading the folder cannot get
// out of step with the folder.
const onDisk = [];
for (const name of Object.keys(SUBJECTS)) {
  if (await exists(join(OUT, name + '.png'))) onDisk.push(name);
}
const manifest = {
  note: 'Kits with a generated plate. Anything not listed is cut by src/visual/engrave.js.',
  width: W,
  height: H,
  kits: onDisk.sort(),
};
await writeFile(join(OUT, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n${made.length} handled this run; ${onDisk.length} installed, ${failed.length} failed.`);
if (failed.length) {
  for (const f of failed) console.error('  ' + f);
  process.exit(1);
}
