"use client";
import { useEffect, useMemo, useState } from "react";

const HEARD_MS = 5 * 60 * 1000; // ab 5 Min. Wiedergabe im Streaming-Verlauf gilt ein Album als gehört
const PAGE = 10; // kleine Seitengröße, passt zu den Limits im Spotify-Entwicklermodus
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const load = <T,>(k: string, d: T): T => {
  try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; }
};
const save = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

async function sp(p: string) {
  const r = await fetch("/api/sp?p=" + encodeURIComponent(p));
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
async function all(path: string, size: number) {
  const out: any[] = [];
  for (let o = 0; ; o += size) {
    const d = await sp(`${path}${path.includes("?") ? "&" : "?"}limit=${size}&offset=${o}`);
    out.push(...d.items);
    if (!d.next) return out;
  }
}

type Hist = Record<string, { ms: number; last: string }>;

export default function Home() {
  const [auth, setAuth] = useState<"?" | "in" | "out">("?");
  const [series, setSeries] = useState<{ id: string; name: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [albums, setAlbums] = useState<any[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Hist>({});
  const [manual, setManual] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [view, setView] = useState<"all" | "open" | "heard">("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function fetchAlbums(id: string) {
    setBusy(true); setErr("");
    try {
      const list = await all(`/artists/${id}/albums?include_groups=album&market=DE`, PAGE);
      const seen = new Set<string>();
      const uniq = list.filter((a) => !seen.has(norm(a.name)) && seen.add(norm(a.name)));
      uniq.sort((a, b) => a.release_date.localeCompare(b.release_date));
      setAlbums(uniq);
    } catch (e: any) { setErr("Alben konnten nicht geladen werden (" + e.message + ")."); }
    setBusy(false);
  }

  useEffect(() => {
    setHist(load("hist", {})); setManual(load("manual", [])); setFilter(load("filter", ""));
    const s = load<{ id: string; name: string } | null>("series", null);
    setSeries(s);
    (async () => {
      try {
        const lib = await all("/me/albums", 50);
        setSaved(new Set(lib.map((x) => x.album.id)));
        const rp = await sp("/me/player/recently-played?limit=50");
        const m: Record<string, string> = {};
        for (const it of rp.items) { const id = it.track.album.id; if (!m[id] || it.played_at > m[id]) m[id] = it.played_at; }
        setRecent(m);
        setAuth("in");
        if (s) fetchAlbums(s.id);
      } catch (e: any) {
        setAuth(e.message === "401" ? "out" : "in");
        if (e.message !== "401") setErr("Fehler beim Laden: " + e.message);
      }
    })();
  }, []);

  async function search() {
    setErr("");
    try { setFound((await sp(`/search?type=artist&limit=10&q=${encodeURIComponent(q)}`)).artists.items); }
    catch (e: any) { setErr("Suche fehlgeschlagen (" + e.message + ")."); }
  }
  function pick(a: any) {
    const s = { id: a.id, name: a.name };
    setSeries(s); save("series", s); setFound([]); fetchAlbums(a.id);
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
      const viaManual = manual.includes(a.id);
      const last = [h?.last, recent[a.id]].filter(Boolean).sort().pop();
      return { a, heard: viaHist || viaRecent || viaManual, auto: viaHist || viaRecent, last, saved: saved.has(a.id) };
    });
  }, [albums, filter, hist, recent, manual, saved]);

  const shown = rows.filter((r) => view === "all" || (view === "heard") === r.heard);
  const nHeard = rows.filter((r) => r.heard).length;

  if (auth === "?") return <main><p>Lädt …</p></main>;
  if (auth === "out")
    return (
      <main>
        <h1>Hörspiel-Tracker</h1>
        <p>Zeigt dir, welche Folgen einer Hörspielreihe du auf Spotify schon gehört hast.</p>
        <a href="/api/login"><button>Mit Spotify anmelden</button></a>
      </main>
    );

  return (
    <main>
      <h1>Hörspiel-Tracker</h1>
      {err && <p className="open">{err}</p>}
      <div className="box">
        <b>Reihe: {series?.name ?? "noch keine gewählt"}</b>
        <div className="bar">
          <input type="text" placeholder="Interpret suchen, z. B. Die drei ???" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <button onClick={search}>Suchen</button>
        </div>
        {found.map((a) => (
          <div className="row" key={a.id}><span className="t">{a.name}</span><button className="ghost" onClick={() => pick(a)}>Wählen</button></div>
        ))}
        <input type="text" placeholder="Nur Alben mit diesem Titelteil, z. B. Folge" value={filter} onChange={(e) => { setFilter(e.target.value); save("filter", e.target.value); }} />
        <p><small>Spotify-Verlauf (Streaming_History_Audio_*.json) importieren:</small><br /><input type="file" accept=".json" multiple onChange={(e) => importHist(e.target.files)} /></p>
      </div>
      {busy && <p>Lädt Alben …</p>}
      {rows.length > 0 && (
        <>
          <p><b>{nHeard} von {rows.length}</b> gehört</p>
          <div className="bar">
            {(["all", "open", "heard"] as const).map((v) => (
              <button key={v} className={view === v ? "on" : "ghost"} onClick={() => setView(v)}>{{ all: "Alle", open: "Nicht gehört", heard: "Gehört" }[v]}</button>
            ))}
          </div>
        </>
      )}
      {shown.map(({ a, heard, auto, last, saved: sv }) => (
        <div className="row" key={a.id} onClick={() => !auto && toggle(a.id)}>
          {a.images?.[2] ? <img src={a.images[2].url} alt="" /> : <span className="ph" />}
          <span className="t"><b>{a.name}</b><small>{last ? "Zuletzt: " + new Date(last).toLocaleDateString("de-DE") : sv ? "In Bibliothek gespeichert" : a.release_date}</small></span>
          <span className={"tag " + (heard ? "heard" : "open")}>{heard ? "gehört" : "offen"}</span>
        </div>
      ))}
      <div className="bar">
        <button className="ghost" onClick={async () => { await fetch("/api/logout", { method: "POST" }); setAuth("out"); }}>Abmelden</button>
      </div>
    </main>
  );
}
