<p align="center">
  <img src=".github/social-preview.png" width="100%" alt="Tintinnabulum — turn any stream of events into sound">
</p>

# Tintinnabulum

**Hear your data.**

Something happens. You hear a note.

Big things sound low. Small things sound high. Things that grow ring. Things
that shrink are plucked.

That is the whole idea.

**[Open the sandbox →](https://guillain-rdcde.github.io/Tintinnabulum/)**

Press **Listen**. You are listening to Wikipedia: every circle is somebody
editing an article, somewhere, at that moment. Click one to open it.

Eleven other feeds are in the same list. You can send your own with one `curl`.
Nothing to install; it runs in a browser, and on a phone.

Or open **Create**, the fifth tab: every picture is a small tool. Press
**Space** for another, change the colours, hear it, keep the ones you like,
take them away as a picture or a video with its sound, or play them live.

<p align="center">
  <img src=".github/create-whorl.png" width="100%" alt="The Create tab: Whorl, variation 777, striped bands twisted into a whirlpool, with its dials, inks, frame and export around it">
</p>
<p align="center"><sub><i>Whorl</i>, variation 777, on the Create bench. Each whirlpool is one event.</sub></p>

<p align="center">
  <img src=".github/fireworks-across-the-bay.png" width="100%" alt="Fireworks across the bay: small bursts over a far shore, reflected in the water">
</p>
<p align="center"><sub><i>Fireworks across the bay</i>, one of the works in the Gallery. Each shell is one event.</sub></p>

<p align="center">
  <img src=".github/the-lily-pond.png" width="100%" alt="The lily pond: a pond painted in broken strokes, with the sky in it and flowers opening on the water">
</p>
<p align="center"><sub><i>The lily pond</i>. Each flower is one event.</sub></p>

<p align="center">
  <img src=".github/lanterns-on-the-lake.png" width="100%" alt="Lanterns on the lake: paper lanterns rising from a dark shore, their light lying in the water">
</p>
<p align="center"><sub><i>Lanterns on the lake</i>. Each lantern is one event.</sub></p>

> *tintinnabulum* — Latin, a small bell.

## More

- **[How it works](docs/HOW-IT-WORKS.md)** — the whole path, from the feed to
  the speaker, in plain language first.
- **[The input standard](spec/README.md)** — one required field, and a mapping
  document that plugs anything else in without writing code.
- **[Reference](docs/REFERENCE.md)** — the library API, the built-in feeds,
  the kits, the scenes, the palettes, the finishes and the works.

## Thanks

**[Stéphanie Cante](https://www.linkedin.com/in/st%C3%A9phanie-cante-1a461374)**,
who put Listen to Wikipedia in front of me, explained what made it good, and
said this had to exist.

---

<sub>The idea — a bell for growth, a plucked string for shrinkage, pitch inversely proportional to the size of the change — comes from <a href="https://github.com/hatnote/listen-to-wikipedia">Listen to Wikipedia</a> by Stephen LaPorte and Mahmoud Hashemi, and through it from <a href="https://www.bitlisten.com/">BitListen</a> by Maximillian Laumeister. The sample banks in <code>sounds/</code> are redistributed from that project under its BSD 3-Clause licence. Tintinnabulum is an independent implementation, not a fork, and is not endorsed by any of the above — see <a href="NOTICE">NOTICE</a>, and use <code>kit: 'synth'</code> to ship no third-party audio at all. BSD 3-Clause, see <a href="LICENSE">LICENSE</a>.</sub>
