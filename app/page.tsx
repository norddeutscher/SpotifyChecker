"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const HEARD_MS = 5 * 60 * 1000; // Album gilt ab 5 Min. Wiedergabe im Verlauf als gehört
const TRACK_MS = 30 * 1000; // Song gilt ab 30 s Wiedergabe als gehört
const CACHE_DAYS = 7;
const TRACK_PACE_MS = 1200; // Pause zwischen Song-Abfragen, damit Spotify nicht bremst
const SHOW_STEP = 200;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const load = <T,>(k: string, d: T): T => {
  try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; }
};
const save = (k: string, v: unknown): boolean => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};

let notify: (m: string) => void = () => {};
const msg = (e: any, what: string) => {
  const m = String(e.message);
  if (!m.startsWith("429")) return `${what} (${m}).`;
  const min = Math.max(1, Math.ceil((Number(m.split(":")[1]) || 60) / 60));
  return `Spotify bremst die App gerade. Bitte in ca. ${min} Min. erneut versuchen.`;
};

// Bei Fehler 429 (zu viele Anfragen) wartet die App kurz, sonst meldet sie die Wartezeit.
async function sp(p: string, tries = 3): Promise<any> {
  const until = Number(localStorage.getItem("blockedUntil") || 0);
  if (until > Date.now()) throw new Error("429:" + Math.ceil((until - Date.now()) / 1000));
  const r = await fetch("/api/sp?p=" + encodeURIComponent(p));
  if (r.status === 429) {
    const ra = Number(r.headers.get("Retry-After")) || 2;
    if (ra > 90) { try { localStorage.setItem("blockedUntil", String(Date.now() + ra * 1000)); } catch {} }
    if (tries === 0 || ra > 90) throw new Error("429:" + ra);
    notify(`Spotify bremst kurz – weiter in ${Math.ceil(ra)} s …`);
    await sleep((ra + 0.5) * 1000);
    notify("");
    return sp(p, tries - 1);
  }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function all(path: string, size: number, pause = 400) {
  const out: any[] = [];
  for (let o = 0; ; ) {
    const d = await sp(`${path}${path.includes("?") ? "&" : "?"}limit=${size}&offset=${o}`);
    out.push(...(d.items ?? []));
    if (!d.next || !d.items?.length) return out;
    o += d.items.length;
    await sleep(pause);
  }
}

type Mode = "albums" | "songs" | "playlists";
type Album = { id: string; name: string; date: string; img: string; url: string };
type Lite = { id: string; name: string };
type Track = { id: string; name: string; sub: string; img: string; url: string };
type Pl = { id: string; name: string; owner: string; img: string; url: string };
type Hist = Record<string, { ms: number; last: string }>;
const toPl = (p: any): Pl => ({ id: p.id, name: p.name, owner: p.owner?.display_name ?? "", img: p.images?.[0]?.url ?? "", url: p.external_urls?.spotify ?? "" });
const day = (s?: string) => (s ? new Date(s).toLocaleDateString("de-DE") : "");

export default function Home() {
  const [auth, setAuth] = useState<"?" | "in" | "out">("?");
  const [theme, setTheme] = useState("light");
  const [mode, setMode] = useState<Mode>("albums");
  const [series, setSeries] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [tfilter, setTfilter] = useState("");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [aTracks, setATracks] = useState<Record<string, Lite[]>>({});
  const [pl, setPl] = useState<Pl | null>(null);
  const [plTracks, setPlTracks] = useState<Track[]>([]);
  const [plists, setPlists] = useState<Pl[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<Record<string, string>>({});
  const [recentT, setRecentT] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Hist>({});
  const [histT, setHistT] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [view, setView] = useState<"all" | "open" | "heard">("all");
  const [shownN, setShownN] = useState(SHOW_STEP);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const stop = useRef(false);
  const savedTried = useRef(false);

  async function loadSaved() {
    if (savedTried.current) return;
    savedTried.current = true;
    const cs = load<{ t: number; ids: string[] } | null>("saved", null);
    if (cs && Date.now() - cs.t < 864e5) { setSaved(new Set(cs.ids)); return; }
    try {
      const ids = (await all("/me/albums", 50)).map((x) => x.album.id);
      setSaved(new Set(ids)); save("saved", { t: Date.now(), ids });
    } catch {}
  }

  async function fetchAlbums(id: string, force = false) {
    setErr("");
    const key = "albums:" + id + (mode === "songs" ? ":s" : "");
    const c = load<{ t: number; a: Album[] } | null>(key, null);
    if (c && c.a.length && !force && Date.now() - c.t < CACHE_DAYS * 864e5) { setAlbums(c.a); return; }
    setBusy(true);
    try {
      const path = `/artists/${id}/albums?include_groups=${mode === "songs" ? "album,single" : "album"}&market=DE`;
      let list: any[];
      try { list = await all(path, 50); }
      catch (e: any) { if (e.message !== "400") throw e; list = await all(path, 10); }
      const seen = new Set<string>();
      const a: Album[] = list
        .filter((x) => !seen.has(norm(x.name)) && seen.add(norm(x.name)))
        .sort((x, y) => x.release_date.localeCompare(y.release_date) || x.name.localeCompare(y.name))
        .map((x) => ({ id: x.id, name: x.name, date: x.release_date, img: x.images?.[1]?.url ?? x.images?.[0]?.url ?? "", url: x.external_urls?.spotify ?? "" }));
      setAlbums(a);
      if (a.length) save(key, { t: Date.now(), a });
      else setErr("Spotify hat zu diesem Interpreten keine Alben geliefert. Wähle ihn ggf. nochmal über die Suche.");
    } catch (e: any) {
      setErr(msg(e, "Alben konnten nicht geladen werden"));
    }
    setBusy(false);
    loadSaved();
  }

  useEffect(() => {
    notify = setNote;
    setTheme(document.documentElement.dataset.theme || "light");
    setHist(load("hist", {})); setHistT(load("histT", {})); setManual(load("manual", []));
    setFilter(load("filter", "")); setTfilter(load("tfilter", "")); setMode(load("mode", "albums"));
    setSeries(load("series", null));
    (async () => {
      try {
        const rp = await sp("/me/player/recently-played?limit=50");
        const m: Record<string, string> = {}, t: Record<string, string> = {};
        for (const it of rp.items) {
          const a = it.track.album.id, id = it.track.id;
          if (!m[a] || it.played_at > m[a]) m[a] = it.played_at;
          if (!t[id] || it.played_at > t[id]) t[id] = it.played_at;
        }
        setRecent(m); setRecentT(t);
      } catch (e: any) {
        if (e.message === "401") { setAuth("out"); return; }
      }
      setAuth("in");
    })();
  }, []);

  // Albumliste laden, sobald Login, Interpret oder Modus feststehen
  useEffect(() => {
    if (auth === "in" && series && mode !== "playlists") fetchAlbums(series.id);
  }, [auth, series?.id, mode]);

  // bereits geladene Songs der Alben aus dem Browser-Speicher holen
  useEffect(() => {
    if (mode !== "songs") return;
    const m: Record<string, Lite[]> = {};
    for (const a of albums) { const c = load<Lite[] | null>("tr:" + a.id, null); if (c) m[a.id] = c; }
    setATracks(m);
  }, [mode, albums]);

  function flipTheme() {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("theme", t);
    setTheme(t);
  }
  function changeMode(m: Mode) {
    setMode(m); save("mode", m); setFound([]); setPlists([]); setErr(""); setView("all"); setShownN(SHOW_STEP); setQ("");
  }
  async function search() {
    setErr("");
    try {
      if (mode !== "playlists") { setFound((await sp(`/search?type=artist&limit=10&q=${encodeURIComponent(q)}`)).artists.items); return; }
      let mine: Pl[] = [];
      const cm = load<{ t: number; l: Pl[] } | null>("mine", null);
      if (cm && Date.now() - cm.t < 864e5) mine = cm.l;
      else try { mine = (await all("/me/playlists", 50)).filter(Boolean).map(toPl); save("mine", { t: Date.now(), l: mine }); } catch {}
      const own = mine.filter((p) => norm(p.name).includes(norm(q)));
      const seen = new Set(own.map((p) => p.id));
      const ext = ((await sp(`/search?type=playlist&limit=10&q=${encodeURIComponent(q)}`)).playlists?.items ?? []).filter(Boolean).map(toPl);
      setPlists([...own, ...ext.filter((p: Pl) => !seen.has(p.id))]);
    } catch (e: any) { setErr(msg(e, "Suche fehlgeschlagen")); }
  }
  function pick(a: any) {
    const s = { id: a.id, name: a.name };
    setSeries(s); save("series", s); setFound([]); setAlbums([]);
  }
  async function pickPl(p: Pl) {
    setPl(p); setPlists([]); setPlTracks([]); setErr(""); setShownN(SHOW_STEP);
    const c = load<{ t: number; a: Track[] } | null>("pl:" + p.id, null);
    if (c && c.a.length && Date.now() - c.t < 864e5) { setPlTracks(c.a); return; }
    setBusy(true);
    const noAccess = "Spotify erlaubt in der Entwicklerversion nur das Lesen von Playlists, die dir gehören oder bei denen du mitarbeitest. Tipp: Füge die Songs in Spotify zu einer eigenen Playlist hinzu und such dann diese.";
    try {
      const items = await all(`/playlists/${p.id}/items`, 50);
      const a: Track[] = items.map((x) => x.item ?? x.track).filter((t) => t && t.id && t.type !== "episode")
        .map((t) => ({ id: t.id, name: t.name, sub: (t.artists ?? []).map((x: any) => x.name).join(", "), img: t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url ?? "", url: t.external_urls?.spotify ?? "" }));
      setPlTracks(a);
      if (a.length) save("pl:" + p.id, { t: Date.now(), a }); else setErr(noAccess);
    } catch (e: any) {
      setErr(e.message === "403" || e.message === "404" ? noAccess : msg(e, "Playlist konnte nicht geladen werden"));
    }
    setBusy(false);
  }

  const fAlbums = useMemo(() => albums.filter((a) => norm(a.name).includes(norm(filter))), [albums, filter]);
  const todo = fAlbums.filter((a) => !aTracks[a.id]);

  async function loadSongs() {
    stop.current = false; setErr("");
    const list = [...todo];
    for (let i = 0; i < list.length; i++) {
      if (stop.current) break;
      setProg({ done: i, total: list.length });
      try {
        const tr: Lite[] = (await all(`/albums/${list[i].id}/tracks?market=DE`, 50, 0)).map((x) => ({ id: x.id, name: x.name }));
        save("tr:" + list[i].id, tr);
        setATracks((p) => ({ ...p, [list[i].id]: tr }));
      } catch (e: any) { setErr(msg(e, "Songs konnten nicht geladen werden")); break; }
      await sleep(TRACK_PACE_MS);
    }
    setProg(null);
  }

  async function importHist(files: FileList | null) {
    if (!files) return;
    const h: Hist = { ...hist };
    const tm = new Map<string, { ms: number; last: string }>();
    for (const f of Array.from(files)) {
      for (const e of JSON.parse(await f.text())) {
        if (!e.ts) continue;
        const n = e.master_metadata_album_album_name;
        if (n) {
          const x = (h[norm(n)] ??= { ms: 0, last: "" });
          x.ms += e.ms_played || 0;
          if (e.ts > x.last) x.last = e.ts;
        }
        if (e.spotify_track_uri) {
          const id = String(e.spotify_track_uri).slice(14);
          const x = tm.get(id) ?? { ms: 0, last: "" };
          x.ms += e.ms_played || 0;
          if (e.ts > x.last) x.last = e.ts;
          tm.set(id, x);
        }
      }
    }
    const t = { ...histT };
    tm.forEach((x, id) => { if (x.ms >= TRACK_MS) { const d = x.last.slice(0, 10); if (!t[id] || d > t[id]) t[id] = d; } });
    setHist(h); setHistT(t);
    if (!save("hist", h) || !save("histT", t)) setErr("Der Verlauf ist zu groß für den Browser-Speicher und gilt nur, solange die Seite offen bleibt.");
  }
  function toggle(id: string) {
    const m = manual.includes(id) ? manual.filter((x) => x !== id) : [...manual, id];
    setManual(m); save("manual", m);
  }

  const rows = useMemo(() => fAlbums.map((a) => {
    const h = hist[norm(a.name)];
    const viaHist = !!h && h.ms >= HEARD_MS;
    const viaRecent = !!recent[a.id];
    const last = [h?.last, recent[a.id]].filter(Boolean).sort().pop();
    return { a, heard: viaHist || viaRecent || manual.includes(a.id), auto: viaHist || viaRecent, last, saved: saved.has(a.id) };
  }), [fAlbums, hist, recent, manual, saved]);

  const trackRows = useMemo(() => {
    const src: Track[] = mode === "playlists" ? plTracks : mode === "songs"
      ? fAlbums.flatMap((a) => (aTracks[a.id] ?? []).map((t) => ({ id: t.id, name: t.name, sub: a.name, img: a.img, url: "https://open.spotify.com/track/" + t.id })))
      : [];
    const f = norm(tfilter);
    return src.filter((t) => !f || norm(t.name).includes(f)).map((t) => {
      const h = histT[t.id], r = recentT[t.id];
      return { t, heard: !!h || !!r || manual.includes(t.id), auto: !!h || !!r, last: [h, r].filter(Boolean).sort().pop() };
    });
  }, [mode, plTracks, fAlbums, aTracks, tfilter, histT, recentT, manual]);

  const flags: boolean[] = mode === "albums" ? rows.map((r) => r.heard) : trackRows.map((r) => r.heard);
  const nHeard = flags.filter(Boolean).length;
  const pct = flags.length ? Math.round((nHeard / flags.length) * 100) : 0;
  const keep = (h: boolean) => view === "all" || (view === "heard") === h;
  const shownA = rows.filter((r) => keep(r.heard));
  const shownT = trackRows.filter((r) => keep(r.heard));

  if (auth === "?") return <main><p>Lädt …</p></main>;
  if (auth === "out")
    return (
      <main>
        <header className="top"><h1>Hörspiel-Tracker</h1><button className="ghost" onClick={flipTheme}>{theme === "dark" ? "Hell" : "Dunkel"}</button></header>
        <section className="panel">
          <p>Zeigt dir, welche Alben, Songs und Playlists du auf Spotify schon gehört hast.</p>
          <a href="/api/login"><button>Mit Spotify anmelden</button></a>
        </section>
      </main>
    );

  const hints = {
    albums: "Alle Alben eines Interpreten. Gehört = Wiedergabe im Verlauf oder zuletzt gespielt.",
    songs: "Alle Songs der Alben und Singles eines Interpreten. Spotify liefert sie nur pro Album, deshalb holt „Songs laden“ sie nach und nach (ca. 1 pro Sekunde).",
    playlists: "Playlist per Name suchen. Die Songs kann Spotify nur bei Playlists liefern, die dir gehören oder bei denen du mitarbeitest.",
  };

  return (
    <main>
      <header className="top">
        <h1>Hörspiel-Tracker</h1>
        <div className="acts">
          <button className="ghost" onClick={flipTheme}>{theme === "dark" ? "Hell" : "Dunkel"}</button>
          <button className="ghost" onClick={async () => { await fetch("/api/logout", { method: "POST" }); setAuth("out"); }}>Abmelden</button>
        </div>
      </header>
      {err && <p className="err">{err}</p>}

      <section className="panel">
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <span className="l">Was möchtest du prüfen?</span>
          <div className="bar">
            {(["albums", "songs", "playlists"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : "ghost"} onClick={() => changeMode(m)}>{{ albums: "Alben", songs: "Songs", playlists: "Playlists" }[m]}</button>
            ))}
          </div>
          <p className="hint">{hints[mode]}</p>
        </div>
        <div className="field">
          <span className="l">{mode === "playlists" ? `Playlist: ${pl?.name ?? "noch keine gewählt"}` : `Interpret: ${series?.name ?? "noch keiner gewählt"}`}</span>
          <div className="bar">
            <input type="text" placeholder={mode === "playlists" ? "Playlist suchen, z. B. Hörspiele" : "Interpret suchen, z. B. Die drei ???"} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search}>Suchen</button>
          </div>
          {found.map((a) => (<div className="pick" key={a.id}><span>{a.name}</span><button className="ghost" onClick={() => pick(a)}>Wählen</button></div>))}
          {plists.map((p) => (<div className="pick" key={p.id}><span>{p.name}<br /><small className="hint">{p.owner}</small></span><button className="ghost" onClick={() => pickPl(p)}>Wählen</button></div>))}
        </div>
        <div className="field">
          <span className="l">Filter und Verlauf</span>
          {mode !== "playlists" && <input type="text" placeholder="Albumtitel enthält, z. B. Folge" value={filter} onChange={(e) => { setFilter(e.target.value); save("filter", e.target.value); }} />}
          {mode !== "albums" && <input type="text" placeholder="Songtitel enthält …" value={tfilter} onChange={(e) => { setTfilter(e.target.value); save("tfilter", e.target.value); setShownN(SHOW_STEP); }} />}
          <label className="file">Streaming-Verlauf importieren<input type="file" accept=".json" multiple hidden onChange={(e) => importHist(e.target.files)} /></label>
          <p className="hint">{Object.keys(hist).length ? `Verlauf gespeichert (${Object.keys(hist).length} Alben, ${Object.keys(histT).length} Songs).` : "Noch kein Verlauf importiert."} Dateien: Streaming_History_Audio_*.json</p>
        </div>
      </section>

      {busy && <p className="hint">Lädt …</p>}
      {note && <p className="hint">{note}</p>}

      {mode === "songs" && series && fAlbums.length > 0 && (
        <div className="bar">
          {prog ? (<><span className="hint">Songs laden … {prog.done} von {prog.total} Alben</span><button className="ghost" onClick={() => { stop.current = true; }}>Stopp</button></>)
            : todo.length > 0 ? <button onClick={loadSongs}>Songs laden ({todo.length} Alben offen)</button> : null}
        </div>
      )}

      {flags.length > 0 && (
        <>
          <section className="stats">
            <span><b>{nHeard}</b> gehört</span>
            <span><b>{flags.length - nHeard}</b> offen</span>
            <span><b>{pct} %</b> geschafft</span>
            <div className="meter"><i style={{ width: pct + "%" }} /></div>
          </section>
          <div className="bar" style={{ margin: "10px 0" }}>
            {(["all", "open", "heard"] as const).map((v) => (
              <button key={v} className={view === v ? "on" : "ghost"} onClick={() => { setView(v); setShownN(SHOW_STEP); }}>{{ all: "Alle", open: "Nicht gehört", heard: "Gehört" }[v]}</button>
            ))}
            {series && mode !== "playlists" && <button className="ghost" onClick={() => fetchAlbums(series.id, true)}>Neu laden</button>}
          </div>
          <p className="hint">Tipp auf einen Eintrag markiert ihn von Hand als gehört (nochmal tippen hebt es auf).</p>
        </>
      )}

      {mode === "albums" && (
        <div className="grid">
          {shownA.map(({ a, heard, auto, last, saved: sv }) => (
            <article key={a.id} className={"card" + (heard ? " is-heard" : "")} onClick={() => !auto && toggle(a.id)}>
              <div className="cover">
                {a.img && <img src={a.img} alt="" loading="lazy" />}
                <span className={"badge " + (heard ? "heard" : "open")}>{heard ? "gehört" : "offen"}</span>
              </div>
              <div className="meta">
                <b>{a.name}</b>
                <small>{last ? "Zuletzt: " + day(last) : sv ? "In Bibliothek gespeichert" : a.date}</small>
              </div>
              <a className="btn" href={a.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>In Spotify öffnen</a>
            </article>
          ))}
        </div>
      )}

      {mode !== "albums" && (
        <div>
          {shownT.slice(0, shownN).map(({ t, heard, auto, last }) => (
            <div key={t.id} className={"trow" + (heard ? " is-heard" : "")} onClick={() => !auto && toggle(t.id)}>
              {t.img ? <img src={t.img} alt="" loading="lazy" /> : <span className="ph" />}
              <span className="t"><b>{t.name}</b><small>{t.sub}{last ? " · zuletzt " + day(last) : ""}</small></span>
              <span className={"badge inline " + (heard ? "heard" : "open")}>{heard ? "gehört" : "offen"}</span>
              <a className="btn" href={t.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Öffnen</a>
            </div>
          ))}
          {shownT.length > shownN && <button className="ghost" onClick={() => setShownN((n) => n + SHOW_STEP)}>Mehr anzeigen ({shownT.length - shownN} weitere)</button>}
        </div>
      )}
    </main>
  );
}
