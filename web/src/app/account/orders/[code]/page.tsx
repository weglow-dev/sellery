/**
 * /account/orders/[code] — 주문 상세 (reuse-map §1.5 glo orders/[orderId] 개작 · app-plan §6.1). 소유: F.
 *   · 미로그인 → /login?next= (목록과 달리 리다이렉트 — §4.1 "상세·API 는 401/redirect")
 *   · service fetchMyOrder(user.id, code) — user_id 불일치·없음 → notFound() (orders/not-found.tsx "주문을 찾을 수 없습니다")
 *   · 주문 상품 · 주문 정보 · 배송 정보(service 조인이라 shipping 원문 표시) · 환불 (isRefundable → RefundButton, 아니면 사유 문구)
 *   · 환불 정책 원문(js/60-customer.js L282): "판매 종료 후 {n}일 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {n}일)"
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusChip } from "@/components/status-chip";
import { CsModalButton } from "@/components/cs-modal";
import { OrderIcon } from "@/components/orders/order-row";
import { ShipInfo } from "@/components/orders/ship-info";
import { getSessionUser } from "@/lib/auth";
import { normalizeHandle } from "@/lib/campaign";
import { md } from "@/lib/dates";
import { isRefundable, orderStatusLabel, REFUND_BLOCK_MESSAGES, REFUND_NOTICE, shipLabel, won } from "@/lib/order-status";
import { fetchMyOrder, fetchOrderSettings, ORDER_CODE_RE, type MyOrder } from "@/lib/orders-server";
import { RefundButton } from "./refund-button";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  return { title: `주문 ${code.toUpperCase()}` };
}

/** ISO → 'YYYY. M. D. 오후 3:20' (Asia/Seoul) */
function kstDateTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(t));
}

/** '01012345678' → '010-1234-5678' (숫자만 8~15자리 저장값 — 그 외는 그대로) */
function fmtPhone(p: string | null | undefined): string {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return p;
}

export default async function OrderDetailPage({ params }: Params) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/account/orders/${code}`)}`);
  if (!ORDER_CODE_RE.test(code)) notFound();

  const [order, settings] = await Promise.all([fetchMyOrder(user.id, code), fetchOrderSettings()]);
  if (!order) notFound();

  const CODE = order.code.toUpperCase();
  const st = orderStatusLabel(order, order.campaign);
  const ship = shipLabel(order, order.campaign, settings);
  const refund = isRefundable(order, order.campaign);
  const storeHref = `/s/${normalizeHandle(order.seller.handle)}/${encodeURIComponent(order.campaign.code)}`;
  const sa = order.shipping;

  return (
    <div className="store">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <Link href="/account/orders" className="btn ghost sm">
          ← 내 주문
        </Link>
        <span style={{ fontSize: 11.5, color: "var(--color-mute)", fontFamily: "var(--font-mono)" }}>{CODE}</span>
      </div>

      <h2 className="pg">
        주문 상세{" "}
        <small>
          {CODE} · {md(order.paid_at)} 주문
        </small>
      </h2>

      {/* 1. 주문 상품 */}
      <div className="card static">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <OrderIcon thumbUrl={order.product.thumb_url} emoji={order.product.emoji} size={52} />
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {order.product.name}{" "}
              <span style={{ fontWeight: 400, color: "var(--color-mute)", fontSize: 13 }}>
                · {order.option_name || "기본"} × {order.qty}
              </span>
            </div>
            <div className="meta">
              {order.brand.name} 직배송{ship ? ` · ${ship}` : ""}
            </div>
          </div>
          <StatusChip tone={st.tone}>{st.label}</StatusChip>
          <div className="cart-sum" style={{ fontSize: 16 }}>
            {won(order.amount)}
          </div>
        </div>
        <div className="btnrow" style={{ marginTop: 14 }}>
          <Link href={storeHref} className="btn sm ghost">
            판매 페이지 보기
          </Link>
          <CsModalButton
            className="sm"
            productName={order.product.name}
            thumbUrl={order.product.thumb_url}
            emoji={order.product.emoji}
            brandName={order.brand.name}
            orderCode={order.code}
          >
            💬 문의하기
          </CsModalButton>
          {refund.ok ? (
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

      {/* 2. 주문 정보 */}
      <div className="card static">
        <h4>주문 정보</h4>
        <table className="stmt" style={{ minWidth: 0, fontSize: 13 }}>
          <tbody>
            <Row k="주문번호">
              <span style={{ fontFamily: "var(--font-mono)" }}>{CODE}</span>
            </Row>
            <Row k="주문 일시">{kstDateTime(order.paid_at)}</Row>
            <Row k="결제 수단">{order.payment_method || "—"}</Row>
            <Row k="상품 금액">
              {won(order.unit_price)} × {order.qty}
            </Row>
            <Row k="배송비">무료 · 브랜드 직배송</Row>
            <tr className="tot">
              <td>총 결제</td>
              <td className="num">{won(order.amount)}</td>
            </tr>
            <Row k="판매 인플루언서">
              {order.seller.name} <span className="meta">{order.seller.handle}</span>
            </Row>
            <Row k="공급 브랜드">{order.brand.name}</Row>
          </tbody>
        </table>
      </div>

      {/* 3. 배송 정보 */}
      <div className="card static">
        <h4>배송 정보</h4>
        {sa ? (
          <table className="stmt" style={{ minWidth: 0, fontSize: 13 }}>
            <tbody>
              <Row k="수령인">{sa.recipient || "—"}</Row>
              <Row k="연락처">{fmtPhone(sa.phone)}</Row>
              <Row k="주소">
                {[sa.postcode ? `(${sa.postcode})` : "", sa.address1, sa.address2].filter(Boolean).join(" ") || "—"}
              </Row>
              {sa.memo ? <Row k="배송 메모">{sa.memo}</Row> : null}
            </tbody>
          </table>
        ) : (
          <div className="meta">배송지 정보가 없어요 — 고객센터로 문의해주세요</div>
        )}
        <ShipInfo order={order} settings={settings} />
      </div>

      {/* 4. 환불 */}
      <RefundCard order={order} refund={refund} clearDays={settings.clear_days} />
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>{k}</td>
      <td className="num" style={{ whiteSpace: "normal" }}>
        {children}
      </td>
    </tr>
  );
}

function RefundCard({
  order,
  refund,
  clearDays,
}: {
  order: MyOrder;
  refund: ReturnType<typeof isRefundable>;
  clearDays: number;
}) {
  const refunded = order.status === "REFUNDED" || order.status === "CANCELED";
  return (
    <div className="card static">
      <h4>교환 · 환불</h4>
      {refunded ? (
        <div className="notice" style={{ margin: "0 0 12px" }}>
          환불 완료{order.refunded_at ? ` · ${md(order.refunded_at)}` : ""} · {won(order.refund_amount ?? order.amount)} — 결제수단으로
          3영업일 내 환급{order.refund_reason ? ` · 사유: ${order.refund_reason}` : ""}
        </div>
      ) : refund.ok ? (
        <div className="btnrow" style={{ alignItems: "center", marginBottom: 12 }}>
          <RefundButton
            className="sm"
            code={order.code}
            productName={order.product.name}
            optionName={order.option_name}
            qty={order.qty}
            amount={order.amount}
          />
          <span className="meta">{REFUND_NOTICE}</span>
        </div>
      ) : (
        <div className="notice" style={{ margin: "0 0 12px" }}>
          {REFUND_BLOCK_MESSAGES[refund.code]}
        </div>
      )}
      <ul className="store-ul">
        <li>
          판매 종료 후 <b>{clearDays}일</b> 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {clearDays}일)
        </li>
        <li>
          대금은 정산 전까지 <b>셀러리</b>가 보관하므로 환불이 지연되지 않습니다
        </li>
        <li>문의: 셀러리 고객센터(채널톡) — 인플루언서 DM이 아닌 셀러리로 접수</li>
      </ul>
    </div>
  );
}
