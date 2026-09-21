/**
 * 인플루언서 콘솔 — 상품 갤러리 · 상품 상세 · 무상 샘플 요청 (docs/inf-console-plan.md §6 `/products` `/products/[code]` · §7 3단계).
 * 프로토타입 원본: js/20-seller.js vExplore · prodCard · productDetailModal, helpers.ts sampleBtn · sampleLine, actions.ts reqSample.
 *
 * 전부 service role(RLS 우회) + 인플루언서 id 는 **`requireSeller()` 가 돌려준 `seller.id`** 만 — 클라이언트 값은 믿지 않는다(§4.4).
 *   listProductsForSeller(sellerId)   listed 상품 + 브랜드 요약 + 상품별 견적(`app_sample_quotes` 1회) + 카테고리 목록
 *   getProductForSeller(sellerId, code)   상품 1건 + 견적 + 익명 실적(캠페인 수 · 판매 수량 합 — PII 없음). 없으면 null → 라우트 404
 *   requestFreeSample(sellerId, productCode, shipping)   `app_request_free_sample` RPC → {ok, campaignCode} | {ok:false, code}
 * 버튼 문구·배송지 검증은 순수 모듈 `../../partner/sample-rules.ts`.
 */
import type { Shipping } from "../../types";
import { CAMPAIGN_CODE_RE, CATS } from "../../campaign";
import {
  isRequestFreeSampleCode,
  parseSampleQuote,
  type RequestFreeSampleCode,
  type SampleQuote,
  type SampleReason,
} from "../../partner/sample-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type PartnerBrand = {
  id: string;
  code: string | null;
  name: string;
  logo_url: string | null;
  grade: string | null;
  category: string;
};

export type PartnerProduct = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  emoji: string;
  thumb_url: string | null;
  image_urls: string[];
  category: string;
  consumer_price: number;
  sale_price: number;
  /** 인플루언서 수수료율 (플랫폼 10%p 별도) — 0.2 */
  commission_rate: number;
  sample_text: string | null;
  stock: number;
  /** 독점권 오퍼 등급(표시용) · 라벨 */
  exclusive_grade: string | null;
  exclusive_label: string | null;
  trend: unknown;
  boosted_at: string | null;
  created_at: string;
  brand: PartnerBrand;
  /** app_sample_quote — RPC 실패·계약 위반이면 null (버튼은 "판매 준비 중") */
  quote: SampleQuote | null;
};

/** 상품 상세의 익명 실적 — 데이터패스 마스킹은 다음 단계, 지금은 집계 두 개만 */
export type ProductPerformance = {
  /** 이 상품으로 진행된 캠페인 수 (종결 포함 · 샘플 단계 제외) */
  campaigns: number;
  /** 확정 판매 수량 합 (LIVE · CLEARING · SETTLED 의 sold_qty) */
  sold_qty: number;
};

/** 상품 code 형식 — 캠페인 code 와 같은 규칙 ('p1' · 'p100') */
export const PRODUCT_CODE_RE = CAMPAIGN_CODE_RE;

const PRODUCT_SELECT =
  "id,code,name,description,emoji,thumb_url,image_urls,category,consumer_price,sale_price,commission_rate,sample_text,stock," +
  "exclusive_grade,exclusive_label,trend,boosted_at,created_at," +
  "brand:brands!products_brand_id_fkey(id,code,name,logo_url,grade,category,active)";

type RawProduct = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  emoji: string;
  thumb_url: string | null;
  image_urls: string[] | null;
  category: string;
  consumer_price: number;
  sale_price: number;
  commission_rate: number | string;
  sample_text: string | null;
  stock: number;
  exclusive_grade: string | null;
  exclusive_label: string | null;
  trend: unknown;
  boosted_at: string | null;
  created_at: string;
  brand: { id: string; code: string | null; name: string; logo_url: string | null; grade: string | null; category: string; active: boolean } | null;
};

function toProduct(r: RawProduct, quote: SampleQuote | null): PartnerProduct | null {
  if (!r.brand || !r.brand.active) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    emoji: r.emoji || "📦",
    thumb_url: r.thumb_url,
    image_urls: Array.isArray(r.image_urls) ? r.image_urls.filter((u): u is string => typeof u === "string") : [],
    category: r.category,
    consumer_price: r.consumer_price,
    sale_price: r.sale_price,
    commission_rate: Number(r.commission_rate) || 0,
    sample_text: r.sample_text,
    stock: r.stock,
    exclusive_grade: r.exclusive_grade,
    exclusive_label: r.exclusive_label,
    trend: r.trend ?? null,
    boosted_at: r.boosted_at,
    created_at: r.created_at,
    brand: { id: r.brand.id, code: r.brand.code, name: r.brand.name, logo_url: r.brand.logo_url, grade: r.brand.grade, category: r.brand.category },
    quote,
  };
}

/** `app_sample_quotes` — { "<product uuid>": quote } → Map. RPC 오류는 빈 Map (카드는 "판매 준비 중"). */
async function quotesFor(admin: Admin, sellerId: string, productIds: string[]): Promise<Map<string, SampleQuote>> {
  const out = new Map<string, SampleQuote>();
  if (productIds.length === 0) return out;
  const { data, error } = await admin.rpc("app_sample_quotes", { p_seller_id: sellerId, p_product_ids: productIds, p_use_cel: false });
  if (error) {
    console.error("[products] app_sample_quotes failed:", error.message);
    return out;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const [pid, json] of Object.entries(data as Record<string, unknown>)) {
      const q = parseSampleQuote(json);
      if (q) out.set(pid, q);
    }
  }
  return out;
}

/**
 * 갤러리 — listed · 삭제되지 않은 상품 전부 (프로토타입 realFirst: 부스트 → 최신순). 카테고리는 CATS 순서로, 상품이 있는 것만.
 * DB 왕복 2회: products(+brand 임베드) · app_sample_quotes.
 */
export async function listProductsForSeller(
  sellerId: string,
  admin: Admin = createAdminClient(),
): Promise<{ products: PartnerProduct[]; categories: string[] }> {
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("status", "listed")
    .is("deleted_at", null)
    .order("boosted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .overrideTypes<RawProduct[], { merge: false }>();
  if (error) throw new Error(`products read failed: ${error.message}`);
  const rows = data ?? [];
  const quotes = await quotesFor(
    admin,
    sellerId,
    rows.map((r) => r.id),
  );
  const products = rows.map((r) => toProduct(r, quotes.get(r.id) ?? null)).filter((p): p is PartnerProduct => p !== null);
  const present = new Set(products.map((p) => p.category));
  const categories = (CATS as readonly string[]).filter((c) => c !== "전체" && present.has(c));
  // CATS 밖의 카테고리(관리자가 추가한 값)도 뒤에 붙인다
  for (const c of present) if (!categories.includes(c)) categories.push(c);
  return { products, categories };
}

/** 상품 상세 — listed 가 아니거나 삭제·없는 코드면 null (라우트 404). 견적 1회 + 익명 실적 1회. */
export async function getProductForSeller(
  sellerId: string,
  code: string,
  admin: Admin = createAdminClient(),
): Promise<{ product: PartnerProduct; performance: ProductPerformance } | null> {
  if (!PRODUCT_CODE_RE.test(code)) return null;
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("code", code)
    .eq("status", "listed")
    .is("deleted_at", null)
    .maybeSingle()
    .overrideTypes<RawProduct | null, { merge: false }>();
  if (error) throw new Error(`products read failed: ${error.message}`);
  if (!data) return null;

  const [quotes, perf] = await Promise.all([
    quotesFor(admin, sellerId, [data.id]),
    admin
      .from("campaigns")
      .select("status, sold_qty")
      .eq("product_id", data.id)
      .in("status", ["SCHEDULE_CONFIRMED", "LIVE", "CLEARING", "SETTLED"]),
  ]);
  if (perf.error) console.error("[products] performance read failed:", perf.error.message);
  const product = toProduct(data, quotes.get(data.id) ?? null);
  if (!product) return null;
  const perfRows = perf.data ?? [];
  const performance: ProductPerformance = {
    campaigns: perfRows.length,
    sold_qty: perfRows.reduce((a, r) => a + (r.sold_qty ?? 0), 0),
  };
  return { product, performance };
}

export type RequestFreeSampleResult =
  | { ok: true; campaignId: string; campaignCode: string }
  | {
      ok: false;
      code: RequestFreeSampleCode;
      /** BAD_SHIPPING 의 실패 필드 */
      field?: string;
      /** NOT_FREE 의 사유 · 구매가 (라우트가 [샘플 구매 ₩N] 안내로 바꾼다) */
      reason?: SampleReason | null;
      price?: number | null;
      /** ALREADY_ACTIVE 의 진행 중 캠페인 */
      campaignCode?: string | null;
    };

/** `app_request_free_sample` jsonb → 결과. 형식이 어긋나면 DB_ERROR. */
export function parseRequestFreeSampleResult(json: unknown): RequestFreeSampleResult {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const campaignId = typeof o.campaign_id === "string" ? o.campaign_id : null;
    const campaignCode = typeof o.campaign_code === "string" ? o.campaign_code : null;
    if (!campaignId || !campaignCode) return { ok: false, code: "DB_ERROR" };
    return { ok: true, campaignId, campaignCode };
  }
  const code = isRequestFreeSampleCode(o.code) ? o.code : "DB_ERROR";
  const reason = typeof o.reason === "string" ? (o.reason as SampleReason) : null;
  return {
    ok: false,
    code,
    field: typeof o.field === "string" ? o.field : undefined,
    reason,
    price: typeof o.price === "number" ? o.price : null,
    campaignCode: typeof o.campaign_code === "string" ? o.campaign_code : null,
  };
}

/**
 * 무상 샘플 요청 — 배송지는 호출자가 `parseShippingInput` 으로 검증한 값(함수가 다시 검사한다). 없는 상품 코드는 UNLISTED.
 * 성공하면 라우트가 `/campaigns/<campaignCode>` 로 보낸다(프로토타입 go.camp).
 */
export async function requestFreeSample(
  sellerId: string,
  productCode: string,
  shipping: Shipping,
  admin: Admin = createAdminClient(),
): Promise<RequestFreeSampleResult> {
  if (!PRODUCT_CODE_RE.test(productCode)) return { ok: false, code: "UNLISTED" };
  const { data: p, error: pErr } = await admin.from("products").select("id").eq("code", productCode).is("deleted_at", null).maybeSingle();
  if (pErr) {
    console.error("[products] product lookup failed:", pErr.message);
    return { ok: false, code: "DB_ERROR" };
  }
  if (!p) return { ok: false, code: "UNLISTED" };

  const { data, error } = await admin.rpc("app_request_free_sample", {
    p_seller_id: sellerId,
    p_product_id: p.id,
    p_shipping: { ...shipping },
  });
  if (error) {
    console.error("[products] app_request_free_sample failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseRequestFreeSampleResult(data);
}
