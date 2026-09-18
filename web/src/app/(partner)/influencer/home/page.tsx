import type { Metadata } from "next";
import Link from "next/link";
import { GradeBox } from "@/components/grade-box";
import { PlatformHandle } from "@/components/platform-handle";
import { requireSeller, sellerPath } from "@/lib/partner/seller";

/**
 * 인플루언서 콘솔 홈 — 2단계 (docs/inf-console-plan.md §7 "2. 로그인 · 가입 · 자동 생성"): 상단 활동명·등급·🥬 잔액 +
 * "지금 할 일" 카드 3장 — 채널 인증(/my) · 계좌 등록(5단계 예고 · 비활성) · 상품 둘러보기(3단계 예고 · 비활성).
 * 데이터는 `requireSeller()` 컨텍스트만(캠페인·주문 위젯은 3단계). 세션·service role 읽기라 force-dynamic.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "홈" };

export default async function InfluencerHomePage() {
  const ctx = await requireSeller({ next: "/home" });
  const { seller, balance } = ctx;

  return (
    <>
      <div className="console-head">
        <h2>{seller.name} 님, 안녕하세요</h2>
        <GradeBox grade={seller.grade} sm />
        <span className="cel" title="셀러리 포인트 잔액">
          🥬 {balance}
        </span>
      </div>
      <section className="card static" style={{ marginBottom: 16 }}>
        <div className="lbl-sm">내 계정</div>
        <p className="meta" style={{ marginTop: 6 }}>
          <PlatformHandle platform={seller.platform} handle={seller.handle} /> · 등급 <b>{seller.grade ?? "스타터"}</b> · 🥬{" "}
          <b>{balance}</b>
          {seller.code ? (
            <>
              {" "}
              · 코드 <b>{seller.code}</b>
            </>
          ) : null}
        </p>
        <p className="meta">등급은 최근 3개월 확정 매출로 매달 다시 계산되고, 🥬 는 확정 매출 ₩500만당 1개씩 쌓여요.</p>
      </section>

      <div className="sec">지금 할 일</div>
      <div className="console-todo">
        <section className="card static">
          <h4>① 채널 인증</h4>
          <p className="meta">가입 때 등록한 {seller.handle} 채널을 인증하면 브랜드 갤러리에 노출돼요. 1회용 코드를 프로필이나 DM 으로 보내면 돼요.</p>
          <Link href={sellerPath(ctx, "/my")} className="btn pri sm">
            인증하러 가기 →
          </Link>
        </section>
        <section className="card static">
          <h4>② 정산 계좌 등록</h4>
          <p className="meta">
            {seller.has_bank_info ? "정산 정보가 등록돼 있어요." : "정산 정보가 없으면 D+21 지급이 보류돼요."} 계좌·원천징수 자료 입력은{" "}
            <b>5단계</b>에서 열립니다.
          </p>
          <button type="button" className="ghost sm" disabled aria-disabled="true">
            준비 중
          </button>
        </section>
        <section className="card static">
          <h4>③ 첫 상품 둘러보기</h4>
          <p className="meta">
            브랜드 상품 갤러리에서 무상 샘플을 요청하거나 샘플을 구매해 첫 캠페인을 시작해요. 상품 갤러리는 <b>3단계</b>에서 열립니다.
          </p>
          <button type="button" className="ghost sm" disabled aria-disabled="true">
            준비 중
          </button>
        </section>
      </div>
    </>
  );
}
