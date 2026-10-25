<img src="docs/icon.png" width="96" align="right" alt="Caleido icon">

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

## Install the app (recommended)

Caleido is a native Mac app (macOS 13 or later, Apple Silicon and Intel). Nothing else to install:
no Node.js, no Chrome.

1. Download **`Caleido-<version>.dmg`** from the
   [latest release](https://github.com/tonegas/caleido/releases/latest).
2. Open the `.dmg` and drag **Caleido** into **Applications**.
3. Open Caleido from Launchpad or Applications.
4. The first time, allow access to the **microphone** (and, for karaoke, to **Spotify/Music**).

The app isn't signed with an Apple Developer ID, so the first time macOS blocks it ("Apple could not
verify…"). Click **Done**, then go to **System Settings → Privacy & Security**, scroll down and
click **Open Anyway**. Alternatively, run this once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Caleido.app
```

To update, download the new `.dmg` and replace the app in Applications.
To uninstall, move Caleido from Applications to the Trash.

## Getting started

1. **Connect the TV to your Mac** with an HDMI/USB‑C cable, or via AirPlay
   (Control Center → Screen Mirroring).
2. **Open Caleido.** It goes full screen on the TV by itself; if no TV is connected, it uses the
   Mac's screen. Use **View → Move to Next Display** (`Cmd+D`) to switch screens.
3. The first time, macOS asks for permission to use the **microphone**: allow it.
4. Play some music and enjoy the show. To quit, press **`Cmd+Q`**.

## Run from source

Requires [Google Chrome](https://www.google.com/chrome/) and [Node.js](https://nodejs.org/) 18 or
later (with Homebrew: `brew install node`).

```bash
git clone https://github.com/tonegas/caleido.git
cd caleido
```

Then double-click **`Caleido.command`** (or run `npm run tv`): it starts a local server and opens
Chrome full screen on the TV. If macOS blocks the file the first time, right-click it → **Open**.

You can also open it in any browser: start the server with `npm start`, go to
<http://localhost:8765> and press `F` for full screen.

### Build the Mac app

```bash
npm run build:mac
```

This needs the Xcode command line tools (`xcode-select --install`) and produces
`build/Caleido.app` and `build/Caleido-<version>.dmg`. `npm run icon` regenerates the app icon
from a frame of the Mandala scene (needs Chrome and `npm install`).

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
| `Cmd+Ctrl+F` | app: leave/enter full screen |
| `Cmd+D` | app: move to the next display |

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
- The first time, macOS asks whether Caleido (or Terminal, when running from source) may control
  Spotify/Music: allow it.

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

Caleido is a web page. The Mac app shows it in a WebKit window and serves it from a tiny built-in
HTTP server; when running from source, a small Node server with no dependencies does the same.

- `app/js/audio.js`: microphone analysis (log spectrum, bands, automatic gain control, beat and
  BPM detection).
- `app/js/shaders.js`: the scenes, written in GLSL. Each frame warps the previous one (zoom,
  rotation) to create the psychedelic trails.
- `app/js/visualizer.js`: WebGL2 rendering with feedback and supersampling.
- `app/js/milkdrop.js`: Milkdrop mode.
- `app/js/karaoke.js`, `app/js/lyrics.js`: karaoke display and lyrics from LRCLIB.
- `macos/main.swift` (app) / `server.js` (source): local server and player reading (AppleScript).
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
