// 브랜드 매출 · 정산 · 등급 규칙 — packages/db/src/brand/settle-rules.ts (0019 app_brand_sales · app_brand_settlements · app_set_brand_settle_info · app_set_brand_profile
// · app_brand_grade_card 계약 · 프로토타입 calc().brandPay · bgradeOf · bDiscOf · freeRefLeft · saveBrandInfo)
import { describe, expect, it } from "vitest";
import { BG_DISC, BGRADES, BREF_DISC, CLEAR_DAYS, PG_RATE, PLAT_RATE } from "@sellery/core/constants";
import {
  BANKS,
  brandDiscountLine,
  brandDiscRateOf,
  brandGradeFor,
  brandGradeLine,
  brandPayoutLine,
  brandProfileFailMessage,
  brandRateLine,
  brandSettleFailMessage,
  brandSettlementStatusLabel,
  calcBrandPay,
  freeRefLine,
  isBrandRefBoostAt,
  nextBrandGrade,
  parseBrandGradeCard,
  parseBrandGradeRecalcResult,
  parseBrandProfile,
  parseBrandProfileInput,
  parseBrandSales,
  parseBrandSettleInfo,
  parseBrandSettleInfoInput,
  parseBrandSettlements,
  parseSetBrandProfileResult,
  parseSetBrandSettleInfoResult,
  platformPgLine,
  settleDue,
  type BrandSettlementRow,
} from "../brand/settle-rules";

describe("calcBrandPay — docs/settlement-policy.md §12 제안서 예시 (총 30% · 플래티넘 +1.5%p · 브랜드 할인 없음)", () => {
  // 결제 91건 ₩2,719,000 − 환불 3건 ₩89,700 = net ₩2,629,300
  const k = calcBrandPay({ net: 2719000 - 89700, rate: 0.2, bonusPp: 1.5 });
  it("PG · 인플루언서 · 플랫폼 · 브랜드 정산액", () => {
    expect(k.pg).toBe(49957); // 49,956.7
    expect(k.sf).toBe(525860);
    expect(k.gBonus).toBe(39440); // 플랫폼 부담 — 브랜드 정산액에 없다
    expect(k.sfTotal).toBe(565300);
    expect(k.pfGross).toBe(262930);
    expect(k.bBoost).toBe(0);
    expect(k.bDisc).toBe(0);
    expect(k.brandPay).toBe(1790553); // 2,629,300 − 49,956.7 − 525,860 − 262,930 = 1,790,553.3
  });
  it("플랫폼+PG 열 = pfGross − bBoost − bDisc + pg → net − sf − platformPg = brandPay (plan §8 결정)", () => {
    expect(k.platformPg).toBe(312887); // 262,930 + 49,956.7
    expect(k.base - k.sf - k.platformPg).toBe(k.brandPay);
  });
  it("확정 매출 100만원 분배 — 브랜드 ₩681,000 · 인플루언서 ₩200,000 · 셀러리 ₩100,000 · PG ₩19,000", () => {
    const m = calcBrandPay({ net: 1000000, rate: 0.2 });
    expect(m.brandPay).toBe(681000);
    expect(m.sf).toBe(200000);
    expect(m.pfGross).toBe(100000);
    expect(m.pg).toBe(19000);
  });
});

describe("calcBrandPay — 시드 c1 (b1 골드 −0.5%p · s1 골드 +1%p · 20%) = 0019 app_brand_sales 스모크와 같은 값", () => {
  // gross 1,375,400 − refunded 59,800 = net 1,315,600 (2026-09-22 클라우드 시드)
  const k = calcBrandPay({ net: 1375400 - 59800, rate: 0.2, bonusPp: 1, brandDiscRate: BG_DISC.골드 });
  it("라인 값", () => {
    expect(k.base).toBe(1315600);
    expect(k.pg).toBe(24996); // 24,996.4
    expect(k.sf).toBe(263120);
    expect(k.gBonus).toBe(13156);
    expect(k.sfTotal).toBe(276276);
    expect(k.pfGross).toBe(131560);
    expect(k.bDisc).toBe(6578);
    expect(k.platformPg).toBe(149978); // 131,560 − 6,578 + 24,996.4
    expect(k.brandPay).toBe(902502); // 902,501.6
  });
  it("시드 c12 (net 1,963,700) — half-up 반올림 (bDisc 9,818.5 → 9,819)", () => {
    const m = calcBrandPay({ net: 2044400 - 80700, rate: 0.2, bonusPp: 1, brandDiscRate: 0.005 });
    expect(m.bDisc).toBe(9819);
    expect(m.pg).toBe(37310);
    expect(m.platformPg).toBe(223862);
    expect(m.brandPay).toBe(1347098);
  });
  it("시드 c5 (s3 추천 부스트 · 실버 +0.5%p · 18%) — 부스트는 인플루언서 수령에만", () => {
    const m = calcBrandPay({ net: 13695000 - 473100, rate: 0.18, bonusPp: 0.5, refBoost: true, brandDiscRate: 0.005 });
    expect(m.boost).toBe(132219);
    expect(m.sf).toBe(2379942);
    expect(m.sfTotal).toBe(2578271);
    expect(m.brandPay).toBe(9334661);
    expect(m.platformPg).toBe(1507297);
  });
});

describe("calcBrandPay — 브랜드 추천 · 샘플 구매분 · 요율 덮어쓰기", () => {
  it("피추천 브랜드 첫 3회 −1%p 는 정산액 가산 · 플랫폼+PG 에서 차감", () => {
    const k = calcBrandPay({ net: 1000000, rate: 0.2, brandRefBoost: true, brandDiscRate: 0.01 });
    expect(k.bBoost).toBe(10000);
    expect(k.bDisc).toBe(10000);
    expect(k.brandPay).toBe(701000); // 681,000 + 10,000 + 10,000
    expect(k.platformPg).toBe(99000); // 100,000 − 10,000 − 10,000 + 19,000
    expect(k.base - k.sf - k.platformPg).toBe(k.brandPay);
  });
  it("샘플 구매분은 인플루언서 수수료 기준에서만 빠진다 (PG · 플랫폼 · 할인은 net 전체)", () => {
    const k = calcBrandPay({ net: 1000000, sampleNet: 75650, rate: 0.2, brandDiscRate: 0.005 });
    expect(k.base).toBe(924350);
    expect(k.sf).toBe(184870);
    expect(k.pg).toBe(19000);
    expect(k.pfGross).toBe(100000);
    expect(k.bDisc).toBe(5000);
    expect(k.brandPay).toBe(701130);
  });
  it("platform_settings 요율을 넘기면 그 값 · 기본은 코어 상수", () => {
    const k = calcBrandPay({ net: 1000000, rate: 0.2, pgRate: 0.02, platformRate: 0.12 });
    expect(k.pg).toBe(20000);
    expect(k.pfGross).toBe(120000);
    expect(PG_RATE).toBe(0.019);
    expect(PLAT_RATE).toBe(0.1);
  });
  it("빈 입력은 0", () => {
    const k = calcBrandPay({ net: 0, rate: 0 });
    expect(k).toEqual({ base: 0, pg: 0, sf: 0, gBonus: 0, boost: 0, sfTotal: 0, pfGross: 0, bBoost: 0, bDisc: 0, platformPg: 0, brandPay: 0 });
  });
});

describe("브랜드 등급 — BGRADES · BG_DISC (docs/grade-policy.md §5 · 시드 b1 골드 · b2 플래티넘)", () => {
  it("brandGradeFor — 내림차순 첫 매치", () => {
    expect(brandGradeFor(91373500)).toBe("골드");
    expect(brandGradeFor(382075650)).toBe("플래티넘");
    expect(brandGradeFor(0)).toBe("스타터");
    expect(brandGradeFor(1000000000)).toBe("블랙");
    expect(brandGradeFor(79999999)).toBe("실버");
    expect(brandGradeFor(-5)).toBe("스타터");
  });
  it("nextBrandGrade — 다음 등급과 남은 금액 · 블랙은 null", () => {
    expect(nextBrandGrade(91373500)).toEqual({ grade: "플래티넘", min: 200000000, remaining: 108626500 });
    expect(nextBrandGrade(382075650)).toEqual({ grade: "다이아", min: 500000000, remaining: 117924350 });
    expect(nextBrandGrade(1500000000)).toBeNull();
    expect(nextBrandGrade(0)?.grade).toBe("브론즈");
  });
  it("brandDiscRateOf — 골드 0.5%p … 블랙 2%p · 실버 이하 0", () => {
    expect(brandDiscRateOf("골드")).toBe(0.005);
    expect(brandDiscRateOf("블랙")).toBe(0.02);
    expect(brandDiscRateOf("실버")).toBe(0);
    expect(brandDiscRateOf(null)).toBe(0);
    for (const t of BGRADES) expect(brandDiscRateOf(t.g)).toBe(BG_DISC[t.g] ?? 0);
  });
  it("isBrandRefBoostAt — 피추천 브랜드 첫 3회", () => {
    expect(isBrandRefBoostAt(true, 1)).toBe(true);
    expect(isBrandRefBoostAt(true, 3)).toBe(true);
    expect(isBrandRefBoostAt(true, 4)).toBe(false);
    expect(isBrandRefBoostAt(false, 1)).toBe(false);
    expect(isBrandRefBoostAt(true, null)).toBe(false);
  });
  it("settleDue — 종료일 + CLEAR_DAYS", () => {
    expect(CLEAR_DAYS).toBe(21);
    expect(settleDue("2026-09-17")).toBe("2026-10-08");
  });
});

describe("parseBrandSettleInfoInput — /brand/settle 폼 (0019 app_set_brand_settle_info 와 같은 조건)", () => {
  const good = { bank: "국민", account: "110-123-456789", holder: "(주)바인허브", biz_no: "2148801234", mail_order_no: "제2026-서울강남-00001호", company: "(주)바인허브", ceo: "김바인", biz_type: "도소매", biz_item: "건강기능식품", tax_email: "Tax@VyneHerb.co" };
  it("정상 — 계좌 숫자만 · 사업자번호 정규화 · 이메일 소문자", () => {
    const r = parseBrandSettleInfoInput(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bank).toEqual({ bank: "국민", account: "110123456789", holder: "(주)바인허브" });
    expect(r.value.tax.biz_no).toBe("214-88-01234");
    expect(r.value.tax.email).toBe("tax@vyneherb.co");
    expect(r.value.tax.mail_order_no).toBe("제2026-서울강남-00001호");
    expect(r.value.tax.company).toBe("(주)바인허브");
  });
  it("세금계산서 · 사업자번호 · 통신판매업은 전부 선택", () => {
    const r = parseBrandSettleInfoInput({ bank: "신한", account: "12345678", holder: "홍길동" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tax).toEqual({ biz_no: null, mail_order_no: null, company: null, ceo: null, biz_type: null, biz_item: null, email: null });
  });
  it.each([
    [{ ...good, bank: "" }, "BANK_REQUIRED", "bank"],
    [{ ...good, bank: "선택" }, "BANK_REQUIRED", "bank"],
    [{ ...good, bank: "산업" }, "BAD_BANK", "bank"],
    [{ ...good, account: "1234567" }, "BAD_ACCOUNT", "account"],
    [{ ...good, account: "12345678901234567" }, "BAD_ACCOUNT", "account"],
    [{ ...good, holder: "  " }, "HOLDER_REQUIRED", "holder"],
    [{ ...good, biz_no: "12" }, "BAD_BIZ_NO", "biz_no"],
    [{ ...good, mail_order_no: "x".repeat(41) }, "BAD_MAIL_ORDER", "mail_order_no"],
    [{ ...good, tax_email: "nope" }, "BAD_EMAIL", "tax_email"],
  ] as const)("실패 %#: %s", (form, code, field) => {
    const r = parseBrandSettleInfoInput(form as Record<string, string>);
    expect(r).toEqual({ ok: false, error: { code, field } });
  });
  it("BANKS 는 core BANKS 에서 '선택' 을 뺀 목록 (0019 v_banks 와 같은 9개)", () => {
    expect(BANKS).toHaveLength(9);
    expect(BANKS).not.toContain("선택");
    expect(BANKS).toContain("SC제일");
  });
});

describe("parseBrandProfileInput — /brand/my 폼 (0019 app_set_brand_profile 와 같은 조건)", () => {
  const good = { name: " 바인허브 ", category: "건강기능식품", manager_name: "김바인", manager_phone: "01012345678", description: "  건강한 다이어트\r\n브랜드  " };
  it("정상 — 공백 정리 · 연락처 정규화 · 소개 CRLF → LF", () => {
    const r = parseBrandProfileInput(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ name: "바인허브", category: "건강기능식품", manager_name: "김바인", manager_phone: "010-1234-5678", description: "건강한 다이어트\n브랜드" });
  });
  it("연락처 · 소개는 비울 수 있다 (null)", () => {
    const r = parseBrandProfileInput({ ...good, manager_phone: "", description: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.manager_phone).toBeNull();
    expect(r.value.description).toBeNull();
  });
  it.each([
    [{ ...good, name: "" }, "name"],
    [{ ...good, name: "가".repeat(41) }, "name"],
    [{ ...good, category: "패션" }, "category"],
    [{ ...good, manager_name: "" }, "manager_name"],
    [{ ...good, manager_phone: "1234" }, "manager_phone"],
    [{ ...good, description: "가".repeat(501) }, "description"],
  ] as const)("실패 %#: 첫 필드 %s", (form, field) => {
    const r = parseBrandProfileInput(form as Record<string, string>);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe(field);
    expect(r.message).toBe(brandProfileFailMessage("INVALID_INPUT", field));
  });
  it("문구 — 알 수 없는 코드는 DB_ERROR 문구", () => {
    expect(brandProfileFailMessage("INVALID_INPUT", "logo_url")).toMatch(/로고/);
    expect(brandProfileFailMessage("BAD_FILE")).toMatch(/4MB/);
    expect(brandProfileFailMessage("???")).toBe(brandProfileFailMessage("DB_ERROR"));
    expect(brandSettleFailMessage("BIZ_NO_LOCKED")).toMatch(/가입 후/);
    expect(brandSettleFailMessage("???")).toBe(brandSettleFailMessage("DB_ERROR"));
  });
});

describe("RPC 파서 — app_brand_settle_info · app_brand_profile · app_brand_grade_card", () => {
  const info = {
    ok: true, has_bank_info: true, bank: "기업", holder: "(주)바인허브", account_masked: "**********1234", has_biz_no: true, biz_no_masked: "***-**-01234",
    mail_order_no: "제2024-서울강남-01234호", has_biz_doc: false, has_tax_info: false, tax_info: null, po_enabled: false, po_email: null, settle_info_complete: true,
  };
  it("parseBrandSettleInfo — 원문 없이 마스킹 값만", () => {
    const v = parseBrandSettleInfo(info);
    expect(v?.account_masked).toBe("**********1234");
    expect(v?.settle_info_complete).toBe(true);
    expect(v?.tax_info).toBeNull();
    expect(parseBrandSettleInfo({ ok: false, code: "NOT_FOUND" })).toBeNull();
    expect(parseBrandSettleInfo(null)).toBeNull();
    const w = parseBrandSettleInfo({ ...info, tax_info: { company: "(주)바인허브", email: "tax@vyneherb.co" } });
    expect(w?.tax_info).toEqual({ company: "(주)바인허브", ceo: null, biz_type: null, biz_item: null, email: "tax@vyneherb.co" });
  });
  it("parseSetBrandSettleInfoResult — 성공은 info · 실패는 code", () => {
    const r = parseSetBrandSettleInfoResult({ ...info, saved: true });
    expect(r.ok).toBe(true);
    expect(parseSetBrandSettleInfoResult({ ok: false, code: "BIZ_NO_LOCKED" })).toEqual({ ok: false, code: "BIZ_NO_LOCKED" });
    expect(parseSetBrandSettleInfoResult(undefined)).toEqual({ ok: false, code: "DB_ERROR" });
  });
  const profile = { ok: true, id: "b0000000-0000-4000-8000-000000000001", code: "b1", name: "바인허브", category: "건강기능식품", manager_name: "김바인", manager_phone: null, email: "partner@vyneherb.example", description: null, logo_url: null, biz_no_masked: "***-**-01234", ref_code: "VYNE-01", active: true, created_at: "2026-09-15T04:33:10+00:00" };
  it("parseBrandProfile · parseSetBrandProfileResult — INVALID_INPUT 은 field 를 싣는다", () => {
    expect(parseBrandProfile(profile)?.ref_code).toBe("VYNE-01");
    expect(parseBrandProfile({ ok: false })).toBeNull();
    const r = parseSetBrandProfileResult({ ...profile, saved: true });
    expect(r.ok && r.profile.name).toBe("바인허브");
    expect(parseSetBrandProfileResult({ ok: false, code: "INVALID_INPUT", field: "manager_phone" })).toEqual({ ok: false, code: "INVALID_INPUT", field: "manager_phone" });
    expect(parseSetBrandProfileResult("x")).toEqual({ ok: false, code: "DB_ERROR", field: null });
  });
  const card = {
    ok: true, gmv: 91373500, grade: "골드", grade_cached: "골드", sort_order: 3, top_pct: 18, fee_discount: 0.005, perk: "수수료 −0.5%p · 카탈로그 상단 노출",
    next: { grade: "플래티넘", min_gmv: 200000000, remaining: 108626500 }, free_ref_per_month: 0, free_ref_used_this_month: 0, free_ref_left: 0, celery_balance: 21, celery_per_won: 5000000,
    tiers: [{ name: "블랙", sort_order: 0, min_gmv: 1000000000, fee_discount: 0.02, top_pct: 1, free_ref_per_month: 5, perk: "x" }],
  };
  it("parseBrandGradeCard — 시드 b1 (스모크 값) · TS 등급 계산과 일치", () => {
    const v = parseBrandGradeCard(card);
    expect(v?.grade).toBe("골드");
    expect(v?.next).toEqual({ grade: "플래티넘", min_gmv: 200000000, remaining: 108626500 });
    expect(v?.tiers[0].name).toBe("블랙");
    expect(brandGradeFor(v!.gmv)).toBe(v!.grade);
    expect(nextBrandGrade(v!.gmv)?.remaining).toBe(v!.next!.remaining);
    expect(brandGradeLine(v!)).toBe("골드 · 누적 ₩91,373,500 · 플래티넘까지 ₩108,626,500");
    expect(brandDiscountLine(v!.fee_discount)).toBe("플랫폼 수수료 −0.5%p (실효 9.5%)");
    expect(brandDiscountLine(0)).toMatch(/골드부터/);
    expect(freeRefLine(v!)).toMatch(/다이아 등급부터/);
  });
  it("parseBrandGradeCard — 다이아 (스모크 b2 gmv_base 6억 · 이달 2회 사용) · 블랙은 next null", () => {
    const v = parseBrandGradeCard({ ...card, gmv: 600075650, grade: "다이아", sort_order: 1, fee_discount: 0.015, next: { grade: "블랙", min_gmv: 1000000000, remaining: 399924350 }, free_ref_per_month: 5, free_ref_used_this_month: 2, free_ref_left: 3 });
    expect(freeRefLine(v!)).toBe("이달 무료 열람 3/5회 남음");
    expect(brandDiscountLine(v!.fee_discount)).toBe("플랫폼 수수료 −1.5%p (실효 8.5%)");
    const b = parseBrandGradeCard({ ...card, gmv: 1500000000, grade: "블랙", next: null });
    expect(b?.next).toBeNull();
    expect(brandGradeLine(b!)).toMatch(/최고 등급/);
  });
  it("parseBrandGradeRecalcResult", () => {
    expect(parseBrandGradeRecalcResult({ ok: true, gmv: 600075650, grade: "다이아", previous: "플래티넘", changed: true })).toEqual({ ok: true, gmv: 600075650, grade: "다이아", previous: "플래티넘", changed: true });
    expect(parseBrandGradeRecalcResult({ ok: false, code: "NOT_FOUND" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("parseBrandSales — 0019 app_brand_sales (시드 b1 c1 행 · 2026-09-22 스모크)", () => {
  const raw = {
    ok: true, today: "2026-09-22", brand_grade: "골드", brand_discount_rate: 0.005, settle_info_complete: true,
    rates: { pg_rate: 0.019, platform_rate: 0.1, brand_ref_disc: 0.01, brand_ref_times: 3, clear_days: 21 },
    campaigns: [{
      campaign_id: "c0000000-0000-4000-8000-000000000001", campaign_code: "c1", status: "CLEARING",
      seller: { id: "a0000000-0000-4000-8000-000000000001", code: "s1", name: "지유", handle: "@jiyu_beauty", platform: "instagram", avatar_url: "assets/av-s1.svg", grade: "골드" },
      product: { code: "p1", name: "버닝온", emoji: "🔥", thumb_url: null, sale_price: 29900 },
      start_date: "2026-09-13", end_date: "2026-09-17", due_on: "2026-10-08", qty: 800, sold_qty: 44,
      paid_count: 33, refund_count: 1, gross: 1375400, canceled: 0, refunded: 59800, net: 1315600, sample_net: 0, qty_sold: 44, today_orders: 0, today_gross: 0,
      seller_rate: 0.2, seller_grade: "골드", seller_bonus_pp: 1, ref_boost_applied: false, brand_ref_applied: false,
      pg_fee: 24996, seller_fee: 263120, seller_bonus: 13156, ref_boost: 0, seller_fee_total: 276276,
      platform_fee_gross: 131560, brand_discount: 6578, brand_ref_boost: 0, platform_pg: 149978, brand_payout_est: 902502,
      daily: [{ d: "2026-09-16", gross: 0 }], recent: [{ code: "o105", buyer_masked: "김*은", qty: 1, amount: 29900, status: "PAID", paid_at: "2026-09-17T00:00:00+00:00" }],
    }],
    totals: { net: 16533100, pg_fee: 314129, seller_fee: 3042820, platform_pg: 1884773, brand_payout_est: 11605507, today_gross: 0, today_orders: 0, paid_count: 487, refund_count: 19 },
  };
  it("행 · 합계 · 요율", () => {
    const s = parseBrandSales(raw);
    expect(s?.campaigns).toHaveLength(1);
    const c = s!.campaigns[0];
    expect(c.seller.handle).toBe("@jiyu_beauty");
    expect(c.brand_payout_est).toBe(902502);
    expect(c.platform_pg).toBe(149978);
    expect(c.net - c.seller_fee - c.platform_pg).toBe(c.brand_payout_est);
    expect(s?.totals.brand_payout_est).toBe(11605507);
    expect(s?.rates.brand_ref_times).toBe(3);
    expect(s?.settle_info_complete).toBe(true);
  });
  it("SQL 행 == calcBrandPay (TS 포트 대조)", () => {
    const c = parseBrandSales(raw)!.campaigns[0];
    const k = calcBrandPay({ net: c.net, sampleNet: c.sample_net, rate: c.seller_rate, bonusPp: c.seller_bonus_pp, refBoost: c.ref_boost_applied, brandRefBoost: c.brand_ref_applied, brandDiscRate: 0.005 });
    expect(k.pg).toBe(c.pg_fee);
    expect(k.sf).toBe(c.seller_fee);
    expect(k.gBonus).toBe(c.seller_bonus);
    expect(k.sfTotal).toBe(c.seller_fee_total);
    expect(k.pfGross).toBe(c.platform_fee_gross);
    expect(k.bDisc).toBe(c.brand_discount);
    expect(k.platformPg).toBe(c.platform_pg);
    expect(k.brandPay).toBe(c.brand_payout_est);
  });
  it("ok:false · 빈 값은 null / 기본값", () => {
    expect(parseBrandSales({ ok: false, code: "NOT_FOUND" })).toBeNull();
    const s = parseBrandSales({ ok: true });
    expect(s?.campaigns).toEqual([]);
    expect(s?.rates.pg_rate).toBe(PG_RATE);
    expect(s?.rates.brand_ref_disc).toBe(BREF_DISC);
  });
});

describe("parseBrandSettlements · brandSettlementStatusLabel — 0019 app_brand_settlements", () => {
  const base = {
    campaign_id: "c6", campaign_code: "c6", status: "SETTLED", seller: { code: "s2", name: "혜린", handle: "@hyerin_pick", platform: "instagram", grade: "골드" },
    product: { code: "p5", name: "데일리 플랜트 프로틴", emoji: "🥤", thumb_url: null }, start_date: "2026-08-06", end_date: "2026-08-11",
  };
  const settled = {
    ...base, kind: "settled", net: 22840400, sample_net: 0, seller_rate: 0.22, pg_fee: 433968, seller_fee: 5024888, seller_bonus: 228404, ref_boost: 0, seller_fee_total: 5253292,
    platform_fee_gross: 2284040, brand_grade: "플래티넘", brand_discount_rate: 0.01, brand_discount: 228404, brand_ref_applied: true, brand_ref_boost: 228404,
    platform_pg: 2261200, brand_payout: 15810312, hold_brand: true, settlement_status: "held", due_on: "2026-09-08", settled_at: "2026-09-22T03:32:52+00:00", paid_at: null,
    payout: { status: "held", amount: 15810312, paid_at: null, hold_reason: "smoke hold" },
  };
  const nullRow = { ...base, kind: "settled", net: null, sample_net: null, seller_rate: 0.22, pg_fee: null, seller_fee: null, seller_bonus: null, ref_boost: null, seller_fee_total: null, platform_fee_gross: null, brand_grade: null, brand_discount_rate: null, brand_discount: null, brand_ref_applied: null, brand_ref_boost: null, platform_pg: null, brand_payout: null, hold_brand: null, settlement_status: null, due_on: "2026-09-01", settled_at: "2026-09-01T00:00:00+00:00", paid_at: null, payout: null };
  const pending = { ...base, campaign_code: "c1", status: "CLEARING", kind: "pending", net: 1315600, sample_net: 0, seller_rate: 0.2, pg_fee: 24996, seller_fee: 263120, seller_bonus: 13156, ref_boost: 0, seller_fee_total: 276276, platform_fee_gross: 131560, brand_grade: "골드", brand_discount_rate: 0.005, brand_discount: 6578, brand_ref_applied: false, brand_ref_boost: 0, platform_pg: 149978, brand_payout: 902502, hold_brand: false, settlement_status: null, due_on: "2026-10-08", settled_at: null, paid_at: null, payout: null };
  const raw = { ok: true, settle_info_complete: true, has_bank_info: true, rows: [settled, nullRow, pending], totals: { settled_payout: 15810312, pending_payout: 902502, held_payout: 15810312 } };
  it("settled 스냅샷 · 명세 없는 SETTLED(null) · pending 재계산 행", () => {
    const s = parseBrandSettlements(raw)!;
    expect(s.rows).toHaveLength(3);
    const [a, b, c] = s.rows;
    expect(a.kind).toBe("settled");
    expect(a.platform_pg).toBe(2284040 - 228404 - 228404 + 433968);
    expect(a.payout?.status).toBe("held");
    expect(b.brand_payout).toBeNull();
    expect(b.hold_brand).toBeNull();
    expect(c.kind).toBe("pending");
    expect(c.net! - c.seller_fee! - c.platform_pg!).toBe(c.brand_payout);
    expect(s.totals.held_payout).toBe(15810312);
  });
  it("상태 칸 — 판매 중 · 교환·환불 기간 · 명세 준비 중 · 지급 보류 · 지급 완료 · 지급 대기", () => {
    const s = parseBrandSettlements(raw)!;
    const [a, b, c] = s.rows;
    expect(brandSettlementStatusLabel(a)).toEqual({ label: "지급 보류", tone: "red", sub: "smoke hold" });
    expect(brandSettlementStatusLabel(b)).toEqual({ label: "정산 완료", tone: "gray", sub: "명세 준비 중" });
    expect(brandSettlementStatusLabel(c)).toEqual({ label: "교환·환불 기간", tone: "amber", sub: "정산 예정 10/8" });
    expect(brandSettlementStatusLabel({ ...c, status: "LIVE" }).label).toBe("판매 중");
    const paid: BrandSettlementRow = { ...a, hold_brand: false, settlement_status: "paid", payout: { status: "paid", amount: 1, paid_at: "2026-09-30T00:00:00+00:00", hold_reason: null } };
    expect(brandSettlementStatusLabel(paid)).toEqual({ label: "지급 완료", tone: "green", sub: "9/30" });
    const wait: BrandSettlementRow = { ...a, hold_brand: false, settlement_status: "pending", payout: null };
    expect(brandSettlementStatusLabel(wait)).toEqual({ label: "지급 대기", tone: "blue", sub: "기준일 9/8" });
    const held: BrandSettlementRow = { ...a, payout: null };
    expect(brandSettlementStatusLabel(held).sub).toMatch(/정산 정보 미등록/);
  });
  it("ok:false 는 null", () => {
    expect(parseBrandSettlements({ ok: false })).toBeNull();
  });
});

describe("문구", () => {
  it("brandRateLine — 등급·추천 보너스는 셀러리 부담 표기", () => {
    expect(brandRateLine(0.2)).toBe("20%");
    expect(brandRateLine(0.2, 1, false)).toBe("20% (등급 +1%p 셀러리 부담)");
    expect(brandRateLine(0.18, 0.5, true)).toBe("18% (등급 +0.5%p · 추천 +1%p 셀러리 부담)");
    expect(brandRateLine(null)).toBe("—");
  });
  it("platformPgLine", () => {
    expect(platformPgLine(0.1, 0.019, "골드", 0.005, false)).toBe("플랫폼 10% −0.5%p 골드 + PG 1.9%");
    expect(platformPgLine(0.1, 0.019, "플래티넘", 0.01, true)).toBe("플랫폼 10% −1%p 플래티넘 −1%p 추천 + PG 1.9%");
    expect(platformPgLine(0.1, 0.019, "실버", 0, null)).toBe("플랫폼 10% + PG 1.9%");
  });
  it("brandPayoutLine", () => {
    expect(brandPayoutLine(1315600, 902502, "2026-10-08")).toBe("확정 ₩1,315,600 → 브랜드 정산액 ₩902,502 (D+21 10/8)");
    expect(brandPayoutLine(0, 0, null)).toBe("확정 ₩0 → 브랜드 정산액 ₩0");
  });
});
