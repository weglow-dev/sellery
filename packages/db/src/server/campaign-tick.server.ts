/**
 * 캠페인 스케줄러 틱 — SCHEDULE_CONFIRMED → LIVE(시작일 도래) · LIVE → CLEARING(종료일 경과) (docs/brand-console-plan.md §4 "0018" · docs/app-plan.md §12 `api/cron/campaign-tick`).
 * 프로토타입 원본: helpers.ts autoTick(렌더마다) — 실서비스는 크론 `/api/cron/campaign-tick`(shop · `CRON_SECRET`) 또는 `partner-admin.mjs tick`.
 *
 *   runCampaignTick()          `app_campaign_tick` — 전체 · 멱등 · 오늘은 Asia/Seoul 달력일 · 이벤트 went_live / ended{due_on}
 *   tickCampaign(campaignId)   `app_campaign_tick_one` — 1건(운영·테스트)
 * 정산(CLEARING → SETTLED)은 여기 없다 — 관리자 단계.
 */
import { createAdminClient, type Admin } from "./admin.server";

export type CampaignTickResult = {
  ok: true;
  today: string;
  wentLive: number;
  ended: number;
  wentLiveCodes: string[];
  endedCodes: string[];
};

export type CampaignTickOneResult =
  | { ok: true; campaignId: string; campaignCode: string; from: string; to: string; wentLive: boolean; ended: boolean; today: string }
  | { ok: false; code: "NOT_FOUND" | "DB_ERROR" };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function parseCampaignTickResult(json: unknown): CampaignTickResult | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  return {
    ok: true,
    today: typeof o.today === "string" ? o.today : "",
    wentLive: num(o.went_live),
    ended: num(o.ended),
    wentLiveCodes: strs(o.went_live_codes),
    endedCodes: strs(o.ended_codes),
  };
}

/** 전체 틱 — RPC 오류는 throw(크론 라우트가 500 + 로그). */
export async function runCampaignTick(admin: Admin = createAdminClient()): Promise<CampaignTickResult> {
  const { data, error } = await admin.rpc("app_campaign_tick");
  if (error) throw new Error(`app_campaign_tick failed: ${error.message}`);
  const r = parseCampaignTickResult(data);
  if (!r) throw new Error("app_campaign_tick returned an unexpected shape");
  return r;
}

/** 1건 틱 — 운영 스크립트 · 테스트. */
export async function tickCampaign(campaignId: string, admin: Admin = createAdminClient()): Promise<CampaignTickOneResult> {
  const { data, error } = await admin.rpc("app_campaign_tick_one", { p_campaign_id: campaignId });
  if (error) {
    console.error("[campaign-tick] app_campaign_tick_one failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const o = obj(data);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: o.code === "NOT_FOUND" ? "NOT_FOUND" : "DB_ERROR" };
  return {
    ok: true,
    campaignId: String(o.campaign_id ?? campaignId),
    campaignCode: String(o.campaign_code ?? ""),
    from: String(o.from ?? ""),
    to: String(o.to ?? ""),
    wentLive: o.went_live === true,
    ended: o.ended === true,
    today: String(o.today ?? ""),
  };
}
