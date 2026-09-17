import type { Metadata } from "next";

/**
 * 인플루언서 콘솔 홈 — 1단계(호스트 분리 골격)의 자리표시 카드 (docs/inf-console-plan.md §7 "1단계").
 * 3단계에서 "지금 할 일 · 진행 중 · 등급/🥬" 3위젯이 들어온다. 세션·service role 읽기라 전부 force-dynamic.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "홈" };

export default function InfluencerHomePage() {
  return (
    <section className="card static">
      <div className="lbl-sm">인플루언서 콘솔</div>
      <h2 className="console-title">콘솔 준비 중</h2>
      <p className="meta">
        이메일 로그인 · 가입 · 신청은 <b>2단계</b>에서 열립니다. 지금은 화면 골격(상단 바 · 하단 탭)만 확인할 수 있어요.
      </p>
      <p className="meta">상품 갤러리 · 무상 샘플 요청 · 캠페인 목록은 3단계, 샘플 구매 결제는 4단계에 들어옵니다.</p>
    </section>
  );
}
