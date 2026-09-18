import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consoleRoleOf, consoleUrl } from "@/lib/hosts";
import { safeNext } from "@/lib/auth";

/**
 * Sign out server-side so the (possibly httpOnly) auth cookies are cleared. 303 (app-plan §4.1).
 * 목적지: 콘솔 호스트에서 왔으면 그 콘솔 로그인의 **절대 URL**(`consoleUrl(role, "/login")` — 검증된 env 호스트 기준,
 * 예 `https://inf.sellery.life/login`), 아니면 고객 홈 `/` (docs/inf-console-plan.md §2.1 · §3.2).
 * 콘솔 분기는 `request.url` 의 오리진에 기대지 않는다 — `next start`·셀프 호스트에서는 기동 주소(`http://localhost:3100`)라
 * 고객 카카오 `/login` 으로 떨어진다(proxy.ts 가 `sameHostOrigin` 으로 피하는 것과 같은 문제).
 * `/auth/*` 는 리라이트 제외 경로라 어느 호스트에서도 같은 경로.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // `?next=` 가 있으면(같은 오리진 상대 경로만 — safeNext) 그곳으로: 경로 모드 콘솔의 로그아웃 → `/influencer/login`
  const nextRaw = new URL(request.url).searchParams.get("next");
  const next = nextRaw ? safeNext(nextRaw) : null;
  const entry = consoleRoleOf(request.headers.get("host"));
  // entry 가 있으면 그 역할의 env 호스트가 반드시 있으므로 consoleUrl 은 항상 절대 URL 을 돌려준다
  const to = next && next !== "/" ? new URL(next, request.url) : entry ? consoleUrl(entry.role, "/login") : new URL("/", request.url);
  return NextResponse.redirect(to, { status: 303 });
}
