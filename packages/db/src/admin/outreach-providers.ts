/**
 * 크리에이터 아웃리치 — 외부 데이터 제공사 어댑터(순수). HTTP 는 `../server/admin/outreach-collect.server.ts`.
 *
 * 왜 제공사인가: 인스타그램 공식 API 는 남의 팔로워 성별·연령·국가를 주지 않는다. 그 추정값을 가진 곳은 인플루언서 데이터 제공사뿐이고,
 * 대표 조건(팔로워 5만↑ · 여성 60%↑ · 20~40대 80%↑ · 한국 80%↑ · 반응 우상향/유지)을 **검색 조건으로 그대로 보내서** 걸러진 결과만 받는다.
 * 1호 어댑터 = Modash Discovery API (`POST https://api.modash.io/v1/instagram/search` · Bearer 토큰 · 페이지당 ≤15건 · 0.01 크레딧/건).
 *   - 응답 항목 스키마는 문서에서 접혀 있어(2026-10-22) `parseModashSearch` 는 `profile.*` 또는 평면 키 둘 다 받는다. 키가 들어오면 실제 응답으로 한 번 맞춘다.
 *   - 검색 조건이 이미 걸러 주므로 결과의 `audience.filtered_by = 'modash'` — 비율 숫자가 안 와도 `outreachFit` 이 충족으로 친다.
 */
import { OUTREACH_FILTER, normalizeHandle, type OutreachAudience, type OutreachCsvRow, type OutreachTrend } from "./outreach-rules";

export const OUTREACH_PROVIDERS = ["modash"] as const;
export type OutreachProvider = (typeof OUTREACH_PROVIDERS)[number];

export type ModashSearchOptions = {
  page?: number;
  /** Modash location id for South Korea (lookup `/v1/instagram/locations?query=Korea`) */
  krLocationId: number | string;
  /** 'i6months' 등 — 반응 추세 필터 (followersGrowthRate) */
  growthInterval?: string;
};

/** 대표 조건 → Modash 검색 본문. 연령 밴드는 Modash 기준(18-24 · 25-34 · 35-44) 합이 20~40대 80% 에 해당 */
export function modashSearchBody(o: ModashSearchOptions): Record<string, unknown> {
  return {
    page: o.page ?? 0,
    calculationMethod: "median",
    sort: { field: "followers", direction: "desc" },
    filter: {
      influencer: {
        followers: { min: OUTREACH_FILTER.minFollowers },
        // 반응 우상향/유지: 최근 6개월 팔로워 성장률이 0 이상
        followersGrowthRate: { interval: o.growthInterval ?? "i6months", value: 0, operator: "gte" },
        lastposted: 90,
      },
      audience: {
        location: [{ id: o.krLocationId, weight: OUTREACH_FILTER.krPct / 100 }],
        gender: { id: "FEMALE", weight: OUTREACH_FILTER.femalePct / 100 },
        age: [
          { id: "18-24", weight: 0.2 },
          { id: "25-34", weight: 0.3 },
          { id: "35-44", weight: 0.2 },
        ],
      },
    },
  };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** weight 배열 → 코드별 % (0.72 → 72) */
function weights(list: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of Array.isArray(list) ? list : []) {
    const o = obj(x);
    if (!o) continue;
    const code = str(o.code) ?? str(o.id) ?? str(o.name);
    const w = num(o.weight);
    if (code && w !== null) out[code.toUpperCase()] = Math.round(w * 1000) / 10;
  }
  return out;
}

/** 응답의 audience 블록(있을 때) → 우리 audience. 없으면 filtered_by 만 */
export function modashAudience(src: unknown): OutreachAudience {
  const a = obj(src);
  const out: OutreachAudience & { filtered_by?: string } = { source: "modash", filtered_by: "modash" };
  if (!a) return out;
  const g = weights(a.genders ?? a.gender);
  if (g.FEMALE !== undefined) out.female_pct = g.FEMALE;
  const ages = weights(a.ages ?? a.age);
  const bands = ["18-24", "25-34", "35-44"].map((b) => ages[b.toUpperCase()] ?? 0);
  if (bands.some((b) => b > 0)) out.age_20_40_pct = Math.round(bands.reduce((x, y) => x + y, 0) * 10) / 10;
  const geo = weights(a.geoCountries ?? a.countries ?? a.location);
  const kr = geo.KR ?? geo["SOUTH KOREA"] ?? geo["KOREA, REPUBLIC OF"] ?? geo["KOREA"];
  if (kr !== undefined) out.kr_pct = kr;
  return out;
}

export type ProviderRow = OutreachCsvRow & { ig_user_id?: string | null; audience?: OutreachAudience | null; picture?: string | null };

/** Modash 검색 응답 → 후보 행. `directs` 와 `lookalikes` 둘 다(직접 매치 먼저). 핸들이 없으면 버린다 */
export function parseModashSearch(json: unknown): { rows: ProviderRow[]; total: number; error: string | null } {
  const o = obj(json);
  if (!o) return { rows: [], total: 0, error: "응답이 비었어요" };
  if (o.error === true) return { rows: [], total: 0, error: str(o.message) ?? str(o.code) ?? "제공사 오류" };
  const items = [...(Array.isArray(o.directs) ? o.directs : []), ...(Array.isArray(o.lookalikes) ? o.lookalikes : [])];
  const rows: ProviderRow[] = [];
  for (const it of items) {
    const item = obj(it);
    if (!item) continue;
    const p = obj(item.profile) ?? item;
    const handle = normalizeHandle(str(p.username) ?? str(p.handle) ?? "");
    if (!handle) continue;
    const growth = num(p.followersGrowthRate) ?? num(obj(p.stats ?? {})?.followersGrowthRate);
    const trend: OutreachTrend | null = growth === null ? null : growth > 0.02 ? "up" : growth >= -0.02 ? "flat" : "down";
    rows.push({
      handle,
      ig_user_id: str(p.userId) ?? str(item.userId) ?? null,
      name: str(p.fullname) ?? str(p.fullName) ?? null,
      followers: num(p.followers) === null ? null : Math.round(num(p.followers)!),
      engagement_rate: num(p.engagementRate),
      trend,
      picture: str(p.picture) ?? null,
      audience: modashAudience(item.audience ?? p.audience),
    });
  }
  return { rows, total: num(o.total) ?? rows.length, error: null };
}

/** `/v1/instagram/locations?query=Korea` 응답에서 한국 id — 이름에 Korea 가 들어가고 North 가 아닌 첫 항목 */
export function pickKoreaLocationId(json: unknown): number | string | null {
  const list = Array.isArray(json) ? json : (obj(json)?.locations ?? obj(json)?.data);
  for (const x of Array.isArray(list) ? list : []) {
    const o = obj(x);
    const name = `${str(o?.name) ?? ""} ${str(o?.title) ?? ""}`.toLowerCase();
    if (name.includes("korea") && !name.includes("north")) return (o?.id as number | string) ?? null;
  }
  return null;
}
