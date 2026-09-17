import type { Metadata } from "next";

/**
 * 콘솔 로그인 자리표시 — proxy 세션 게이트(규칙 5)의 착지(`/login?next=…`)가 404 가 되지 않게 둔다.
 * 이메일/비밀번호 로그인 폼 · 가입 · 인증 메일 · 비밀번호 재설정은 2단계 (docs/inf-console-plan.md §4.1).
 * 고객 사이트 링크는 절대 URL(`NEXT_PUBLIC_SITE_URL`) — root layout 이 다르고 호스트도 다를 수 있어 <a href>.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "로그인" };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function InfluencerLoginPage() {
  return (
    <section className="card static">
      <div className="lbl-sm">인플루언서 콘솔</div>
      <h2 className="console-title">로그인</h2>
      <p className="meta">
        이메일 로그인은 <b>2단계</b>에서 열립니다. 인플루언서 계정은 고객 카카오 계정과 분리된 이메일/비밀번호 계정입니다.
      </p>
      <div className="btnrow" style={{ marginTop: 14 }}>
        <a href={SITE_URL} className="btn ghost sm">
          ← 셀러리 고객 사이트
        </a>
      </div>
    </section>
  );
}
