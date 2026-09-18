import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { consolePath } from "@/lib/hosts";
import { consoleNextOf } from "@/lib/partner/seller";
import { LoginForm } from "./login-form";

/**
 * 콘솔 로그인 — 이메일/비밀번호 (docs/inf-console-plan.md §4.1). proxy 세션 게이트(규칙 5)의 착지(`/login?next=…`).
 * 서버에서 `next` 를 정규화(`consoleNextOf`)하고 이미 로그인이면 즉시 그곳으로. 폼·Auth 호출은 클라이언트 컴포넌트.
 * 카카오 버튼 없음 — 인플루언서 계정은 고객 카카오 계정과 분리된 이메일 계정. 고객 사이트 링크는 절대 URL(`NEXT_PUBLIC_SITE_URL`).
 * `?error=auth`(콜백 실패) · `?error=expired`(인증 링크 만료·재사용 — /auth/confirm) 문구.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "로그인" };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const ERROR_TEXT: Record<string, string> = {
  auth: "로그인에 실패했어요. 잠시 후 다시 시도해주세요.",
  expired: "인증 링크가 만료됐거나 이미 사용됐어요. 이미 인증을 마쳤다면 로그인해주세요 — 아직 전이라면 가입 화면에서 메일을 다시 받을 수 있어요.",
};

export default async function InfluencerLoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const host = (await headers()).get("host");
  const next = consoleNextOf(sp.next, host);

  const user = await getSessionUser();
  if (user) redirect(next);

  const err = first(sp.error);
  const initialError = err ? (ERROR_TEXT[err] ?? ERROR_TEXT.auth) : null;

  return (
    <div className="console-auth">
      <section className="card static">
        <div className="lbl-sm">인플루언서 콘솔</div>
        <h2 className="console-title">로그인</h2>
        <p className="meta">등록한 이메일과 비밀번호로 로그인합니다. 인플루언서 계정은 고객 카카오 계정과 별개의 이메일 계정이에요.</p>
        <LoginForm next={next} initialError={initialError} passwordHref={consolePath("seller", "/password", host)} />
        <div className="foot">
          <span>아직 계정이 없나요?</span>
          <Link href={consolePath("seller", "/signup", host)}>인플루언서 가입</Link>
        </div>
      </section>
      <p className="meta" style={{ textAlign: "center", marginTop: 14 }}>
        <a href={SITE_URL}>← 셀러리 고객 사이트</a>
      </p>
    </div>
  );
}
