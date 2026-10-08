// 공유 잔액 가드 — packages/payments/src/payout-rules.ts checkPayoutGuard (2026-10-08 launch-prep). 지급대행 상점 peerkeamf5 는 다른 서비스와 잔액을 공유하므로
// 셀러리는 ① 토스 잔액 ② 셀러리 지급 대기 합계 ③ 하루 상한(platform_settings.payout_daily_cap) 안에서만 요청하고, 하나라도 걸리면 배치 전체를 거절한다.
import { describe, expect, it } from "vitest";
import { checkPayoutGuard, countsTowardDailyCap, kstDayStartIso, normalizeDailyCap, PAYOUT_DAILY_CAP_DEFAULT, sumAmounts } from "../payout-rules";

describe("normalizeDailyCap", () => {
  it("없음 · 0 · 음수 · 문자열 쓰레기는 기본 5,000,000 · 숫자/숫자 문자열은 반올림", () => {
    expect(normalizeDailyCap(undefined)).toBe(PAYOUT_DAILY_CAP_DEFAULT);
    expect(normalizeDailyCap(null)).toBe(PAYOUT_DAILY_CAP_DEFAULT);
    expect(normalizeDailyCap(0)).toBe(PAYOUT_DAILY_CAP_DEFAULT);
    expect(normalizeDailyCap(-1)).toBe(PAYOUT_DAILY_CAP_DEFAULT);
    expect(normalizeDailyCap("abc")).toBe(PAYOUT_DAILY_CAP_DEFAULT);
    expect(normalizeDailyCap("3000000")).toBe(3_000_000);
    expect(normalizeDailyCap(1234.6)).toBe(1235);
  });
});

describe("checkPayoutGuard", () => {
  const base = { batchTotal: 1_000_000, queueTotal: 3_000_000, available: 10_000_000, requestedToday: 0, dailyCap: 5_000_000 };

  it("정상 — 잔액·큐·상한 안이면 ok · 남은 한도 = 상한 − 오늘 − 이번", () => {
    expect(checkPayoutGuard(base)).toEqual({ ok: true, remainingToday: 4_000_000 });
    expect(checkPayoutGuard({ ...base, requestedToday: 3_500_000, batchTotal: 1_500_000 })).toEqual({ ok: true, remainingToday: 0 });
  });

  it("QUEUE_EXCEEDED — 배치가 셀러리 지급 대기 합계를 넘으면(잔액이 충분해도) 거절", () => {
    const r = checkPayoutGuard({ ...base, batchTotal: 3_000_001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("QUEUE_EXCEEDED");
    // 큐 합계와 같은 금액은 통과(전체 대기 요청)
    expect(checkPayoutGuard({ ...base, batchTotal: 3_000_000 }).ok).toBe(true);
  });

  it("BALANCE_UNKNOWN — 잔액 조회 실패(null · NaN)면 요청하지 않는다", () => {
    const r = checkPayoutGuard({ ...base, available: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BALANCE_UNKNOWN");
    expect((checkPayoutGuard({ ...base, available: Number.NaN }) as { code: string }).code).toBe("BALANCE_UNKNOWN");
  });

  it("BALANCE_EXCEEDED — 배치가 토스 지급 가능 잔액(공유)을 넘으면 거절 · 같으면 통과", () => {
    const r = checkPayoutGuard({ ...base, available: 999_999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BALANCE_EXCEEDED");
    expect(checkPayoutGuard({ ...base, available: 1_000_000 }).ok).toBe(true);
  });

  it("DAILY_CAP_EXCEEDED — 오늘 요청 + 이번이 상한을 넘으면 거절 · 메시지에 남은 한도", () => {
    const r = checkPayoutGuard({ ...base, requestedToday: 4_500_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("DAILY_CAP_EXCEEDED");
      expect(r.remainingToday).toBe(500_000);
      expect(r.message).toContain("₩500,000");
      expect(r.message).toContain("payout-cap");
    }
    // 딱 상한까지는 통과
    expect(checkPayoutGuard({ ...base, requestedToday: 4_000_000 }).ok).toBe(true);
  });

  it("상한이 없으면 기본 5,000,000 · 오늘 이미 상한을 넘겼으면 남은 한도 0", () => {
    const r = checkPayoutGuard({ ...base, dailyCap: undefined, batchTotal: 5_000_001, queueTotal: 9_000_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DAILY_CAP_EXCEEDED");
    const r2 = checkPayoutGuard({ ...base, dailyCap: null, requestedToday: 7_000_000, batchTotal: 1 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.remainingToday).toBe(0);
  });

  it("검사 순서 — 큐 → 잔액 → 상한 (큐 초과는 잔액 몰라도 QUEUE_EXCEEDED)", () => {
    const r = checkPayoutGuard({ ...base, batchTotal: 4_000_000, available: null, requestedToday: 5_000_000 });
    expect((r as { code: string }).code).toBe("QUEUE_EXCEEDED");
  });
});

describe("countsTowardDailyCap · sumAmounts · kstDayStartIso", () => {
  it("REQUESTED · IN_PROGRESS · COMPLETED 만 오늘 합계에 — 취소·거절·실패·삭제·없음은 제외", () => {
    expect(countsTowardDailyCap("REQUESTED")).toBe(true);
    expect(countsTowardDailyCap("IN_PROGRESS")).toBe(true);
    expect(countsTowardDailyCap("COMPLETED")).toBe(true);
    for (const s of ["CANCELED", "REJECTED", "FAILED", "DELETED", null, undefined, ""]) expect(countsTowardDailyCap(s)).toBe(false);
  });
  it("sumAmounts — 숫자 아닌 값은 0 · 반올림", () => {
    expect(sumAmounts([{ amount: 100 }, { amount: null }, { amount: undefined }, { amount: 0.4 }, { amount: Number.NaN }])).toBe(100);
  });
  it("kstDayStartIso — KST 자정을 UTC 로 (전날 15:00Z)", () => {
    expect(kstDayStartIso(new Date("2026-10-08T03:00:00Z"))).toBe("2026-10-07T15:00:00.000Z"); // KST 10-08 12:00
    expect(kstDayStartIso(new Date("2026-10-07T16:00:00Z"))).toBe("2026-10-07T15:00:00.000Z"); // KST 10-08 01:00
    expect(kstDayStartIso(new Date("2026-10-07T14:00:00Z"))).toBe("2026-10-06T15:00:00.000Z"); // KST 10-07 23:00
  });
});
