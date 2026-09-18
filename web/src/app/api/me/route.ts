import { NextResponse } from "next/server";
import { displayName, getSessionUser } from "@/lib/auth";

/**
 * Lightweight auth probe for client UI (app-plan §6.2): `{ user: { name, avatar } | null }`.
 * 서버에서 세션을 읽으므로 httpOnly 쿠키여도 동작한다. 캐시 금지.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  const headers = { "Cache-Control": "no-store" };

  if (!user) return NextResponse.json({ user: null }, { headers });

  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const avatar =
    typeof m.avatar_url === "string" ? m.avatar_url : typeof m.picture === "string" ? m.picture : null;

  return NextResponse.json({ user: { name: displayName(user), avatar } }, { headers });
}
