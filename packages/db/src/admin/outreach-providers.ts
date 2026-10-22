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

export const OUTREACH_PROVIDERS = ["meta", "modash"] as const;
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

/* ============================================================
 * 2호 어댑터 — Meta **Instagram Creator Marketplace API** (공식 · 무료 · 2025-10 공개)
 *   GET https://graph.facebook.com/v25.0/<IG_USER_ID>/creator_marketplace_creators?…  (Page access token · 브랜드 IG 비즈니스 계정에 연결된 페이지)
 *   권한 `instagram_creator_marketplace_discovery`(App Review 로 Advanced Access — Standard 는 모의 데이터) · instagram_basic · pages_show_list · pages_manage_metadata · business_management
 *   필터: creator_min_followers · major_audience_gender · major_audience_age_bucket · major_audience_countries · creator_follower_growth · reels_interaction_rate …
 *   응답: username · biography · category · insights(total_followers · creator_engaged_accounts breakdown gender/age/top_countries · reels_interaction_rate)
 *   "major_*" 는 '가장 큰 버킷' 조건이라 우리 임계(여성 60% · 20~40대 80% · 한국 80%)는 **응답 분포로 다시 거른다**(outreachFit).
 *   분포는 참여 계정(engaged accounts) 기준 — 팔로워 분포의 근사. audience.source = 'meta:engaged'.
 *   docs: developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/creator-marketplace
 * ============================================================ */

export const META_GRAPH_VERSION = "v25.0";
export const META_CREATOR_FIELDS =
  "id,username,biography,category,profile_picture_url,is_account_verified,insights.metric(total_followers,reels_interaction_rate,creator_engaged_accounts).breakdown(gender,age,top_countries)";

export type MetaCreatorSearchOptions = { after?: string | null; limit?: number };

/** 대표 조건 → 쿼리 파라미터. 모의/실데이터 모두 같은 모양 */
export function metaCreatorSearchParams(o: MetaCreatorSearchOptions = {}): URLSearchParams {
  const q = new URLSearchParams();
  q.set("creator_min_followers", String(OUTREACH_FILTER.minFollowers));
  q.set("major_audience_gender", "female");
  q.set("major_audience_countries", "KR");
  q.set("creator_countries", "KR");
  q.set("creator_latest_post_activity", "L90");
  q.set("exclude_messaged_creators", "true");
  q.set("limit", String(o.limit ?? 25));
  q.set("fields", META_CREATOR_FIELDS);
  if (o.after) q.set("after", o.after);
  return q;
}

/** insights 배열 [{name, period, values:[{value, breakdown?}]}] 또는 {data:[…]} 에서 metric 하나 꺼내기 */
function metricOf(insights: unknown, name: string): Obj | null {
  const list = Array.isArray(insights) ? insights : (obj(insights)?.data as unknown);
  for (const x of Array.isArray(list) ? list : []) {
    const o = obj(x);
    if (o && (str(o.name) === name || str(o.metric) === name)) return o;
  }
  return null;
}
function metricValue(m: Obj | null): number | null {
  if (!m) return null;
  const direct = num(m.value) ?? num(m.total_value);
  if (direct !== null) return direct;
  const vals = Array.isArray(m.values) ? m.values : [];
  const first = obj(vals[0]);
  return num(first?.value) ?? num(obj(first?.value)?.value) ?? null;
}
/** breakdown 결과를 {key: 비율%} 로 — 다양한 모양(results[{dimension_values,value}] · 객체 맵) 허용 */
function breakdownPct(m: Obj | null, dimension: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!m) return out;
  const total = num(m.total_value) ?? null;
  const tv = obj(m.total_value);
  const breakdowns = Array.isArray(tv?.breakdowns) ? tv!.breakdowns : Array.isArray(m.breakdowns) ? m.breakdowns : [];
  let found: unknown = null;
  for (const b of breakdowns) {
    const bo = obj(b);
    const keys = Array.isArray(bo?.dimension_keys) ? bo!.dimension_keys : [];
    if (keys.map(String).includes(dimension)) found = bo?.results;
  }
  if (!found) {
    // 단순 모양: m.<dimension> = { FEMALE: 0.7 } 또는 m.breakdown[dimension]
    const direct = obj(m[dimension]) ?? obj(obj(m.breakdown)?.[dimension]) ?? obj(obj((Array.isArray(m.values) ? m.values : [])[0])?.[dimension]);
    if (direct) {
      const sum = Object.values(direct).reduce<number>((a, v) => a + (num(v) ?? 0), 0);
      for (const [k, v] of Object.entries(direct)) {
        const n = num(v);
        if (n === null) continue;
        out[k.toUpperCase()] = sum > 0 && sum > 1.5 ? Math.round((n / sum) * 1000) / 10 : Math.round(n * 1000) / 10;
      }
      return out;
    }
    return out;
  }
  const rows = (Array.isArray(found) ? found : []).map((r) => obj(r)).filter((r): r is Obj => r !== null);
  const sum = rows.reduce((a, r) => a + (num(r.value) ?? 0), 0);
  const denom = total && total > 0 ? total : sum;
  for (const r of rows) {
    const dv = Array.isArray(r.dimension_values) ? r.dimension_values : [];
    const key = String(dv[0] ?? "").toUpperCase();
    const v = num(r.value);
    if (!key || v === null || !denom) continue;
    out[key] = Math.round((v / denom) * 1000) / 10;
  }
  return out;
}

/** 크리에이터 마켓플레이스 응답 → 후보 행 (+ 다음 커서) */
export function parseMetaCreators(json: unknown): { rows: ProviderRow[]; after: string | null; error: string | null } {
  const o = obj(json);
  if (!o) return { rows: [], after: null, error: "응답이 비었어요" };
  const err = obj(o.error);
  if (err) return { rows: [], after: null, error: `${str(err.message) ?? "Graph API 오류"}${err.code ? ` (code ${err.code})` : ""}` };
  const rows: ProviderRow[] = [];
  for (const it of Array.isArray(o.data) ? o.data : []) {
    const c = obj(it);
    if (!c) continue;
    const handle = normalizeHandle(str(c.username) ?? "");
    if (!handle) continue;
    const ins = c.insights;
    const followers = metricValue(metricOf(ins, "total_followers"));
    const er = metricValue(metricOf(ins, "reels_interaction_rate"));
    const engaged = metricOf(ins, "creator_engaged_accounts");
    const g = breakdownPct(engaged, "gender");
    const ages = breakdownPct(engaged, "age");
    const geo = breakdownPct(engaged, "top_countries");
    const female = g.FEMALE ?? g.F ?? null;
    const bands = ["18-24", "25-34", "35-44"].map((b) => ages[b] ?? 0);
    const age2040 = bands.some((b) => b > 0) ? Math.round(bands.reduce((x, y) => x + y, 0) * 10) / 10 : null;
    const kr = geo.KR ?? null;
    const growth = num(c.creator_follower_growth);
    rows.push({
      handle,
      ig_user_id: str(c.id),
      name: str(c.name) ?? null,
      category: str(c.category) ?? null,
      followers: followers === null ? null : Math.round(followers),
      engagement_rate: er === null ? null : er > 1 ? Math.round(er * 100) / 10000 : Math.round(er * 10000) / 10000,
      trend: growth === null ? null : growth > 0.02 ? "up" : growth >= -0.02 ? "flat" : "down",
      picture: str(c.profile_picture_url),
      audience: { source: "meta:engaged", female_pct: female, age_20_40_pct: age2040, kr_pct: kr, filtered_by: female === null && age2040 === null && kr === null ? "meta" : null },
    });
  }
  const after = str(obj(obj(o.paging)?.cursors)?.after);
  return { rows, after, error: null };
}
