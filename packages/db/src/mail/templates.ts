/**
 * 거래 메일 템플릿 — 순수 함수(입력 → { subject, html, text, idempotencyKey, tag }). DB·환경 없음 · 테스트 대상(src/test/mail-templates.test.ts).
 * 사용자 입력(옵션명 · 배송지 · 사유 · 문의 본문)은 레이아웃이 전부 이스케이프한다. 링크는 `ctx.siteUrl`(PUBLIC_SITE_URL 오리진) + 앱 경로.
 *
 * | 이벤트 | 함수 | 받는 사람 | 링크 |
 * |---|---|---|---|
 * | 주문 확인(결제 완료) | orderPaidCustomerMail | 고객 | 회원 /account/orders/<code> · 비회원 /orders/lookup |
 * | 새 주문 | orderPaidBrandMail | 브랜드(brands.email) | /brand/orders?campaign=<code> |
 * | 배송 시작(운송장 등록) | orderShippedMail | 고객 | 택배사 조회 URL(trackingUrlOf) · 없으면 주문 화면 |
 * | 환불 완료 | orderRefundedMail | 고객 | 주문 화면 |
 * | 문의 답변 | csRepliedMail | 고객 | /cs/<code> |
 * | 새 문의 · 추가 문의 | csOpenedBrandMail | 브랜드 | /brand/cs/<code> |
 *
 * 발송 자체(Resend · 멱등 키 · 비활성)는 `./resend.ts` + `../server/mail.server.ts`, 이벤트별 행 조회는 `../server/mail-events.server.ts`.
 */
import { trackingUrlOf, carrierName } from "../carriers";
import { addDays, md } from "../dates";
import { won } from "../order-status";
import type { Shipping } from "../types";
import { mailIdempotencyKey, renderMailHtml, renderMailText, type MailDoc } from "./layout";

export type MailCtx = {
  /** 절대 URL 오리진 — `https://sellery.life` (끝 슬래시 없음) */
  siteUrl: string;
};

export type MailTemplate = {
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  /** Resend tag(event) — ASCII 영숫자·_·- 만 */
  tag: string;
};

/** 메일이 보는 주문 — orders 행 + 캠페인 조인의 부분집합 (mail-events.server 가 채운다) */
export type MailOrder = {
  id: string;
  /** 'o2001' — 화면·메일은 대문자 */
  code: string;
  productName: string;
  optionName: string | null;
  qty: number;
  amount: number;
  buyerName: string;
  /** 회원 주문이면 true → /account/orders 링크, 아니면 /orders/lookup */
  isMember: boolean;
  shipping: Shipping | null;
  brandName: string;
  sellerHandle: string;
  campaignCode: string;
  /** YYYY-MM-DD · null 이면 환불 기한 문구 생략 */
  campaignEndDate: string | null;
  /** 판매 종료 후 교환·환불 가능 일수(platform_settings clear_days · 기본 21) */
  clearDays: number;
  courier: string | null;
  trackingNo: string | null;
  refundAmount: number | null;
  refundReason: string | null;
  paidAt: string;
};

export type MailCs = {
  conversationId: string;
  /** 'cs100' — 표기는 대문자 */
  code: string;
  type: string;
  buyerName: string;
  orderCode: string | null;
  productName: string;
  campaignCode: string;
  brandName: string;
  /** 회원 문의면 true (비회원은 접수 기기 쿠키로만 열린다) */
  isMember: boolean;
};

const PREVIEW_MAX = 200;

function url(ctx: MailCtx, path: string): string {
  return `${ctx.siteUrl.replace(/\/+$/, "")}${path}`;
}

function upper(code: string): string {
  return code.toUpperCase();
}

function productLine(o: MailOrder): string {
  const opt = o.optionName && o.optionName.trim() ? ` · ${o.optionName.trim()}` : "";
  return `${o.productName}${opt} × ${o.qty}`;
}

function shippingLine(s: Shipping | null): string | null {
  if (!s || !s.address1) return null;
  const addr = [s.address1, s.address2].filter((v) => v && v.trim()).join(" ");
  const post = s.postcode ? ` (${s.postcode})` : "";
  return `${s.recipient}${post}\n${addr}`;
}

/** 고객 주문 화면 — 회원은 상세, 비회원은 주문번호+연락처 조회 */
export function orderPageUrl(o: Pick<MailOrder, "code" | "isMember">, ctx: MailCtx): string {
  return o.isMember ? url(ctx, `/account/orders/${encodeURIComponent(o.code)}`) : url(ctx, "/orders/lookup");
}

/** 미리보기 — 공백 정리 후 200자 (본문 전체는 화면에서) */
export function previewOf(body: string | null | undefined, max = PREVIEW_MAX): string {
  const s = (body ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function finish(doc: MailDoc, subject: string, idempotencyKey: string, tag: string): MailTemplate {
  return { subject, html: renderMailHtml(doc), text: renderMailText(doc), idempotencyKey, tag };
}

/* ---------------- 주문 확인 ---------------- */

export function orderPaidCustomerMail(o: MailOrder, ctx: MailCtx): MailTemplate {
  const code = upper(o.code);
  const rows = [
    { label: "주문번호", value: code },
    { label: "상품", value: productLine(o) },
    { label: "결제 금액", value: won(o.amount) },
  ];
  const ship = shippingLine(o.shipping);
  if (ship) rows.push({ label: "배송지", value: ship });
  rows.push({ label: "판매 브랜드", value: o.brandName }, { label: "인플루언서", value: o.sellerHandle });
  const notes: string[] = [];
  if (o.campaignEndDate) {
    notes.push(`교환·환불은 판매 종료 뒤 ${o.clearDays}일(${md(addDays(o.campaignEndDate, o.clearDays))})까지, 발송 전 주문만 주문 화면에서 바로 취소할 수 있어요. 발송 뒤에는 판매 브랜드에 문의해주세요.`);
  } else {
    notes.push("발송 전 주문은 주문 화면에서 바로 취소할 수 있어요. 발송 뒤에는 판매 브랜드에 문의해주세요.");
  }
  if (!o.isMember) notes.push("비회원 주문은 주문번호와 결제 때 입력한 연락처로 조회할 수 있어요.");
  const doc: MailDoc = {
    title: "주문이 접수되었어요",
    preheader: `${code} · ${productLine(o)} · ${won(o.amount)}`,
    intro: `${o.buyerName}님, 결제가 완료되어 주문을 접수했어요. 브랜드가 상품을 발송하면 다시 알려드릴게요.`,
    rows,
    button: { label: o.isMember ? "주문 상세 보기" : "주문 조회하기", url: orderPageUrl(o, ctx) },
    notes,
  };
  return finish(doc, `[셀러리] 주문이 접수되었어요 · ${code}`, mailIdempotencyKey("order_paid", "customer", o.id), "order_paid");
}

export function orderPaidBrandMail(o: MailOrder, ctx: MailCtx): MailTemplate {
  const code = upper(o.code);
  const doc: MailDoc = {
    title: "새 주문이 들어왔어요",
    preheader: `${code} · ${productLine(o)} · ${won(o.amount)}`,
    intro: `${o.brandName} 담당자님, ${o.sellerHandle} 판매(${upper(o.campaignCode)})에 새 주문 1건이 결제되었어요. 브랜드 콘솔에서 발주서를 내려받고 운송장을 등록해주세요.`,
    rows: [
      { label: "주문번호", value: code },
      { label: "상품", value: productLine(o) },
      { label: "결제 금액", value: won(o.amount) },
      { label: "주문자", value: o.buyerName },
      { label: "인플루언서", value: o.sellerHandle },
    ],
    button: { label: "주문 관리 열기", url: url(ctx, `/brand/orders?campaign=${encodeURIComponent(o.campaignCode)}`) },
    notes: ["배송지·연락처는 브랜드 콘솔 주문 표와 발주서 CSV 에서만 볼 수 있어요(메일에는 싣지 않습니다)."],
  };
  return finish(doc, `[셀러리] 새 주문 · ${code} · ${o.productName}`, mailIdempotencyKey("order_paid", "brand", o.id), "order_paid_brand");
}

/* ---------------- 배송 시작 ---------------- */

export function orderShippedMail(o: MailOrder, ctx: MailCtx): MailTemplate {
  const code = upper(o.code);
  const tracking = trackingUrlOf(o.courier, o.trackingNo);
  const courier = carrierName(o.courier);
  const doc: MailDoc = {
    title: "상품이 발송되었어요",
    preheader: `${code} · ${courier} ${o.trackingNo ?? ""}`.trim(),
    intro: `${o.buyerName}님, ${o.brandName}가 주문하신 상품을 발송했어요. 아래 송장번호로 배송을 조회할 수 있어요.`,
    rows: [
      { label: "주문번호", value: code },
      { label: "상품", value: productLine(o) },
      { label: "택배사", value: courier },
      { label: "송장번호", value: o.trackingNo ?? "—" },
    ],
    button: tracking ? { label: "배송 조회", url: tracking } : { label: "주문 확인하기", url: orderPageUrl(o, ctx) },
    notes: ["발송 뒤 교환·반품은 주문 화면의 [문의하기]로 판매 브랜드에 접수해주세요."],
  };
  return finish(
    doc,
    `[셀러리] 상품이 발송되었어요 · ${code}`,
    mailIdempotencyKey("order_shipped", o.id, o.courier, o.trackingNo),
    "order_shipped",
  );
}

/* ---------------- 환불 완료 ---------------- */

export function orderRefundedMail(o: MailOrder, ctx: MailCtx): MailTemplate {
  const code = upper(o.code);
  const amount = o.refundAmount ?? o.amount;
  const rows = [
    { label: "주문번호", value: code },
    { label: "상품", value: productLine(o) },
    { label: "환불 금액", value: won(amount) },
  ];
  if (o.refundReason && o.refundReason.trim()) rows.push({ label: "사유", value: o.refundReason.trim() });
  const doc: MailDoc = {
    title: "환불이 완료되었어요",
    preheader: `${code} · ${won(amount)} 결제 취소`,
    intro: `${o.buyerName}님, 주문 ${code}의 결제가 취소되었어요.`,
    rows,
    button: { label: "주문 확인하기", url: orderPageUrl(o, ctx) },
    notes: ["카드 결제 취소는 카드사 사정에 따라 영업일 기준 3~7일 뒤 명세서에 반영돼요. 간편결제는 해당 서비스의 결제 내역에서 확인해주세요."],
  };
  return finish(doc, `[셀러리] 환불이 완료되었어요 · ${code}`, mailIdempotencyKey("order_refunded", o.id), "order_refunded");
}

/* ---------------- 고객 문의 ---------------- */

export function csRepliedMail(cs: MailCs, reply: { messageId: string; body: string }, ctx: MailCtx): MailTemplate {
  const code = upper(cs.code);
  const notes = ["답변에 이어서 질문하려면 문의 화면에서 추가 문의를 남겨주세요."];
  if (!cs.isMember) notes.push("비회원 문의는 접수한 기기(브라우저)에서만 열려요 — 주문 조회 화면에서 다시 열 수 있어요.");
  const doc: MailDoc = {
    title: "문의에 답변이 달렸어요",
    preheader: previewOf(reply.body, 80),
    intro: `${cs.buyerName}님, ${cs.brandName}가 문의(${code})에 답변했어요.`,
    rows: [
      { label: "문의번호", value: code },
      { label: "상품", value: cs.productName },
    ],
    quote: previewOf(reply.body),
    button: { label: "답변 전체 보기", url: url(ctx, `/cs/${encodeURIComponent(cs.code)}`) },
    notes,
  };
  return finish(doc, `[셀러리] 문의에 답변이 달렸어요 · ${code}`, mailIdempotencyKey("cs_replied", reply.messageId), "cs_replied");
}

export function csOpenedBrandMail(cs: MailCs, message: { messageId: string; body: string; followUp: boolean }, ctx: MailCtx): MailTemplate {
  const code = upper(cs.code);
  const rows = [
    { label: "문의번호", value: code },
    { label: "유형", value: cs.type },
    { label: "상품", value: `${cs.productName} (${upper(cs.campaignCode)})` },
    { label: "고객", value: cs.buyerName },
  ];
  if (cs.orderCode) rows.push({ label: "주문번호", value: upper(cs.orderCode) });
  const doc: MailDoc = {
    title: message.followUp ? "고객이 추가 문의를 남겼어요" : "새 고객 문의가 접수되었어요",
    preheader: previewOf(message.body, 80),
    intro: message.followUp
      ? `${cs.brandName} 담당자님, 문의 ${code}에 고객이 메시지를 더 남겼어요. 브랜드 콘솔에서 답변해주세요.`
      : `${cs.brandName} 담당자님, 고객 문의가 접수되었어요. 셀러리는 고객 문의를 브랜드에 바로 전달합니다 — 브랜드 콘솔에서 답변해주세요.`,
    rows,
    quote: previewOf(message.body),
    button: { label: "문의 답변하기", url: url(ctx, `/brand/cs/${encodeURIComponent(cs.code)}`) },
    notes: ["고객의 연락처·배송지는 메일에 싣지 않습니다 — 브랜드 콘솔 문의 상세와 주문 표에서 확인해주세요."],
  };
  return finish(
    doc,
    `[셀러리] ${message.followUp ? "추가 문의" : "새 고객 문의"} · ${code} · ${cs.type}`,
    mailIdempotencyKey(message.followUp ? "cs_followup" : "cs_opened", message.messageId),
    message.followUp ? "cs_followup" : "cs_opened",
  );
}
