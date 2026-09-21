/**
 * 브랜드 콘솔 — 내 상품 목록 · 상세 · 등록/수정 · 노출 토글 · 삭제 · 이미지 업로드 (docs/brand-console-plan.md §5 `/brand/products` `/new` `/[code]` · §6 2단계).
 * 프로토타입 원본: apps/brand (demo) products/+page.svelte · packages/ui ProductModal.svelte · actions.ts createProduct/saveProduct/deleteProduct/toggleListing.
 *
 * 전부 service role + **`brand_id = <requireBrand 의 brand.id>` 필터** — 다른 브랜드 상품은 URL 을 바꿔도 null(라우트 404, §6 2단계 (g)).
 *   listBrandProducts(brandId)                    내 상품 전부(삭제 제외 · 최신순) + 배정량(allocated) · 잠금(locked) · 진행 캠페인 수 · 상태 칩
 *   getBrandProduct(brandId, code)                상품 1건(같은 보강) — 없으면 null
 *   listCategories()                              categories 표 (등록 폼 셀렉트 — 데모 기본값 '건기식' 은 FK 위반)
 *   upsertBrandProduct(brandId, productId|null, input)   `app_brand_upsert_product` — input 은 parseProductInput 이 만든 값(함수가 다시 검사)
 *   setBrandListing(brandId, code, listed)        `app_brand_set_listing` — listed ⇄ paused
 *   deleteBrandProduct(brandId, code)             `app_brand_delete_product` — 소프트 삭제
 *   uploadProductImage(brandId, file)             Storage `public-assets`(0006 공개) `products/<brand>/<uuid>.<ext>` → 공개 URL (thumb_url · image_urls 값)
 * 폼 검증·문구는 순수 모듈 `../../brand/product-rules.ts`.
 */
import type { Json } from "../../database.types";
import { CAMPAIGN_CODE_RE } from "../../campaign";
import {
  allocatedOf,
  isProductFailCode,
  isProductLocked,
  productStatusChip,
  type ProductFailCode,
  type ProductInput,
  type ProductOption,
} from "../../brand/product-rules";
import type { StatusTone } from "../../order-status";
import { createAdminClient, type Admin } from "../admin.server";

/** 상품 code 형식 — 캠페인 code 와 같은 규칙 ('p1' · 'p100') */
export const PRODUCT_CODE_RE = CAMPAIGN_CODE_RE;

export type BrandProduct = {
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
  /** 인플루언서 수수료율 (플랫폼 10%p 별도) */
  commission_rate: number;
  sample_text: string | null;
  stock: number;
  status: string;
  chip: { label: string; tone: StatusTone };
  reject_reason: string | null;
  trend: unknown;
  exclusive_grade: string | null;
  exclusive_label: string | null;
  /** 독점 인플루언서가 확정됨 — 독점 오퍼 해제 불가 */
  exclusive_seller_id: string | null;
  sample_free_grade: string | null;
  sample_buy_mode: string | null;
  sample_fixed_price: number | null;
  sample_refund: boolean | null;
  /** 브랜드 등록 원본 옵션 ([] 이면 자동 옵션 — product-rules autoOptions) */
  options: ProductOption[];
  boosted_at: string | null;
  created_at: string;
  updated_at: string;
  /** SCHEDULE_CONFIRMED · LIVE qty 합 (표시용 — 판정은 0015) */
  allocated: number;
  /** SCHEDULE_CONFIRMED · LIVE · CLEARING 캠페인 존재 — 가격·요율·옵션 잠금 */
  locked: boolean;
  /** 종결 아닌 캠페인 수 — 0 이어야 삭제 가능 */
  active_campaigns: number;
  /** 확정·진행 중 판매 일정 (목록 "판매 일정" 열) */
  schedules: { code: string; status: string; start_date: string | null; end_date: string | null; qty: number }[];
};

const PRODUCT_COLS =
  "id,code,name,description,emoji,thumb_url,image_urls,category,consumer_price,sale_price,commission_rate,sample_text,stock,status,reject_reason,trend," +
  "exclusive_grade,exclusive_label,exclusive_seller_id,sample_free_grade,sample_buy_mode,sample_fixed_price,sample_refund,options,boosted_at,created_at,updated_at";

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
  status: string;
  reject_reason: string | null;
  trend: unknown;
  exclusive_grade: string | null;
  exclusive_label: string | null;
  exclusive_seller_id: string | null;
  sample_free_grade: string | null;
  sample_buy_mode: string | null;
  sample_fixed_price: number | null;
  sample_refund: boolean | null;
  options: unknown;
  boosted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawCampaign = { code: string; product_id: string; status: string; qty: number; start_date: string | null; end_date: string | null };

const ENDED = new Set(["REJECTED", "PASSED", "DECLINED"]);

function toOptions(v: unknown): ProductOption[] {
  if (!Array.isArray(v)) return [];
  const out: ProductOption[] = [];
  for (const o of v) {
    if (!o || typeof o !== "object") continue;
    const n = (o as Record<string, unknown>).n;
    const price = (o as Record<string, unknown>).price;
    if (typeof n === "string" && typeof price === "number") out.push({ n, price });
  }
  return out;
}

function toProduct(r: RawProduct, camps: RawCampaign[]): BrandProduct {
  const mine = camps.filter((c) => c.product_id === r.id);
  const statuses = mine.map((c) => c.status);
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
    status: r.status,
    chip: productStatusChip(r.status),
    reject_reason: r.reject_reason,
    trend: r.trend ?? null,
    exclusive_grade: r.exclusive_grade,
    exclusive_label: r.exclusive_label,
    exclusive_seller_id: r.exclusive_seller_id,
    sample_free_grade: r.sample_free_grade,
    sample_buy_mode: r.sample_buy_mode,
    sample_fixed_price: r.sample_fixed_price,
    sample_refund: r.sample_refund,
    options: toOptions(r.options),
    boosted_at: r.boosted_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    allocated: allocatedOf(mine),
    locked: isProductLocked(statuses),
    active_campaigns: statuses.filter((s) => !ENDED.has(s)).length,
    schedules: mine
      .filter((c) => c.status === "SCHEDULE_CONFIRMED" || c.status === "LIVE" || c.status === "CLEARING")
      .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))
      .map((c) => ({ code: c.code, status: c.status, start_date: c.start_date, end_date: c.end_date, qty: c.qty ?? 0 })),
  };
}

/** 상품 id 들의 캠페인(전 상태) — 배정량·잠금·삭제 가드·일정 표시용 */
async function campaignsFor(admin: Admin, productIds: string[]): Promise<RawCampaign[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await admin
    .from("campaigns")
    .select("code, product_id, status, qty, start_date, end_date")
    .in("product_id", productIds)
    .overrideTypes<RawCampaign[], { merge: false }>();
  if (error) {
    console.error("[brand/products] campaigns read failed:", error.message);
    return [];
  }
  return data ?? [];
}

/** 내 상품 전부 — 삭제 제외 · 최신순 (데모 products/+page.svelte 표). DB 왕복 2회(products · campaigns). */
export async function listBrandProducts(brandId: string, admin: Admin = createAdminClient()): Promise<BrandProduct[]> {
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_COLS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .overrideTypes<RawProduct[], { merge: false }>();
  if (error) throw new Error(`products read failed: ${error.message}`);
  const rows = data ?? [];
  const camps = await campaignsFor(
    admin,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toProduct(r, camps));
}

/** 상품 1건 — 내 것이 아니거나 삭제·없는 코드면 null (라우트 404). */
export async function getBrandProduct(brandId: string, code: string, admin: Admin = createAdminClient()): Promise<BrandProduct | null> {
  if (!PRODUCT_CODE_RE.test(code)) return null;
  const { data, error } = await admin
    .from("products")
    .select(PRODUCT_COLS)
    .eq("brand_id", brandId)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle()
    .overrideTypes<RawProduct | null, { merge: false }>();
  if (error) throw new Error(`products read failed: ${error.message}`);
  if (!data) return null;
  const camps = await campaignsFor(admin, [data.id]);
  return toProduct(data, camps);
}

export type CategoryRow = { name: string; group_name: string; description: string | null; examples: string | null; sort_order: number };

/** 등록 폼 카테고리 셀렉트 — categories 표(sort_order 순) */
export async function listCategories(admin: Admin = createAdminClient()): Promise<CategoryRow[]> {
  const { data, error } = await admin.from("categories").select("name, group_name, description, examples, sort_order").order("sort_order", { ascending: true });
  if (error) {
    console.error("[brand/products] categories read failed:", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    name: c.name,
    group_name: c.group_name,
    description: c.description ?? null,
    examples: c.examples ?? null,
    sort_order: c.sort_order ?? 0,
  }));
}

/* ---------------- app_brand_upsert_product ---------------- */

export type UpsertProductResult =
  | { ok: true; productId: string; code: string | null; status: string; created: boolean; rereview: boolean; locked: boolean }
  | { ok: false; code: ProductFailCode; field?: string; allocated?: number | null };

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** `app_brand_upsert_product` jsonb → 결과. 형식이 어긋나면 DB_ERROR. */
export function parseUpsertProductResult(json: unknown): UpsertProductResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const productId = typeof o.product_id === "string" ? o.product_id : null;
    const status = typeof o.status === "string" ? o.status : null;
    if (!productId || !status) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      productId,
      code: typeof o.code === "string" ? o.code : null,
      status,
      created: o.created === true,
      rereview: o.rereview === true,
      locked: o.locked === true,
    };
  }
  return {
    ok: false,
    code: isProductFailCode(o.code) ? o.code : "DB_ERROR",
    field: typeof o.field === "string" ? o.field : undefined,
    allocated: typeof o.allocated === "number" ? o.allocated : null,
  };
}

/** 내 상품 code → id (없거나 남의 것이면 null) */
async function productIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  if (!PRODUCT_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("products").select("id").eq("brand_id", brandId).eq("code", code).is("deleted_at", null).maybeSingle();
  if (error) {
    console.error("[brand/products] product lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/**
 * 등록(productCode null) · 수정 — input 은 `parseProductInput` 결과. 이미지 URL 은 호출자가 `uploadProductImage` 로 먼저 올려 input 에 넣는다.
 * 성공하면 라우트가 `/brand/products/<code>` 로 보낸다.
 */
export async function upsertBrandProduct(
  brandId: string,
  productCode: string | null,
  input: ProductInput,
  admin: Admin = createAdminClient(),
): Promise<UpsertProductResult> {
  let productId: string | null = null;
  if (productCode !== null) {
    const found = await productIdOf(admin, brandId, productCode);
    if (found === "error") return { ok: false, code: "DB_ERROR" };
    if (!found) return { ok: false, code: "NOT_FOUND" };
    productId = found;
  }
  const { data, error } = await admin.rpc("app_brand_upsert_product", {
    p_brand_id: brandId,
    // 신규는 SQL null (생성 타입은 uuid 를 string 으로만 받는다 — 함수는 `p_product_id is null` 로 등록/수정을 가른다)
    p_product_id: productId as unknown as string,
    p_input: input as unknown as Json,
  });
  if (error) {
    console.error("[brand/products] app_brand_upsert_product failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseUpsertProductResult(data);
}

/* ---------------- app_brand_set_listing · app_brand_delete_product ---------------- */

export type ListingResult = { ok: true; already: boolean; code: string | null; status: string } | { ok: false; code: ProductFailCode; status?: string | null };

export function parseListingResult(json: unknown): ListingResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    return { ok: true, already: o.already === true, code: typeof o.code === "string" ? o.code : null, status: typeof o.status === "string" ? o.status : "" };
  }
  return { ok: false, code: isProductFailCode(o.code) ? o.code : "DB_ERROR", status: typeof o.status === "string" ? o.status : null };
}

/** 노출 토글 — listed ⇄ paused (pending · rejected 는 NOT_REVIEWED). 멱등. */
export async function setBrandListing(brandId: string, productCode: string, listed: boolean, admin: Admin = createAdminClient()): Promise<ListingResult> {
  const found = await productIdOf(admin, brandId, productCode);
  if (found === "error") return { ok: false, code: "DB_ERROR" };
  if (!found) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_brand_set_listing", { p_brand_id: brandId, p_product_id: found, p_listed: listed });
  if (error) {
    console.error("[brand/products] app_brand_set_listing failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseListingResult(data);
}

export type DeleteProductResult = { ok: true; code: string | null } | { ok: false; code: ProductFailCode; count?: number | null };

export function parseDeleteProductResult(json: unknown): DeleteProductResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) return { ok: true, code: typeof o.code === "string" ? o.code : null };
  return { ok: false, code: isProductFailCode(o.code) ? o.code : "DB_ERROR", count: typeof o.count === "number" ? o.count : null };
}

/** 소프트 삭제 — 종결 아닌 캠페인이 있으면 HAS_ACTIVE_CAMPAIGNS (라우트는 "노출 중단을 사용하세요"). */
export async function deleteBrandProduct(brandId: string, productCode: string, admin: Admin = createAdminClient()): Promise<DeleteProductResult> {
  const found = await productIdOf(admin, brandId, productCode);
  if (found === "error") return { ok: false, code: "DB_ERROR" };
  if (!found) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_brand_delete_product", { p_brand_id: brandId, p_product_id: found });
  if (error) {
    console.error("[brand/products] app_brand_delete_product failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseDeleteProductResult(data);
}

/* ---------------- 상품 이미지 (Storage public-assets · 0006) ---------------- */

export const PRODUCT_IMAGE_BUCKET = "public-assets";
/** 0006 버킷 한도 10MB — Vercel 서버리스 본문 4.5MB 가 먼저 막는다(inf §5.9) → 폼은 4MB 안내 */
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type ProductImageFile = { bytes: ArrayBuffer | Uint8Array; type: string; size: number };
export type UploadProductImageResult = { ok: true; path: string; url: string } | { ok: false; code: "BAD_FILE" | "DB_ERROR" };

/** object path — `products/<brand id>/<random>.<ext>` (원본 파일명 미사용 · 상품 id 는 등록 전에 없을 수 있어 브랜드 폴더만) */
export function productImagePath(brandId: string, ext: string, rand: string = crypto.randomUUID()): string {
  return `products/${brandId}/${rand}.${ext}`;
}

/** 공개 버킷에 올리고 공개 URL 을 돌려준다 — 호출자가 thumb_url / image_urls 에 넣어 upsert. 삭제·교체 정리는 하지 않는다(공개 버킷 · 이력). */
export async function uploadProductImage(brandId: string, file: ProductImageFile, admin: Admin = createAdminClient()): Promise<UploadProductImageResult> {
  const ext = PRODUCT_IMAGE_TYPES[file.type];
  if (!ext || file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > PRODUCT_IMAGE_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const path = productImagePath(brandId, ext);
  const up = await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (up.error) {
    console.error("[brand/products] image upload failed:", up.error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const { data } = admin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}
