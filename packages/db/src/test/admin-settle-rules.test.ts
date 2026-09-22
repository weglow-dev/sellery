// 관리자 정산 규칙 — calcSettlement 는 calc() 전체. 인플루언서 조각(calcSellerShare) · 브랜드 조각(calcBrandPay) 과 같은 숫자여야 하고,
// 0020 app_admin_settle_preview 의 live 값(스모크) 과도 같아야 한다 — 셋 중 하나를 바꾸면 여기가 먼저 깨진다.
import { describe, expect, it } from "vitest";
import { BG_DISC, GRADES, WHT } from "@sellery/core/constants";
import {
  brandHoldReason,
  calcSettlement,
  dueLabel,
  HOLD_LABELS,
  parseAdminSettlements,
  parsePayoutExport,
  parseSettlePreview,
  parseSettleRunResult,
  payoutCsv,
  rrnCsv,
  sellerHoldReason,
  settleRunSummary,
  toCsv,
} from "../admin/settle-rules";
import { calcBrandPay } from "../brand/settle-rules";
import { calcSellerShare, sellerWhtRate } from "../partner/settle-rules";

describe("calcSettlement — 시드 c1 (지유 골드 × 버닝온 20% · b1 골드 −0.5%p) = 0013/0019 스모크 값", () => {
  // gross 1,375,400 − refunded 59,800 = net 1,315,600
  const k = calcSettlement({ gross: 1375400, refunds: 59800, rate: 0.2, bonusPp: 1, brandDiscRate: BG_DISC.골드, whtRate: sellerWhtRate("personal") });
  const seller = calcSellerShare({ net: 1375400 - 59800, rate: 0.2, bonusPp: 1, whtRate: sellerWhtRate("personal") });
  const brand = calcBrandPay({ net: 1375400 - 59800, rate: 0.2, bonusPp: 1, brandDiscRate: BG_DISC.골드 });
  it("인플루언서 라인 = calcSellerShare (sfTotal 276,276 · wht 9,117 · 실수령 267,159)", () => {
    expect(k.base).toBe(seller.base);
    expect(k.sf).toBe(seller.sf);
    expect(k.gBonus).toBe(seller.gBonus);
    expect(k.boost).toBe(seller.boost);
    expect(k.sfTotal).toBe(276276);
    expect(k.wht).toBe(9117);
    expect(k.sellerPayout).toBe(267159);
    expect(k.sellerPayout).toBe(seller.payout);
  });
  it("브랜드 라인 = calcBrandPay (brandPay 902,502 · platformPg 149,978 · pg 24,996)", () => {
    expect(k.pg).toBe(24996);
    expect(k.pg).toBe(brand.pg);
    expect(k.pfGross).toBe(131560);
    expect(k.bDisc).toBe(6578);
    expect(k.brandPay).toBe(902502);
    expect(k.brandPay).toBe(brand.brandPay);
    expect(k.platformPg).toBe(149978);
    expect(k.platformPg).toBe(brand.platformPg);
  });
  it("플랫폼 라인 — costs = 등급 보너스 + 등급 할인 · pf = 10% − costs · vat = pf − pf/1.1", () => {
    expect(k.costs).toBe(19734); // 13,156 + 6,578
    expect(k.pf).toBe(111826); // 131,560 − 19,734
    expect(k.vat).toBe(10166); // 111,826 − 101,660
    expect(k.pfNet).toBe(101660);
    expect(k.refReward).toBe(0);
    expect(k.bBoost).toBe(0);
    expect(k.bReward).toBe(0);
    expect(k.sampleRefundCel).toBe(0);
    expect(k.sampleRefundCash).toBe(0);
    expect(k.sampleCelCover).toBe(0);
  });
});

describe("calcSettlement — 시드 c5 (민지 실버 +0.5%p · 추천 부스트 · 18% · b1 골드)", () => {
  const k = calcSettlement({ gross: 13695000, refunds: 473100, rate: 0.18, bonusPp: 0.5, refBoost: true, brandDiscRate: 0.005, whtRate: WHT });
  const brand = calcBrandPay({ net: 13695000 - 473100, rate: 0.18, bonusPp: 0.5, refBoost: true, brandDiscRate: 0.005 });
  const seller = calcSellerShare({ net: 13695000 - 473100, rate: 0.18, bonusPp: 0.5, refBoost: true, whtRate: WHT });
  it("net 13,221,900 · 부스트는 net 전체 · 추천인 2% 보상은 플랫폼 부담", () => {
    expect(k.net).toBe(13221900);
    expect(k.sf).toBe(2379942);
    expect(k.gBonus).toBe(66110); // 66,109.5 half-up
    expect(k.boost).toBe(132219);
    expect(k.refReward).toBe(264438);
    expect(k.sfTotal).toBe(2578271); // 2,578,270.5
    expect(k.sfTotal).toBe(seller.sfTotal);
    expect(k.wht).toBe(85083); // 85,082.93
    expect(k.sellerPayout).toBe(2493188); // 2,493,187.57
    expect(k.sellerPayout).toBe(seller.payout);
  });
  it("브랜드 정산액 9,334,661 · 플랫폼+PG 1,507,297 (calcBrandPay 와 동일)", () => {
    expect(k.brandPay).toBe(9334661);
    expect(k.brandPay).toBe(brand.brandPay);
    expect(k.platformPg).toBe(1507297);
    expect(k.bDisc).toBe(66110);
  });
  it("플랫폼 — costs 528,876 · pf 793,314 · vat 72,119 · pfNet 721,195 (라인 독립 반올림: 저장값끼리 ±1원 가능)", () => {
    expect(k.pfGross).toBe(1322190);
    expect(k.costs).toBe(528876);
    expect(k.pf).toBe(793314);
    expect(k.vat).toBe(72119);
    expect(k.pfNet).toBe(721195);
  });
});

describe("calcSettlement — 제안서 예시 (settlement-policy §12 · 플래티넘 +1.5%p · 개인)", () => {
  const k = calcSettlement({ gross: 2719000, refunds: 89700, rate: 0.2, bonusPp: GRADES.find((t) => t.g === "플래티넘")!.bonus, whtRate: WHT });
  it("문서 표의 표시값과 같다", () => {
    expect(k.net).toBe(2629300);
    expect(k.pg).toBe(49957);
    expect(k.sf).toBe(525860);
    expect(k.gBonus).toBe(39440); // 39,439.5
    expect(k.sfTotal).toBe(565300); // 565,299.5
    expect(k.pf).toBe(223491); // 223,490.5 (제안서는 223,490 — 문서에 기록된 ₩1 차이)
    expect(k.brandPay).toBe(1790553);
    expect(k.wht).toBe(18655);
    expect(k.sellerPayout).toBe(546645);
    expect(k.pfNet).toBe(203173);
  });
});

describe("calcSettlement — 샘플 구매분 · 환급 · 브랜드 추천 · 사업자", () => {
  it("샘플 구매분은 sf·gBonus 에서만 빠지고 pg·10%·추천·할인은 net 전체 (§9)", () => {
    const k = calcSettlement({ gross: 100000, sampleNet: 20000, rate: 0.2, bonusPp: 1, refBoost: true, brandRefBoost: true, brandDiscRate: 0.01, whtRate: 0 });
    expect(k.base).toBe(80000);
    expect(k.sf).toBe(16000);
    expect(k.gBonus).toBe(800);
    expect(k.boost).toBe(1000);
    expect(k.refReward).toBe(2000);
    expect(k.bBoost).toBe(1000);
    expect(k.bReward).toBe(1000);
    expect(k.bDisc).toBe(1000);
    expect(k.pfGross).toBe(10000);
    expect(k.costs).toBe(6800);
    expect(k.pf).toBe(3200);
    expect(k.brandPay).toBe(100000 - 1900 - 16000 - 10000 + 1000 + 1000);
    expect(k.wht).toBe(0);
    expect(k.sellerPayout).toBe(17800);
  });
  it("샘플 환급 — 현금은 실수령에 가산(원천징수 없음) · 🥬 는 개수만 · 보전액 = sampleCel × 20,000", () => {
    const k = calcSettlement({ gross: 123920, sampleNet: 23920, rate: 0.2, whtRate: WHT, sampleRefundCel: 1, sampleRefundCash: 3920, sampleCel: 1 });
    expect(k.sfTotal).toBe(20000);
    expect(k.wht).toBe(660);
    expect(k.sellerPayout).toBe(20000 - 660 + 3920);
    expect(k.sampleRefundCel).toBe(1);
    expect(k.sampleRefundCash).toBe(3920);
    expect(k.sampleCelCover).toBe(20000);
  });
  it("사업자(whtRate 0) 는 원천징수 0 · pf 가 0 이하이면 vat 0", () => {
    const k = calcSettlement({ gross: 100000, rate: 0.9, bonusPp: 3, refBoost: true, brandRefBoost: true, brandDiscRate: 0.02, whtRate: sellerWhtRate("biz") });
    expect(k.wht).toBe(0);
    expect(k.pf).toBe(0); // 10% − (3 + 1 + 2 + 1 + 1 + 2)% = 0
    expect(k.vat).toBe(0);
    expect(k.pfNet).toBe(0);
  });
  it("빈 입력은 전부 0", () => {
    const k = calcSettlement({ gross: 0, rate: 0.2 });
    expect(Object.values(k).every((v) => v === 0)).toBe(true);
  });
});

describe("지급 보류 판정 — 0020 admin_payout_hold_reason 과 같은 순서", () => {
  it("인플루언서: 계좌 → (사업자: 사업자번호+세금계산서 · 개인: 주민번호)", () => {
    expect(sellerHoldReason({ hasBankInfo: false, settleType: "personal", hasRrn: true })).toBe("BANK_MISSING");
    expect(sellerHoldReason({ hasBankInfo: false, settleType: "biz", hasRrn: false, hasBizNo: true, hasTaxInfo: true })).toBe("BANK_MISSING");
    expect(sellerHoldReason({ hasBankInfo: true, settleType: "personal", hasRrn: false })).toBe("RRN_MISSING");
    expect(sellerHoldReason({ hasBankInfo: true, settleType: null, hasRrn: false })).toBe("RRN_MISSING"); // 미등록(null) 은 개인 취급
    expect(sellerHoldReason({ hasBankInfo: true, settleType: "personal", hasRrn: true })).toBeNull();
    expect(sellerHoldReason({ hasBankInfo: true, settleType: "biz", hasRrn: false, hasBizNo: true, hasTaxInfo: false })).toBe("TAX_INFO_MISSING");
    expect(sellerHoldReason({ hasBankInfo: true, settleType: "biz", hasRrn: false, hasBizNo: false, hasTaxInfo: true })).toBe("TAX_INFO_MISSING");
    expect(sellerHoldReason({ hasBankInfo: true, settleType: "biz", hasRrn: false, hasBizNo: true, hasTaxInfo: true })).toBeNull();
  });
  it("브랜드: 정산 정보 4개 완비 여부 하나", () => {
    expect(brandHoldReason({ settleInfoComplete: false })).toBe("SETTLE_INFO_INCOMPLETE");
    expect(brandHoldReason({ settleInfoComplete: true })).toBeNull();
  });
  it("문구가 있다", () => {
    expect(HOLD_LABELS.BANK_MISSING).toBe("정산 계좌 미등록");
    expect(HOLD_LABELS.RRN_MISSING).toContain("주민등록번호");
  });
});

describe("CSV — BOM · CRLF · 계좌는 엑셀 문자열", () => {
  it("toCsv 는 BOM 으로 시작하고 CRLF 로 끝나며 쉼표·따옴표를 감싼다", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'q"q'], [1, null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a,b\r\n"x,y","q""q"\r\n1,\r\n');
  });
  it("payoutCsv — 헤더 20열 · 계좌 =\"…\" · 상태 문구", () => {
    const csv = payoutCsv([
      {
        payout_id: "p1",
        settlement_id: "s1",
        campaign_code: "c5",
        title: "벨리라잇 · @minji_diet",
        payee_type: "seller",
        payee_code: "s3",
        payee_name: "민지",
        settle_type: "personal",
        bank: "토스뱅크",
        account: "100012345678",
        holder: "박민지",
        biz_no: null,
        amount: 2493188,
        wht: 85083,
        status: "pending",
        hold_code: null,
        due_on: "2026-09-25",
        settled_at: "2026-09-22T03:00:00+00:00",
        paid_at: null,
        memo: null,
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0].split(",").length).toBe(20);
    expect(lines[1]).toContain('"=""100012345678"""'); // CSV 이스케이프된 ="…" — 엑셀은 수식으로 읽어 문자열 유지
    expect(lines[1]).toContain("인플루언서");
    expect(lines[1]).toContain("지급 대기");
    expect(lines[1]).toContain("2026-09-22");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("rrnCsv — 사업자 행은 주민번호 빈칸 + 비고", () => {
    const csv = rrnCsv([
      { settlement_id: "s", campaign_code: "c6", seller_code: "s2", seller_name: "혜린", settle_type: "biz", rrn: null, code: "BIZ", seller_fee_total: 1, seller_wht: 0, seller_payout: 1, settled_at: null },
    ]);
    expect(csv.split("\r\n")[1]).toContain("사업자(세금계산서)");
  });
});

describe("파서 · 문구", () => {
  const live = {
    ok: true,
    source: "live",
    campaign_id: "c0000000-0000-4000-8000-000000000005",
    campaign_code: "c5",
    campaign_status: "CLEARING",
    title: "벨리라잇 · @minji_diet",
    due_on: "2026-09-25",
    seller: { id: "a0000000-0000-4000-8000-000000000003", code: "s3", name: "민지", handle: "@minji_diet", grade: "실버", settle_type: "personal", has_bank_info: true, has_rrn: false },
    brand: { id: "b0000000-0000-4000-8000-000000000001", code: "b1", name: "바인허브", grade: "골드", settle_info_complete: true },
    product: { id: "d0000000-0000-4000-8000-000000000003", code: "p3", name: "벨리라잇", emoji: "📦", thumb_url: null, sample_refund: false },
    paid_count: 412,
    refund_count: 14,
    gross: 13695000,
    refunds: 473100,
    net: 13221900,
    sample_net: 0,
    seller_rate: 0.18,
    seller_bonus_pp: 0.5,
    wht_rate: 0.033,
    ref_boost_applied: true,
    seller_fee_total: 2578271,
    seller_wht: 85083,
    seller_payout: 2493188,
    brand_payout: 9334661,
    platform_fee: 793314,
    platform_net: 721195,
    hold_seller: true,
    hold_brand: false,
    holds: { seller: { code: "RRN_MISSING", label: "주민등록번호 미등록 — 원천징수 자료" }, brand: null },
    settlement: null,
    payouts: { seller: null, brand: null },
    eligible: true,
    reason: null,
  };
  it("parseSettlePreview(live)", () => {
    const p = parseSettlePreview(live)!;
    expect(p.source).toBe("live");
    expect(p.seller_payout).toBe(2493188);
    expect(p.holds.seller?.code).toBe("RRN_MISSING");
    expect(p.holds.brand).toBeNull();
    expect(p.eligible).toBe(true);
    expect(p.settlement).toBeNull();
    expect(parseSettlePreview({ ok: false, code: "NOT_FOUND" })).toBeNull();
  });
  it("parseSettlePreview(none) — 스냅샷 없는 SETTLED(c6)", () => {
    const p = parseSettlePreview({ ok: true, source: "none", campaign_id: "x", campaign_code: "c6", campaign_status: "SETTLED", eligible: false, reason: "NO_SNAPSHOT" })!;
    expect(p.source).toBe("none");
    expect(p.reason).toBe("NO_SNAPSHOT");
    expect(p.net).toBe(0);
  });
  it("parseAdminSettlements — queue · rows · counts", () => {
    const a = parseAdminSettlements({ ok: true, today: "2026-09-22", status: null, queue: [live], rows: [{ ...live, source: "snapshot", settlement: { id: "st1", status: "held", settled_at: "2026-09-22T03:00:00Z", paid_at: null, memo: null } }], counts: { due_now: 1, clearing: 2, pending: 0, held: 1, paid: 0, payouts_pending: 1, payouts_held: 1, payouts_pending_amount: 9334661 } })!;
    expect(a.queue).toHaveLength(1);
    expect(a.queue[0].seller_payout).toBe(2493188);
    expect(a.rows[0].source).toBe("snapshot");
    expect(a.rows[0].settlement?.status).toBe("held");
    expect(a.counts.due_now).toBe(1);
    expect(parseAdminSettlements({ ok: false, code: "BAD_STATUS" })).toBeNull();
  });
  it("parseSettleRunResult + settleRunSummary", () => {
    const r = parseSettleRunResult({
      ok: true,
      already: false,
      forced: true,
      settlement_id: "st1",
      campaign_code: "c5",
      net: 13221900,
      seller_fee_total: 2578271,
      seller_wht: 85083,
      seller_payout: 2493188,
      brand_payout: 9334661,
      holds: { seller: { code: "RRN_MISSING", label: "주민등록번호 미등록 — 원천징수 자료" }, brand: null },
      payouts: { seller: { id: "p1", payee_type: "seller", status: "held", amount: 2493188, wht: 85083, hold_code: "RRN_MISSING" }, brand: { id: "p2", payee_type: "brand", status: "pending", amount: 9334661, wht: 0 } },
      celery: { sample_refund_cel: 0, sample_refund_cash: 0, seller_earned: 3, brand_earned: 0 },
      referral: { seller_reward: 264438, brand_reward: 0 },
      grades: { seller: { ok: true, previous_grade: "실버", grade: "골드", previous_m3_sales: 13221900, m3_sales: 26443800, changed: true }, brand: { ok: true, previous: "골드", grade: "골드", gmv: 1, changed: false } },
    });
    expect(r.ok && !r.already && r.payouts.seller?.status).toBe("held");
    const line = settleRunSummary(r);
    expect(line).toContain("c5: 확정 ₩13,221,900");
    expect(line).toContain("인플루언서 보류(주민등록번호");
    expect(line).toContain("🥬 획득 인플 3");
    expect(line).toContain("추천 보상 ₩264,438");
    expect(line).toContain("실버 → 골드");
    expect(line).toContain("강제 실행");
    expect(settleRunSummary(parseSettleRunResult({ ok: true, already: true, settlement_id: "st1", campaign_code: "c5" }))).toBe("c5: 이미 정산 완료");
    expect(settleRunSummary(parseSettleRunResult({ ok: false, code: "NOT_DUE", due_on: "2026-10-08" }))).toContain("10/8");
  });
  it("parsePayoutExport 실패 코드", () => {
    expect(parsePayoutExport({ ok: false, code: "ACTOR_REQUIRED" })).toEqual({ ok: false, code: "ACTOR_REQUIRED" });
    const e = parsePayoutExport({ ok: true, status: "pending", count: 1, logged: 1, rows: [{ payout_id: "p", settlement_id: "s", campaign_code: "c5", payee_type: "brand", amount: 1, wht: 0, status: "pending", account: "1" }] });
    expect(e.ok && e.rows[0].payee_type).toBe("brand");
  });
  it("dueLabel", () => {
    expect(dueLabel("2026-09-25", "2026-09-22")).toBe("D-3 (9/25)");
    expect(dueLabel("2026-09-22", "2026-09-22")).toBe("오늘 (9/22)");
    expect(dueLabel("2026-09-20", "2026-09-22")).toBe("D+2 경과 (9/20)");
    expect(dueLabel(null, "2026-09-22")).toBe("기준일 미정");
  });
});
