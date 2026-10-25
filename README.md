# Caleido

**A psychedelic music visualizer for parties, made to run full screen on your TV.**
Caleido listens to the room through your Mac's microphone and turns the music into
kaleidoscopes, tunnels, plasma and fractals that move in time with the beat, in the spirit of
the old Winamp visualizers. It also has a karaoke mode that shows the song's lyrics in sync.

<p align="center">
  <img src="docs/mandala.png" width="32%" alt="Mandala scene">
  <img src="docs/tunnel.png" width="32%" alt="Tunnel scene">
  <img src="docs/spectrum.png" width="32%" alt="Spectrum scene">
</p>

## Features

- **Reacts to the sound in the room**: no cables to your sound system, the Mac's microphone is
  enough. Gain adjusts itself, so it works with loud music and with quiet background music.
- **Frequency and volume drive different zones**: the bass moves the center and the zoom,
  frequencies color the rings and slices, and volume sets speed and brightness.
- **Stays on the beat**: it detects beats and estimates BPM. Colors jump on every hit,
  symmetry changes every 8 beats and the scene changes every 32.
- **6 scenes**: Mandala, Tunnel, Plasma, Spectrum, Fractal, Oscilloscope.
- **Milkdrop mode**: the classic Winamp visualizer with hundreds of original presets
  (via [butterchurn](https://github.com/jberg/butterchurn)). Works offline.
- **Karaoke**: shows synced lyrics for the song playing in Spotify or Apple Music.
- **Made for TVs**: opens full screen on the external display by itself, stays sharp at 1080p,
  hides the cursor and keeps the screen from sleeping.

## Requirements

- A Mac (macOS 12 or later)
- [Google Chrome](https://www.google.com/chrome/)
- [Node.js](https://nodejs.org/) 18 or later (with Homebrew: `brew install node`)

## Installation

```bash
git clone https://github.com/tonegas/caleido.git
cd caleido
```

That's it: the libraries it needs are already in `app/vendor`.
(`npm install` is only needed to run the tests.)

## Getting started

1. **Connect the TV to your Mac** with an HDMI/USB‑C cable, or via AirPlay
   (Control Center → Screen Mirroring).
2. **Double-click `Caleido.command`** (or run `npm run tv` in a terminal).
   Caleido opens full screen on the TV. If no TV is connected, it uses the Mac's screen.
3. The first time, macOS asks for permission to use the **microphone**: allow it.
4. Play some music and enjoy the show. To quit, press **`Cmd+Q`**.

> If macOS blocks the file the first time, right-click `Caleido.command` → **Open**.

You can also open it in any browser: start the server with `npm start`, go to
<http://localhost:8765> and press `F` for full screen.

## Keyboard controls

| Key | Action |
|---|---|
| `F` / double click | full screen |
| `Space` / `→` / `←` | next / previous scene (in Milkdrop: next preset) |
| `1` … `6` | pick a scene |
| `M` | Milkdrop mode on/off |
| `N` | next Milkdrop preset |
| `K` | karaoke on/off |
| `[` / `]` | karaoke: lyrics 0.25 s earlier / later |
| `A` | automatic scene changes on/off |
| `↑` / `↓` | microphone sensitivity |
| `I` | switch audio input |
| `B` | beat flash on/off |
| `Q` | quality 1x–2x (2x by default, lowered automatically if the Mac struggles) |
| `H` | show/hide info (BPM, levels, fps) and the list of controls |

## Karaoke

Press `K` while a song is playing in **Spotify** or **Apple Music** on the Mac.
Caleido reads the song title and playback position from the player, downloads the synced lyrics
from [LRCLIB](https://lrclib.net) (a free database of time-stamped lyrics; needs internet) and
shows them line by line over the visuals, filling in the current line as it is sung.

- It stays in sync when you pause, skip ahead or change song.
- Lines appear half a second early, like on a real karaoke screen, so there's time to read them.
- If the lyrics run early or late (for example with Bluetooth speakers, or when the lyrics come from
  a different recording of the song), fix it with `[` and `]`. The correction resets when a new song starts.
- If a song only has unsynced lyrics, they scroll in proportion to the song's length.
- The first time, macOS asks whether Terminal may control Spotify/Music: allow it.

**Music from other devices (phone, speaker)**: Caleido includes a ShazamKit-based recognizer,
but Apple only lets apps use it when they're signed with an Apple Developer account that has the
ShazamKit service enabled. Without that signature, recognition is turned off and Caleido asks you
to play the music from Spotify or Apple Music instead.

## Tips for the TV

- Placing the Mac near the speakers works great.
- Use the TV as an **extended display** (System Settings → Displays) at its highest resolution.
- If the picture looks soft or grainy, check the TV's picture settings: set the HDMI input to
  **PC** mode, the aspect ratio to **Original/Just Scan**, low sharpness, and noise reduction off.
- Want a clean audio signal instead of the microphone? Install
  [BlackHole](https://existential.audio/blackhole/) and select it with the `I` key.

## How it works

Caleido is a web page served locally by a small Node server with no dependencies.

- `app/js/audio.js`: microphone analysis (log spectrum, bands, automatic gain control, beat and
  BPM detection).
- `app/js/shaders.js`: the scenes, written in GLSL. Each frame warps the previous one (zoom,
  rotation) to create the psychedelic trails.
- `app/js/visualizer.js`: WebGL2 rendering with feedback and supersampling.
- `app/js/milkdrop.js`: Milkdrop mode.
- `app/js/karaoke.js` + `server.js`: reading the player (AppleScript) and lyrics from LRCLIB.
- `Caleido.command`: finds the external display and opens Chrome full screen on it.

## Tests

```bash
npm install
npm test
```

The test opens Chrome in the background with a simulated microphone playing a 120 BPM test
track. It checks the audio analysis, the estimated BPM, every scene, Milkdrop and karaoke timing.
Screenshots are saved to `test/shots/`. Run `node test/realmic.mjs` to see the levels from the
real microphone.

## License

MIT. Milkdrop mode uses [butterchurn](https://github.com/jberg/butterchurn) and
[butterchurn-presets](https://github.com/jberg/butterchurn-presets) (MIT, licenses in
`app/vendor`). No song lyrics are included in this repository: they're downloaded on the fly
from LRCLIB.
