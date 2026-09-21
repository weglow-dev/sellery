/**
 * 브랜드 콘솔 — 처리 대기 큐 · 캠페인 목록 · 상세(스레드) · 샘플 승인/거절/발송 (docs/brand-console-plan.md §1 · §5 `/brand/requests` `/brand/campaigns` `/[code]` · §6 2단계).
 * 프로토타입 원본: apps/brand (demo) camps/+page.svelte · 홈 "승인·처리 대기"(brandPending) · packages/ui CampaignDetail.svelte 브랜드 분기 · actions.ts approveSample/rejectSample/shipSample.
 *
 * 전부 0015 RPC(security definer · service role) + **`brand_id = <requireBrand 의 brand.id>`** — 다른 브랜드 캠페인은 코드를 바꿔도 null / NOT_FOUND(라우트 404).
 *   listBrandRequests(brandId, statuses?)         `app_brand_requests` — 브랜드 차례 상태(기본 SAMPLE_REQUESTED · SAMPLE_APPROVED · SAMPLE_PURCHASED · SCHEDULE_PROPOSED) 오래된 순
 *   listBrandCampaigns(brandId)                   `app_brand_campaigns` — 전부 최신순 (칩 필터는 순수 matchesBrandCampaignFilter)
 *   getBrandCampaign(brandId, code)               `app_brand_campaign` — 행 + sample_shipping(발송용 수취인 원문) + events. 내 것이 아니면 null
 *   approveSample(brandId, code)                  `app_brand_approve_sample` — SAMPLE_REQUESTED → SAMPLE_APPROVED · 멱등
 *   rejectSample(brandId, code, reason)           `app_brand_reject_sample` — → REJECTED + decision_reason · 멱등
 *   shipSample(brandId, code, courier, trackingNo)  `app_brand_ship_sample` — SAMPLE_APPROVED · SAMPLE_PURCHASED → SAMPLE_SHIPPED + 택배사·송장 · 멱등
 * 행 파서·칩·액션·폼 검증은 순수 모듈 `../../brand/campaign-rules.ts`.
 */
import { CAMPAIGN_CODE_RE } from "../../campaign";
import {
  parseBrandCampaignDetail,
  parseBrandCampaignRows,
  parseSampleActionResult,
  type BrandCampaignDetail,
  type BrandCampaignRow,
  type SampleActionResult,
} from "../../brand/campaign-rules";
import type { Courier } from "../../carriers";
import { createAdminClient, type Admin } from "../admin.server";

export type { BrandCampaignRow, BrandCampaignDetail, BrandCampaignEvent, BrandSellerSummary, SampleActionResult } from "../../brand/campaign-rules";

/** 처리 대기 큐 — statuses 를 주면 그 상태만 (예 ['SAMPLE_REQUESTED']). RPC 오류는 throw(페이지 500) — 빈 큐와 구분한다. */
export async function listBrandRequests(brandId: string, statuses?: readonly string[], admin: Admin = createAdminClient()): Promise<BrandCampaignRow[]> {
  const { data, error } = await admin.rpc("app_brand_requests", {
    p_brand_id: brandId,
    ...(statuses && statuses.length ? { p_statuses: [...statuses] } : {}),
  });
  if (error) throw new Error(`app_brand_requests failed: ${error.message}`);
  return parseBrandCampaignRows(data);
}

/** 내 브랜드 캠페인 전부 — 최신순 */
export async function listBrandCampaigns(brandId: string, admin: Admin = createAdminClient()): Promise<BrandCampaignRow[]> {
  const { data, error } = await admin.rpc("app_brand_campaigns", { p_brand_id: brandId });
  if (error) throw new Error(`app_brand_campaigns failed: ${error.message}`);
  return parseBrandCampaignRows(data);
}

/** 내 브랜드 캠페인 code → id. 없거나 남의 것이면 null, DB 오류는 "error". */
async function campaignIdOf(admin: Admin, brandId: string, code: string): Promise<string | null | "error"> {
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const { data, error } = await admin.from("campaigns").select("id").eq("brand_id", brandId).eq("code", code).maybeSingle();
  if (error) {
    console.error("[brand/campaigns] campaign lookup failed:", error.message);
    return "error";
  }
  return data?.id ?? null;
}

/** 캠페인 상세 + 배송지 + 스레드. 내 것이 아니거나 없는 코드면 null → 라우트 404 (소유자 불일치를 구분하지 않는다). */
export async function getBrandCampaign(brandId: string, code: string, admin: Admin = createAdminClient()): Promise<BrandCampaignDetail | null> {
  const id = await campaignIdOf(admin, brandId, code);
  if (id === "error") throw new Error("campaign lookup failed");
  if (!id) return null;
  const { data, error } = await admin.rpc("app_brand_campaign", { p_brand_id: brandId, p_campaign_id: id });
  if (error) throw new Error(`app_brand_campaign failed: ${error.message}`);
  return parseBrandCampaignDetail(data);
}

type SampleFn = "app_brand_approve_sample" | "app_brand_reject_sample" | "app_brand_ship_sample";

async function callSample(admin: Admin, fn: SampleFn, brandId: string, code: string, extra: Record<string, unknown>): Promise<SampleActionResult> {
  const id = await campaignIdOf(admin, brandId, code);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const args = { p_brand_id: brandId, p_campaign_id: id, ...extra };
  const { data, error } = await admin.rpc(fn, args as never);
  if (error) {
    console.error(`[brand/campaigns] ${fn} failed:`, error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseSampleActionResult(data);
}

/** 샘플 요청 승인 — SAMPLE_REQUESTED → SAMPLE_APPROVED (이벤트 sample_approved). 이미 승인이면 already. */
export function approveSample(brandId: string, campaignCode: string, admin: Admin = createAdminClient()): Promise<SampleActionResult> {
  return callSample(admin, "app_brand_approve_sample", brandId, campaignCode, {});
}

/** 샘플 요청 거절 — → REJECTED + decision_reason (reason 은 parseRejectInput 결과 · null 허용). */
export function rejectSample(brandId: string, campaignCode: string, reason: string | null, admin: Admin = createAdminClient()): Promise<SampleActionResult> {
  return callSample(admin, "app_brand_reject_sample", brandId, campaignCode, { p_reason: reason ?? undefined });
}

/** 샘플 발송 — courier · trackingNo 는 parseShipInput 결과(함수가 다시 검사한다). SAMPLE_APPROVED · SAMPLE_PURCHASED → SAMPLE_SHIPPED. */
export function shipSample(brandId: string, campaignCode: string, courier: Courier, trackingNo: string, admin: Admin = createAdminClient()): Promise<SampleActionResult> {
  return callSample(admin, "app_brand_ship_sample", brandId, campaignCode, { p_courier: courier, p_tracking_no: trackingNo });
}
