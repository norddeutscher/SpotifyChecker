import { cookies } from "next/headers";

export const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function tokenRequest(body: Record<string, string>) {
  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return r.ok ? r.json() : null;
}

// Liefert ein gültiges Access Token und erneuert es bei Bedarf per Refresh Token.
export async function getAccessToken(): Promise<string | null> {
  const c = await cookies();
  const at = c.get("sp_at")?.value;
  if (at && Date.now() < Number(c.get("sp_exp")?.value ?? 0) - 30_000) return at;
  const rt = c.get("sp_rt")?.value;
  if (!rt) return null;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: rt });
  if (!t) return null;
  c.set("sp_at", t.access_token, COOKIE);
  c.set("sp_exp", String(Date.now() + t.expires_in * 1000), COOKIE);
  if (t.refresh_token) c.set("sp_rt", t.refresh_token, COOKIE);
  return t.access_token;
}
