/**
 * 주문 상태 라벨 · 파생 배송 문구 · 환불 가능 판정 — 단일 소스 (계약 docs/app-plan.md §10.0). 소유: F.
 *
 * ux-spec §3.6 원문: PAID → '결제 완료'(green) · REFUNDED → '환불 완료'(gray). CANCELED(조정 큐 — 돈은 토스에서 돌아갔으나
 *   정산 후·샘플이라 REFUNDED 로 둘 수 없는 주문, app-plan §5)도 고객에게는 '환불 완료'.
 * ship 파생(프로토타입 js/60-customer.js L314): status!=='PAID' → 없음 · 캠페인 LIVE → '브랜드 발송 준비 중'
 *   · CLEARING → '교환·환불 {md(end_date+clear_days)}까지' · 그 외 → '배송 완료'.
 *   확장(ux-spec §3.6 [신규]): tracking_no 가 있으면 앞에 '{courier} {tracking_no} · '. LIVE 인데 송장이 있으면 '발송 준비 중' 은
 *   사실과 어긋나므로 그 자리만 '배송 중'(브랜드 탭 파생 규칙)으로 바꾼다.
 * 환불 가능(§0-8 · §7.4): PAID · 비샘플 · 캠페인 ≠ SETTLED · tracking_no null(발송 전). 서버 app_refund_precheck 와 같은 순서·같은 코드.
 *
 * 브라우저·서버 양쪽에서 import 된다 — 순수 함수만 (lib/dates · lib/carriers 도 순수).
 */
import { addDays, md } from "@/lib/dates";
import { carrierName } from "@/lib/carriers";

export type OrderLike = {
  status: string;
  tracking_no: string | null;
  courier: string | null;
  is_sample?: boolean;
};

export type CampaignLike = {
  status: string;
  end_date: string | null;
};

/** .st 상태 칩 색 (ux-spec §1.4) — components/status-chip.tsx ChipTone 의 부분집합 */
export type StatusTone = "green" | "gray" | "blue" | "amber" | "red";

export function orderStatusLabel(o: OrderLike, c: CampaignLike): { label: string; tone: StatusTone } {
  void c; // 칩은 주문 상태만 본다 — 배송 단계는 shipLabel() 이 따로 파생한다
  switch (o.status) {
    case "PAID":
      return { label: "결제 완료", tone: "green" };
    case "REFUNDED":
    case "CANCELED":
      return { label: "환불 완료", tone: "gray" };
    default:
      return { label: o.status, tone: "gray" };
  }
}

export function shipLabel(o: OrderLike, c: CampaignLike, settings: { clear_days: number }): string | null {
  if (o.status !== "PAID") return null;
  const shipped = !!o.tracking_no;
  let base: string;
  if (c.status === "LIVE") {
    base = shipped ? "배송 중" : "브랜드 발송 준비 중";
  } else if (c.status === "CLEARING") {
    const days = Number.isFinite(settings.clear_days) ? settings.clear_days : DEFAULT_CLEAR_DAYS;
    base = c.end_date ? `교환·환불 ${md(addDays(c.end_date, days))}까지` : "교환·환불 신청 가능";
  } else {
    base = "배송 완료";
  }
  return shipped ? `${carrierName(o.courier)} ${o.tracking_no} · ${base}` : base;
}

export type RefundBlockCode = "NOT_PAID" | "SAMPLE" | "SETTLED" | "SHIPPED";

export function isRefundable(o: OrderLike, c: CampaignLike): { ok: true } | { ok: false; code: RefundBlockCode } {
  if (o.status !== "PAID") return { ok: false, code: "NOT_PAID" };
  if (o.is_sample) return { ok: false, code: "SAMPLE" };
  if (c.status === "SETTLED") return { ok: false, code: "SETTLED" };
  if (o.tracking_no) return { ok: false, code: "SHIPPED" };
  return { ok: true };
}

/** 환불 불가 사유 문구 — 서버 /api/payments/cancel 의 같은 코드와 같은 문구 (ux-spec §3.6 · §5 · app-plan §6.2) */
export const REFUND_BLOCK_MESSAGES: Record<RefundBlockCode, string> = {
  NOT_PAID: "이미 환불 처리된 주문이에요",
  SAMPLE: "인플루언서 샘플 구매분은 브랜드 정산에 포함된 건이라 여기서 환불하지 않습니다",
  SETTLED: "정산이 끝난 주문은 브랜드 고객 문의로 접수해주세요",
  SHIPPED: "발송된 주문은 고객센터로 접수해주세요",
};

/** 환불 모달·상세 안내 문구 (app-plan §0-8 — 프로토타입 "이미 발송된 상품은 회수 후 처리돼요" 대체) */
export const REFUND_NOTICE = "발송 전 주문만 신청할 수 있어요 · 발송 후에는 고객센터로 접수해주세요";

/** 환불 사유 선택지 (app-plan §6.2 · §13 열린 결정) */
export const REFUND_REASONS = ["단순 변심", "상품 하자", "오배송", "기타"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** 토스 cancelReason 200자 제한 — 선택지 + 상세를 합친 길이 */
export const REFUND_REASON_MAX = 200;

/** platform_settings.clear_days 를 못 읽을 때의 기본값 (프로토타입 CLEAR_DAYS · 0008 coalesce 기본값과 동일) */
export const DEFAULT_CLEAR_DAYS = 21;

/** '₩29,900' — 프로토타입 fmt(): 반올림 후 ko-KR 천 단위 + '₩' 리터럴 (ux-spec §1.6) */
export function won(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return `₩${v.toLocaleString("ko-KR")}`;
}
