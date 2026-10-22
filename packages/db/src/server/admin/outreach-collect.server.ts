/**
 * 아웃리치 "조건으로 수집" — 제공사 검색(Modash) 1페이지(≤15건)를 받아 후보 큐에 upsert 한다 (대표 요청 2026-10-22).
 *   collectOutreachCandidates({ provider:'modash', page, actor }) → { ok, inserted, updated, total, page, error }
 *   설정: configureOutreachCollect({ modashApiKey, modashKrLocationId? }) — 관리자 앱이 env 에서 넣는다. 키가 없으면 NOT_CONFIGURED.
 *   한국 location id 는 한 번 조회(`/v1/instagram/locations?query=Korea`)해 캐시. 조회 실패 시 env 값.
 *   비용: 검색 0.01 크레딧/건(페이지당 ~0.15) — 버튼 1회 = 1페이지. 보고서(상세 인구통계) 호출은 2단계(선택).
 */
import { modashSearchBody, parseModashSearch, pickKoreaLocationId, type OutreachProvider } from "../../admin/outreach-providers";
import { createAdminClient, type Admin } from "../admin.server";
import { upsertOutreachCreators } from "./outreach.server";

const MODASH = "https://api.modash.io/v1";
let cfg: { modashApiKey?: string | null; modashKrLocationId?: string | null } = {};
let krLocationCache: number | string | null = null;

export function configureOutreachCollect(c: { modashApiKey?: string | null; modashKrLocationId?: string | null }): void {
  cfg = { ...cfg, ...c };
}

export function outreachCollectStatus(): { provider: OutreachProvider | null; configured: boolean } {
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

export type CollectResult = { ok: boolean; code?: "NOT_CONFIGURED" | "PROVIDER_ERROR" | "NO_LOCATION"; inserted: number; updated: number; failed: number; found: number; total: number; page: number; error?: string | null };

export async function collectOutreachCandidates(opts: { provider?: OutreachProvider; page?: number; actor: string | null }, admin: Admin = createAdminClient()): Promise<CollectResult> {
  const page = Math.max(0, opts.page ?? 0);
  const base = { inserted: 0, updated: 0, failed: 0, found: 0, total: 0, page };
  if (!cfg.modashApiKey) return { ok: false, code: "NOT_CONFIGURED", ...base };
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
  return { ok: true, ...base, ...up, found: parsed.rows.length, total: parsed.total };
}
