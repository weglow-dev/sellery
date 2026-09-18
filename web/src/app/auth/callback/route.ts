import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureCustomer } from "@/lib/customers";
import { isPartnerUser, safeNext } from "@/lib/auth";
import { consolePath } from "@/lib/hosts";
import { createSellerFromSignup, linkSellerIdOf } from "@/lib/partner/signup";

/**
 * OAuth callback (app-plan §4.1). Supabase (카카오 뒤) 가 `?code=…&next=…` 로 보낸다.
 *   exchangeCodeForSession(code) → 세션 쿠키 → ensureCustomer(best-effort) → redirect(origin + safeNext(next) + ?welcome=1)
 * 실패 → /login?error=auth. glo 콜백의 `${origin}${next}` 무검증 리다이렉트는 복사하지 않는다.
 * `?welcome=1` 은 목적지에서 토스트 "{name}님, 카카오로 로그인했어요" 를 1회 띄우기 위한 표식 (ux-spec §3.3).
 *
 * 파트너 분기(docs/inf-console-plan.md §4.2 · §4.3): `user_metadata.partner_role`(비신뢰 값 — 무해한 분기에만) 또는
 * `app_metadata.link_seller_id` 가 있으면 `ensureCustomer` 를 건너뛰고 `createSellerFromSignup(user)`(멱등) 를 호출하며
 * `?welcome=1` 을 붙이지 않는다. `next` 접두나 요청 host 로 판정하지 않는다(Preview 경로 모드·재설정에서 어긋난다).
 * 생성 실패(`ok:false`)는 `/apply?reason=<code>` 보완 폼으로. 파트너 인증 메일은 token_hash 방식(`/auth/confirm`)이라
 * 이 PKCE 경로로는 거의 오지 않지만, 같은 헬퍼를 두어 어느 경로로 와도 결과가 같다.
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
      if (user && (isPartnerUser(user) || linkSellerIdOf(user) !== null)) {
        // 파트너 — customers 행을 만들지 않는다. 가입 생성은 멱등(already:true).
        const host = request.headers.get("host");
        const result = await createSellerFromSignup(user);
        if (!result.ok) {
          console.error("[auth/callback] createSellerFromSignup:", result.code, result.field ?? "");
          const apply = consolePath("seller", "/apply", host);
          return NextResponse.redirect(new URL(`${apply}?reason=${encodeURIComponent(result.code)}`, origin));
        }
        return NextResponse.redirect(new URL(next === "/" ? consolePath("seller", "/home", host) : next, origin));
      }
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
