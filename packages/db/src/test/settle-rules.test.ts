// 매출 · 정산 규칙 — packages/db/src/partner/settle-rules.ts (0013 app_seller_sales · app_seller_settlements · app_set_settle_info 계약 · 프로토타입 calc · sellerWht · saveSettleInfo)
import { describe, expect, it } from "vitest";
import { BANKS as CORE_BANKS, CLEAR_DAYS, GRADES, WHT } from "@sellery/core/constants";
import {
  BANKS,
  calcSellerShare,
  formatRrn,
  maskAccount,
  maskBizNo,
  normalizeBizNo,
  parseSellerSales,
  parseSellerSettlements,
  parseSetRrnResult,
  parseSetSettleInfoResult,
  parseSettleInfo,
  parseSettleInfoInput,
  rateLine,
  sellerWhtRate,
  settleDue,
  settlementStatusLabel,
  validateRrn,
  whtLine,
  type SellerSettlementRow,
} from "../partner/settle-rules";

describe("calcSellerShare — docs/settlement-policy.md §12 제안서 예시 (총 30% · 플래티넘 +1.5%p · 개인)", () => {
  // 결제 91건 ₩2,719,000 − 환불 3건 ₩89,700 = net ₩2,629,300
  const k = calcSellerShare({ net: 2719000 - 89700, rate: 0.2, bonusPp: 1.5, whtRate: WHT });
  it("기본 수수료 · 등급 추가분 · 합계", () => {
    expect(k.base).toBe(2629300);
    expect(k.sf).toBe(525860);
    expect(k.gBonus).toBe(39440); // 39,439.5 → half-up
    expect(k.sfTotal).toBe(565300); // 565,299.5
    expect(k.boost).toBe(0);
  });
  it("원천징수 3.3% · 실수령", () => {
    expect(k.wht).toBe(18655); // 18,654.88
    expect(k.payout).toBe(546645); // 546,644.62
  });
  it("플래티넘 보너스 1.5 는 GRADES 상수와 같다", () => {
    expect(GRADES.find((t) => t.g === "플래티넘")?.bonus).toBe(1.5);
  });
});

describe("calcSellerShare — 시드 c1 (지유 골드 × 버닝온 20%) = 0013 app_seller_sales 스모크 값", () => {
  // seed.sql: 34건 중 1건 REFUNDED(qty 2) · 총 qty 46 × ₩29,900 = gross 1,375,400 · refund 59,800
  const k = calcSellerShare({ net: 1375400 - 59800, rate: 0.2, bonusPp: 1, whtRate: sellerWhtRate("personal") });
  it("SQL 과 같은 라인 값", () => {
    expect(k).toEqual({ base: 1315600, sf: 263120, gBonus: 13156, boost: 0, sfTotal: 276276, wht: 9117, payout: 267159 });
  });
});

describe("calcSellerShare — 샘플 구매분 · 추천 부스트 · 사업자", () => {
  it("샘플 구매분은 기본 수수료·보너스에서 빠지고 추천 부스트는 net 전체 기준(§9)", () => {
    const k = calcSellerShare({ net: 100000, sampleNet: 20000, rate: 0.2, bonusPp: 1, refBoost: true, whtRate: WHT });
    expect(k.base).toBe(80000);
    expect(k.sf).toBe(16000);
    expect(k.gBonus).toBe(800);
    expect(k.boost).toBe(1000); // 100,000 × 1%
    expect(k.sfTotal).toBe(17800);
  });
  it("사업자는 원천징수 0 — 실수령 = 세전 (§5.9 '항상 3.3%' 버그 금지)", () => {
    const k = calcSellerShare({ net: 1000000, rate: 0.2, whtRate: sellerWhtRate("biz") });
    expect(k.wht).toBe(0);
    expect(k.payout).toBe(k.sfTotal);
    expect(k.payout).toBe(200000);
  });
  it("미등록(null) 도 3.3%", () => {
    expect(sellerWhtRate(null)).toBe(WHT);
    expect(sellerWhtRate(undefined)).toBe(WHT);
    expect(sellerWhtRate("personal")).toBe(WHT);
    expect(sellerWhtRate("biz")).toBe(0);
  });
  it("빈 입력은 0", () => {
    expect(calcSellerShare({ net: 0, rate: 0.2 })).toEqual({ base: 0, sf: 0, gBonus: 0, boost: 0, sfTotal: 0, wht: 0, payout: 0 });
  });
});

describe("settleDue", () => {
  it("종료일 + CLEAR_DAYS(21)", () => {
    expect(CLEAR_DAYS).toBe(21);
    expect(settleDue("2026-09-17")).toBe("2026-10-08");
    expect(settleDue("2026-12-20")).toBe("2027-01-10");
  });
});

describe("validateRrn — 13자리 · 생년월일 · 검증숫자 (0013 partner_rrn_valid 와 같은 규칙)", () => {
  // 검증숫자 계산: 가중치 2,3,4,5,6,7,8,9,2,3,4,5 · (11 − Σ mod 11) mod 10
  const check = (d12: string) => {
    const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(d12[i]) * w[i];
    return `${d12}${(11 - (s % 11)) % 10}`;
  };
  const valid = check("900101123456");
  it("검증숫자가 맞는 번호는 숫자 13자리로", () => {
    expect(validateRrn(valid)).toBe(valid);
    expect(validateRrn(`${valid.slice(0, 6)}-${valid.slice(6)}`)).toBe(valid);
    expect(validateRrn(check("050315312345"))).toBe(check("050315312345")); // 2000년대(3)
  });
  it("검증숫자 불일치 · 자릿수 · 날짜 · 성별 자리 불량은 null", () => {
    const wrong = `${valid.slice(0, 12)}${(Number(valid[12]) + 1) % 10}`;
    expect(validateRrn(wrong)).toBeNull();
    expect(validateRrn("90010112345")).toBeNull();
    expect(validateRrn(check("901301123456"))).toBeNull(); // 13월
    expect(validateRrn(check("900230123456"))).toBeNull(); // 2월 30일
    expect(validateRrn(check("900101923456"))).toBeNull(); // 성별 자리 9
    expect(validateRrn(check("900101023456"))).toBeNull(); // 성별 자리 0
    expect(validateRrn("")).toBeNull();
    expect(validateRrn(null)).toBeNull();
  });
  it("formatRrn", () => {
    expect(formatRrn(valid)).toBe(`${valid.slice(0, 6)}-${valid.slice(6)}`);
    expect(formatRrn("123")).toBe("123");
  });
});

describe("마스킹 · 은행 · 사업자번호", () => {
  it("maskAccount 뒤 4자리", () => {
    expect(maskAccount("3333012345678")).toBe("*********5678");
    expect(maskAccount("94820-111222-333")).toBe("**********2333");
    expect(maskAccount("1234")).toBe("****");
    expect(maskAccount(null)).toBeNull();
  });
  it("maskBizNo 뒤 5자리", () => {
    expect(maskBizNo("512-21-00987")).toBe("***-**-00987");
    expect(maskBizNo("5122100987")).toBe("***-**-00987");
    expect(maskBizNo(null)).toBeNull();
  });
  it("normalizeBizNo", () => {
    expect(normalizeBizNo("5122100987")).toBe("512-21-00987");
    expect(normalizeBizNo("512-21-0098")).toBeNull();
  });
  it("BANKS 는 core BANKS 에서 '선택' 만 뺀 것 — 시드 은행이 들어 있다", () => {
    expect(BANKS).toEqual(CORE_BANKS.filter((b) => b !== "선택"));
    expect(BANKS).not.toContain("선택");
    expect(BANKS).toContain("카카오뱅크");
    expect(BANKS).toContain("국민");
  });
});

describe("parseSettleInfoInput — /settle 폼 (app_set_settle_info 와 같은 조건·순서)", () => {
  const base = { settle_type: "personal", bank: "카카오뱅크", account: "3333-01-2345678", holder: " 김지유 " };
  it("개인 — 계좌 숫자만 · 예금주 trim · tax null", () => {
    const r = parseSettleInfoInput(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ settle_type: "personal", bank: { bank: "카카오뱅크", account: "3333012345678", holder: "김지유" }, tax: null });
  });
  it("사업자 — 사업자번호 정규화 · 세금계산서 정보", () => {
    const r = parseSettleInfoInput({ ...base, settle_type: "biz", biz_no: "5122100987", company: "혜린스튜디오", ceo: "혜린", biz_type: "서비스", biz_item: "광고", tax_email: "Tax@Example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tax).toEqual({ biz_no: "512-21-00987", company: "혜린스튜디오", ceo: "혜린", biz_type: "서비스", biz_item: "광고", email: "tax@example.com" });
  });
  it("실패 코드 순서", () => {
    const code = (f: Record<string, string>) => {
      const r = parseSettleInfoInput(f);
      return r.ok ? "OK" : r.error.code;
    };
    expect(code({ ...base, settle_type: "x" })).toBe("BAD_TYPE");
    expect(code({ ...base, bank: "선택" })).toBe("BANK_REQUIRED");
    expect(code({ ...base, bank: "우주은행" })).toBe("BAD_BANK");
    expect(code({ ...base, account: "1234567" })).toBe("BAD_ACCOUNT");
    expect(code({ ...base, holder: "" })).toBe("HOLDER_REQUIRED");
    expect(code({ ...base, settle_type: "biz" })).toBe("BIZ_NO_REQUIRED");
    expect(code({ ...base, settle_type: "biz", biz_no: "12-34" })).toBe("BAD_BIZ_NO");
  });
});

describe("RPC 결과 파서", () => {
  /** 0013 app_seller_settle_info 실제 응답 모양 (s2 혜린 · biz) */
  const INFO = {
    ok: true,
    settle_type: "biz",
    has_bank_info: true,
    bank: "국민",
    holder: "혜린스튜디오",
    account_masked: "**********2333",
    has_tax_info: false,
    tax_info: null,
    biz_no_masked: "***-**-00987",
    has_biz_doc: false,
    has_rrn: false,
    rrn_mask: null,
    rrn_set_at: null,
    wht_rate: 0,
  };
  it("parseSettleInfo — 원문 키가 없다", () => {
    const v = parseSettleInfo(INFO)!;
    expect(v.settle_type).toBe("biz");
    expect(v.wht_rate).toBe(0);
    expect(v.account_masked).toBe("**********2333");
    expect(Object.keys(v)).not.toContain("account");
    expect(parseSettleInfo({ ok: false, code: "NOT_FOUND" })).toBeNull();
  });
  it("parseSetSettleInfoResult · parseSetRrnResult", () => {
    expect(parseSetSettleInfoResult({ ...INFO, saved: true })).toMatchObject({ ok: true });
    expect(parseSetSettleInfoResult({ ok: false, code: "BAD_ACCOUNT" })).toEqual({ ok: false, code: "BAD_ACCOUNT" });
    expect(parseSetSettleInfoResult(null)).toEqual({ ok: false, code: "DB_ERROR" });
    expect(parseSetRrnResult({ ok: true, has_rrn: true, rrn_mask: "******-1******", rrn_set_at: "2026-09-21T00:00:00+00:00" })).toEqual({
      ok: true,
      rrn_mask: "******-1******",
      rrn_set_at: "2026-09-21T00:00:00+00:00",
    });
    expect(parseSetRrnResult({ ok: false, code: "RRN_KEY_MISSING" })).toEqual({ ok: false, code: "RRN_KEY_MISSING" });
  });
  it("parseSellerSales — 0013 스모크 응답(c1)", () => {
    const raw = {
      ok: true,
      today: "2026-09-21",
      settle_type: "personal",
      wht_rate: 0.033,
      grade: "골드",
      grade_bonus_pp: 1.0,
      rates: { platform_rate: 0.1, ref_boost: 0.01, ref_times: 5, clear_days: 21 },
      campaigns: [
        {
          campaign_id: "c0000000-0000-4000-8000-000000000001",
          campaign_code: "c1",
          status: "LIVE",
          product: { code: "p1", name: "버닝온", emoji: "🔥", thumb_url: "assets/burningon.webp", sale_price: 29900 },
          brand: { code: "b1", name: "바인허브" },
          start_date: "2026-09-13",
          end_date: "2026-09-17",
          due_on: "2026-10-08",
          qty: 800,
          sold_qty: 44,
          paid_count: 33,
          refund_count: 1,
          gross: 1375400,
          canceled: 0,
          refunded: 59800,
          net: 1315600,
          sample_net: 0,
          qty_sold: 44,
          today_orders: 0,
          today_gross: 0,
          my_rate: 0.2,
          grade: "골드",
          grade_bonus_pp: 1.0,
          ref_boost_applied: false,
          my_fee: 263120,
          grade_bonus: 13156,
          ref_boost: 0,
          my_fee_total: 276276,
          wht: 9117,
          my_payout_est: 267159,
          daily: [{ d: "2026-09-15", gross: 0 }],
          recent: [{ code: "o133", buyer_masked: "김*은", qty: 1, amount: 29900, status: "PAID", paid_at: "2026-09-17T00:00:00+00:00" }],
        },
      ],
      totals: { net: 1315600, my_fee_total: 276276, wht: 9117, my_payout_est: 267159, today_gross: 0, today_orders: 0, paid_count: 33, refund_count: 1 },
    };
    const v = parseSellerSales(raw)!;
    expect(v.campaigns).toHaveLength(1);
    const c = v.campaigns[0];
    expect(c.my_payout_est).toBe(267159);
    expect(settleDue(c.end_date!)).toBe(c.due_on);
    // SQL 라인 = TS calcSellerShare
    const k = calcSellerShare({ net: c.net, sampleNet: c.sample_net, rate: c.my_rate, bonusPp: c.grade_bonus_pp, refBoost: c.ref_boost_applied, whtRate: v.wht_rate });
    expect(k).toEqual({ base: 1315600, sf: c.my_fee, gBonus: c.grade_bonus, boost: c.ref_boost, sfTotal: c.my_fee_total, wht: c.wht, payout: c.my_payout_est });
    expect(parseSellerSales({ ok: false, code: "NOT_FOUND" })).toBeNull();
  });
  it("parseSellerSettlements — settled(스냅샷) · pending(예정) · 스냅샷 없는 SETTLED", () => {
    const raw = {
      ok: true,
      has_bank_info: true,
      settle_type: "biz",
      wht_rate: 0,
      rows: [
        {
          kind: "settled",
          campaign_id: "x",
          campaign_code: "c6",
          status: "SETTLED",
          product: { code: "p5", name: "데일리 플랜트 프로틴", emoji: "🥤", thumb_url: null },
          brand: { code: "b2", name: "글로헬스" },
          start_date: "2026-08-06",
          end_date: "2026-08-11",
          net: 1000000,
          sample_net: 0,
          my_rate: 0.22,
          grade: "골드",
          grade_bonus_pp: 1,
          ref_boost_applied: false,
          my_fee: 220000,
          grade_bonus: 10000,
          ref_boost: 0,
          my_fee_total: 230000,
          wht_rate: 0,
          wht: 0,
          sample_refund_cel: 0,
          sample_refund_cash: 0,
          my_payout: 230000,
          hold_seller: false,
          settlement_status: "pending",
          due_on: "2026-09-01",
          settled_at: "2026-09-07T00:00:00+00:00",
          payout: { status: "pending", amount: 230000, paid_at: null, hold_reason: null },
        },
        { kind: "settled", campaign_code: "c7", status: "SETTLED", product: {}, brand: {}, net: null, my_payout: null, payout: null },
        { kind: "pending", campaign_code: "c4", status: "CLEARING", product: {}, brand: {}, net: 500000, my_payout: 110000, hold_seller: true, due_on: "2026-10-01" },
      ],
      totals: { settled_payout: 230000, pending_payout: 110000 },
    };
    const v = parseSellerSettlements(raw)!;
    expect(v.rows).toHaveLength(3);
    expect(v.rows[0].my_payout).toBe(230000);
    expect(v.rows[0].payout?.status).toBe("pending");
    expect(v.rows[1].my_payout).toBeNull();
    expect(v.rows[2].kind).toBe("pending");
    expect(v.totals).toEqual({ settled_payout: 230000, pending_payout: 110000 });
    expect(settlementStatusLabel(v.rows[0])).toMatchObject({ label: "지급 대기", tone: "blue" });
    expect(settlementStatusLabel(v.rows[1])).toMatchObject({ label: "정산 완료", sub: "명세 준비 중" });
    expect(settlementStatusLabel(v.rows[2])).toMatchObject({ label: "교환·환불 기간", tone: "amber", sub: "지급 예정 10/1" });
    const paid: SellerSettlementRow = { ...v.rows[0], payout: { status: "paid", amount: 230000, paid_at: "2026-09-10T01:00:00+00:00", hold_reason: null } };
    expect(settlementStatusLabel(paid)).toMatchObject({ label: "지급 완료", tone: "green" });
    const held: SellerSettlementRow = { ...v.rows[0], hold_seller: true, settlement_status: "held" };
    expect(settlementStatusLabel(held).label).toBe("지급 보류");
  });
});

describe("문구", () => {
  it("whtLine · rateLine", () => {
    expect(whtLine(0.033, 9117)).toBe("원천징수 3.3% −₩9,117");
    expect(whtLine(0.033, null)).toBe("원천징수 3.3%");
    expect(whtLine(0, 0)).toBe("세금계산서 발행 · 원천징수 없음");
    expect(rateLine(0.2, "골드", 1, false)).toBe("20% +1%p 골드");
    expect(rateLine(0.2, "플래티넘", 1.5, true)).toBe("20% +1.5%p 플래티넘 +1%p 추천");
    expect(rateLine(0.2, "스타터", 0, false)).toBe("20%");
    expect(rateLine(null, null, null, null)).toBe("—");
  });
});
