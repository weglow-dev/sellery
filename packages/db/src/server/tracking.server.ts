/**
 * 택배 자동 추적 — 서버 어댑터 (0049 · shop `/api/cron/tracking` · `partner-admin.mjs tracking-sweep|track`).
 * 로직은 순수 모듈 `../tracking/sweep.ts`(fetch · rpc 주입) — 여기서는 supabase admin 을 감싸고 화면용 조회만 더한다.
 *
 *   runTrackingSweep(admin, {apiKey, limit, dryRun})   sweepTracking(db, …) — 결과·로그 규칙은 sweep.ts
 *   fetchOrdersTracking(admin, codes)                  브랜드 주문 표가 스냅샷을 덧붙일 때(app_brand_orders 는 0049 컬럼을 모른다)
 *   fetchCampaignTracking(admin, id)                   브랜드 캠페인 상세(brand_campaign_json 은 0049 컬럼을 모른다)
 */
import { createAdminClient, type Admin } from "./admin.server";
import { parseTrackingFields, type TrackingFields } from "../tracking/sweettracker";
import { listTrackingDue, sweepTracking, type SweepOptions, type SweepResult, type TrackingDb, type TrackingDue } from "../tracking/sweep";

export type { SweepItem, SweepOptions, SweepResult, TrackingDue, DueParcel } from "../tracking/sweep";
export { trackParcel, fetchKeyUsage } from "../tracking/sweep";

/** supabase admin → TrackingDb (rpc 이름은 0049 두 함수뿐 · 인자는 jsonb 호환이라 Json 캐스트) */
export function trackingDb(admin: Admin): TrackingDb {
  return { rpc: (fn, args) => admin.rpc(fn, args as never) };
}

/** 매시 스윕 — 크론 라우트·운영 스크립트가 부른다. DB 오류(due 조회)는 throw(크론 500) · 소포별 오류는 카운트. */
export function runTrackingSweep(admin: Admin = createAdminClient(), opts: SweepOptions): Promise<SweepResult> {
  return sweepTracking(trackingDb(admin), opts);
}

/** 조회 대상 미리보기(운영) — API 호출 없음 · 14일 경과분은 TIMEOUT 으로 닫는다 */
export function fetchTrackingDue(admin: Admin = createAdminClient(), limit = 50, maxAgeDays = 14): Promise<TrackingDue> {
  return listTrackingDue(trackingDb(admin), limit, maxAgeDays);
}

/** 브랜드 주문 표용 — 주문 코드 → 스냅샷. 없는 코드는 빠진다. 오류는 로그만(빈 Map). */
export async function fetchOrdersTracking(admin: Admin, codes: readonly string[]): Promise<Map<string, TrackingFields>> {
  const out = new Map<string, TrackingFields>();
  if (!codes.length) return out;
  const { data, error } = await admin.from("orders").select("code,tracking_status,tracking_last,tracking_checked_at,delivered_at").in("code", [...codes]);
  if (error) {
    console.error("[tracking] orders snapshot read failed:", error.message);
    return out;
  }
  for (const r of data ?? []) {
    const t = parseTrackingFields(r as unknown as Record<string, unknown>, "delivered_at");
    if (t) out.set(r.code, t);
  }
  return out;
}

/** 브랜드 캠페인 상세용 — 샘플 송장 스냅샷. 오류·없음은 null. */
export async function fetchCampaignTracking(admin: Admin, campaignId: string): Promise<TrackingFields | null> {
  const { data, error } = await admin.from("campaigns").select("tracking_status,tracking_last,tracking_checked_at,sample_delivered_at").eq("id", campaignId).maybeSingle();
  if (error) {
    console.error("[tracking] campaign snapshot read failed:", error.message);
    return null;
  }
  return parseTrackingFields(data as unknown as Record<string, unknown> | null, "sample_delivered_at");
}
