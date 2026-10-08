/**
 * 캠페인 실시간 갱신 — 서버(브로드캐스트 발신)와 브라우저(구독)가 **같은 채널 이름 · 이벤트 이름 · 페이로드 모양**을 쓰도록 여기 한 곳에 둔다 (순수 · 브라우저 도달 가능).
 *
 *   채널(topic)  `campaign:<campaigns.id>` — Supabase Realtime **Broadcast · 공개 채널**(RLS 없음 · 구독은 anon 키로 가능).
 *   이벤트       `changed` — 페이로드는 `{ kind, at }` 뿐. **본문·상태값·이름은 싣지 않는다** — 받은 쪽은 서버 load 를 다시 돌려(`invalidate`) 게이트(requireSeller/requireBrand) 를 통과한 데이터만 본다.
 *   발신         서버 `notifyCampaignChanged()`(`server/realtime.server.ts` · service role · Realtime REST `/realtime/v1/api/broadcast` — 웹소켓 없이 1 POST).
 *   수신         `packages/ui/src/site/console/LiveRefresh.svelte` — 브로드캐스트가 오면 `invalidate(key)`, 못 받아도 보이는 동안 N 초 폴링이 같은 일을 한다.
 *
 * 왜 Postgres Changes 가 아니라 Broadcast 인가: Postgres Changes 는 구독자에게 행(본문)이 그대로 가고 RLS 정책이 필요하다. Broadcast 는 "바뀌었다" 신호만 보내고 데이터는 기존 서버 경로로 다시 읽는다 — 게이트가 한 곳에 남는다.
 * 채널 이름에 쓰는 id 는 uuid(공개 code 가 아니다) — 알아도 "언제 무언가 바뀌었다" 이상은 새지 않는다.
 */

export const CAMPAIGN_CHANGED_EVENT = "changed";

/** 무엇이 바뀌었는지 — 받는 쪽은 종류를 가리지 않고 다시 읽는다(힌트 · 로그용). */
export type CampaignChangeKind = "chat" | "status" | "refund_request" | "sample_payment" | "settle" | "tick";

export type CampaignChangedPayload = { kind: CampaignChangeKind; at: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `campaign:<id>` — id 가 uuid 가 아니면 null(발신·구독 모두 건너뛴다). */
export function campaignTopic(campaignId: string | null | undefined): string | null {
  const id = (campaignId ?? "").trim().toLowerCase();
  return UUID_RE.test(id) ? `campaign:${id}` : null;
}

export function campaignChangedPayload(kind: CampaignChangeKind, at: Date = new Date()): CampaignChangedPayload {
  return { kind, at: at.toISOString() };
}

/** 수신 페이로드 검사 — 모양이 다르면 null(무시). 본문이 실려 와도 쓰지 않는다. */
export function parseCampaignChangedPayload(json: unknown): CampaignChangedPayload | null {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!o || typeof o.kind !== "string" || typeof o.at !== "string") return null;
  return { kind: o.kind as CampaignChangeKind, at: o.at };
}

/** Realtime REST 브로드캐스트 요청 본문 — 여러 캠페인을 한 요청에 담는다(틱). */
export function broadcastMessages(campaignIds: readonly string[], kind: CampaignChangeKind, at: Date = new Date()) {
  const payload = campaignChangedPayload(kind, at);
  const seen = new Set<string>();
  const messages: { topic: string; event: string; payload: CampaignChangedPayload; private: boolean }[] = [];
  for (const id of campaignIds) {
    const topic = campaignTopic(id);
    if (!topic || seen.has(topic)) continue;
    seen.add(topic);
    messages.push({ topic, event: CAMPAIGN_CHANGED_EVENT, payload, private: false });
  }
  return messages;
}
