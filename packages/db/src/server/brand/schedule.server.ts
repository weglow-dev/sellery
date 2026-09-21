/**
 * 브랜드 콘솔 — 판매 일정 승인 · 반려 (docs/brand-console-plan.md §1 SCHEDULE_PROPOSED 행 · §4 "0016" · §5 `/brand/campaigns/[code]` `?/confirmSchedule` `?/rejectSchedule`).
 * 프로토타입 원본: actions.ts confirmSchedule / rejectSchedule.
 *
 * 전부 0016 RPC(security definer · service role) + **`brand_id = <requireBrand 의 brand.id>`** — 남의 캠페인은 코드를 바꿔도 NOT_FOUND(라우트 404).
 *   confirmSchedule(brandId, code)          `app_brand_confirm_schedule` — SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED · start/end/qty ← proposed · price_locked/rate_locked 스냅샷
 *                                           · 확정 시점 우선 기간(PERIOD_BLOCKED) · 잔여 재고(STOCK_SHORT) · 시작일 경과(PERIOD_PAST) 재검사 · 멱등
 *   rejectSchedule(brandId, code, reason)   `app_brand_reject_schedule` — SCHEDULE_PROPOSED → TESTING + decision_reason(사유 선택) · 멱등
 * 결과 파서·문구는 `../../brand/campaign-rules.ts`(parseScheduleActionResult · scheduleActionFailMessage). 잔여 재고·제안 기간은 brand_campaign_json 의 stock_left · proposed_* 로 화면에.
 */
import { CAMPAIGN_CODE_RE } from "../../campaign";
import { parseScheduleActionResult, type ScheduleActionResult } from "../../brand/campaign-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { ScheduleActionResult } from "../../brand/campaign-rules";

async function campaignIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("campaigns").select("id").eq("brand_id", brandId).eq("code", code).maybeSingle();
  if (error) {
    console.error("[brand/schedule] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

type Fn = "app_brand_confirm_schedule" | "app_brand_reject_schedule";

async function call(admin: Admin, fn: Fn, brandId: string, code: string, extra: Record<string, unknown>): Promise<ScheduleActionResult> {
  const id = await campaignIdOf(admin, brandId, code);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const args = { p_brand_id: brandId, p_campaign_id: id, ...extra };
  const { data, error } = await admin.rpc(fn, args as never);
  if (error) {
    console.error(`[brand/schedule] ${fn} failed:`, error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseScheduleActionResult(data);
}

/** 일정 승인 — 성공 시 start · end · qty · priceLocked · rateLocked 가 채워진다. */
export function confirmSchedule(brandId: string, campaignCode: string, admin: Admin = createAdminClient()): Promise<ScheduleActionResult> {
  return call(admin, "app_brand_confirm_schedule", brandId, campaignCode, {});
}

/** 일정 반려 — reason 은 parseRejectInput 결과(null 허용). 인플루언서가 다시 제안한다(TESTING · proposed_* 는 프리필용으로 남는다). */
export function rejectSchedule(brandId: string, campaignCode: string, reason: string | null, admin: Admin = createAdminClient()): Promise<ScheduleActionResult> {
  return call(admin, "app_brand_reject_schedule", brandId, campaignCode, { p_reason: reason ?? undefined });
}
