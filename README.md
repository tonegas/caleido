# Caleido

**Visualizzatore musicale psichedelico per le feste, da proiettare a tutto schermo sulla TV.**
Ascolta la musica dal microfono del Mac e la trasforma in caleidoscopi, tunnel, plasma e
frattali che vanno a tempo di musica, nello stile del vecchio Winamp. Ha anche una modalità
karaoke che mostra il testo della canzone a tempo.

<p align="center">
  <img src="docs/mandala.png" width="32%" alt="Scena Mandala">
  <img src="docs/tunnel.png" width="32%" alt="Scena Tunnel">
  <img src="docs/spettro.png" width="32%" alt="Scena Spettro">
</p>

## Cosa fa

- **Reagisce al suono della stanza**: nessun collegamento con l'impianto, basta il microfono del Mac.
  Il guadagno si regola da solo, quindi funziona sia con la musica alta che a volume basso.
- **Frequenze e volume guidano zone diverse**: i bassi muovono il centro e lo zoom, le frequenze
  colorano gli anelli e gli spicchi, il volume regola velocità e luminosità.
- **Va a tempo**: riconosce i beat e stima i BPM; i colori saltano a ogni colpo, le simmetrie
  cambiano ogni 8 beat e la scena ogni 32.
- **6 scene**: Mandala, Tunnel, Plasma, Spettro, Frattale, Oscilloscopio.
- **Modalità Milkdrop**: il visualizzatore storico di Winamp con centinaia di preset originali
  (tramite [butterchurn](https://github.com/jberg/butterchurn)), funziona anche senza internet.
- **Karaoke**: mostra il testo sincronizzato della canzone che sta suonando su Spotify o Musica.
- **Pensato per la TV**: si apre da solo a schermo intero sullo schermo esterno, nitido anche a 1080p,
  senza cursore e senza che lo schermo vada in stop.

## Requisiti

- Un Mac (macOS 12 o successivo)
- [Google Chrome](https://www.google.com/chrome/)
- [Node.js](https://nodejs.org/) 18 o successivo (con Homebrew: `brew install node`)

## Installazione

```bash
git clone https://github.com/tonegas/caleido.git
cd caleido
```

Non serve altro: le librerie necessarie sono già incluse nella cartella `app/vendor`.
(`npm install` serve solo per far girare i test.)

## Avvio

1. **Collega la TV al Mac**: con un cavo HDMI/USB‑C, oppure via AirPlay
   (Centro di Controllo → Duplica schermo).
2. **Doppio click su `Caleido.command`** (oppure, dal terminale, `npm run tv`).
   Caleido si apre a schermo intero sulla TV; se la TV non è collegata usa lo schermo del Mac.
3. La prima volta macOS chiede il permesso di usare il **microfono**: concedilo.
4. Metti la musica e goditi lo spettacolo. Per uscire: **`Cmd+Q`**.

> Se macOS blocca il file al primo avvio, fai click destro su `Caleido.command` → **Apri**.

Puoi anche aprirlo in un browser qualsiasi: avvia il server con `npm start` e vai su
<http://localhost:8765>, poi premi `F` per lo schermo intero.

## Comandi da tastiera

| Tasto | Azione |
|---|---|
| `F` / doppio click | schermo intero |
| `Spazio` / `→` / `←` | scena successiva / precedente (in Milkdrop: preset successivo) |
| `1` … `6` | scegli la scena |
| `M` | modalità Milkdrop on/off |
| `N` | preset Milkdrop successivo |
| `K` | karaoke on/off |
| `[` / `]` | karaoke: testo 0,25 s prima / dopo |
| `A` | cambio automatico delle scene on/off |
| `↑` / `↓` | sensibilità del microfono |
| `I` | cambia ingresso audio |
| `B` | flash sul beat on/off |
| `Q` | qualità 1x–2x (di default 2x, si riduce da sola se il Mac fatica) |
| `H` | mostra/nasconde info (BPM, livelli, fps) ed elenco comandi |

## Karaoke

Premi `K` mentre una canzone suona su **Spotify** o **Musica** sul Mac.
Caleido legge dal player titolo e posizione del brano, scarica il testo sincronizzato da
[LRCLIB](https://lrclib.net) (archivio libero di testi temporizzati, serve internet) e lo mostra
riga per riga sopra le animazioni, colorando la riga corrente man mano che viene cantata.

- Resta a tempo anche se metti in pausa, salti avanti o cambi canzone.
- Se il testo è in anticipo o in ritardo (per esempio con casse bluetooth), correggi con `[` e `]`.
- Se per un brano esiste solo il testo non sincronizzato, scorre in proporzione alla durata.
- La prima volta macOS chiede di consentire a Terminale di controllare Spotify/Musica: concedilo.

**Musica da altri dispositivi (telefono, cassa)**: Caleido include un riconoscitore basato su
ShazamKit, ma Apple ne consente l'uso solo ad app firmate con un account sviluppatore Apple con il
servizio ShazamKit attivo. Senza quella firma il riconoscimento è disattivato e Caleido chiede di
avviare la musica da Spotify o Musica.

## Consigli per la TV

- Il Mac vicino alle casse funziona benissimo.
- Usa la TV come **schermo esteso** (Impostazioni di Sistema → Monitor) e alla risoluzione più alta
  disponibile.
- Se l'immagine sembra morbida o sgranata, controlla le impostazioni della TV: ingresso HDMI in
  modalità **PC**, formato **Originale/Just Scan**, nitidezza bassa e riduzione rumore disattivata.
- Vuoi il segnale audio "pulito" invece del microfono? Installa
  [BlackHole](https://existential.audio/blackhole/) e selezionalo con il tasto `I`.

## Come funziona

Caleido è una pagina web servita in locale da un piccolo server Node senza dipendenze.

- `app/js/audio.js`: analisi del microfono (spettro logaritmico, bande, controllo automatico del
  guadagno, rilevamento dei beat e dei BPM).
- `app/js/shaders.js`: le scene, scritte in GLSL; ogni frame deforma il precedente (zoom, rotazione)
  per creare le scie psichedeliche.
- `app/js/visualizer.js`: rendering WebGL2 con feedback e supersampling.
- `app/js/milkdrop.js`: modalità Milkdrop.
- `app/js/karaoke.js` + `server.js`: lettura del player (AppleScript), testi da LRCLIB.
- `Caleido.command`: trova lo schermo esterno e apre Chrome a schermo intero lì.

## Test

```bash
npm install
npm test
```

Il test apre Chrome in background con un microfono simulato che suona una traccia di prova a
120 BPM e verifica analisi audio, BPM stimati, tutte le scene, Milkdrop e il karaoke.
Gli screenshot finiscono in `test/shots/`. Con `node test/realmic.mjs` puoi vedere i livelli
letti dal microfono vero.

## Licenza

MIT. La modalità Milkdrop usa [butterchurn](https://github.com/jberg/butterchurn) e
[butterchurn-presets](https://github.com/jberg/butterchurn-presets) (MIT, licenze in `app/vendor`).
I testi delle canzoni non sono inclusi: vengono scaricati al momento da LRCLIB.
