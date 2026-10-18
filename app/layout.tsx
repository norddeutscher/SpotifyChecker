import type { ReactNode } from "react";

export const metadata = { title: "Hörspiel-Tracker" };
export const viewport = { width: "device-width", initialScale: 1 };

const css = `
:root{--bg:#e9eef2;--ink:#1b2a41;--mute:#5b6b7f;--line:#cbd5df;--red:#b3122b;--green:#2f6f5e;--card:#f7f9fb}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.4 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px 14px 80px}
h1{font:700 1.5rem/1.2 Georgia,serif;margin:8px 0 14px}
button,input{font:inherit}button{background:var(--ink);color:#fff;border:0;border-radius:8px;padding:10px 14px}
button.ghost{background:none;color:var(--ink);border:1px solid var(--line)}button.on{background:var(--red)}
input[type=text]{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff}
.row{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.row img,.row .ph{width:52px;height:52px;border-radius:4px;background:var(--line);flex:none}
.row .t{flex:1;min-width:0}.row .t b{display:block;font-weight:600}
.row small{color:var(--mute)}.tag{font-size:.8rem;font-weight:600;white-space:nowrap}
.side{display:flex;flex-direction:column;align-items:flex-end;gap:6px}.btn{font-size:.8rem;padding:6px 10px;border:1px solid var(--line);border-radius:8px;color:var(--ink);text-decoration:none;white-space:nowrap}
.heard{color:var(--green)}.open{color:var(--red)}
.bar{display:flex;gap:8px;margin:12px 0;flex-wrap:wrap}.box{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:12px 0}
button:focus-visible,input:focus-visible{outline:2px solid var(--red);outline-offset:2px}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>
        <style>{css}</style>
        {children}
      </body>
    </html>
  );
}
