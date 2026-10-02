/**
 * 등급 월간 재계산 결과 파서(`grade-tick.ts`) 테스트.
 * 재계산 규칙은 DB(0032 · 0020 · 0019)가 하므로 여기서는 jsonb → 타입 변환만 검증한다.
 */
import { describe, expect, it } from "vitest";
import { parseGradeTickResult } from "../grade-tick";

const ok = {
  ok: true,
  today: "2026-10-01",
  base_backfilled: 0,
  sellers: 8,
  brands: 2,
  sellers_changed: 1,
  brands_changed: 0,
  changed_sellers: ["s4 다이아→브론즈"],
  changed_brands: [],
};

describe("parseGradeTickResult", () => {
  it("정상 응답을 좁힌다", () => {
    expect(parseGradeTickResult(ok)).toEqual({
      ok: true,
      today: "2026-10-01",
      baseBackfilled: 0,
      sellers: 8,
      brands: 2,
      sellersChanged: 1,
      brandsChanged: 0,
      changedSellers: ["s4 다이아→브론즈"],
      changedBrands: [],
    });
  });

  it("변경 목록은 방향을 담는다 — 강등인지 승급인지가 운영에 중요하다", () => {
    const r = parseGradeTickResult({ ...ok, changed_sellers: ["s4 다이아→브론즈", "s1 골드→플래티넘"] })!;
    expect(r.changedSellers[0]).toContain("다이아→브론즈");
    expect(r.changedSellers[1]).toContain("골드→플래티넘");
  });

  it("base_backfilled 는 0 이 정상 — >0 이면 이관 경로 점검 신호다", () => {
    expect(parseGradeTickResult({ ...ok, base_backfilled: 8 })!.baseBackfilled).toBe(8);
  });

  it("ok 가 아니면 null — 라우트가 500 으로 알린다(조용히 성공 처리하지 않는다)", () => {
    expect(parseGradeTickResult({ ok: false, code: "DB_ERROR" })).toBeNull();
    expect(parseGradeTickResult(null)).toBeNull();
    expect(parseGradeTickResult([])).toBeNull();
  });

  it("숫자가 아니면 0 · 배열이 아니면 빈 배열 — NaN/undefined 를 로그에 흘리지 않는다", () => {
    const r = parseGradeTickResult({ ok: true, sellers: "여덟", changed_sellers: "s4" })!;
    expect(r.sellers).toBe(0);
    expect(r.changedSellers).toEqual([]);
    expect(r.today).toBe("");
  });

  it("배열 안의 비문자열은 버린다", () => {
    const r = parseGradeTickResult({ ...ok, changed_sellers: ["s4 다이아→브론즈", 42, null] })!;
    expect(r.changedSellers).toEqual(["s4 다이아→브론즈"]);
  });
});
