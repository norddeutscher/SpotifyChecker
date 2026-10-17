import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const c = await cookies();
  ["sp_at", "sp_exp", "sp_rt"].forEach((k) => c.delete(k));
  return NextResponse.json({ ok: true });
}
