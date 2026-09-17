/**
 * 내 주문 목록 행 `.rowitem.cart-row` (프로토타입 js/60-customer.js vCustOrders L315-317 · ux-spec §3.6). 소유: F.
 *   pIcon 44 · .nm {product.name} <sub>· {option_name} × {qty}</sub> · .sub {CODE} · {md(paid_at)} 주문 · {brand} 직배송{ · ship}
 *   · .st 칩 · .cart-sum ₩{amount} · [문의] [환불 신청(PAID·비SETTLED·미발송·비샘플만)]
 * 서버 컴포넌트 — 상호작용 조각(문의 모달·환불 버튼)만 클라이언트.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { StatusChip } from "@/components/status-chip";
import { CsModalButton } from "@/components/cs-modal";
import { RefundButton } from "@/app/(customer)/account/orders/[code]/refund-button";
import { md } from "@/lib/dates";
import { isRefundable, orderStatusLabel, shipLabel, won } from "@/lib/order-status";
import type { MyOrder } from "@/lib/orders-server";

/** 시드 thumb_url 은 상대 경로('assets/x.webp') · data: URI · 절대 URL — 상대 경로는 public/ 기준 '/' 를 붙인다 */
function thumbSrc(url: string | null): string | null {
  if (!url) return null;
  if (/^(data:|https?:\/\/|\/)/.test(url)) return url;
  return `/${url.replace(/^\.?\//, "")}`;
}

/** 상품 아이콘 `pIcon` (js/50-admin.js L54): 썸네일이 있으면 .picon img, 없으면 이모지 */
export function OrderIcon({ thumbUrl, emoji, size = 44 }: { thumbUrl: string | null; emoji: string; size?: number }) {
  const src = thumbSrc(thumbUrl);
  const style: CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.62) };
  return (
    <span className="picon" style={style} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- 시드 썸네일은 data: URI·정적 webp (최적화 대상 아님) */}
      {src ? <img src={src} alt="" /> : emoji}
    </span>
  );
}

export function orderHref(code: string): string {
  return `/account/orders/${encodeURIComponent(code)}`;
}

export function OrderRow({ order, settings }: { order: MyOrder; settings: { clear_days: number } }) {
  const st = orderStatusLabel(order, order.campaign);
  const ship = shipLabel(order, order.campaign, settings);
  const refundable = isRefundable(order, order.campaign).ok;
  const code = order.code.toUpperCase();
  const href = orderHref(order.code);

  return (
    <div className="rowitem cart-row">
      <Link href={href} aria-label={`주문 ${code} 상세`} style={{ display: "inline-flex", flex: "none" }}>
        <OrderIcon thumbUrl={order.product.thumb_url} emoji={order.product.emoji} size={44} />
      </Link>
      <div className="grow" style={{ minWidth: 160 }}>
        <Link href={href} className="nm">
          {order.product.name}{" "}
          <span className="sub" style={{ fontWeight: 400 }}>
            · {order.option_name || "기본"} × {order.qty}
          </span>
        </Link>
        <div className="sub">
          {code} · {md(order.paid_at)} 주문 · {order.brand.name} 직배송
          {ship ? ` · ${ship}` : ""}
        </div>
      </div>
      <StatusChip tone={st.tone}>{st.label}</StatusChip>
      <div className="cart-sum">{won(order.amount)}</div>
      <div className="rowacts">
        <CsModalButton
          className="sm"
          productName={order.product.name}
          thumbUrl={order.product.thumb_url}
          emoji={order.product.emoji}
          brandName={order.brand.name}
          orderCode={order.code}
        >
          문의
        </CsModalButton>
        {refundable ? (
          <RefundButton
            className="sm ghost"
            code={order.code}
            productName={order.product.name}
            optionName={order.option_name}
            qty={order.qty}
            amount={order.amount}
          />
        ) : null}
      </div>
    </div>
  );
}
