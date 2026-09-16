import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTossError, tossGetPayment } from "@/lib/toss";

/**
 * GET /api/health — 배포 뒤 서버 설정 점검 (web/DEPLOY.md §8). 소유: E.
 *
 * 로그인 없이 서버 비밀키 두 개가 "실제로 맞는 값"인지 확인한다. 데이터는 돌려주지 않는다.
 *   - supabaseAdmin: service_role 키로 checkout_sessions HEAD 조회 1회 → 키가 anon/틀림이면 RLS·권한 오류 → fail
 *   - toss: 시크릿 키로 존재하지 않는 결제 1건 조회 → 맞는 키면 404 NOT_FOUND_PAYMENT → ok,
 *           틀린 키면 401 UNAUTHORIZED_KEY · 미설정이면 CONFIG_ERROR → fail
 * 전부 ok 면 200, 하나라도 fail 이면 503. 원인은 Vercel Logs 에만 남긴다(공개 엔드포인트).
 */
export const dynamic = "force-dynamic";

type Check = "ok" | "fail";

export async function GET() {
  const checks: { supabaseAdmin: Check; toss: Check } = { supabaseAdmin: "fail", toss: "fail" };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("checkout_sessions").select("id", { head: true, count: "exact" });
    if (error) console.error("[health] supabase admin:", error.message);
    else checks.supabaseAdmin = "ok";
  } catch (e) {
    console.error("[health] supabase admin:", e instanceof Error ? e.message : e);
  }

  const probe = await tossGetPayment("health_probe_not_a_real_payment", { timeoutMs: 5_000 });
  if (probe.ok) {
    checks.toss = "ok";
  } else if (probe.status === 404 && isTossError(probe.body)) {
    checks.toss = "ok";
  } else {
    console.error("[health] toss:", probe.status, isTossError(probe.body) ? probe.body.code : "?");
  }

  const ok = checks.supabaseAdmin === "ok" && checks.toss === "ok";
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
