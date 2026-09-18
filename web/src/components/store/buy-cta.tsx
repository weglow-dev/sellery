"use client";

/**
 * 상태별 CTA 블록 (ux-spec §3.1.3 원문). 소유: C.
 *   LIVE:   [구매하기 (pri buy)] — left ≤ 0 → '품절' disabled · isBuyable 실패 → disabled
 *           .meta: {md(start)}–{md(end)} 한정 · 잔여 {n}개 · {sold}개 판매됨 · 결제 시 셀러리 안전결제로 이동
 *   예정:   [🔔 {md(start)} 오픈 알림 받기 (pri buy)] → 토스트 (저장 없음)
 *   종료:   [판매가 종료되었습니다 (disabled)] · .meta: 교환·환불은 종료 후 {clear_days}일까지 셀러리 고객센터에서 처리됩니다
 * 🛒 장바구니 버튼은 슬라이스 1 에서 숨김 (구매하기 full width).
 * 클릭(buyNow, js/80-actions.js L568-578): LIVE 아니면 토스트 · left < q 면 토스트 · 미로그인 → /login?next=/checkout?c&o&q · 로그인 → /checkout?c&o&q
 */
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { NOTIFY_TOAST } from "@/components/campaign-card";
import { fmtNum, isBuyable, isEnded, stockLeft, type CampaignCard } from "@/lib/campaign";
import { md } from "@/lib/dates";

export function checkoutUrl(code: string, optionIndex: number, qty: number): string {
  return `/checkout?c=${encodeURIComponent(code)}&o=${optionIndex}&q=${qty}`;
}

export function BuyCta({ card, optionIndex, qty, signedIn }: { card: CampaignCard; optionIndex: number; qty: number; signedIn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const c = card.campaign;
  const ended = isEnded(c, c.today);
  const left = stockLeft(card);

  if (ended) {
    return (
      <>
        <button type="button" className="buy" disabled style={{ opacity: 0.6 }}>
          판매가 종료되었습니다
        </button>
        <div className="meta" style={{ textAlign: "center", marginTop: 8 }}>
          교환·환불은 종료 후 {card.settings.clear_days}일까지 셀러리 고객센터에서 처리됩니다
        </div>
      </>
    );
  }

  if (c.status === "SCHEDULE_CONFIRMED") {
    return (
      <button type="button" className="pri buy" onClick={() => toast(NOTIFY_TOAST)}>
        🔔 {c.start_date ? md(c.start_date) : ""} 오픈 알림 받기
      </button>
    );
  }

  // LIVE
  const buyable = isBuyable(card, 1);
  const soldOut = left <= 0;
  const onBuy = () => {
    const chk = isBuyable(card, qty);
    if (!chk.ok) {
      toast(chk.message);
      return;
    }
    const next = checkoutUrl(c.code, optionIndex, qty);
    router.push(signedIn ? next : `/login?next=${encodeURIComponent(next)}`);
  };
  return (
    <>
      <div className="buyrow">
        <button type="button" className="pri buy" onClick={onBuy} disabled={soldOut || !buyable.ok} style={soldOut ? { opacity: 0.5 } : undefined}>
          {soldOut ? "품절" : "구매하기"}
        </button>
      </div>
      <div className="meta" style={{ textAlign: "center", marginTop: 8 }}>
        {c.start_date ? md(c.start_date) : "—"}–{c.end_date ? md(c.end_date) : "—"} 한정 · 잔여 {fmtNum(Math.max(0, left))}개 · {fmtNum(c.sold_qty ?? 0)}개 판매됨 ·
        결제 시 셀러리 안전결제로 이동
      </div>
    </>
  );
}
