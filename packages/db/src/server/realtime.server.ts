/**
 * 캠페인 변경 브로드캐스트 — 스레드·상태를 바꾼 쓰기 **직후** 한 번 부른다. 두 콘솔의 캠페인 상세(`LiveRefresh`)가 이 신호로 서버 load 를 다시 돌린다 (`../realtime.ts` 헤더).
 *
 *   notifyCampaignChanged(campaignId, kind)          1건
 *   notifyCampaignsChanged(campaignIds, kind)        여러 건을 한 요청에(틱)
 *   notifyCampaignCodesChanged(admin, codes, kind)   code 만 아는 호출자(틱 결과) — id 를 찾아 보낸다
 *
 * Supabase Realtime REST `POST <url>/realtime/v1/api/broadcast` (service role · 웹소켓 없음 · 서버리스에서 1 요청 ≈ 수십 ms).
 * **절대 throw 하지 않는다** — 설정(url · service key)이 없거나 실패하면 false 를 돌려주고 로그만 남긴다. 폴링이 뒤를 받친다.
 * 호출 위치(각 쓰기 경로에서 정확히 한 번 · already 는 제외):
 *   partner/chat `sendCampaignChat` · partner/campaigns `receiveSample` `requestSampleRefund` · partner/schedule `proposeSchedule` `passCampaign` `acceptInvite` `declineInvite`
 *   brand/campaigns `approveSample` `rejectSample` `shipSample` · brand/schedule `confirmSchedule` `rejectSchedule` · brand/invite `inviteSeller`
 *   campaign-tick `runCampaignTick` `tickCampaign` · admin/campaigns(브랜드 대행 · 판매 중단/재개 · 관리자 발신) · admin/sample `settleSampleAsAdmin` · admin/settle `runSettlement` `cancelSettlement`
 *   @sellery/payments partner-sample(샘플 결제 확정 · 환불)
 */
import { broadcastMessages, type CampaignChangeKind } from "../realtime";
import type { Admin } from "./admin.server";
import { dbConfig } from "./config.server";

const TIMEOUT_MS = 3000;

export async function notifyCampaignsChanged(campaignIds: readonly string[], kind: CampaignChangeKind): Promise<boolean> {
  const { url, serviceKey } = dbConfig();
  const messages = broadcastMessages(campaignIds, kind);
  if (!url || !serviceKey || messages.length === 0) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      console.error(`[realtime] broadcast ${kind} failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[realtime] broadcast failed:", e instanceof Error ? e.message : String(e));
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function notifyCampaignChanged(campaignId: string | null | undefined, kind: CampaignChangeKind): Promise<boolean> {
  return campaignId ? notifyCampaignsChanged([campaignId], kind) : Promise.resolve(false);
}

/** code 목록 → id 조회 → 브로드캐스트 (틱 결과 `went_live_codes` · `ended_codes`). 조회 실패도 삼킨다. */
export async function notifyCampaignCodesChanged(admin: Admin, codes: readonly string[], kind: CampaignChangeKind): Promise<boolean> {
  const list = [...new Set(codes.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (list.length === 0) return false;
  const { data, error } = await admin.from("campaigns").select("id").in("code", list);
  if (error) {
    console.error("[realtime] campaign id lookup failed:", error.message);
    return false;
  }
  return notifyCampaignsChanged((data ?? []).map((r) => r.id), kind);
}
