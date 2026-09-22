/**
 * 브랜드 콘솔 `/brand/settle` — 정산 정보 등록 · 사업자등록증 · 정산 내역 열람 (docs/brand-console-plan.md §5 `/brand/settle` · §6 행 5 · §8).
 * 데모 원본: 브랜드 마이페이지 정산 정보 폼(saveBrandInfo · brandDocPick) · vBrandSettle. **정산 실행(runSettle)은 여기 없다** — 관리자 콘솔.
 *
 * 전부 service role + `requireBrand()` 의 `brand.id`. 콘솔 응답에는 계좌·사업자번호 원문이 없다(0019 함수가 마스킹한 값만 돌려준다).
 *   getBrandSettleInfo(brandId)                   app_brand_settle_info → BrandSettleInfoView | null (마스킹 · 등록 여부 · settle_info_complete · po_* 읽기만)
 *   saveBrandSettleInfo(brandId, input)           app_set_brand_settle_info — input 은 `parseBrandSettleInfoInput` 통과값 → { ok, info } | { ok:false, code }
 *   listBrandSettlements(brandId)                 app_brand_settlements → BrandSettlements | null
 *   uploadBrandBizDoc(brandId, file)              Storage `partner-docs`(0006 비공개) 에 `brands/<id>/biz-doc.<ext>` 로 올리고 brands.biz_doc_url 에 object path 저장.
 *                                                 JPG · PNG · WebP · PDF, 10MB 이하. 같은 경로에 덮어쓴다(upsert) — 인플루언서 `uploadBizDoc` 과 같은 규칙.
 *   getBrandBizDocSignedUrl(brandId, ttlSec=300)  본인 서류 미리보기용 단기 서명 URL (없으면 null). 공개 URL 은 만들지 않는다.
 * 인플루언서 짝: `../partner/settle.server.ts`(0013).
 */
import {
  parseBrandSettleInfo,
  parseBrandSettlements,
  parseSetBrandSettleInfoResult,
  type BrandSettleInfoInput,
  type BrandSettleInfoView,
  type BrandSettlements,
  type SetBrandSettleInfoResult,
} from "../../brand/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { BIZ_DOC_BUCKET, BIZ_DOC_MAX_BYTES, BIZ_DOC_TYPES, type BizDocFile, type UploadBizDocResult } from "../partner/settle.server";

export type { BrandSettleInfoInput, BrandSettleInfoView, BrandSettlementRow, BrandSettlements, SetBrandSettleInfoResult } from "../../brand/settle-rules";
export { BIZ_DOC_BUCKET, BIZ_DOC_MAX_BYTES, BIZ_DOC_TYPES, type BizDocFile, type UploadBizDocResult };

export async function getBrandSettleInfo(brandId: string, admin: Admin = createAdminClient()): Promise<BrandSettleInfoView | null> {
  const { data, error } = await admin.rpc("app_brand_settle_info", { p_brand_id: brandId });
  if (error) {
    console.error("[brand/settle] app_brand_settle_info failed:", error.message);
    return null;
  }
  return parseBrandSettleInfo(data);
}

/** 폼 저장 — `input` 은 호출자가 `parseBrandSettleInfoInput` 으로 검증한 값만 (RPC 가 같은 조건으로 다시 검사한다) */
export async function saveBrandSettleInfo(brandId: string, input: BrandSettleInfoInput, admin: Admin = createAdminClient()): Promise<SetBrandSettleInfoResult> {
  const { data, error } = await admin.rpc("app_set_brand_settle_info", {
    p_brand_id: brandId,
    p_bank: { bank: input.bank.bank, account: input.bank.account, holder: input.bank.holder },
    p_tax: {
      biz_no: input.tax.biz_no,
      mail_order_no: input.tax.mail_order_no,
      company: input.tax.company,
      ceo: input.tax.ceo,
      biz_type: input.tax.biz_type,
      biz_item: input.tax.biz_item,
      email: input.tax.email,
    },
  });
  if (error) {
    console.error("[brand/settle] app_set_brand_settle_info failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSetBrandSettleInfoResult(data);
}

export async function listBrandSettlements(brandId: string, admin: Admin = createAdminClient()): Promise<BrandSettlements | null> {
  const { data, error } = await admin.rpc("app_brand_settlements", { p_brand_id: brandId });
  if (error) {
    console.error("[brand/settle] app_brand_settlements failed:", error.message);
    return null;
  }
  return parseBrandSettlements(data);
}

/* ---------------- 사업자등록증 (Storage partner-docs) ---------------- */

/** object path — `brands/<brand id>/biz-doc.<ext>` (경로에 원본 파일명을 쓰지 않는다) */
export function brandBizDocPath(brandId: string, ext: string): string {
  return `brands/${brandId}/biz-doc.${ext}`;
}

export async function uploadBrandBizDoc(brandId: string, file: BizDocFile, admin: Admin = createAdminClient()): Promise<UploadBizDocResult> {
  const ext = BIZ_DOC_TYPES[file.type];
  if (!ext || file.size <= 0 || file.size > BIZ_DOC_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > BIZ_DOC_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const path = brandBizDocPath(brandId, ext);
  const up = await admin.storage.from(BIZ_DOC_BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  if (up.error) {
    console.error("[brand/settle] biz doc upload failed:", up.error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const { error } = await admin.from("brands").update({ biz_doc_url: path }).eq("id", brandId);
  if (error) {
    console.error("[brand/settle] biz_doc_url update failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return { ok: true, path };
}

/** 본인 서류의 단기 서명 URL — 등록된 경로가 없거나 발급 실패면 null */
export async function getBrandBizDocSignedUrl(brandId: string, ttlSec = 300, admin: Admin = createAdminClient()): Promise<string | null> {
  const { data: row, error } = await admin.from("brands").select("biz_doc_url").eq("id", brandId).maybeSingle();
  if (error || !row?.biz_doc_url) return null;
  const signed = await admin.storage.from(BIZ_DOC_BUCKET).createSignedUrl(row.biz_doc_url, Math.max(30, Math.min(ttlSec, 3600)));
  if (signed.error || !signed.data?.signedUrl) return null;
  return signed.data.signedUrl;
}
