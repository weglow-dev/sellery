import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { COMPANY } from "@/lib/company";
import { getSellerContext, sellerPath } from "@/lib/partner/seller";
import { createSellerFromSignup } from "@/lib/partner/signup";
import { SIGNUP_FAIL_MESSAGES, isPlatform, isSignupFailCode, type SignupFailCode } from "@/lib/partner/signup-rules";
import { ApplyForm } from "./apply-form";

/**
 * `/apply` — 보완 폼 (docs/inf-console-plan.md §4.3 "예외 경로"). 남는 유일한 중간 화면: 세션은 있는데 `sellers.user_id` 행이 없는
 * guest 만 온다 — (1) HANDLE_TAKEN (2) user_metadata 누락·형식 오류(INVALID_INPUT — 옛 템플릿 `{{ .ConfirmationURL }}` 경로)
 * (3) /auth/confirm 이 세션 생성 뒤 함수 호출 전에 죽은 경우. 로드 시 먼저 `createSellerFromSignup(user)` 를 다시 시도하고(멱등 —
 * 성공하면 바로 /home), 실패했을 때만 user_metadata 를 프리필한 폼을 그린다. 신청 테이블·심사 상태·반려·/pending 은 없다.
 * 게이트: `requireSeller()` 는 guest 를 여기로 보내므로 이 페이지는 `getSellerContext()` 를 직접 본다(루프 방지).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "가입 정보 확인" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** 폼으로 고칠 수 없는 실패 — 안내만 (연결 대상 문제 · 신원 미확인) */
const NO_FORM: ReadonlySet<SignupFailCode> = new Set(["LINK_TARGET_NOT_FOUND", "LINK_TARGET_TAKEN", "NOT_CONFIRMED"]);

export default async function ApplyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const ctx = await getSellerContext();
  if (ctx.state === "anon") {
    redirect(`${sellerPath(ctx, "/login")}?next=${encodeURIComponent(sellerPath(ctx, "/apply"))}`);
  }
  if (ctx.state === "ok") redirect(sellerPath(ctx, "/home"));
  if (ctx.state === "suspended") redirect(sellerPath(ctx, "/suspended"));

  // guest — 멱등 재시도 (성공하면 폼 없이 홈으로)
  const retry = await createSellerFromSignup(ctx.user);
  if (retry.ok) redirect(sellerPath(ctx, "/home"));

  const reasonParam = first(sp.reason);
  const reason: SignupFailCode = isSignupFailCode(reasonParam) ? reasonParam : retry.code;
  const meta = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  const platformRaw = str("platform").toLowerCase();
  const defaults = {
    name: str("display_name") || str("name"),
    platform: isPlatform(platformRaw) ? platformRaw : ("instagram" as const),
    handle: str("handle"),
    referralCode: str("referral_code").toUpperCase(),
    termsAgreed: typeof meta.terms_agreed_at === "string" && meta.terms_agreed_at.length > 0,
  };

  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">가입 정보를 확인해주세요</h2>
        <p className="notice danger" role="alert">
          {SIGNUP_FAIL_MESSAGES[reason]}
        </p>
        {NO_FORM.has(reason) ? (
          <p className="meta">
            이 문제는 화면에서 바로 고칠 수 없어요. 가입한 이메일과 함께 <a href={COMPANY.csUrl}>{COMPANY.email}</a> 로 알려주시면 확인해
            드릴게요.
          </p>
        ) : (
          <>
            <p className="meta">아래 정보만 확인하면 바로 콘솔에 들어갈 수 있어요. 이메일 인증은 이미 끝났습니다.</p>
            <ApplyForm defaults={defaults} />
          </>
        )}
        <div className="foot">
          <span>{ctx.user.email ?? ""}</span>
          <form method="post" action="/auth/signout">
            <button type="submit" className="ghost sm">
              로그아웃
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
