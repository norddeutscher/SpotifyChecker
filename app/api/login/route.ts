import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE } from "@/lib/spotify";

export async function GET() {
  const state = crypto.randomUUID();
  (await cookies()).set("sp_state", state, { ...COOKIE, maxAge: 600 });
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: "user-library-read user-read-recently-played",
    state,
  }).toString();
  return NextResponse.redirect(url);
}
