"use client";
import { useEffect, useMemo, useState } from "react";

const HEARD_MS = 5 * 60 * 1000; // ab 5 Min. Wiedergabe im Streaming-Verlauf gilt ein Album als gehört
const CACHE_DAYS = 7;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const load = <T,>(k: string, d: T): T => {
  try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let notify: (m: string) => void = () => {};
const msg = (e: any, what: string) => {
  const m = String(e.message);
  if (!m.startsWith("429")) return `${what} (${m}).`;
  const min = Math.max(1, Math.ceil((Number(m.split(":")[1]) || 60) / 60));
  return `Spotify bremst die App gerade. Bitte in ca. ${min} Min. auf „Neu laden“ tippen.`;
};

// Bei Fehler 429 (zu viele Anfragen) wartet die App kurz, sonst meldet sie die Wartezeit.
async function sp(p: string, tries = 3): Promise<any> {
  const r = await fetch("/api/sp?p=" + encodeURIComponent(p));
  if (r.status === 429) {
    const ra = Number(r.headers.get("Retry-After")) || 2;
    if (tries === 0 || ra > 90) throw new Error("429:" + ra);
    notify(`Spotify bremst kurz – weiter in ${Math.ceil(ra)} s …`);
    await sleep((ra + 0.5) * 1000);
    notify("");
    return sp(p, tries - 1);
  }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function all(path: string, size: number) {
  const out: any[] = [];
  for (let o = 0; ; ) {
    const d = await sp(`${path}${path.includes("?") ? "&" : "?"}limit=${size}&offset=${o}`);
    out.push(...d.items);
    if (!d.next || !d.items.length) return out;
    o += d.items.length;
    await sleep(120);
  }
}

type Album = { id: string; name: string; date: string; img: string; url: string };
type Hist = Record<string, { ms: number; last: string }>;

export default function Home() {
  const [auth, setAuth] = useState<"?" | "in" | "out">("?");
  const [theme, setTheme] = useState("light");
  const [series, setSeries] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [albums, setAlbums] = useState<Album[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Hist>({});
  const [manual, setManual] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [view, setView] = useState<"all" | "open" | "heard">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function fetchAlbums(id: string, force = false) {
    setErr("");
    const c = load<{ t: number; a: Album[] } | null>("albums:" + id, null);
    if (c && c.a.length && !force && Date.now() - c.t < CACHE_DAYS * 864e5) { setAlbums(c.a); return; }
    setBusy(true);
    try {
      const path = `/artists/${id}/albums?include_groups=album&market=DE`;
      let list: any[];
      try { list = await all(path, 50); }
      catch (e: any) { if (e.message !== "400") throw e; list = await all(path, 10); }
      const seen = new Set<string>();
      const a: Album[] = list
        .filter((x) => !seen.has(norm(x.name)) && seen.add(norm(x.name)))
        .sort((x, y) => x.release_date.localeCompare(y.release_date) || x.name.localeCompare(y.name))
        .map((x) => ({ id: x.id, name: x.name, date: x.release_date, img: x.images?.[1]?.url ?? x.images?.[0]?.url ?? "", url: x.external_urls?.spotify ?? "" }));
      setAlbums(a);
      if (a.length) save("albums:" + id, { t: Date.now(), a });
      else setErr("Spotify hat zu diesem Interpreten keine Alben geliefert. Wähle ihn ggf. nochmal über die Suche.");
    } catch (e: any) {
      setErr(msg(e, "Alben konnten nicht geladen werden"));
    }
    setBusy(false);
  }

  useEffect(() => {
    notify = setNote;
    setTheme(document.documentElement.dataset.theme || "light");
    setHist(load("hist", {})); setManual(load("manual", [])); setFilter(load("filter", ""));
    const s = load<{ id: string; name: string } | null>("series", null);
    setSeries(s);
    (async () => {
      // Login prüfen und letzte Wiedergaben holen (Fehler hier stoppen das Laden der Alben nicht)
      try {
        const rp = await sp("/me/player/recently-played?limit=50");
        const m: Record<string, string> = {};
        for (const it of rp.items) { const id = it.track.album.id; if (!m[id] || it.played_at > m[id]) m[id] = it.played_at; }
        setRecent(m);
      } catch (e: any) {
        if (e.message === "401") { setAuth("out"); return; }
      }
      setAuth("in");
      if (s) await fetchAlbums(s.id);
      // gespeicherte Alben: nur 1x pro Tag abrufen
      const cs = load<{ t: number; ids: string[] } | null>("saved", null);
      if (cs && Date.now() - cs.t < 864e5) setSaved(new Set(cs.ids));
      else try {
        const ids = (await all("/me/albums", 50)).map((x) => x.album.id);
        setSaved(new Set(ids)); save("saved", { t: Date.now(), ids });
      } catch {}
    })();
  }, []);

  function flipTheme() {
    const t = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    localStorage.setItem("theme", t);
    setTheme(t);
  }
  async function search() {
    setErr("");
    try { setFound((await sp(`/search?type=artist&limit=10&q=${encodeURIComponent(q)}`)).artists.items); }
    catch (e: any) { setErr("Suche fehlgeschlagen (" + e.message + ")."); }
  }
  function pick(a: any) {
    const s = { id: a.id, name: a.name };
    setSeries(s); save("series", s); setFound([]); setAlbums([]); fetchAlbums(a.id);
  }
  async function importHist(files: FileList | null) {
    if (!files) return;
    const h: Hist = { ...hist };
    for (const f of Array.from(files)) {
      for (const e of JSON.parse(await f.text())) {
        const n = e.master_metadata_album_album_name;
        if (!n || !e.ts) continue;
        const x = (h[norm(n)] ??= { ms: 0, last: "" });
        x.ms += e.ms_played || 0;
        if (e.ts > x.last) x.last = e.ts;
      }
    }
    setHist(h); save("hist", h);
  }
  function toggle(id: string) {
    const m = manual.includes(id) ? manual.filter((x) => x !== id) : [...manual, id];
    setManual(m); save("manual", m);
  }

  const rows = useMemo(() => {
    const f = norm(filter);
    return albums.filter((a) => norm(a.name).includes(f)).map((a) => {
      const h = hist[norm(a.name)];
      const viaHist = !!h && h.ms >= HEARD_MS;
      const viaRecent = !!recent[a.id];
      const last = [h?.last, recent[a.id]].filter(Boolean).sort().pop();
      return { a, heard: viaHist || viaRecent || manual.includes(a.id), auto: viaHist || viaRecent, last, saved: saved.has(a.id) };
    });
  }, [albums, filter, hist, recent, manual, saved]);

  const shown = rows.filter((r) => view === "all" || (view === "heard") === r.heard);
  const nHeard = rows.filter((r) => r.heard).length;
  const pct = rows.length ? Math.round((nHeard / rows.length) * 100) : 0;

  if (auth === "?") return <main><p>Lädt …</p></main>;
  if (auth === "out")
    return (
      <main>
        <header className="top"><h1>Hörspiel-Tracker</h1><button className="ghost" onClick={flipTheme}>{theme === "dark" ? "Hell" : "Dunkel"}</button></header>
        <section className="panel">
          <p>Zeigt dir, welche Folgen einer Hörspielreihe du auf Spotify schon gehört hast.</p>
          <a href="/api/login"><button>Mit Spotify anmelden</button></a>
        </section>
      </main>
    );

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
        <div className="field">
          <span className="l">Reihe: {series?.name ?? "noch keine gewählt"}</span>
          <div className="bar">
            <input type="text" placeholder="Interpret suchen, z. B. Die drei ???" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <button onClick={search}>Suchen</button>
          </div>
          {found.map((a) => (
            <div className="pick" key={a.id}><span>{a.name}</span><button className="ghost" onClick={() => pick(a)}>Wählen</button></div>
          ))}
        </div>
        <div className="field">
          <span className="l">Anzeige und Verlauf</span>
          <input type="text" placeholder="Nur Alben mit diesem Titelteil, z. B. Folge" value={filter} onChange={(e) => { setFilter(e.target.value); save("filter", e.target.value); }} />
          <label className="file">Streaming-Verlauf importieren<input type="file" accept=".json" multiple hidden onChange={(e) => importHist(e.target.files)} /></label>
          <p className="hint">{Object.keys(hist).length ? `Verlauf gespeichert (${Object.keys(hist).length} Titel).` : "Noch kein Verlauf importiert."} Dateien: Streaming_History_Audio_*.json</p>
        </div>
      </section>

      {busy && <p className="hint">Lädt Alben …</p>}
      {note && <p className="hint">{note}</p>}
      {!series && <p className="hint">Such oben nach einer Reihe, z. B. „Die drei ???“, und tipp auf „Wählen“.</p>}

      {rows.length > 0 && (
        <>
          <section className="stats">
            <span><b>{nHeard}</b> gehört</span>
            <span><b>{rows.length - nHeard}</b> offen</span>
            <span><b>{pct} %</b> geschafft</span>
            <div className="meter"><i style={{ width: pct + "%" }} /></div>
          </section>
          <div className="bar" style={{ margin: "10px 0" }}>
            {(["all", "open", "heard"] as const).map((v) => (
              <button key={v} className={view === v ? "on" : "ghost"} onClick={() => setView(v)}>{{ all: "Alle", open: "Nicht gehört", heard: "Gehört" }[v]}</button>
            ))}
            {series && <button className="ghost" onClick={() => fetchAlbums(series.id, true)}>Neu laden</button>}
          </div>
          <p className="hint">Tipp auf ein Album markiert es von Hand als gehört (nochmal tippen hebt es auf).</p>
        </>
      )}

      <div className="grid">
        {shown.map(({ a, heard, auto, last, saved: sv }) => (
          <article key={a.id} className={"card" + (heard ? " is-heard" : "")} onClick={() => !auto && toggle(a.id)}>
            <div className="cover">
              {a.img && <img src={a.img} alt="" loading="lazy" />}
              <span className={"badge " + (heard ? "heard" : "open")}>{heard ? "gehört" : "offen"}</span>
            </div>
            <div className="meta">
              <b>{a.name}</b>
              <small>{last ? "Zuletzt: " + new Date(last).toLocaleDateString("de-DE") : sv ? "In Bibliothek gespeichert" : a.date}</small>
            </div>
            <a className="btn" href={a.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>In Spotify öffnen</a>
          </article>
        ))}
      </div>
    </main>
  );
}
