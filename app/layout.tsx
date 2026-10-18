import type { ReactNode } from "react";

export const metadata = { title: "Hörspiel-Tracker" };
export const viewport = { width: "device-width", initialScale: 1 };

const theme = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`;

const css = `
:root{color-scheme:light;--bg:#e9eef2;--surface:#f7f9fb;--field:#fff;--ink:#1b2a41;--mute:#5b6b7f;--line:#cbd5df;--red:#b3122b;--green:#2f6f5e;--on:#fff}
[data-theme=dark]{color-scheme:dark;--bg:#0e1320;--surface:#171e2f;--field:#0e1320;--ink:#e8ecf4;--mute:#93a0b8;--line:#2a3550;--red:#e5384f;--green:#4fb286;--on:#08120e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.4 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px 14px 60px}
h1{font:700 1.7rem/1.2 Georgia,serif;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:6px 0 16px}.acts{display:flex;gap:8px}
button,input{font:inherit}button{background:var(--ink);color:var(--bg);border:0;border-radius:8px;padding:10px 14px;cursor:pointer}
button.ghost{background:none;color:var(--ink);border:1px solid var(--line)}button.on{background:var(--red);color:var(--on)}
input[type=text]{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--field);color:var(--ink)}
.panel{display:grid;gap:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
@media(min-width:760px){.panel{grid-template-columns:1fr 1fr}}
.field{display:flex;flex-direction:column;gap:8px}.field label.l{font-weight:600}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.bar input{flex:1;min-width:0}
.hint{color:var(--mute);font-size:.85rem;margin:0}
.pick{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)}
.file{display:inline-block;padding:9px 14px;border:1px solid var(--line);border-radius:8px;cursor:pointer;align-self:flex-start}
.stats{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:baseline;margin:4px 0 6px}.stats b{font-size:1.4rem}
.meter{flex-basis:100%;height:8px;border-radius:4px;background:var(--line);overflow:hidden}.meter i{display:block;height:100%;background:var(--green)}
.err{color:var(--red);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin-top:8px}
.card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;cursor:pointer}
.cover{position:relative;aspect-ratio:1/1;background:var(--line)}.cover img{width:100%;height:100%;object-fit:cover;display:block}
.is-heard .cover img{opacity:.5}
.badge{position:absolute;top:8px;left:8px;font-size:.75rem;font-weight:700;padding:3px 8px;border-radius:999px;color:var(--on)}
.badge.heard{background:var(--green)}.badge.open{background:var(--red)}
.meta{padding:10px 10px 6px;flex:1}.meta b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600}
.meta small{color:var(--mute)}
.btn{display:block;margin:0 10px 10px;text-align:center;font-size:.85rem;padding:7px 8px;border:1px solid var(--line);border-radius:8px;color:var(--ink);text-decoration:none}
.trow{display:flex;gap:10px;align-items:center;padding:8px 10px;background:var(--surface);border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer}
.trow img,.trow .ph{width:44px;height:44px;border-radius:6px;object-fit:cover;background:var(--line);flex:none}.trow .t{flex:1;min-width:0}
.trow .t b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.trow .t small{color:var(--mute)}
.trow .btn{margin:0;white-space:nowrap}.is-heard.trow{opacity:.65}.badge.inline{position:static;display:inline-block}
button:focus-visible,input:focus-visible,a:focus-visible,.file:focus-within{outline:2px solid var(--red);outline-offset:2px}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>
        <style>{css}</style>
        {children}
      </body>
    </html>
  );
}
