/**
 * 관리자 파트너 관리 — 브랜드 규칙. 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/admin/brands.server.ts`.
 *
 * 데모 원본: `apps/admin/src/routes/(demo)/brands/+page.svelte`(프로토타입 `vAdminBrands`) — 열 구성을 그대로 따른다:
 * 브랜드(로고·상호·카테고리·담당자·이메일·추천인) · 등급 · 누적 GMV · 상품(전체/노출/대기) · 판매(전체·LIVE) ·
 * 정산 정보(등록·미등록) · 🥬 · 자동 제안 ON/OFF · 관리(🥬 지급 · 상품 보기).
 * 운영 스크립트 `packages/db/scripts/partner-admin.mjs` 의 `brands` · `suspend-brand` · `reactivate-brand` 도 같이 옮긴다
 * (데모에는 정지 버튼이 없어 상세에만 둔다 — 인플루언서와 같은 규칙).
 *
 * 마이그레이션 없음 — 컬럼이 전부 있다: `brands.active` · `grade` · `gmv_base` · `bank_info` · `biz_no` · `tax_info` ·
 * `auto_propose` · `logo_url` · `manager_name`(0001 · 0019). 누적 GMV 는 `brand_gmv(uuid)`(0004).
 * **브랜드에는 `hidden` 이 없다** — 인플루언서만 있는 컬럼이다(갤러리 비공개).
 *
 *   BRAND_FILTERS · parseBrandFilter — 목록 필터(전체 · 활동 중 · 정지 · 정산 정보 미등록 · 검수 대기 보유)
 *   brandStatusChip · settleInfoChip · autoProposeLabel — 상태 칩·문구
 *   productCountLine — "노출 n · 대기 m" 한 줄
 *   brandSearchHit — 검색(상호 · 담당자 · 이메일 · code · 카테고리) 클라이언트측 판정
 *   BRAND_ACTION_MESSAGES — 액션 결과 문구
 *   SUSPEND_BRAND_NOTE — 정지하면 판매 링크가 즉시 닫힌다는 경고(campaign_card 의 b.active 가드 · 2026-10-08 정정)
 */
import type { StatusTone } from "../order-status";

export const BRAND_FILTERS = ["all", "active", "suspended", "no_settle_info", "pending_product"] as const;
export type BrandFilter = (typeof BRAND_FILTERS)[number];

export const BRAND_FILTER_LABELS: Record<BrandFilter, string> = {
  all: "전체",
  active: "활동 중",
  suspended: "정지",
  no_settle_info: "정산 정보 미등록",
  pending_product: "검수 대기 보유",
};

export function parseBrandFilter(raw: string | null | undefined): BrandFilter {
  return BRAND_FILTERS.includes(raw as BrandFilter) ? (raw as BrandFilter) : "all";
}

/** 브랜드 상태 — `hidden` 이 없으므로 정지/활동 중 둘뿐이다 */
export function brandStatusChip(b: { active: boolean }): { label: string; tone: StatusTone } {
  return b.active ? { label: "활동 중", tone: "green" } : { label: "정지", tone: "red" };
}

/**
 * 정산 정보 — 데모는 `settleInfo.account` 유무로만 판정했다. DB 는 계좌(`bank_info`)와 사업자번호(`biz_no`)가 따로 있고
 * 0019 가 세금계산서 정보(`tax_info`)를 더했다. 지급 보류 판정(계획서 M4 `SETTLE_INFO_INCOMPLETE`)과 같은 방향으로
 * **계좌가 없으면 미등록**, 계좌는 있는데 사업자번호·세금계산서 정보가 비면 "일부"로 구분한다.
 */
export function settleInfoChip(b: {
  has_bank_info: boolean;
  biz_no: string | null;
  has_tax_info: boolean;
}): { label: string; tone: StatusTone } {
  if (!b.has_bank_info) return { label: "미등록", tone: "amber" };
  if (!b.biz_no || !b.has_tax_info) return { label: "일부", tone: "amber" };
  return { label: "등록", tone: "green" };
}

/** 데모의 "노출 n · 대기 m" */
export function productCountLine(b: { products_listed: number; products_pending: number }): string {
  return `노출 ${b.products_listed} · 대기 ${b.products_pending}`;
}

export function autoProposeLabel(on: boolean): string {
  return on ? "ON" : "OFF";
}

/**
 * 브랜드 정지의 **실제 영향** (2026-10-08 정정).
 *
 * `products.status` 는 그대로 `listed` 로 남는다 — 그 점에서 "상품이 내려가지 않는다" 는 참이다.
 * 그런데 고객이 보는 결과는 반대다: `campaign_card()` 의 `b.active` 가드(0008:233) 때문에 그 브랜드
 * 상품의 **판매 링크가 전부 즉시 404** 가 되고, 결제 게이트도 같은 RPC 를 쓰므로 진행 중 결제까지 막힌다.
 *
 * 이전 문구("정지해도 판매 중인 상품은 내려가지 않습니다")는 운영자에게 "판매가 계속된다" 로 읽혀
 * 영향 범위를 과소평가하게 했다. 한 건만 멈추려면 브랜드 정지가 아니라 캠페인의 [판매 중단](0040)을 쓴다.
 */
export const SUSPEND_BRAND_NOTE =
  "진행 중인 판매 링크가 즉시 닫히고 결제도 막힙니다 (상품 상태는 '노출 중'으로 남습니다). 한 건만 멈추려면 캠페인의 [판매 중단]을 쓰세요.";

export const BRAND_ACTION_MESSAGES: Record<string, string> = {
  suspended: "정지했습니다. 다음 요청부터 브랜드 콘솔에 들어올 수 없습니다.",
  reactivated: "정지를 풀었습니다.",
  auto_on: "자동 제안을 켰습니다.",
  auto_off: "자동 제안을 껐습니다.",
  celery_granted: "🥬 를 지급했습니다.",
  err_not_found: "대상을 찾지 못했습니다.",
  err_input: "입력값을 확인해주세요.",
  err: "처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
};

/** 검색 판정 — 서버는 같은 컬럼에 `ilike` `or()` 를 건다 */
export function brandSearchHit(
  b: { name: string; manager_name: string | null; email: string | null; code: string | null; category: string | null },
  q: string,
): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [b.name, b.manager_name, b.email, b.code, b.category].some((v) => (v ?? "").toLowerCase().includes(t));
}
