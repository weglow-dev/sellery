import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { consolePath } from "@/lib/hosts";
import { SignupForm } from "./signup-form";

/**
 * 인플루언서 가입 — 프로토타입 login.html fJoin(활동명 · 이메일 · 비밀번호 · 추천 코드 · 약관) + 플랫폼 · 핸들
 * (docs/inf-console-plan.md §4.1). 수동 심사 없음: signUp → 인증 메일(token_hash 링크) → /auth/confirm 이 sellers 행을 만들고 /home.
 * 이용약관·개인정보처리방침은 고객 사이트의 절대 URL(`NEXT_PUBLIC_SITE_URL`) — root layout 이 다르고 호스트도 다를 수 있다.
 * 경로 prop 들은 요청 host 기준 `consolePath` 로 만든다(클라이언트에서 env 로 계산하면 `*.vercel.app` 임시 확인에서 어긋난다).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "인플루언서 가입" };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export default async function InfluencerSignupPage() {
  const host = (await headers()).get("host");
  const user = await getSessionUser();
  if (user) redirect(consolePath("seller", "/home", host));

  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">인플루언서 가입</h2>
        <p className="meta">가입 후 이메일 인증을 완료하면 바로 콘솔에 들어갈 수 있어요. 인증 메일의 링크는 다른 기기에서 열어도 됩니다.</p>
        <SignupForm
          nextPath={consolePath("seller", "/home", host)}
          applyPath={consolePath("seller", "/apply", host)}
          verifySentPath={consolePath("seller", "/verify-sent", host)}
          termsUrl={`${SITE_URL}/terms`}
          privacyUrl={`${SITE_URL}/privacy`}
        />
        <div className="foot">
          <span>이미 계정이 있나요?</span>
          <Link href={consolePath("seller", "/login", host)}>로그인</Link>
        </div>
      </section>
    </div>
  );
}
