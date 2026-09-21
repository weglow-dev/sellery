/**
 * 인플루언서 콘솔 `/settle` — 정산 정보 등록 · 정산 내역 열람 (docs/inf-console-plan.md §5.9 · §6 `/settle` · §7 5단계 · §4.9 마스킹).
 * 프로토타입 원본: js/20-seller.js vSellerSettle · vMy 정산 정보 폼(saveSettleInfo · bizDocPick). **정산 실행(runSettle)은 여기 없다** — 관리자 콘솔.
 *
 * 전부 service role + `requireSeller()` 의 `seller.id`. 콘솔 응답에는 계좌·사업자번호·주민번호 원문이 없다(0013 함수가 마스킹한 값만 돌려준다).
 *   getSellerSettleInfo(sellerId)                 app_seller_settle_info → SettleInfoView | null (마스킹 · 등록 여부 · wht_rate)
 *   saveSettleInfo(sellerId, input)               app_set_settle_info — input 은 `parseSettleInfoInput` 통과값 → { ok, info } | { ok:false, code }
 *   setSellerRrn(sellerId, rrn)                   app_set_seller_rrn — rrn 은 `validateRrn` 통과값(숫자 13자리). 키는 configureDb({ rrnEncKey }) — 없으면 RRN_KEY_MISSING
 *                                                 (DB 를 부르지 않는다). 원문은 어디에도 로그하지 않는다.
 *   listSellerSettlements(sellerId)               app_seller_settlements → SellerSettlements | null
 *   uploadBizDoc(sellerId, file)                  Storage `partner-docs`(0006 비공개) 에 `sellers/<id>/biz-doc.<ext>` 로 올리고 sellers.biz_doc_url 에 object path 저장.
 *                                                 JPG · PNG · WebP · PDF, 10MB 이하(버킷 한도 20MB 보다 좁게). 같은 경로에 덮어쓴다(upsert) — 이전 파일은 남기지 않는다.
 *   getBizDocSignedUrl(sellerId, ttlSec = 300)    본인 서류 미리보기용 단기 서명 URL (없으면 null). 공개 URL 은 만들지 않는다.
 * 원문 복호(app_seller_rrn_decrypt)는 콘솔 함수가 아니다 — 운영 스크립트(지급명세서) 전용, 호출마다 sensitive_access_log 1행.
 */
import {
  parseSellerSettlements,
  parseSetRrnResult,
  parseSetSettleInfoResult,
  parseSettleInfo,
  type SellerSettlements,
  type SetRrnResult,
  type SetSettleInfoResult,
  type SettleInfoInput,
  type SettleInfoView,
} from "../../partner/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { dbConfig } from "../config.server";

export type { SellerSettlements, SellerSettlementRow, SetRrnResult, SetSettleInfoResult, SettleInfoInput, SettleInfoView } from "../../partner/settle-rules";

export async function getSellerSettleInfo(sellerId: string, admin: Admin = createAdminClient()): Promise<SettleInfoView | null> {
  const { data, error } = await admin.rpc("app_seller_settle_info", { p_seller_id: sellerId });
  if (error) {
    console.error("[settle] app_seller_settle_info failed:", error.message);
    return null;
  }
  return parseSettleInfo(data);
}

/** 폼 저장 — `input` 은 호출자가 `parseSettleInfoInput` 으로 검증한 값만 (RPC 가 같은 조건으로 다시 검사한다) */
export async function saveSettleInfo(sellerId: string, input: SettleInfoInput, admin: Admin = createAdminClient()): Promise<SetSettleInfoResult> {
  const { data, error } = await admin.rpc("app_set_settle_info", {
    p_seller_id: sellerId,
    p_settle_type: input.settle_type,
    p_bank: { bank: input.bank.bank, account: input.bank.account, holder: input.bank.holder },
    p_tax: input.tax
      ? { biz_no: input.tax.biz_no, company: input.tax.company, ceo: input.tax.ceo, biz_type: input.tax.biz_type, biz_item: input.tax.biz_item, email: input.tax.email }
      : undefined,
  });
  if (error) {
    console.error("[settle] app_set_settle_info failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSetSettleInfoResult(data);
}

/**
 * 주민등록번호 저장 — `rrnDigits` 는 `validateRrn` 통과값(숫자 13자리). 키가 주입되지 않았으면 DB 를 부르지 않고 RRN_KEY_MISSING.
 * 실패 로그에도 번호는 남기지 않는다.
 */
export async function setSellerRrn(sellerId: string, rrnDigits: string, admin?: Admin): Promise<SetRrnResult> {
  const key = dbConfig().rrnEncKey;
  if (!key) return { ok: false, code: "RRN_KEY_MISSING" };
  if (!/^\d{13}$/.test(rrnDigits)) return { ok: false, code: "BAD_RRN" };
  const a = admin ?? createAdminClient();
  const { data, error } = await a.rpc("app_set_seller_rrn", { p_seller_id: sellerId, p_rrn: rrnDigits, p_key: key, p_skip_checksum: false });
  if (error) {
    console.error("[settle] app_set_seller_rrn failed:", error.code ?? error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSetRrnResult(data);
}

export async function listSellerSettlements(sellerId: string, admin: Admin = createAdminClient()): Promise<SellerSettlements | null> {
  const { data, error } = await admin.rpc("app_seller_settlements", { p_seller_id: sellerId });
  if (error) {
    console.error("[settle] app_seller_settlements failed:", error.message);
    return null;
  }
  return parseSellerSettlements(data);
}

/* ---------------- 사업자등록증 (Storage partner-docs) ---------------- */

export const BIZ_DOC_BUCKET = "partner-docs";
export const BIZ_DOC_MAX_BYTES = 10 * 1024 * 1024;
export const BIZ_DOC_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type BizDocFile = { bytes: ArrayBuffer | Uint8Array; type: string; size: number };
export type UploadBizDocResult = { ok: true; path: string } | { ok: false; code: "BAD_FILE" | "DB_ERROR" };

/** object path — `sellers/<seller id>/biz-doc.<ext>` (경로에 원본 파일명을 쓰지 않는다) */
export function bizDocPath(sellerId: string, ext: string): string {
  return `sellers/${sellerId}/biz-doc.${ext}`;
}

export async function uploadBizDoc(sellerId: string, file: BizDocFile, admin: Admin = createAdminClient()): Promise<UploadBizDocResult> {
  const ext = BIZ_DOC_TYPES[file.type];
  if (!ext || file.size <= 0 || file.size > BIZ_DOC_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > BIZ_DOC_MAX_BYTES) return { ok: false, code: "BAD_FILE" };
  const path = bizDocPath(sellerId, ext);
  const up = await admin.storage.from(BIZ_DOC_BUCKET).upload(path, bytes, { contentType: file.type, upsert: true });
  if (up.error) {
    console.error("[settle] biz doc upload failed:", up.error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const { error } = await admin.from("sellers").update({ biz_doc_url: path }).eq("id", sellerId);
  if (error) {
    console.error("[settle] biz_doc_url update failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return { ok: true, path };
}

/** 본인 서류의 단기 서명 URL — 등록된 경로가 없거나 발급 실패면 null */
export async function getBizDocSignedUrl(sellerId: string, ttlSec = 300, admin: Admin = createAdminClient()): Promise<string | null> {
  const { data: row, error } = await admin.from("sellers").select("biz_doc_url").eq("id", sellerId).maybeSingle();
  if (error || !row?.biz_doc_url) return null;
  const signed = await admin.storage.from(BIZ_DOC_BUCKET).createSignedUrl(row.biz_doc_url, Math.max(30, Math.min(ttlSec, 3600)));
  if (signed.error || !signed.data?.signedUrl) return null;
  return signed.data.signedUrl;
}
