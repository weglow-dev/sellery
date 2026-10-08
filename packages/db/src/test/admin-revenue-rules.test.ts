import { describe, expect, it } from "vitest";
import {
  OPEX_FALLBACK,
  OPEX_KEYS,
  opexBreakdown,
  parseAdminRevenue,
  parseOpex,
  profitSummary,
} from "../admin/revenue-rules";

describe("parseOpex — 모르는 키 · 음수 · 문자열을 버린다 (0022 app_admin_save_opex 와 같은 규칙)", () => {
  it("아는 키만 남고 나머지는 0", () => {
    const o = parseOpex({ server: 99000, db: "35000", cs: -500, domain: null, 해킹: 9999 });
    expect(o.server).toBe(99000);
    expect(o.db).toBe(35000); // 숫자로 바뀌는 문자열은 받는다
    expect(o.cs).toBe(0); // 음수 → 0
    expect(o.domain).toBe(0);
    expect(Object.keys(o).sort()).toEqual([...OPEX_KEYS].sort());
  });

  it("객체가 아니면 전부 0", () => {
    for (const bad of [null, undefined, [], "x", 3]) {
      const o = parseOpex(bad);
      expect(Object.values(o).every((v) => v === 0)).toBe(true);
    }
  });

  it("소수는 반올림", () => {
    expect(parseOpex({ server: 1499.6 }).server).toBe(1500);
  });
});

describe("opexBreakdown — 데모 varCost · fixedTotal 과 같은 식", () => {
  const base = { opex: OPEX_FALLBACK, orders: 1052, sellers: 8, inferences: 12, celCover: 60000 };

  it("고정비 = 서버+DB+CS+도메인+기타", () => {
    expect(opexBreakdown(base).fixed).toBe(30000 + 35000 + 50000 + 15000 + 30000);
  });

  it("알림톡 = 단가 × 주문 × 3 (결제·배송·정산)", () => {
    expect(opexBreakdown(base).kakao).toBe(15 * 1052 * 3);
  });

  it("Claude = 크롤링(명 × 30일) + 추론(건)", () => {
    expect(opexBreakdown(base).claude).toBe(120 * 8 * 30 + 300 * 12);
  });

  it("변동비에 celCover 가 들어간다 — 🥬 샘플값을 브랜드에 원화로 지급한 플랫폼 비용", () => {
    const b = opexBreakdown(base);
    expect(b.celCover).toBe(60000);
    expect(b.variable).toBe(b.kakao + b.claude + b.pgFixed + 60000);
    expect(b.total).toBe(b.fixed + b.variable);
  });

  it("celCover 음수는 0 으로", () => {
    expect(opexBreakdown({ ...base, celCover: -1 }).celCover).toBe(0);
  });

  it("건수가 0 이면 변동비는 PG 고정비 + celCover 뿐", () => {
    const b = opexBreakdown({ opex: OPEX_FALLBACK, orders: 0, sellers: 0, inferences: 0, celCover: 0 });
    expect(b.kakao).toBe(0);
    expect(b.claude).toBe(0);
    expect(b.variable).toBe(OPEX_FALLBACK.pgFixed);
  });
});

describe("profitSummary", () => {
  it("최종 순이익 = 플랫폼 순수익 − 운영비", () => {
    expect(profitSummary(16576850, 980785, 500000).finalNet).toBe(480785);
  });

  it("순수익보다 운영비가 크면 음수", () => {
    expect(profitSummary(1000000, 50000, 500000).finalNet).toBe(-450000);
  });

  it("손익분기 월 GMV = 운영비 ÷ 순 테이크레이트", () => {
    const p = profitSummary(16576850, 980785, 500000);
    expect(p.takeRate).toBeCloseTo(0.05916, 4);
    expect(p.breakEvenGmv).toBe(Math.round(500000 / (980785 / 16576850)));
  });

  it("매출 0 이면 테이크레이트·운영비율·손익분기를 계산하지 않는다", () => {
    const p = profitSummary(0, 0, 500000);
    expect(p.takeRate).toBeNull();
    expect(p.breakEvenGmv).toBeNull();
    expect(p.opexRatio).toBeNull();
    expect(p.finalNet).toBe(-500000);
  });

  it("순수익이 0 이하면 손익분기를 계산하지 않는다 (0 으로 나누지 않는다)", () => {
    expect(profitSummary(1000000, 0, 500000).breakEvenGmv).toBeNull();
    expect(profitSummary(1000000, -100, 500000).breakEvenGmv).toBeNull();
  });
});

describe("parseAdminRevenue", () => {
  const raw = {
    ok: true,
    totals: { gross: 17190450, refunds: 613600, net: 16576850, sample_net: 75650, platform_net: 980785, paid_count: 487 },
    rows: [
      { campaign_id: "a", campaign_code: "c1", campaign_status: "LIVE", source: "live", net: 1315600, platform_net: 101660, product_name: "버닝온" },
      { campaign_id: "b", campaign_code: "c2", campaign_status: "SAMPLE_PURCHASED", source: "live", net: 75650, platform_net: 6190 },
      { campaign_id: "c", campaign_code: "c6", campaign_status: "SETTLED", source: "none" },
    ],
    counts: { campaigns: 3, no_snapshot: 1 },
    celery: { topup_won: 200000, topup_net: 181818, topup_count: 2, granted: 28, earned: 135, spent: 4, balance: 169 },
    cel_cover: 60000,
    opex: { server: 30000 },
  };

  it("ok 가 아니면 null", () => {
    expect(parseAdminRevenue({ ok: false, code: "DB_ERROR" })).toBeNull();
    expect(parseAdminRevenue(null)).toBeNull();
    expect(parseAdminRevenue([])).toBeNull();
  });

  it("합계 · 행 · 셀러리 · celCover 를 읽는다", () => {
    const r = parseAdminRevenue(raw)!;
    expect(r.totals.net).toBe(16576850);
    expect(r.totals.sample_net).toBe(75650);
    expect(r.rows).toHaveLength(3);
    expect(r.celery.topup_net).toBe(181818);
    expect(r.celCover).toBe(60000);
    expect(r.counts.no_snapshot).toBe(1);
  });

  it("빠진 금액 항목은 0 으로 채운다", () => {
    const r = parseAdminRevenue(raw)!;
    expect(r.totals.vat).toBe(0);
    expect(r.rows[2].net).toBe(0);
  });

  it("samplePending — LIVE·CLEARING·SETTLED 밖이면 브랜드 지급 규칙 미정 표시 대상", () => {
    const r = parseAdminRevenue(raw)!;
    expect(r.rows[0].samplePending).toBe(false); // LIVE
    expect(r.rows[1].samplePending).toBe(true); // SAMPLE_PURCHASED
    expect(r.rows[2].samplePending).toBe(false); // SETTLED
  });

  it("source 는 live · snapshot · none 만", () => {
    const r = parseAdminRevenue({ ...raw, rows: [{ campaign_id: "x", campaign_status: "LIVE", source: "뭔가" }] })!;
    expect(r.rows[0].source).toBe("live");
  });

  it("opex 는 모르는 키를 버리고 기본 키를 채운다", () => {
    const r = parseAdminRevenue(raw)!;
    expect(r.opex.server).toBe(30000);
    expect(r.opex.db).toBe(0);
  });

  it("행이 배열이 아니면 빈 목록", () => {
    expect(parseAdminRevenue({ ...raw, rows: "x" })!.rows).toEqual([]);
  });
});

/**
 * 정산 후 환불 조정 (0049) — 정산이 끝난 뒤 들어온 환불은 스냅샷에 반영될 수 없다(주문은 `CANCELED`).
 * RPC 는 **조정분이 있는 행에만** `*_adjusted` 를 넣으므로, 없으면 조정 전 값과 같아야 한다.
 */
describe("parseAdminRevenue — 정산 후 환불 조정", () => {
  const payload = (totals: Record<string, number>, rows: Record<string, unknown>[] = []) => ({
    ok: true,
    today: "2026-10-08",
    rows,
    opex: {},
    totals,
    celery: {},
  });

  it("조정분이 있으면 그대로 읽는다", () => {
    const r = parseAdminRevenue(
      payload({ net: 1000, platform_net: 100, post_refunds: 30, post_refund_count: 1, net_adjusted: 970, platform_net_adjusted: 70 }),
    )!;
    expect(r.totals.post_refunds).toBe(30);
    expect(r.totals.post_refund_count).toBe(1);
    expect(r.totals.net_adjusted).toBe(970);
    expect(r.totals.platform_net_adjusted).toBe(70);
  });

  it("조정분이 없으면 조정 전과 같다 — 0 으로 보이면 안 된다", () => {
    const r = parseAdminRevenue(payload({ net: 1000, platform_net: 100 }))!;
    expect(r.totals.post_refunds).toBe(0);
    expect(r.totals.net_adjusted).toBe(1000);
    expect(r.totals.platform_net_adjusted).toBe(100);
  });

  it("캠페인 행도 같은 규칙", () => {
    const r = parseAdminRevenue(
      payload({ net: 1000, platform_net: 100 }, [
        { campaign_id: "x1", campaign_code: "c1", campaign_status: "SETTLED", source: "snapshot", net: 500, platform_net: 50 },
        { campaign_id: "x2", campaign_code: "c2", campaign_status: "SETTLED", source: "snapshot", net: 500, platform_net: 50, post_refunds: 20, net_adjusted: 480, platform_net_adjusted: 30 },
      ]),
    )!;
    expect(r.rows[0].net_adjusted).toBe(500);
    expect(r.rows[0].post_refunds).toBe(0);
    expect(r.rows[1].net_adjusted).toBe(480);
    expect(r.rows[1].platform_net_adjusted).toBe(30);
  });
});
