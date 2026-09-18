"use client";

/**
 * 결제 금액 박스 `.card.cart-side` (ux-spec §3.4 우측 — 프로토타입 vCustCart 결제 금액 박스 원문) + 400px 하단 고정 결제 바. 소유: D.
 *   table.stmt  {product} × {q} | ₩{sum} · 배송비 | 무료 · 브랜드 직배송 · tr.tot 총 결제 | ₩{total}
 *   [ ₩{total} 결제하기 ] pri buy · .meta 결제 대금은 셀러리가 보관 · 판매 종료 후 {n}일 환불 보호
 * ≤640px 에서는 카드 안 버튼을 숨기고 <PayBar/>(fixed bottom) 가 같은 버튼을 보여 준다.
 * PayBar 는 transform 이 걸리는 .card 밖(페이지 루트)에서 렌더한다 — fixed 가 카드에 갇히지 않게.
 */
import { won } from "@/lib/campaign";

export type PaySummary = {
  productName: string;
  qty: number;
  total: number;
  clearDays: number;
};

export type PayButtonProps = {
  total: number;
  disabled: boolean;
  submitting: boolean;
  onPay: () => void;
};

export function PayButton({ total, disabled, submitting, onPay }: PayButtonProps) {
  return (
    <button type="button" className="pri buy" onClick={onPay} disabled={disabled || submitting} aria-busy={submitting || undefined} style={{ margin: "6px 0 4px" }}>
      {submitting ? "결제 준비 중…" : `${won(total)} 결제하기`}
    </button>
  );
}

export function OrderSummary({ summary, pay }: { summary: PaySummary; pay: PayButtonProps }) {
  return (
    <div className="card static cart-side">
      <h4>결제 금액</h4>
      <table className="stmt" style={{ minWidth: 0, fontSize: 13 }}>
        <tbody>
          <tr>
            <td>
              {summary.productName} × {summary.qty}
            </td>
            <td className="num">{won(summary.total)}</td>
          </tr>
          <tr>
            <td>배송비</td>
            <td className="num" style={{ fontFamily: "var(--font-sans)" }}>
              무료 · 브랜드 직배송
            </td>
          </tr>
          <tr className="tot">
            <td>총 결제</td>
            <td className="num">{won(summary.total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="max-[640px]:hidden" style={{ marginTop: 12 }}>
        <PayButton {...pay} />
      </div>
      <div className="meta" style={{ textAlign: "center", marginTop: 8 }}>
        결제 대금은 <b>셀러리</b>가 보관 · 판매 종료 후 {summary.clearDays}일 환불 보호
      </div>
    </div>
  );
}

/** 400px 하단 고정 결제 바 (≤640px 에서만 보임). 페이지 루트에 두고, 본문에는 그만큼 하단 여백을 준다. */
export function PayBar({ total, disabled, submitting, onPay }: PayButtonProps) {
  return (
    <div
      className="hidden max-[640px]:block fixed inset-x-0 bottom-0 z-40 bg-bg px-4 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]"
      style={{ boxShadow: "0 -8px 12px -8px rgba(28, 42, 20, 0.25)" }}
    >
      <PayButton total={total} disabled={disabled} submitting={submitting} onPay={onPay} />
    </div>
  );
}
