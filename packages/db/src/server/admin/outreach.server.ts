/**
 * 관리자 콘솔 "아웃리치" — 크리에이터 후보 큐 (0055 outreach_creators · outreach_events). service_role 전용.
 *   listOutreach({ status, q, limit })      → OutreachCreator[] (점수 높은 순 · 최근 수정순)
 *   countOutreachByStatus()                 → Record<status, n>
 *   getOutreach(id) · listOutreachEvents(id)
 *   upsertOutreachCreators(rows, source, actor) → { inserted, updated } — handle 기준 upsert · 지표가 오면 score 재계산 · DM 초안이 비면 생성
 *   updateOutreachFields(id, patch, actor)   → 지표·메모·초안 수정 (score 재계산 · 'edit' 이벤트)
 *   setOutreachStatus(id, status, actor)     → 상태 전이 ('status' 이벤트 · sent/replied 시각)
 *   addOutreachNote(id, body, actor)
 * 2단계(그래프 API 수집)는 같은 upsert 로 들어온다(source 'hashtag'|'discovery').
 */
import type { Json } from "../../database.types";
import {
  dmDraft,
  outreachFit,
  parseOutreachCreator,
  parseOutreachEvents,
  type OutreachAudience,
  type OutreachCreator,
  type OutreachCsvRow,
  type OutreachEvent,
  type OutreachStatus,
} from "../../admin/outreach-rules";
import { createAdminClient, type Admin } from "../admin.server";

export type { OutreachCreator, OutreachEvent, OutreachStatus } from "../../admin/outreach-rules";

const SELECT = "*";

export async function listOutreach(
  opts: { status?: OutreachStatus | null; q?: string | null; limit?: number } = {},
  admin: Admin = createAdminClient(),
): Promise<OutreachCreator[]> {
  let q = admin.from("outreach_creators").select(SELECT).order("score", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).limit(opts.limit ?? 500);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.q) {
    const needle = opts.q.replace(/[%_,]/g, " ").trim();
    if (needle) q = q.or(`handle.ilike.%${needle}%,name.ilike.%${needle}%,category.ilike.%${needle}%`);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[admin/outreach] list failed:", error.message);
    return [];
  }
  return (data ?? []).map(parseOutreachCreator).filter((x): x is OutreachCreator => x !== null);
}

export async function countOutreachByStatus(admin: Admin = createAdminClient()): Promise<Record<string, number>> {
  const { data, error } = await admin.from("outreach_creators").select("status");
  if (error) {
    console.error("[admin/outreach] count failed:", error.message);
    return {};
  }
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

export async function getOutreach(id: string, admin: Admin = createAdminClient()): Promise<OutreachCreator | null> {
  const { data, error } = await admin.from("outreach_creators").select(SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return parseOutreachCreator(data);
}

export async function listOutreachEvents(id: string, admin: Admin = createAdminClient()): Promise<OutreachEvent[]> {
  const { data, error } = await admin.from("outreach_events").select("*").eq("creator_id", id).order("created_at", { ascending: false }).limit(100);
  if (error) return [];
  return parseOutreachEvents(data);
}

async function addEvent(admin: Admin, creatorId: string, kind: string, body: string | null, actor: string | null) {
  const { error } = await admin.from("outreach_events").insert({ creator_id: creatorId, kind, body, actor });
  if (error) console.error("[admin/outreach] event failed:", error.message);
}

function audienceFrom(r: OutreachCsvRow, prev: OutreachAudience | null): OutreachAudience | null {
  const a: OutreachAudience = { ...(prev ?? {}) };
  if (r.female_pct !== undefined) a.female_pct = r.female_pct;
  if (r.age_20_40_pct !== undefined) a.age_20_40_pct = r.age_20_40_pct;
  if (r.kr_pct !== undefined) a.kr_pct = r.kr_pct;
  if (a.female_pct == null && a.age_20_40_pct == null && a.kr_pct == null) return null;
  return a;
}

/** handle 기준 upsert — 새 행은 후보로, 기존 행은 넘어온 지표만 덮어쓴다(빈 값은 유지) */
export async function upsertOutreachCreators(
  rows: OutreachCsvRow[],
  source: "manual" | "csv" | "hashtag" | "discovery",
  actor: string | null,
  admin: Admin = createAdminClient(),
): Promise<{ inserted: number; updated: number; failed: number }> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  for (const r of rows) {
    const { data: prev } = await admin.from("outreach_creators").select(SELECT).eq("handle", r.handle).maybeSingle();
    const existing = prev ? parseOutreachCreator(prev) : null;
    const merged = {
      handle: r.handle,
      name: r.name ?? existing?.name ?? null,
      followers: r.followers ?? existing?.followers ?? null,
      engagement_rate: r.engagement_rate ?? existing?.engagement_rate ?? null,
      trend: r.trend ?? existing?.trend ?? null,
      category: r.category ?? existing?.category ?? null,
      audience: audienceFrom(r, existing?.audience ?? null),
    };
    const fit = outreachFit(merged);
    const payload = {
      ...merged,
      audience: merged.audience as Json | null,
      score: fit.score,
      source: existing?.source ?? source,
      dm_draft: existing?.dm_draft ?? dmDraft({ handle: r.handle, name: merged.name, category: merged.category }),
      last_checked_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await admin.from("outreach_creators").update(payload).eq("id", existing.id);
      if (error) {
        failed++;
        continue;
      }
      updated++;
      await addEvent(admin, existing.id, "edit", `${source} 가져오기로 지표 갱신 · 적합 ${fit.met}/${fit.total}`, actor);
    } else {
      const { data, error } = await admin.from("outreach_creators").insert(payload).select("id").single();
      if (error || !data) {
        failed++;
        continue;
      }
      inserted++;
      await addEvent(admin, data.id, "collected", `${source} · 적합 ${fit.met}/${fit.total}${fit.unknown.length ? ` · 미확인 ${fit.unknown.join(", ")}` : ""}`, actor);
    }
  }
  return { inserted, updated, failed };
}

export type OutreachPatch = {
  name?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  trend?: "up" | "flat" | "down" | null;
  category?: string | null;
  audience?: OutreachAudience | null;
  note?: string | null;
  dm_draft?: string | null;
  assigned_to?: string | null;
};

export async function updateOutreachFields(id: string, patch: OutreachPatch, actor: string | null, admin: Admin = createAdminClient()): Promise<OutreachCreator | null> {
  const cur = await getOutreach(id, admin);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  const fit = outreachFit(next);
  const { error } = await admin
    .from("outreach_creators")
    .update({ ...patch, audience: (patch.audience ?? cur.audience) as Json | null, score: fit.score, last_checked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[admin/outreach] update failed:", error.message);
    return null;
  }
  await addEvent(admin, id, "edit", `지표 수정 · 적합 ${fit.met}/${fit.total}`, actor);
  return getOutreach(id, admin);
}

export async function setOutreachStatus(id: string, status: OutreachStatus, actor: string | null, admin: Admin = createAdminClient()): Promise<boolean> {
  const cur = await getOutreach(id, admin);
  if (!cur) return false;
  const patch: { status: OutreachStatus; sent_at?: string; replied_at?: string; assigned_to?: string } = { status };
  if (status === "sent" && !cur.sent_at) patch.sent_at = new Date().toISOString();
  if (status === "replied" && !cur.replied_at) patch.replied_at = new Date().toISOString();
  if (status === "sent" && actor && !cur.assigned_to) patch.assigned_to = actor;
  const { error } = await admin.from("outreach_creators").update(patch).eq("id", id);
  if (error) {
    console.error("[admin/outreach] status failed:", error.message);
    return false;
  }
  await addEvent(admin, id, status === "sent" ? "dm_sent" : status === "replied" ? "reply" : "status", `${cur.status} → ${status}`, actor);
  return true;
}

export async function addOutreachNote(id: string, body: string, actor: string | null, admin: Admin = createAdminClient()): Promise<boolean> {
  const text = body.trim();
  if (!text) return false;
  await addEvent(admin, id, "note", text, actor);
  return true;
}

export async function deleteOutreach(id: string, admin: Admin = createAdminClient()): Promise<boolean> {
  const { error } = await admin.from("outreach_creators").delete().eq("id", id);
  return !error;
}
