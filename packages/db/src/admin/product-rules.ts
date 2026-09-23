/**
 * 관리자 파트너 관리 — 상품 검수 규칙. 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import).
 * DB 호출은 `../server/admin/products.server.ts`.
 *
 * 데모 원본: `apps/admin/src/routes/(demo)/products/+page.svelte`(프로토타입 `vAdminProducts`) — 열 구성을 그대로 따른다:
 * 상품(아이콘·이름·설명·code) · 브랜드(+등급) · 카테고리 · 판매가(정가 취소선) · 총 수수료(인플+플랫폼) · 재고 ·
 * 판매·매출(건수·LIVE·확정 매출) · 독점 · 상태 · 관리(승인/반려/노출 중단·재개 · 상세페이지).
 * 운영 스크립트 `packages/db/scripts/partner-admin.mjs` 의 `products [--pending] [--brand]` · `review-product` 를 옮긴다.
 *
 * 마이그레이션 없음 — 검수는 0015 `app_admin_review_product(p_product_id, p_decision, p_reason)` 를 그대로 호출한다:
 *   approve : pending · rejected · paused → listed (재고 0 이면 `platform_settings.default_stock_on_approve`)
 *   reject  : → rejected + `reject_reason`(필수 · ≤200자)
 *   pause   : listed → paused
 *   실패 코드: NOT_FOUND · BAD_DECISION · BAD_REASON · WRONG_STATUS
 *
 *   PRODUCT_STATUSES · PRODUCT_STATUS_LABELS · productStatusChip — 상태 칩(검수 대기 · 노출 중 · 노출 중단 · 반려)
 *   parseProductStatusFilter — `?status=` 정규화
 *   totalFeeLine — "인플 20 + 플랫폼 10" 한 줄과 합계
 *   nextListingDecision — 노출 중단 ↔ 재개 버튼이 보낼 decision
 *   REVIEW_FAIL_MESSAGES · PRODUCT_ACTION_MESSAGES — RPC 실패 코드·액션 결과 문구
 *   CATEGORY_POLICY_NOTE — 카테고리 정책 안내(데모 상단 notice)
 */
import { CAT_POLICY, PLAT_RATE } from "@sellery/core/constants";
import type { StatusTone } from "../order-status";

/** `products.status` — 0002 체크 제약과 같은 목록 */
export const PRODUCT_STATUSES = ["pending", "listed", "paused", "rejected"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  pending: "검수 대기",
  listed: "노출 중",
  paused: "노출 중단",
  rejected: "반려",
};

const STATUS_TONES: Record<ProductStatus, StatusTone> = {
  pending: "amber",
  listed: "green",
  paused: "gray",
  rejected: "red",
};

export function productStatusChip(status: ProductStatus | string): { label: string; tone: StatusTone } {
  const s = status as ProductStatus;
  return PRODUCT_STATUSES.includes(s)
    ? { label: PRODUCT_STATUS_LABELS[s], tone: STATUS_TONES[s] }
    : { label: String(status), tone: "gray" };
}

/** `?status=` — 목록 필터. 빈 값·모르는 값은 null(전체) */
export function parseProductStatusFilter(raw: string | null | undefined): ProductStatus | null {
  return PRODUCT_STATUSES.includes(raw as ProductStatus) ? (raw as ProductStatus) : null;
}

/**
 * 총 수수료 — 데모의 "{(rate + PLAT_RATE) * 100}% · 인플 n + 플랫폼 m".
 * `commission_rate` 는 **인플루언서 몫**이고 플랫폼 몫(`PLAT_RATE`)은 상수다(docs/settlement-policy.md §3).
 */
export function totalFeeLine(commissionRate: number): { total: string; detail: string } {
  const seller = Math.round(commissionRate * 100);
  const plat = Math.round(PLAT_RATE * 100);
  return { total: `${seller + plat}%`, detail: `인플 ${seller} + 플랫폼 ${plat}` };
}

/** 노출 제어 버튼 — listed 면 pause, 그 밖(paused)이면 approve(재개). 데모 `toggleListing` 과 같은 동작 */
export function nextListingDecision(status: ProductStatus | string): { decision: "pause" | "approve"; label: string } {
  return status === "listed" ? { decision: "pause", label: "노출 중단" } : { decision: "approve", label: "재개" };
}

/** 0015 `app_admin_review_product` 의 실패 코드 → 문구 */
export const REVIEW_FAIL_MESSAGES: Record<string, string> = {
  NOT_FOUND: "상품을 찾지 못했습니다 (삭제됐을 수 있어요).",
  BAD_DECISION: "처리 종류가 올바르지 않습니다.",
  BAD_REASON: "반려 사유를 입력해야 합니다 (200자 이내).",
  WRONG_STATUS: "노출 중인 상품만 중단할 수 있습니다.",
  DB_ERROR: "처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

export function reviewFailMessage(code: string | null | undefined): string {
  return REVIEW_FAIL_MESSAGES[code ?? ""] ?? REVIEW_FAIL_MESSAGES.DB_ERROR;
}

export const PRODUCT_ACTION_MESSAGES: Record<string, string> = {
  approved: "승인했습니다 — 노출 중으로 바뀌었습니다.",
  approved_already: "이미 노출 중입니다.",
  rejected: "반려했습니다. 사유는 브랜드 상품 화면에 표시됩니다.",
  paused: "노출을 중단했습니다.",
  resumed: "노출을 재개했습니다.",
  err_input: "입력값을 확인해주세요.",
  err: "처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

/** 데모 상단 notice — 건강기능식품 표시광고 사전 심의 안내를 덧붙인다 */
export const CATEGORY_POLICY_NOTE = `${CAT_POLICY} 건강기능식품은 표시광고 사전 심의 대상입니다 — 질병 치료·예방 표현 금지, 기능성 문구는 식약처 인정 범위 내.`;

/** 검색 판정 — 서버는 같은 컬럼에 `ilike` `or()` 를 건다 */
export function productSearchHit(
  p: { name: string; description: string | null; code: string | null; category: string | null; brand_name: string | null },
  q: string,
): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [p.name, p.description, p.code, p.category, p.brand_name].some((v) => (v ?? "").toLowerCase().includes(t));
}
