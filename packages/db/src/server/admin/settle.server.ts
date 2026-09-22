/**
 * 관리자 콘솔 "정산 · 지급" — 0020 함수 호출 (docs/admin-console-plan.md "정산·돈" · docs/settlement-policy.md §8 · §11.4).
 * 데모 원본: `packages/core/src/actions.ts` runSettle · runSettleAll · vAdminSettle. **파트너 관리(정지 · 검수 · 채널)는 여기 없다** — `admin.server.ts`(다른 작업자).
 *
 * 전부 service role + `requireAdmin()` 뒤에서만. 콘솔 화면에는 계좌 원문이 없다 — `exportPayouts` 만 원문을 돌려주고 호출마다 sensitive_access_log 가 남는다(CSV 다운로드 응답 전용).
 *   previewSettlement(campaignRef)                       app_admin_settle_preview → SettlePreview | { ok:false, code }
 *   runSettlement(campaignRef, { actorUserId, force })   app_admin_settle_run → SettleRunResult (한 트랜잭션 · SETTLED 면 already)
 *   runDueSettlements(actorUserId)                        app_admin_settle_run_due → 건별 결과 ("정산 실행(도래분)")
 *   listAdminSettlements(status, limit)                   app_admin_settlements → 대기 큐 + 스냅샷 표 + 카운트
 *   markPayoutPaid(payoutId, { actorUserId, memo }) · holdPayout(payoutId, reason) · releasePayout(payoutId)
 *   exportPayouts(status, { actor, purpose })             app_admin_payout_export → 계좌 원문 행 (로그)
 *   exportRrn(settlementIds, { actor, purpose })          app_admin_rrn_export — `configureDb({ rrnEncKey })` 가 없으면 RRN_KEY_MISSING
 *   recalcSellerGrade(sellerId) · recalcBrandGrade(brandId)  운영 스크립트용
 * campaignRef · payoutId: code('c5') 또는 uuid. 순수 규칙·파서는 `../../admin/settle-rules.ts`.
 */
import {
  parseAdminSettlements,
  parsePayoutActionResult,
  parsePayoutExport,
  parseRrnExport,
  parseSettlePreview,
  parseSettleRunDueResult,
  parseSettleRunResult,
  type AdminSettlements,
  type PayoutActionResult,
  type PayoutExport,
  type RrnExport,
  type SettlePreview,
  type SettleRunDueResult,
  type SettleRunResult,
} from "../../admin/settle-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { dbConfig } from "../config.server";

export type {
  AdminSettlements,
  PayoutActionResult,
  PayoutExport,
  PayoutExportRow,
  PayoutView,
  RrnExport,
  RrnExportRow,
  SettlePreview,
  SettleQueueRow,
  SettleRunDueResult,
  SettleRunResult,
} from "../../admin/settle-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 캠페인 code('c5') 또는 uuid → id. 없으면 null · 읽기 실패 'error' */
export async function campaignIdOf(admin: Admin, ref: string): Promise<string | null | "error"> {
  const r = ref.trim();
  if (!r) return null;
  if (UUID_RE.test(r)) return r;
  const { data, error } = await admin.from("campaigns").select("id").eq("code", r.toLowerCase()).maybeSingle();
  if (error) {
    console.error("[admin/settle] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

export type SettlePreviewResult = { ok: true; preview: SettlePreview } | { ok: false; code: string; status?: string | null };

export async function previewSettlement(campaignRef: string, admin: Admin = createAdminClient()): Promise<SettlePreviewResult> {
  const id = await campaignIdOf(admin, campaignRef);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_admin_settle_preview", { p_campaign_id: id });
  if (error) {
    console.error("[admin/settle] app_admin_settle_preview failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const preview = parseSettlePreview(data);
  if (preview) return { ok: true, preview };
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  return { ok: false, code: typeof o?.code === "string" ? o.code : "DB_ERROR", status: typeof o?.status === "string" ? o.status : null };
}

export async function runSettlement(
  campaignRef: string,
  opts: { actorUserId?: string | null; force?: boolean } = {},
  admin: Admin = createAdminClient(),
): Promise<SettleRunResult> {
  const id = await campaignIdOf(admin, campaignRef);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_admin_settle_run", { p_campaign_id: id, p_actor_user_id: opts.actorUserId ?? undefined, p_force: opts.force ?? false });
  if (error) {
    console.error("[admin/settle] app_admin_settle_run failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSettleRunResult(data);
}

export async function runDueSettlements(actorUserId?: string | null, admin: Admin = createAdminClient()): Promise<SettleRunDueResult> {
  const { data, error } = await admin.rpc("app_admin_settle_run_due", { p_actor_user_id: actorUserId ?? undefined });
  if (error) {
    console.error("[admin/settle] app_admin_settle_run_due failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSettleRunDueResult(data);
}

export async function listAdminSettlements(status?: string | null, limit = 200, admin: Admin = createAdminClient()): Promise<AdminSettlements | null> {
  const { data, error } = await admin.rpc("app_admin_settlements", { p_status: status ?? undefined, p_limit: limit });
  if (error) {
    console.error("[admin/settle] app_admin_settlements failed:", error.message);
    return null;
  }
  return parseAdminSettlements(data);
}

export async function markPayoutPaid(payoutId: string, opts: { actorUserId?: string | null; memo?: string | null } = {}, admin: Admin = createAdminClient()): Promise<PayoutActionResult> {
  if (!UUID_RE.test(payoutId)) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_admin_payout_mark_paid", { p_payout_id: payoutId, p_actor_user_id: opts.actorUserId ?? undefined, p_memo: opts.memo ?? undefined });
  if (error) {
    console.error("[admin/settle] app_admin_payout_mark_paid failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parsePayoutActionResult(data);
}

export async function holdPayout(payoutId: string, reason?: string | null, admin: Admin = createAdminClient()): Promise<PayoutActionResult> {
  if (!UUID_RE.test(payoutId)) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_admin_payout_hold", { p_payout_id: payoutId, p_reason: reason ?? undefined });
  if (error) {
    console.error("[admin/settle] app_admin_payout_hold failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parsePayoutActionResult(data);
}

export async function releasePayout(payoutId: string, admin: Admin = createAdminClient()): Promise<PayoutActionResult> {
  if (!UUID_RE.test(payoutId)) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_admin_payout_release", { p_payout_id: payoutId });
  if (error) {
    console.error("[admin/settle] app_admin_payout_release failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parsePayoutActionResult(data);
}

/** 이체 파일 행 — 계좌 원문. 라우트는 이 결과를 CSV 로만 내려보내고 페이지 데이터에 싣지 않는다. actor = 운영자 이메일, purpose = '지급 배치 2026-10' 등 */
export async function exportPayouts(status: string | null | undefined, opts: { actor: string; purpose: string }, admin: Admin = createAdminClient()): Promise<PayoutExport> {
  const { data, error } = await admin.rpc("app_admin_payout_export", { p_status: status ?? "pending", p_actor: opts.actor, p_purpose: opts.purpose });
  if (error) {
    console.error("[admin/settle] app_admin_payout_export failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parsePayoutExport(data);
}

/** 지급명세서 자료 — 주민번호 복호(0013 · 호출마다 로그). 키(`configureDb({ rrnEncKey })`)가 없으면 DB 를 부르지 않는다. 실패 로그에도 번호는 남기지 않는다. */
export async function exportRrn(settlementIds: readonly string[], opts: { actor: string; purpose?: string }, admin?: Admin): Promise<RrnExport> {
  const key = dbConfig().rrnEncKey;
  if (!key) return { ok: false, code: "RRN_KEY_MISSING" };
  const ids = settlementIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return { ok: true, count: 0, rows: [] };
  const a = admin ?? createAdminClient();
  const { data, error } = await a.rpc("app_admin_rrn_export", { p_settlement_ids: ids, p_actor: opts.actor, p_key: key, p_purpose: opts.purpose ?? "지급명세서" });
  if (error) {
    console.error("[admin/settle] app_admin_rrn_export failed:", error.code ?? error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseRrnExport(data);
}

export type GradeRecalcResult = { ok: true; previous: string | null; grade: string | null; changed: boolean; m3_sales?: number; gmv?: number } | { ok: false; code: string };

export async function recalcSellerGrade(sellerId: string, admin: Admin = createAdminClient()): Promise<GradeRecalcResult> {
  const { data, error } = await admin.rpc("app_seller_grade_recalc", { p_seller_id: sellerId });
  if (error) {
    console.error("[admin/settle] app_seller_grade_recalc failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!o || o.ok !== true) return { ok: false, code: typeof o?.code === "string" ? o.code : "DB_ERROR" };
  return { ok: true, previous: typeof o.previous_grade === "string" ? o.previous_grade : null, grade: typeof o.grade === "string" ? o.grade : null, changed: o.changed === true, m3_sales: Number(o.m3_sales) || 0 };
}

export async function recalcBrandGrade(brandId: string, admin: Admin = createAdminClient()): Promise<GradeRecalcResult> {
  const { data, error } = await admin.rpc("app_brand_grade_recalc", { p_brand_id: brandId });
  if (error) {
    console.error("[admin/settle] app_brand_grade_recalc failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!o || o.ok !== true) return { ok: false, code: typeof o?.code === "string" ? o.code : "DB_ERROR" };
  return { ok: true, previous: typeof o.previous === "string" ? o.previous : null, grade: typeof o.grade === "string" ? o.grade : null, changed: o.changed === true, gmv: Number(o.gmv) || 0 };
}
