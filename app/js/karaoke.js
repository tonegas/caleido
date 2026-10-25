// Karaoke mode: finds out which song is playing (Spotify/Music on the Mac, or Shazam
// recognition from the microphone), downloads the synced lyrics and shows them in time
// on top of the visualizer.

const POLL_PLAYER = 2000;      // ms between two player reads
const RECOGNIZE_EVERY = 45;    // s: recognize again to follow song changes / resync
const RETRY_NO_MATCH = 5;      // s to wait after a failed attempt

export class Karaoke {
  constructor(el, say) {
    this.el = el;
    this.say = say;
    this.on = false;
    this.song = null;          // { title, artist, album, duration, source }
    this.lyrics = null;        // { synced: [{t,text}], plain }
    this.pos0 = 0;             // position in the song at time at0
    this.at0 = 0;
    this.playing = false;
    this.offset = 0;           // manual correction ([ and ])
    this.status = '';
    this._lastLine = -2;
    this._busy = false;
    this._nextRecognize = 0;
    this._pollTimer = null;
    el.innerHTML = `
      <div class="k-head"></div>
      <div class="k-lines">
        <div class="k-line k-prev"></div>
        <div class="k-line k-cur"><span></span></div>
        <div class="k-line k-next"></div>
        <div class="k-line k-next2"></div>
      </div>
      <div class="k-plain"></div>`;
    this.$ = sel => el.querySelector(sel);
  }

  toggle() {
    this.on ? this.stop() : this.start();
    return this.on;
  }

  start() {
    this.on = true;
    this.el.hidden = false;
    this._setStatus('Looking for the song that is playing…');
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), POLL_PLAYER);
  }

  stop() {
    this.on = false;
    this.el.hidden = true;
    clearInterval(this._pollTimer);
  }

  nudge(dt) {
    this.offset += dt;
    this.say(`Karaoke: lyrics offset ${this.offset >= 0 ? '+' : ''}${this.offset.toFixed(2)} s`);
  }

  // current position in the song, extrapolated between two reads
  position() {
    const now = Date.now() / 1000;
    return this.pos0 + (this.playing ? now - this.at0 : 0) + this.offset;
  }

  async _poll() {
    if (this._busy || !this.on) return;
    this._busy = true;
    try {
      const np = await fetch('/api/nowplaying').then(r => r.json()).catch(() => ({}));
      if (np.source && np.playing) {
        await this._setSong(np, np.source);
        // the read arrives with some delay: use the time measured by the server
        this.pos0 = np.position; this.at0 = np.at; this.playing = true;
      } else if (!this.recognizeDisabled && Date.now() / 1000 >= this._nextRecognize) {
        await this._recognize();
      }
    } finally {
      this._busy = false;
    }
  }

  async _recognize() {
    if (!this.song) this._setStatus('Listening to recognize the song…');
    const r = await fetch('/api/recognize').then(r => r.json()).catch(() => ({ ok: false, error: 'server' }));
    if (!this.on) return;
    if (r.ok) {
      await this._setSong(r, 'Shazam');
      this.pos0 = r.offset; this.at0 = r.at; this.playing = true;
      this._nextRecognize = Date.now() / 1000 + RECOGNIZE_EVERY;
    } else if (r.fatal) {
      // recognition not available on this Mac: only the player read is left
      this.recognizeDisabled = true;
      if (!this.song) this._setStatus('Play music from Spotify or Music on the Mac to see the lyrics');
    } else {
      if (!this.song) this._setStatus(`Song not recognized (${r.error}). Retrying…`);
      this._nextRecognize = Date.now() / 1000 + RETRY_NO_MATCH;
    }
  }

  async _setSong(info, source) {
    const same = this.song && this.song.title === info.title && this.song.artist === info.artist;
    if (same) return;
    this.song = { title: info.title, artist: info.artist, album: info.album || '', duration: info.duration || 0, source };
    this.lyrics = null;
    this.offset = 0;
    this._lastLine = -2;
    this._setStatus('Looking for the lyrics…');
    const q = new URLSearchParams({ title: info.title, artist: info.artist, album: info.album || '', duration: info.duration || '' });
    const l = await fetch(`/api/lyrics?${q}`).then(r => r.json()).catch(() => ({ found: false }));
    if (this.song?.title !== info.title) return;   // the song changed in the meantime
    this.lyrics = l.found ? l : null;
    this.$('.k-head').textContent = `${info.title} — ${info.artist}  ·  ${source}`;
    this.say(`Karaoke: ${info.title} — ${info.artist}`);
    if (!l.found) this._setStatus('No lyrics found for this song');
    else if (!l.synced) this._setStatus('');
    else this._setStatus('');
    this.$('.k-plain').textContent = l.found && !l.synced ? l.plain : '';
    this.$('.k-plain').hidden = !(l.found && !l.synced);
  }

  _setStatus(msg) {
    this.status = msg;
    if (msg) {
      this._lastLine = -2;
      this.$('.k-prev').textContent = '';
      this.$('.k-cur span').textContent = msg;
      this.$('.k-cur').style.setProperty('--p', '100%');
      this.$('.k-next').textContent = '';
      this.$('.k-next2').textContent = '';
    }
  }

  // called every frame
  update() {
    if (!this.on || !this.lyrics || this.status) return;
    const pos = this.position();
    if (this.lyrics.synced) {
      const L = this.lyrics.synced;
      let i = -1;
      while (i + 1 < L.length && L[i + 1].t <= pos) i++;
      if (i !== this._lastLine) {
        this._lastLine = i;
        const text = k => (L[k] && L[k].text) || (L[k] ? '♪' : '');
        this.$('.k-prev').textContent = i > 0 ? text(i - 1) : '';
        this.$('.k-cur span').textContent = i >= 0 ? text(i) : '♪';
        this.$('.k-next').textContent = text(i + 1);
        this.$('.k-next2').textContent = text(i + 2);
        const cur = this.$('.k-cur');
        cur.classList.remove('pop'); void cur.offsetWidth; cur.classList.add('pop');
      }
      // progressive fill of the current line
      const t0 = i >= 0 ? L[i].t : 0, t1 = L[i + 1] ? L[i + 1].t : t0 + 4;
      const p = Math.min(1, Math.max(0, (pos - t0) / Math.max(0.5, Math.min(t1 - t0, 8) * 0.9)));
      this.$('.k-cur').style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    } else if (this.lyrics.plain && this.song.duration) {
      // unsynced lyrics: scroll in proportion to the duration
      const box = this.$('.k-plain');
      const f = Math.min(1, Math.max(0, pos / this.song.duration));
      box.scrollTop = f * (box.scrollHeight - box.clientHeight);
    }
  }
}
