/**
 * 브랜드 콘솔 `/brand/my` — 브랜드 정보(상호 · 카테고리 · 담당자 · 연락처 · 소개 · 로고) · 등급 카드 (docs/brand-console-plan.md §5 `/brand/my` · §6 행 5).
 * 데모 원본: vBrandMy(saveBrandInfo · logoPick) · brandGradeHtml · pyrHtml · freeRefLeft.
 *
 * 전부 service role + `requireBrand()` 의 `brand.id`.
 *   getBrandProfile(brandId)                  app_brand_profile → BrandProfileView | null (사업자번호 마스킹 · 계좌 없음)
 *   saveBrandProfile(brandId, input)          app_set_brand_profile — input 은 `parseBrandProfileInput` 통과값(로고 제외) → { ok, profile } | { ok:false, code, field }
 *   setBrandLogoUrl(brandId, url|null)        app_set_brand_profile({ logo_url }) — `uploadBrandLogo` 뒤 호출(null 이면 로고 제거)
 *   uploadBrandLogo(brandId, file)            Storage `public-assets`(0006 공개) `brands/<brand>/logo-<uuid>.<ext>` → 공개 URL (상품 이미지와 같은 패턴 · 삭제·교체 정리는 하지 않는다)
 *   getBrandGradeCard(brandId)                app_brand_grade_card → BrandGradeCard | null (실시간 등급 · 다음 등급 · 할인 · 무료 열람 · 🥬 잔액 · tiers)
 *   recalcBrandGrade(brandId)                 app_brand_grade_recalc — **운영 스크립트 · 정산 실행 전용**(화면은 부르지 않는다 — 카드가 실시간 값을 쓴다)
 */
import {
  parseBrandGradeCard,
  parseBrandGradeRecalcResult,
  parseBrandProfile,
  parseSetBrandProfileResult,
  type BrandGradeCard,
  type BrandGradeRecalcResult,
  type BrandProfileInput,
  type BrandProfileView,
  type SetBrandProfileResult,
} from "../../brand/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { PRODUCT_IMAGE_BUCKET, PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_TYPES, type ProductImageFile } from "./products.server";

export type { BrandGradeCard, BrandGradeRecalcResult, BrandGradeTier, BrandProfileInput, BrandProfileView, SetBrandProfileResult } from "../../brand/settle-rules";

export async function getBrandProfile(brandId: string, admin: Admin = createAdminClient()): Promise<BrandProfileView | null> {
  const { data, error } = await admin.rpc("app_brand_profile", { p_brand_id: brandId });
  if (error) {
    console.error("[brand/profile] app_brand_profile failed:", error.message);
    return null;
  }
  return parseBrandProfile(data);
}

/** 폼 저장 — `input` 은 호출자가 `parseBrandProfileInput` 으로 검증한 값만 (RPC 가 같은 조건으로 다시 검사한다). 로고는 `setBrandLogoUrl`. */
export async function saveBrandProfile(brandId: string, input: BrandProfileInput, admin: Admin = createAdminClient()): Promise<SetBrandProfileResult> {
  const { data, error } = await admin.rpc("app_set_brand_profile", {
    p_brand_id: brandId,
    p_input: {
      name: input.name,
      category: input.category,
      manager_name: input.manager_name,
      manager_phone: input.manager_phone ?? "",
      description: input.description ?? "",
    },
  });
  if (error) {
    console.error("[brand/profile] app_set_brand_profile failed:", error.message);
    return { ok: false, code: "DB_ERROR", field: null };
  }
  return parseSetBrandProfileResult(data);
}

/** 로고 URL 저장 — `uploadBrandLogo` 결과의 url. null 이면 로고 제거. */
export async function setBrandLogoUrl(brandId: string, url: string | null, admin: Admin = createAdminClient()): Promise<SetBrandProfileResult> {
  const { data, error } = await admin.rpc("app_set_brand_profile", { p_brand_id: brandId, p_input: { logo_url: url ?? "" } });
  if (error) {
    console.error("[brand/profile] app_set_brand_profile(logo) failed:", error.message);
    return { ok: false, code: "DB_ERROR", field: null };
  }
  return parseSetBrandProfileResult(data);
}

/* ---------------- 로고 (Storage public-assets · 0006) ---------------- */

export const BRAND_LOGO_BUCKET = PRODUCT_IMAGE_BUCKET;
/** 로고는 상품 이미지보다 좁게 — 4MB (Vercel 서버리스 본문 4.5MB) */
export const BRAND_LOGO_MAX_BYTES = 4 * 1024 * 1024;
export const BRAND_LOGO_TYPES = PRODUCT_IMAGE_TYPES;

export type BrandLogoFile = ProductImageFile;
export type UploadBrandLogoResult = { ok: true; path: string; url: string } | { ok: false; code: "BAD_FILE" | "DB_ERROR" };

/** object path — `brands/<brand id>/logo-<random>.<ext>` */
export function brandLogoPath(brandId: string, ext: string, rand: string = crypto.randomUUID()): string {
  return `brands/${brandId}/logo-${rand}.${ext}`;
}

/** 공개 버킷에 올리고 공개 URL 을 돌려준다 — 호출자가 `setBrandLogoUrl` 로 저장. */
export async function uploadBrandLogo(brandId: string, file: BrandLogoFile, admin: Admin = createAdminClient()): Promise<UploadBrandLogoResult> {
  const ext = BRAND_LOGO_TYPES[file.type];
  if (!ext || file.size <= 0 || file.size > BRAND_LOGO_MAX_BYTES || file.size > PRODUCT_IMAGE_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > BRAND_LOGO_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const path = brandLogoPath(brandId, ext);
  const up = await admin.storage.from(BRAND_LOGO_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (up.error) {
    console.error("[brand/profile] logo upload failed:", up.error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const { data } = admin.storage.from(BRAND_LOGO_BUCKET).getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}

/* ---------------- 등급 ---------------- */

export async function getBrandGradeCard(brandId: string, admin: Admin = createAdminClient()): Promise<BrandGradeCard | null> {
  const { data, error } = await admin.rpc("app_brand_grade_card", { p_brand_id: brandId });
  if (error) {
    console.error("[brand/profile] app_brand_grade_card failed:", error.message);
    return null;
  }
  return parseBrandGradeCard(data);
}

/** brands.grade 캐시 갱신 — 운영 스크립트 · 정산 실행 전용 */
export async function recalcBrandGrade(brandId: string, admin: Admin = createAdminClient()): Promise<BrandGradeRecalcResult> {
  const { data, error } = await admin.rpc("app_brand_grade_recalc", { p_brand_id: brandId });
  if (error) {
    console.error("[brand/profile] app_brand_grade_recalc failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseBrandGradeRecalcResult(data);
}
