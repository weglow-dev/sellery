"use client";

/**
 * 판매 페이지 인터랙티브 부분 (ux-spec §3.1.2 · §3.1.3): 가격 행 · 옵션 선택 · 수량 · 총 결제 금액 · 상태별 CTA. 소유: C.
 * 초기값 옵션 0 · 수량 1 (URL 로 복원하지 않는다). 합계 = options[oi].price × q, 배송비 없음.
 */
import { useState } from "react";
import { OptionPicker } from "@/components/store/option-picker";
import { QtyStepper } from "@/components/store/qty-stepper";
import { BuyCta } from "@/components/store/buy-cta";
import { discountPct, won, type CampaignCard } from "@/lib/campaign";

export function StoreClient({ card, signedIn }: { card: CampaignCard; signedIn: boolean }) {
  const opts = card.product.options;
  const [oi, setOi] = useState(0);
  const [q, setQ] = useState(1);
  const o = opts[Math.min(oi, opts.length - 1)];
  const cp = card.product.consumer_price;
  const gp = card.product.sale_price;
  const disc = discountPct(cp, gp);

  return (
    <>
      <div className="prices" style={{ marginBottom: 14 }}>
        <span className="gp">{won(o.price)}</span>
        {oi === 0 ? (
          <>
            <span className="cp">{won(cp)}</span>
            {disc !== null ? <span className="disc">-{disc}%</span> : null}
          </>
        ) : (
          <span className="cp" style={{ textDecoration: "none" }}>
            {o.n}
          </span>
        )}
      </div>
      <div className="lbl-sm" style={{ marginBottom: 6 }}>
        옵션 선택
      </div>
      <OptionPicker options={opts} value={oi} onChange={setOi} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
        <QtyStepper value={q} onChange={setQ} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11.5, color: "var(--color-mute)" }}>총 결제 금액</div>
          <div className="total-v">{won(o.price * q)}</div>
        </div>
      </div>
      <BuyCta card={card} optionIndex={oi} qty={q} signedIn={signedIn} />
    </>
  );
}
