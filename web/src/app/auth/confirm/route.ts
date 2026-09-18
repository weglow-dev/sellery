import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureCustomer } from "@/lib/customers";
import { isPartnerUser, safeNext } from "@/lib/auth";
import { PREFIX_OF, consolePath, consoleRoleOf, consoleUrl } from "@/lib/hosts";
import { createSellerFromSignup, linkSellerIdOf } from "@/lib/partner/signup";

/**
 * GET /auth/confirm — **token_hash 방식** 인증·재설정·초대 링크 착지 (docs/inf-console-plan.md §4.1 · §4.3).
 *   `?token_hash=…&type=signup|recovery|invite|email|magiclink&next=…`
 *   verifyOtp({ type, token_hash }) → 세션 쿠키 → 파트너(`isPartnerUser` 또는 `app_metadata.link_seller_id`)면
 *   `ensureCustomer` 생략 + `createSellerFromSignup(user)`(멱등 · 한 트랜잭션) → `safeNext(next)` 로 302.
 *   생성 실패(`ok:false`) → `/apply?reason=<code>`(콘솔 경로 · 보완 폼). `type=recovery` 는 생성 없이 `/password/new`.
 *   카카오 고객(파트너 아님)은 기존 콜백처럼 `ensureCustomer`(best-effort) + `?welcome=1`.
 *
 * PKCE `?code=` 가 아니라 token_hash 를 쓰는 이유: code verifier 는 signUp 을 호출한 브라우저 쿠키에만 있어 데스크톱에서
 * 가입하고 휴대폰 메일 앱에서 링크를 열면 exchangeCodeForSession 이 실패한다. 이메일 템플릿의 링크를
 * `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` 으로 바꿔야 이 라우트에 도달한다(web/DEPLOY.md §3.5).
 * `/auth/*` 는 리라이트 제외 경로라 어느 호스트에서도 같은 경로 — `next` 는 상대 경로(`safeNext`)만 통과.
 */
export const dynamic = "force-dynamic";

const OTP_TYPES = ["signup", "recovery", "invite", "email", "magiclink", "email_change"] as const;
type OtpType = (typeof OTP_TYPES)[number];

function isOtpType(v: string | null): v is OtpType {
  return v !== null && (OTP_TYPES as readonly string[]).includes(v);
}

/** 실패 시 보낼 로그인 URL — 콘솔 호스트면 env 기준 절대 URL(`consoleUrl`), 경로 모드에서 next 가 콘솔 경로면 콘솔 로그인, 아니면 고객 로그인 */
function loginUrlFor(origin: string, host: string | null, next: string, reason: string): string {
  const entry = consoleRoleOf(host);
  if (entry) return `${consoleUrl(entry.role, "/login")}?error=${reason}`;
  if (next.startsWith(`${PREFIX_OF.seller}/`) || next === PREFIX_OF.seller) {
    return `${origin}${PREFIX_OF.seller}/login?error=${reason}`;
  }
  return `${origin}/login?error=auth`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const host = request.headers.get("host");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  if (!tokenHash || !isOtpType(type)) {
    return NextResponse.redirect(loginUrlFor(origin, host, next, "auth"), 302);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) {
    console.error("[auth/confirm] verifyOtp failed:", error?.message ?? "no user");
    // 만료·재사용 링크는 로그인으로 (이미 인증된 계정이면 로그인만 하면 된다)
    return NextResponse.redirect(loginUrlFor(origin, host, next, "expired"), 302);
  }
  const user = data.user;
  const partner = isPartnerUser(user) || linkSellerIdOf(user) !== null;

  if (type === "recovery") {
    // 비밀번호 재설정 — 생성 호출 없이 새 비밀번호 화면으로 (next 에도 실려 오지만 고정 목적지로 통일 · 파트너 전용 흐름)
    return NextResponse.redirect(new URL(consolePath("seller", "/password/new", host), origin), 302);
  }

  if (partner) {
    // 파트너 — ensureCustomer 생략(§4.2). 가입 생성은 멱등(already:true) 이라 링크 재클릭·재시도에 안전.
    const result = await createSellerFromSignup(user);
    if (!result.ok) {
      console.error("[auth/confirm] createSellerFromSignup:", result.code, result.field ?? "");
      const apply = consolePath("seller", "/apply", host);
      return NextResponse.redirect(new URL(`${apply}?reason=${encodeURIComponent(result.code)}`, origin), 302);
    }
    // next 가 비었으면(safeNext 폴백 "/") 콘솔 홈 — 경로 모드에서 "/" 는 고객 홈이다
    return NextResponse.redirect(new URL(next === "/" ? consolePath("seller", "/home", host) : next, origin), 302);
  }

  // 고객(카카오) — 기존 콜백과 동일 (best-effort)
  void (async () => {
    await ensureCustomer(createAdminClient(), user);
  })().catch((e: unknown) => {
    console.error("[auth/confirm] ensureCustomer failed:", e instanceof Error ? e.message : e);
  });
  const dest = new URL(next, origin);
  dest.searchParams.set("welcome", "1");
  return NextResponse.redirect(dest, 302);
}
