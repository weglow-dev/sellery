/**
 * 인플루언서 콘솔 — 판매 일정 제안 · 패스 · 브랜드 제안 수락/거절 (docs/brand-console-plan.md §1 · §4 "0016" · §6 3단계 인플루언서 짝 · docs/inf-console-plan.md §7).
 * 프로토타입 원본: actions.ts proposeSchedule / passCamp / acceptInvite / declineInvite · ScheduleModal.
 *
 * 전부 0016 RPC(security definer · service role) + **`seller_id = <requireSeller 의 seller.id>`** — 남의 캠페인은 코드를 바꿔도 NOT_FOUND(라우트 404).
 *   getScheduleContext(sellerId, code)                 `app_seller_schedule_context` — 폼 컨텍스트(잔여 재고 · 기간 선택지 · 이미 잡힌 기간 · 우선권 여부). 남의 것은 null
 *   proposeSchedule(sellerId, code, {start, end, qty}) `app_propose_schedule` — TESTING · SCHEDULE_PROPOSED(재제안) → SCHEDULE_PROPOSED. 입력은 parseScheduleInput 결과
 *   passCampaign(sellerId, code)                       `app_pass_campaign` — TESTING → PASSED · 멱등
 *   acceptInvite(sellerId, code, shipping?)            `app_accept_invite` — INVITED → SAMPLE_APPROVED + sample_shipping(폼 없으면 sellers.sample_address) · 멱등
 *   declineInvite(sellerId, code, reason)              `app_decline_invite` — INVITED → DECLINED + decision_reason · 멱등
 * 순수 규칙(폼 검증 · 문구 · 인플루언서 액션 패널)은 `../../partner/schedule-rules.ts`.
 */
import type { Json } from "../../database.types";
import { CAMPAIGN_CODE_RE } from "../../campaign";
import {
  parseScheduleContext,
  parseScheduleResult,
  parseSellerActionResult,
  type ScheduleContext,
  type ScheduleResult,
  type SellerActionResult,
} from "../../partner/schedule-rules";
import type { Shipping } from "../../types";
import { createAdminClient, type Admin } from "../admin.server";

export type { ScheduleContext, ScheduleResult, SellerActionResult, PeriodHolder, SellerNextAction } from "../../partner/schedule-rules";

/** 본인 캠페인 code → id. 없거나 남의 것이면 null, DB 오류는 "error". */
async function campaignIdOf(admin: Admin, sellerId: string, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("campaigns").select("id").eq("seller_id", sellerId).eq("code", code).maybeSingle();
  if (error) {
    console.error("[partner/schedule] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 일정 제안 폼 컨텍스트. 남의 것·없는 코드면 null(라우트 404), DB 오류는 throw. */
export async function getScheduleContext(sellerId: string, campaignCode: string, admin: Admin = createAdminClient()): Promise<ScheduleContext | null> {
  const id = await campaignIdOf(admin, sellerId, campaignCode);
  if (id === "error") throw new Error("campaign lookup failed");
  if (!id) return null;
  const { data, error } = await admin.rpc("app_seller_schedule_context", { p_seller_id: sellerId, p_campaign_id: id });
  if (error) throw new Error(`app_seller_schedule_context failed: ${error.message}`);
  return parseScheduleContext(data);
}

/** 일정 제안 — start · end 는 'YYYY-MM-DD'(parseScheduleInput 결과). 함수가 오늘 이후 · 기간 · 잔여 재고 · 우선 기간을 다시 검사한다. */
export async function proposeSchedule(
  sellerId: string,
  campaignCode: string,
  input: { start: string; end: string; qty: number },
  admin: Admin = createAdminClient(),
): Promise<ScheduleResult> {
  const id = await campaignIdOf(admin, sellerId, campaignCode);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data, error } = await admin.rpc("app_propose_schedule", {
    p_seller_id: sellerId,
    p_campaign_id: id,
    p_start: input.start,
    p_end: input.end,
    p_qty: input.qty,
  });
  if (error) {
    console.error("[partner/schedule] app_propose_schedule failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseScheduleResult(data);
}

type SellerFn = "app_pass_campaign" | "app_accept_invite" | "app_decline_invite";

async function callSeller(admin: Admin, fn: SellerFn, sellerId: string, code: string, extra: Record<string, unknown>): Promise<SellerActionResult> {
  const id = await campaignIdOf(admin, sellerId, code);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const args = { p_seller_id: sellerId, p_campaign_id: id, ...extra };
  const { data, error } = await admin.rpc(fn, args as never);
  if (error) {
    console.error(`[partner/schedule] ${fn} failed:`, error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSellerActionResult(data);
}

/** 테스트 후 패스 — TESTING → PASSED (이벤트 passed). 이미 PASSED 면 already. */
export function passCampaign(sellerId: string, campaignCode: string, admin: Admin = createAdminClient()): Promise<SellerActionResult> {
  return callSeller(admin, "app_pass_campaign", sellerId, campaignCode, {});
}

/**
 * 브랜드 제안 수락 — INVITED → SAMPLE_APPROVED. shipping 은 parseShippingInput 결과(폼) · 생략하면 sellers.sample_address 를 쓴다(둘 다 없으면 BAD_SHIPPING).
 * 노출 중단 상품은 NOT_LISTED · 독점 확정 상품은 EXCLUSIVE_LOCKED.
 */
export function acceptInvite(sellerId: string, campaignCode: string, shipping: Shipping | null = null, admin: Admin = createAdminClient()): Promise<SellerActionResult> {
  return callSeller(admin, "app_accept_invite", sellerId, campaignCode, shipping ? { p_shipping: shipping as unknown as Json } : {});
}

/** 브랜드 제안 거절 — INVITED → DECLINED + decision_reason (reason 은 parseDeclineInput 결과 · null 허용). */
export function declineInvite(sellerId: string, campaignCode: string, reason: string | null, admin: Admin = createAdminClient()): Promise<SellerActionResult> {
  return callSeller(admin, "app_decline_invite", sellerId, campaignCode, { p_reason: reason ?? undefined });
}
