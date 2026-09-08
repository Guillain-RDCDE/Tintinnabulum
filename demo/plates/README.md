# Generated kit plates

Empty, and that is the normal state.

The kit cards are cut by [`src/visual/engrave.js`](../../src/visual/engrave.js).
They need no files, no network and no API key, and a kit added tomorrow gets a
card without anything here changing.

[`tools/make-plates.mjs`](../../tools/make-plates.mjs) can instead draw them
with an image model:

```bash
node tools/make-plates.mjs --dry                  # the prompts, calling nothing
OPENAI_API_KEY=sk-... node tools/make-plates.mjs  # all twenty-two
```

What lands here is not the returned image. It is white pixels carrying the line
work in their **alpha** channel — a mask, not a picture — so that the plate is
filled with the palette's ink when it is drawn. That is what lets a generated
plate follow the seventeen palettes exactly as a cut one does.

`index.json` is the manifest, and it is the only thing the renderer reads. A
kit that is not listed is cut instead, so a half-finished run degrades to the
burin rather than to missing cards.

The originals from the model are left in `art/plates-raw/`, which is not
published.
