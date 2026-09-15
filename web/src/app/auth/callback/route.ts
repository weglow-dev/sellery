import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureCustomer } from "@/lib/customers";
import { safeNext } from "@/lib/auth";

/**
 * OAuth callback (app-plan §4.1). Supabase (카카오 뒤) 가 `?code=…&next=…` 로 보낸다.
 *   exchangeCodeForSession(code) → 세션 쿠키 → ensureCustomer(best-effort) → redirect(origin + safeNext(next) + ?welcome=1)
 * 실패 → /login?error=auth. glo 콜백의 `${origin}${next}` 무검증 리다이렉트는 복사하지 않는다.
 * `?welcome=1` 은 목적지에서 토스트 "{name}님, 카카오로 로그인했어요" 를 1회 띄우기 위한 표식 (ux-spec §3.3).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = data.user;
      if (user) {
        // customers 행 보장 — 실패해도 로그인은 계속 (체크아웃 API 가 다시 보장한다).
        // createAdminClient() 는 서비스 키가 없으면 동기적으로 throw 하므로 async 블록 안에서 호출해 .catch 로 흡수한다.
        void (async () => {
          await ensureCustomer(createAdminClient(), user);
        })().catch((e: unknown) => {
          console.error("[auth/callback] ensureCustomer failed:", e instanceof Error ? e.message : e);
        });
      }
      const dest = new URL(next, origin);
      dest.searchParams.set("welcome", "1");
      return NextResponse.redirect(dest);
    }
    console.error("[auth/callback] exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
