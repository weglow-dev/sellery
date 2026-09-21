/**
 * 링크 유입 보호 — 순수부 (web/src/lib/linkctx.ts, 계약 docs/app-plan.md §10.0 · 명세 §8).
 *
 * 보안·귀속 장치가 아니라 UX/영업 규칙이다. 쿠키 설정은 apps/shop `hooks.server.ts` 의 linkCtx 핸들(docs/monorepo-migration.md §2.5),
 * 쿠키 읽기(`readLinkCtx(event)`) 는 `./server/linkctx.server.ts`, 필터·파싱은 여기(브라우저·vitest 에서도 import 가능).
 * 기준일은 RPC 가 주는 `campaign.today`(KST) 를 써서 dates.ts 에도 의존하지 않는다.
 */

export const LINKCTX_COOKIE = "slry_linkctx";

/** 쿠키 값(캠페인 code) 형식 — 이 정규식을 통과한 값만 쿠키로 쓰고 읽는다 */
export const LINK_CODE_RE = /^[a-z0-9_-]{1,32}$/;

/** 쿠키 Max-Age 90일 — 실제 유효성(종료 후 link_protect_days)은 서버가 판정한다 */
export const LINKCTX_MAX_AGE = 7776000;

export type LinkCtx = {
  code: string;
  sellerId: string;
  productId: string;
  category: string;
  sellerName: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' 두 개의 달력일 차이 (b − a). 형식이 어긋나면 null. */
function daysDiff(a: string, b: string): number | null {
  if (!DATE_RE.test(a) || !DATE_RE.test(b)) return null;
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86400000);
}

function str(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * campaign_card(code) jsonb → LinkCtx (필요한 최소 필드만 좁힌다).
 * `end_date` 가 있고 `today − end_date > settings.link_protect_days` 면 null (보호 기간 종료).
 * 순수 함수 — vitest 대상.
 */
export function linkCtxFromCard(json: unknown, code: string): LinkCtx | null {
  const card = obj(json);
  if (!card) return null;
  const campaign = obj(card.campaign);
  const product = obj(card.product);
  const seller = obj(card.seller);
  const settings = obj(card.settings);
  if (!campaign || !product || !seller) return null;

  const sellerId = str(seller, "id");
  const sellerName = str(seller, "name");
  const productId = str(product, "id");
  const category = str(product, "category");
  if (!sellerId || !sellerName || !productId || !category) return null;

  const endDate = str(campaign, "end_date");
  const today = str(campaign, "today");
  const protectDaysRaw = settings?.link_protect_days;
  const protectDays =
    typeof protectDaysRaw === "number" && Number.isFinite(protectDaysRaw) ? protectDaysRaw : 7;
  if (endDate && today) {
    const past = daysDiff(endDate, today);
    if (past !== null && past > protectDays) return null;
  }

  return { code, sellerId, productId, category, sellerName };
}

/**
 * !L → 보임; c.seller_id === L.sellerId → 보임;
 * 그 외 c.product_id !== L.productId && c.category !== L.category 일 때만 보임.
 * 적용: 홈 진행 중·오픈 예정·카테고리 건수·순위. 미적용: 인증 띠·모달·사업자 정보·안내문.
 */
export function custVisible(
  c: { seller_id: string; product_id: string; category: string },
  L: LinkCtx | null,
): boolean {
  if (!L) return true;
  if (c.seller_id === L.sellerId) return true;
  return c.product_id !== L.productId && c.category !== L.category;
}
