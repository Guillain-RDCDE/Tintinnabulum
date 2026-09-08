# Generated kit plates

Twenty-two, made by an image model. See [NOTICE](../../NOTICE) for what that
means for anyone redistributing them.

None of it is required. The same subjects are cut by
[`src/visual/engrave.js`](../../src/visual/engrave.js), which needs no files,
no network and no API key: delete this folder and every card is engraved
instead. A kit added later gets a card without anything here changing.

[`tools/make-plates.mjs`](../../tools/make-plates.mjs) is what made them:

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
burin rather than to missing cards. It is rebuilt from what is actually in this
folder on every run, because running for one kit is a normal thing to do and
the first version then unlisted the other twenty-one.

The originals from the model are left in `art/plates-raw/`, which is not
published.
