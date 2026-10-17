import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/spotify";

// Schlanker Proxy: das Frontend ruft nur erlaubte Spotify-Pfade auf, das Token bleibt serverseitig.
const ALLOWED = ["/me/albums", "/me/player/recently-played", "/search", "/artists/", "/albums"];

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  if (!p.startsWith("/") || p.includes("..") || !ALLOWED.some((a) => p.startsWith(a)))
    return NextResponse.json({ error: "forbidden" }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await fetch("https://api.spotify.com/v1" + p, { headers: { Authorization: `Bearer ${token}` } });
  const res = new NextResponse(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
  const ra = r.headers.get("Retry-After");
  if (ra) res.headers.set("Retry-After", ra);
  return res;
}
