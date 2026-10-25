// Synced lyrics from LRCLIB (https://lrclib.net), fetched directly by the page
// (LRCLIB allows cross-origin requests), so the Chrome version and the native app share it.

const API = 'https://lrclib.net/api';
const cache = new Map();

async function getJSON(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// "Song - Remastered 2011", "Song (feat. X)" -> "Song"
const cleanTitle = t => t.replace(/\s+-\s+.*$/, '').replace(/\s*[([](feat|ft|with|remaster|live|radio|version|edit)[^)\]]*[)\]]/gi, '').trim();
const cleanArtist = a => a.split(/,|&| feat\.? | ft\.? /i)[0].trim();

export function parseLRC(lrc) {
  const lines = [];
  for (const row of lrc.split('\n')) {
    const tags = [...row.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = row.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) lines.push({ t: +m[1] * 60 + +m[2], text });
  }
  return lines.sort((a, b) => a.t - b.t);
}

export async function findLyrics({ title = '', artist = '', album = '', duration = 0 }) {
  const key = `${title}|${artist}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const q = new URLSearchParams({ track_name: cleanTitle(title), artist_name: cleanArtist(artist) });
  let best = null;
  if (duration) {
    const exact = await getJSON(`${API}/get?${q}&album_name=${encodeURIComponent(album)}&duration=${Math.round(duration)}`);
    if (exact?.syncedLyrics) best = exact;
  }
  if (!best) {
    // increasingly tolerant searches: title+artist, free text, title only
    let list = (await getJSON(`${API}/search?${q}`)) || [];
    if (!list.length) list = (await getJSON(`${API}/search?q=${encodeURIComponent(cleanTitle(title) + ' ' + cleanArtist(artist))}`)) || [];
    if (!list.length) {
      const art = cleanArtist(artist).toLowerCase().split(/\s+/);
      list = ((await getJSON(`${API}/search?track_name=${encodeURIComponent(cleanTitle(title))}`)) || [])
        .filter(r => art.some(w => w.length > 2 && r.artistName.toLowerCase().includes(w)));
    }
    // prefer synced lyrics, then the closest duration (same recording)
    const dur = +duration || 0;
    const score = r => (r.syncedLyrics ? 0 : 1000) + (dur ? Math.abs(r.duration - dur) : 0);
    best = list.sort((a, b) => score(a) - score(b))[0] || null;
  }
  const result = best
    ? { found: true, title: best.trackName, artist: best.artistName,
        synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null, plain: best.plainLyrics || null }
    : { found: false };
  cache.set(key, result);
  return result;
}
