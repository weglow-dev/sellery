/**
 * 아웃리치 "조건으로 수집" — 제공사 검색(Modash) 1페이지(≤15건)를 받아 후보 큐에 upsert 한다 (대표 요청 2026-10-22).
 *   collectOutreachCandidates({ provider:'modash', page, actor }) → { ok, inserted, updated, total, page, error }
 *   제공사 둘: **meta**(공식 Instagram Creator Marketplace API · 무료 · Advanced Access 전엔 모의 데이터) 우선, 없으면 **modash**(유료).
 *   설정: configureOutreachCollect({ metaPageToken, metaIgUserId, modashApiKey, modashKrLocationId? }) — 관리자 앱이 env 에서 넣는다. 아무것도 없으면 NOT_CONFIGURED.
 *   한국 location id 는 한 번 조회(`/v1/instagram/locations?query=Korea`)해 캐시. 조회 실패 시 env 값.
 *   비용: 검색 0.01 크레딧/건(페이지당 ~0.15) — 버튼 1회 = 1페이지. 보고서(상세 인구통계) 호출은 2단계(선택).
 */
import { META_GRAPH_VERSION, metaCreatorSearchParams, modashSearchBody, parseMetaCreators, parseModashSearch, pickKoreaLocationId, type OutreachProvider } from "../../admin/outreach-providers";
import { outreachFit } from "../../admin/outreach-rules";
import { createAdminClient, type Admin } from "../admin.server";
import { upsertOutreachCreators } from "./outreach.server";

const MODASH = "https://api.modash.io/v1";
type CollectConfig = {
  modashApiKey?: string | null;
  modashKrLocationId?: string | null;
  /** Meta Instagram Creator Marketplace API — 브랜드 IG 비즈니스 계정에 연결된 페이지의 Page access token · 그 IG 사용자 id */
  metaPageToken?: string | null;
  metaIgUserId?: string | null;
};
let cfg: CollectConfig = {};
let krLocationCache: number | string | null = null;

export function configureOutreachCollect(c: CollectConfig): void {
  cfg = { ...cfg, ...c };
}

/** 메타(공식·무료)가 설정돼 있으면 우선, 아니면 Modash */
export function outreachCollectStatus(): { provider: OutreachProvider | null; configured: boolean } {
  if (cfg.metaPageToken && cfg.metaIgUserId) return { provider: "meta", configured: true };
  return cfg.modashApiKey ? { provider: "modash", configured: true } : { provider: null, configured: false };
}

async function modashFetch(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`${MODASH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.modashApiKey}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

async function koreaLocationId(): Promise<number | string | null> {
  if (krLocationCache) return krLocationCache;
  if (cfg.modashKrLocationId) return (krLocationCache = cfg.modashKrLocationId);
  try {
    const r = await modashFetch(`/instagram/locations?query=Korea&limit=10`);
    const id = r.ok ? pickKoreaLocationId(r.json) : null;
    if (id) krLocationCache = id;
    return id;
  } catch (e) {
    console.error("[outreach-collect] locations lookup failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type CollectResult = {
  ok: boolean;
  code?: "NOT_CONFIGURED" | "PROVIDER_ERROR" | "NO_LOCATION";
  provider?: OutreachProvider;
  inserted: number;
  updated: number;
  failed: number;
  /** 제공사가 돌려준 수 · 우리 임계(outreachFit missing 없음)로 걸러 남은 수 */
  found: number;
  kept: number;
  total: number;
  page: number;
  /** 메타: 다음 페이지 커서 */
  after?: string | null;
  error?: string | null;
};

export async function collectOutreachCandidates(
  opts: { provider?: OutreachProvider; page?: number; after?: string | null; actor: string | null },
  admin: Admin = createAdminClient(),
): Promise<CollectResult> {
  const page = Math.max(0, opts.page ?? 0);
  const base = { inserted: 0, updated: 0, failed: 0, found: 0, kept: 0, total: 0, page };
  const status = outreachCollectStatus();
  const provider = opts.provider ?? status.provider;
  if (!provider) return { ok: false, code: "NOT_CONFIGURED", ...base };

  if (provider === "meta") {
    if (!cfg.metaPageToken || !cfg.metaIgUserId) return { ok: false, code: "NOT_CONFIGURED", provider, ...base };
    const q = metaCreatorSearchParams({ after: opts.after ?? null });
    q.set("access_token", cfg.metaPageToken);
    let json: unknown;
    let ok = true;
    try {
      const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(cfg.metaIgUserId)}/creator_marketplace_creators?${q.toString()}`, { signal: AbortSignal.timeout(20_000) });
      ok = res.ok;
      json = await res.json().catch(() => null);
    } catch (e) {
      return { ok: false, code: "PROVIDER_ERROR", provider, ...base, error: e instanceof Error ? e.message : String(e) };
    }
    const parsed = parseMetaCreators(json);
    if (!ok || parsed.error) {
      console.error("[outreach-collect] meta creator_marketplace_creators failed:", parsed.error ?? JSON.stringify(json).slice(0, 300));
      return { ok: false, code: "PROVIDER_ERROR", provider, ...base, error: parsed.error ?? "Graph API 오류" };
    }
    // major_* 필터는 '최대 버킷' 조건이라 우리 임계로 다시 거른다 — 숫자가 없는 행(filtered_by)은 통과
    const kept = parsed.rows.filter((r) => outreachFit(r).missing.length === 0);
    const up = await upsertOutreachCreators(kept, "discovery", opts.actor, admin);
    return { ok: true, provider, ...base, ...up, found: parsed.rows.length, kept: kept.length, total: parsed.rows.length, after: parsed.after };
  }

  if (!cfg.modashApiKey) return { ok: false, code: "NOT_CONFIGURED", provider, ...base };
  const kr = await koreaLocationId();
  if (!kr) return { ok: false, code: "NO_LOCATION", ...base, error: "한국 location id 를 찾지 못했어요 — MODASH_KR_LOCATION_ID 를 설정해주세요" };
  let r: { ok: boolean; status: number; json: unknown };
  try {
    r = await modashFetch(`/instagram/search`, { method: "POST", body: JSON.stringify(modashSearchBody({ page, krLocationId: kr })) });
  } catch (e) {
    return { ok: false, code: "PROVIDER_ERROR", ...base, error: e instanceof Error ? e.message : String(e) };
  }
  const parsed = parseModashSearch(r.json);
  if (!r.ok || parsed.error) {
    console.error("[outreach-collect] modash search failed:", r.status, parsed.error ?? JSON.stringify(r.json).slice(0, 300));
    return { ok: false, code: "PROVIDER_ERROR", ...base, error: parsed.error ?? `HTTP ${r.status}` };
  }
  const up = await upsertOutreachCreators(parsed.rows, "discovery", opts.actor, admin);
  return { ok: true, provider, ...base, ...up, found: parsed.rows.length, kept: parsed.rows.length, total: parsed.total };
}
