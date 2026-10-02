/**
 * 등급 월간 재계산 결과 — 순수 모듈 (DB 호출은 `server/grade-tick.server.ts`).
 *
 * 0032 `app_grade_recalc_all` 의 jsonb 를 타입으로 좁힌다. 재계산 규칙은 DB 가 한다
 * (`app_seller_grade_recalc`(0020) · `app_brand_grade_recalc`(0019) → 트리거 `sellers_sync_grade`(0001)).
 *
 * 운영 결정(2026-10-02): 매월 1일 전원 재계산 · 판매가 끊기면 강등. 지급은 정산 실행 시점 등급
 * (등급 보너스는 플랫폼 부담이라 브랜드 계약을 깨지 않는다 — docs/settlement-policy.md §1).
 */

export type GradeTickResult = {
  ok: true;
  today: string;
  /** `m3_sales_base` 가 0 이라 보정한 행 수 — 0 이 정상. 계속 >0 이면 이관 경로를 봐야 한다(0032 주석). */
  baseBackfilled: number;
  sellers: number;
  brands: number;
  sellersChanged: number;
  brandsChanged: number;
  /** "s1 다이아→플래티넘" 형태 (최대 200개). 강등인지 승급인지가 운영에 중요하다. */
  changedSellers: string[];
  changedBrands: string[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** `app_grade_recalc_all` 의 반환값. `ok` 가 아니면 null — 호출자가 500 으로 알린다. */
export function parseGradeTickResult(json: unknown): GradeTickResult | null {
  const o = obj(json);
  if (!o || o.ok !== true) return null;
  return {
    ok: true,
    today: typeof o.today === "string" ? o.today : "",
    baseBackfilled: num(o.base_backfilled),
    sellers: num(o.sellers),
    brands: num(o.brands),
    sellersChanged: num(o.sellers_changed),
    brandsChanged: num(o.brands_changed),
    changedSellers: strs(o.changed_sellers),
    changedBrands: strs(o.changed_brands),
  };
}
