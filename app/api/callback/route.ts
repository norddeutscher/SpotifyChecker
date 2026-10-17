import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, tokenRequest } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const c = await cookies();
  const home = new URL("/", process.env.SPOTIFY_REDIRECT_URI!);
  if (!p.get("code") || p.get("state") !== c.get("sp_state")?.value) {
    home.searchParams.set("error", "login");
    return NextResponse.redirect(home);
  }
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code: p.get("code")!,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
  });
  if (!t) {
    home.searchParams.set("error", "token");
    return NextResponse.redirect(home);
  }
  c.set("sp_at", t.access_token, COOKIE);
  c.set("sp_exp", String(Date.now() + t.expires_in * 1000), COOKIE);
  c.set("sp_rt", t.refresh_token, COOKIE);
  c.delete("sp_state");
  return NextResponse.redirect(home);
}
