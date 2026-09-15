/**
 * 배송 정보 조각 — 주문 상세의 택배사·송장·조회 링크·발송일 (reuse-map §1.5 glo 배송 조회 블록 개작). 소유: F.
 * 송장이 없으면 파생 배송 문구(shipLabel)만. 서버 컴포넌트.
 */
import { carrierName, trackingUrlOf } from "@/lib/carriers";
import { md } from "@/lib/dates";
import { shipLabel } from "@/lib/order-status";
import type { MyOrder } from "@/lib/orders-server";

export function ShipInfo({ order, settings }: { order: MyOrder; settings: { clear_days: number } }) {
  const ship = shipLabel(order, order.campaign, settings);
  const url = trackingUrlOf(order.courier, order.tracking_no);

  if (!order.tracking_no) {
    return (
      <div className="meta" style={{ marginTop: 6 }}>
        {order.status === "PAID" ? (
          <>
            송장번호: 아직 등록 전이에요{ship ? ` · ${ship}` : ""}
          </>
        ) : (
          "발송 전 환불된 주문이에요"
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13 }}>
        {carrierName(order.courier)} <b style={{ fontFamily: "var(--font-mono)" }}>{order.tracking_no}</b>
        {order.shipped_at ? <span className="meta"> · {md(order.shipped_at)} 발송</span> : null}
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn sm ghost">
          배송 조회 →<span className="sr-only"> ({carrierName(order.courier)} 새 창에서 열림)</span>
        </a>
      ) : (
        <span className="meta">택배사 정보가 없어 조회 링크를 제공할 수 없어요 — 고객센터로 문의해주세요</span>
      )}
      {ship ? (
        <span className="meta" style={{ flexBasis: "100%" }}>
          {ship}
        </span>
      ) : null}
    </div>
  );
}
