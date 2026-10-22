/**
 * 크리에이터 아웃리치 규칙 — 순수 모듈 (관리자 `.svelte` 와 서버 양쪽). DB 호출은 `../server/admin/outreach.server.ts`.
 *   배경(대표 2026-10-22): MYR(Make Your Recipe) 인플루언서 브랜드 제조의뢰를 제안할 인스타 크리에이터를 걸러 **사람이** DM 을 보낸다.
 *   공식 API 로는 남의 팔로워 인구통계 조회·콜드 DM 자동 발송이 불가능하고(메타 약관 · 정보통신망법), 그래서 이 화면은 "후보 큐 + 초안 + 상태 추적" 이다.
 *
 *   OUTREACH_FILTER      대표가 정한 적합 조건 — 팔로워 5만↑ · 여성 60%↑ · 20~40대 80%↑ · 한국 80%↑ · 반응 추세 up/flat
 *   normalizeHandle      '@Jiyu_Beauty ' · 'https://instagram.com/jiyu_beauty/' → 'jiyu_beauty'
 *   parseHandleList      줄·쉼표·공백으로 섞어 붙여 넣은 핸들 목록 → 중복 제거
 *   parseCsvRows         CSV/TSV(헤더 있음) → 행 — 분석사(Modash · HypeAuditor 등) 내보내기나 손으로 만든 표
 *   outreachFit          조건 충족/미달 목록 + 점수 (0~100) · 지표가 없으면 '미확인'
 *   dmDraft              개인화 DM 초안 (MYR 소개 + 랜딩 링크) — 운영자가 손으로 보낸다
 *   OUTREACH_STATUSES · outreachStatusChip · parseOutreachCreator · parseOutreachEvents — 상태 라벨 · 행 파서
 */
import type { StatusTone } from "../order-status";

export const OEM_LANDING_URL = "https://sellery.life/influencer/oem";
export const BRAND_NAME = "Make Your Recipe(MYR)";

/** 대표가 정한 필터 조건 (2026-10-22) */
export const OUTREACH_FILTER = {
  minFollowers: 50_000,
  femalePct: 60,
  age2040Pct: 80,
  krPct: 80,
  trends: ["up", "flat"] as const,
} as const;

export const OUTREACH_STATUSES = ["candidate", "queued", "sent", "replied", "meeting", "joined", "declined", "excluded"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, { label: string; tone: StatusTone; hint: string }> = {
  candidate: { label: "후보", tone: "gray", hint: "수집됨 · 아직 검토 전" },
  queued: { label: "발송 대기", tone: "blue", hint: "적합 확인 · DM 초안 준비됨" },
  sent: { label: "DM 보냄", tone: "amber", hint: "운영자가 @sellery.official 에서 보냄" },
  replied: { label: "답장 옴", tone: "green", hint: "대화 진행 중" },
  meeting: { label: "미팅", tone: "green", hint: "미팅 일정 잡힘" },
  joined: { label: "합류", tone: "green", hint: "제조의뢰 접수 / 계약" },
  declined: { label: "거절", tone: "red", hint: "관심 없음 · 다시 연락하지 않는다" },
  excluded: { label: "제외", tone: "gray", hint: "조건 미달 · 부적합" },
};
export function isOutreachStatus(v: unknown): v is OutreachStatus {
  return typeof v === "string" && (OUTREACH_STATUSES as readonly string[]).includes(v);
}
export function outreachStatusChip(status: string): { label: string; tone: StatusTone } {
  const d = isOutreachStatus(status) ? OUTREACH_STATUS_LABEL[status] : null;
  return d ? { label: d.label, tone: d.tone } : { label: status, tone: "gray" };
}

export const OUTREACH_TRENDS = ["up", "flat", "down"] as const;
export type OutreachTrend = (typeof OUTREACH_TRENDS)[number];
export const OUTREACH_TREND_LABEL: Record<OutreachTrend, string> = { up: "우상향", flat: "유지", down: "하락" };
export const OUTREACH_SOURCES = ["manual", "csv", "hashtag", "discovery"] as const;

/* ---------------- 핸들 ---------------- */

/** '@Jiyu_Beauty ' · 'https://www.instagram.com/jiyu_beauty/?hl=ko' · 'instagram.com/jiyu.beauty' → 'jiyu_beauty' · 형식 밖이면 null */
export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim();
  const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (m) v = m[1];
  v = v.replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(v)) return null;
  return v;
}

/** 줄바꿈·쉼표·공백·세미콜론으로 섞인 목록 → 정규화 핸들(중복 제거 · 순서 유지). 형식 밖은 `bad` 로 돌려준다 */
export function parseHandleList(text: string): { handles: string[]; bad: string[] } {
  const out: string[] = [];
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const tok of String(text ?? "").split(/[\s,;]+/)) {
    if (!tok) continue;
    const h = normalizeHandle(tok);
    if (!h) {
      bad.push(tok);
      continue;
    }
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return { handles: out, bad };
}

/* ---------------- CSV ---------------- */

export type OutreachCsvRow = {
  handle: string;
  /** 제공사 수집 시 (2단계) */
  ig_user_id?: string | null;
  name?: string | null;
  followers?: number | null;
  engagement_rate?: number | null;
  trend?: OutreachTrend | null;
  category?: string | null;
  female_pct?: number | null;
  age_20_40_pct?: number | null;
  kr_pct?: number | null;
};

const HEADER_ALIASES: Record<string, keyof OutreachCsvRow> = {
  handle: "handle", username: "handle", 핸들: "handle", 계정: "handle", 아이디: "handle", url: "handle", profile: "handle",
  name: "name", 이름: "name", 활동명: "name",
  followers: "followers", follower: "followers", 팔로워: "followers", 팔로워수: "followers",
  engagement: "engagement_rate", engagement_rate: "engagement_rate", er: "engagement_rate", 참여율: "engagement_rate",
  trend: "trend", 추세: "trend",
  category: "category", 카테고리: "category", niche: "category",
  female: "female_pct", female_pct: "female_pct", 여성: "female_pct", 여성비율: "female_pct",
  age_20_40: "age_20_40_pct", age_20_40_pct: "age_20_40_pct", "20_40": "age_20_40_pct", "2040": "age_20_40_pct", "20~40대": "age_20_40_pct",
  kr: "kr_pct", kr_pct: "kr_pct", korea: "kr_pct", 한국: "kr_pct", 한국비율: "kr_pct",
};

function num(v: string): number | null {
  const s = v.replace(/[,%\s]/g, "").replace(/k$/i, "000").replace(/만$/, "0000");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 퍼센트는 0~100 으로, 참여율은 소수(0.031) 또는 퍼센트(3.1) 둘 다 받아 소수로 */
function pct(v: string): number | null {
  const n = num(v);
  if (n === null) return null;
  return n <= 1 && v.includes(".") && !v.includes("%") ? Math.round(n * 1000) / 10 : Math.max(0, Math.min(100, n));
}
function rate(v: string): number | null {
  const n = num(v);
  if (n === null) return null;
  return n > 1 || v.includes("%") ? Math.round(n * 100) / 10000 : Math.round(n * 10000) / 10000;
}

/** 헤더 있는 CSV/TSV → 행. 핸들 없는 줄은 건너뛴다(`skipped`). 구분자는 첫 줄에서 탭·쉼표 중 많은 것 */
export function parseCsvRows(text: string): { rows: OutreachCsvRow[]; skipped: number; columns: string[] } {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0, columns: [] };
  const sep = (lines[0].match(/\t/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? "\t" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const keys = header.map((h) => HEADER_ALIASES[h] ?? null);
  const rows: OutreachCsvRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const r: Partial<OutreachCsvRow> = {};
    keys.forEach((k, i) => {
      const v = cells[i] ?? "";
      if (!k || !v) return;
      if (k === "handle") r.handle = normalizeHandle(v) ?? undefined;
      else if (k === "name" || k === "category") r[k] = v;
      else if (k === "followers") r.followers = num(v) === null ? null : Math.round(num(v)!);
      else if (k === "engagement_rate") r.engagement_rate = rate(v);
      else if (k === "trend") r.trend = /up|상승|우상/i.test(v) ? "up" : /down|하락/i.test(v) ? "down" : /flat|유지|보합/i.test(v) ? "flat" : null;
      else if (k === "female_pct" || k === "age_20_40_pct" || k === "kr_pct") r[k] = pct(v);
    });
    if (!r.handle) {
      skipped++;
      continue;
    }
    rows.push(r as OutreachCsvRow);
  }
  return { rows, skipped, columns: header };
}

/* ---------------- 적합 판정 ---------------- */

export type OutreachAudience = {
  female_pct?: number | null;
  age_20_40_pct?: number | null;
  kr_pct?: number | null;
  source?: string | null;
  /** 제공사 검색 조건으로 이미 걸러진 결과 — 비율 숫자가 없어도 세 조건 충족으로 본다 (outreach-providers) */
  filtered_by?: string | null;
};

export type OutreachFit = {
  /** 조건을 전부 알고 전부 충족 */
  ok: boolean;
  /** 충족한 조건 수 / 전체 */
  met: number;
  total: number;
  /** 0~100 — 충족 20점씩, 미확인 0점 */
  score: number;
  missing: string[];
  unknown: string[];
};

export function outreachFit(r: { followers?: number | null; trend?: string | null; audience?: OutreachAudience | null }): OutreachFit {
  const a = r.audience ?? {};
  const checks: { label: string; value: number | null | undefined; pass: (v: number) => boolean }[] = [
    { label: `팔로워 ${OUTREACH_FILTER.minFollowers / 10000}만↑`, value: r.followers, pass: (v) => v >= OUTREACH_FILTER.minFollowers },
    { label: `여성 ${OUTREACH_FILTER.femalePct}%↑`, value: a.female_pct, pass: (v) => v >= OUTREACH_FILTER.femalePct },
    { label: `20~40대 ${OUTREACH_FILTER.age2040Pct}%↑`, value: a.age_20_40_pct, pass: (v) => v >= OUTREACH_FILTER.age2040Pct },
    { label: `한국 ${OUTREACH_FILTER.krPct}%↑`, value: a.kr_pct, pass: (v) => v >= OUTREACH_FILTER.krPct },
  ];
  const missing: string[] = [];
  const unknown: string[] = [];
  let met = 0;
  const filtered = Boolean(a.filtered_by);
  checks.forEach((c, i) => {
    if (c.value === null || c.value === undefined) {
      // 제공사가 조건으로 걸러 준 결과 — 팔로워 구성 3개(i ≥ 1)는 숫자 없이도 충족
      if (filtered && i >= 1) met++;
      else unknown.push(c.label);
    } else if (c.pass(c.value)) met++;
    else missing.push(c.label);
  });
  const trendLabel = "반응 우상향/유지";
  if (!r.trend) unknown.push(trendLabel);
  else if ((OUTREACH_FILTER.trends as readonly string[]).includes(r.trend)) met++;
  else missing.push(trendLabel);
  const total = checks.length + 1;
  return { ok: met === total, met, total, score: Math.round((met / total) * 100), missing, unknown };
}

/* ---------------- DM 초안 ---------------- */

/** 개인화 DM 초안 — 운영자가 @sellery.official 에서 손으로 보낸다(자동 발송 아님). 500자 안팎 */
export function dmDraft(r: { handle: string; name?: string | null; category?: string | null }, landing = OEM_LANDING_URL): string {
  const who = (r.name ?? "").trim() || `@${r.handle}`;
  const cat = (r.category ?? "").trim();
  const catLine = cat ? `${cat} 콘텐츠 잘 보고 있어요. ` : "콘텐츠 잘 보고 있어요. ";
  return (
    `안녕하세요 ${who}님, ${BRAND_NAME}입니다. ${catLine}` +
    `남의 제품을 공구하는 대신, ${who}님만 팔 수 있는 세상에 하나뿐인 제품을 MYR 안에서 만들어 판매할 수 있어요. ` +
    `제조·재고·배송·CS는 전부 저희가 맡고, 사전예약으로 시작해서 재고 부담도 없습니다. ` +
    `소개 페이지 한 번 봐주세요 → ${landing}\n` +
    `관심 있으시면 답장 주시면 미팅 일정 잡아드릴게요 :)`
  );
}

/* ---------------- 파서 ---------------- */

export type OutreachCreator = {
  id: string;
  handle: string;
  ig_user_id: string | null;
  name: string | null;
  platform: string;
  followers: number | null;
  media_count: number | null;
  engagement_rate: number | null;
  trend: OutreachTrend | null;
  category: string | null;
  bio: string | null;
  audience: OutreachAudience | null;
  score: number | null;
  status: OutreachStatus;
  source: string;
  note: string | null;
  dm_draft: string | null;
  sent_at: string | null;
  replied_at: string | null;
  assigned_to: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function parseOutreachAudience(v: unknown): OutreachAudience | null {
  const o = obj(v);
  if (!o) return null;
  return { female_pct: numOrNull(o.female_pct), age_20_40_pct: numOrNull(o.age_20_40_pct), kr_pct: numOrNull(o.kr_pct), source: str(o.source), filtered_by: str(o.filtered_by) };
}

export function parseOutreachCreator(raw: unknown): OutreachCreator | null {
  const o = obj(raw);
  if (!o || typeof o.id !== "string" || typeof o.handle !== "string") return null;
  const st = str(o.status);
  const tr = str(o.trend);
  return {
    id: o.id,
    handle: o.handle,
    ig_user_id: str(o.ig_user_id),
    name: str(o.name),
    platform: str(o.platform) ?? "instagram",
    followers: numOrNull(o.followers),
    media_count: numOrNull(o.media_count),
    engagement_rate: numOrNull(o.engagement_rate),
    trend: tr === "up" || tr === "flat" || tr === "down" ? tr : null,
    category: str(o.category),
    bio: str(o.bio),
    audience: parseOutreachAudience(o.audience),
    score: numOrNull(o.score),
    status: isOutreachStatus(st) ? st : "candidate",
    source: str(o.source) ?? "manual",
    note: str(o.note),
    dm_draft: str(o.dm_draft),
    sent_at: str(o.sent_at),
    replied_at: str(o.replied_at),
    assigned_to: str(o.assigned_to),
    last_checked_at: str(o.last_checked_at),
    created_at: str(o.created_at) ?? "",
    updated_at: str(o.updated_at) ?? "",
  };
}

export type OutreachEvent = { id: string; kind: string; body: string | null; actor: string | null; created_at: string };
export function parseOutreachEvents(raw: unknown): OutreachEvent[] {
  return (Array.isArray(raw) ? raw : [])
    .map((x) => obj(x))
    .filter((o): o is Obj => o !== null && typeof o.id === "string")
    .map((o) => ({ id: o.id as string, kind: str(o.kind) ?? "note", body: str(o.body), actor: str(o.actor), created_at: str(o.created_at) ?? "" }));
}

export const OUTREACH_EVENT_LABEL: Record<string, string> = { collected: "수집", status: "상태 변경", note: "메모", dm_sent: "DM 발송", reply: "답장", edit: "지표 수정" };

/** 프로필 링크 */
export function profileUrl(handle: string, platform = "instagram"): string {
  if (platform === "youtube") return `https://www.youtube.com/@${handle}`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  return `https://www.instagram.com/${handle}/`;
}
