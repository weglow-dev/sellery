/**
 * 상품별 실적 표 규칙(`partner/performance-rules.ts`) 테스트 — 파서 · 잠금 계약 · 문구.
 * 게이트 판정(확인권·첫 행·내 캠페인)은 DB(0039)가 하므로 여기서는 "잠긴 행의 값을 버리는지" 만 본다.
 */
import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_ME,
  dataPassCta,
  lockedNote,
  parsePerformance,
  periodLabel,
  type PerformanceRow,
} from "../partner/performance-rules";

function payload(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    has_pass: false,
    price_cel: 2,
    campaigns: 3,
    sold_qty: 120,
    locked: 1,
    rows: [
      {
        rank: 1,
        is_me: false,
        open: true,
        status: "SETTLED",
        followers: 126000,
        likes_avg: 4200,
        engagement: 3.3,
        start_date: "2026-09-01",
        end_date: "2026-09-07",
        net: 8_500_000,
        sold_qty: 80,
      },
      {
        rank: 2,
        is_me: true,
        open: true,
        status: "LIVE",
        followers: 84300,
        likes_avg: 3100,
        engagement: 3.7,
        start_date: "2026-10-01",
        end_date: "2026-10-05",
        net: 1_315_600,
        sold_qty: 40,
      },
      {
        // 잠긴 행 — DB 는 null 로 보내지만 값이 섞여 들어온 경우를 시험한다
        rank: 3,
        is_me: false,
        open: false,
        status: "CLEARING",
        followers: 210000,
        likes_avg: 12800,
        engagement: 6.1,
        start_date: "2026-08-01",
        end_date: "2026-08-07",
        net: 20_000_000,
        sold_qty: 150,
      },
    ],
    ...over,
  };
}

describe("parsePerformance", () => {
  it("집계·확인권·가격을 좁힌다", () => {
    const v = parsePerformance(payload())!;
    expect(v.hasPass).toBe(false);
    expect(v.priceCel).toBe(2);
    expect(v.campaigns).toBe(3);
    expect(v.soldQty).toBe(120);
    expect(v.locked).toBe(1);
    expect(v.rows).toHaveLength(3);
  });

  it("**잠긴 행의 지표를 버린다** — DB 가 담아 보내도 파서가 막는다", () => {
    const locked = parsePerformance(payload())!.rows.find((r) => !r.open)!;
    expect(locked.followers).toBeNull();
    expect(locked.likesAvg).toBeNull();
    expect(locked.engagement).toBeNull();
    expect(locked.net).toBeNull();
    expect(locked.startDate).toBeNull();
    expect(locked.soldQty).toBeNull();
    // 상태와 순위는 잠겨도 보인다 (몇 건이 있는지는 알려준다)
    expect(locked.status).toBe("CLEARING");
    expect(locked.rank).toBe(3);
  });

  it("열린 행은 지표를 유지한다", () => {
    const open = parsePerformance(payload())!.rows[0];
    expect(open.followers).toBe(126000);
    expect(open.engagement).toBe(3.3);
    expect(open.net).toBe(8_500_000);
  });

  it("내 캠페인은 isMe · 확인권 없이도 열린다", () => {
    const me = parsePerformance(payload())!.rows.find((r) => r.isMe)!;
    expect(me.open).toBe(true);
    expect(me.net).toBe(1_315_600);
  });

  it("확인권이 있으면 전부 열린다", () => {
    const v = parsePerformance(
      payload({ has_pass: true, locked: 0, rows: [{ rank: 1, open: true, followers: 1, net: 2, status: "LIVE" }] }),
    )!;
    expect(v.hasPass).toBe(true);
    expect(v.rows[0].followers).toBe(1);
  });

  it("rank 가 없는 행은 버린다", () => {
    const v = parsePerformance(payload({ rows: [{ open: true }, { rank: 2, open: true }] }))!;
    expect(v.rows.map((r) => r.rank)).toEqual([2]);
  });

  it("ok 가 아니면 null · 가격이 0이면 기본 2", () => {
    expect(parsePerformance({ ok: false })).toBeNull();
    expect(parsePerformance(null)).toBeNull();
    expect(parsePerformance({ ok: true, price_cel: 0 })!.priceCel).toBe(2);
  });

  it("rows 가 없으면 빈 배열", () => {
    expect(parsePerformance({ ok: true })!.rows).toEqual([]);
  });
});

describe("문구", () => {
  it("확인권 CTA 에 가격이 들어간다", () => {
    const v = parsePerformance(payload())!;
    expect(dataPassCta(v)).toContain("🥬 2");
    expect(dataPassCta(v)).toContain("전체 실적");
  });

  it("잠긴 안내는 건수와 '영구 적용' 을 알린다", () => {
    const note = lockedNote(parsePerformance(payload())!)!;
    expect(note).toContain("1건");
    expect(note).toContain("영구");
  });

  it("잠긴 게 없으면 안내가 없다", () => {
    expect(lockedNote(parsePerformance(payload({ locked: 0 }))!)).toBeNull();
  });

  it("MY 배지", () => {
    expect(PERFORMANCE_ME).toBe("MY");
  });
});

describe("periodLabel", () => {
  const row = (s: string | null, e: string | null): PerformanceRow => ({
    rank: 1, isMe: false, open: true, status: "LIVE",
    followers: null, likesAvg: null, engagement: null,
    startDate: s, endDate: e, net: null, soldQty: null,
  });

  it("M/D–M/D 로 줄인다 — 0 을 떼고", () => {
    expect(periodLabel(row("2026-09-01", "2026-09-07"))).toBe("9/1–9/7");
    expect(periodLabel(row("2026-10-15", "2026-11-03"))).toBe("10/15–11/3");
  });

  it("일정이 없으면 — (확정 전이거나 잠긴 행)", () => {
    expect(periodLabel(row(null, null))).toBe("—");
    expect(periodLabel(row("2026-09-01", null))).toBe("—");
  });
});
