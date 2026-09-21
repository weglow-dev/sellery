// 브랜드 시점 캠페인 규칙 — packages/db/src/brand/campaign-rules.ts (docs/brand-console-plan.md §1 · 0015 brand_campaign_json / app_brand_*_sample)
import { describe, expect, it } from "vitest";
import {
  BRAND_TURN_STATUSES,
  TRACKING_RE,
  brandNextAction,
  matchesBrandCampaignFilter,
  normalizeTrackingNo,
  parseBrandCampaignDetail,
  parseBrandCampaignRow,
  parseBrandCampaignRows,
  parseRejectInput,
  parseSampleActionResult,
  parseShipInput,
  sampleActionFailMessage,
  shippingLine,
} from "../brand/campaign-rules";

const row = {
  id: "c0000000-0000-4000-8000-000000000007",
  code: "c7",
  status: "SAMPLE_REQUESTED",
  created_at: "2026-09-21T00:00:00+00:00",
  updated_at: "2026-09-21T00:00:00+00:00",
  invited: false,
  auto_proposed: false,
  regongu: false,
  purchased: false,
  sample_price: null,
  sample_cel: 0,
  sample_cash: 0,
  sample_method: null,
  sample_courier: null,
  tracking_no: null,
  sample_shipped_at: null,
  received_at: null,
  test_due: null,
  proposed_start: null,
  proposed_end: null,
  proposed_qty: null,
  start_date: null,
  end_date: null,
  qty: 0,
  sold_qty: 0,
  decision_reason: null,
  settled_at: null,
  has_shipping: true,
  product: { id: "d1", code: "p1", name: "버닝온", emoji: "🔥", thumb_url: null, category: "다이어트·체형", sale_price: 29900, consumer_price: 39000, commission_rate: "0.2000", sample_text: "무상 1박스", status: "listed" },
  seller: {
    id: "a6",
    code: "s6",
    name: "하늘",
    handle: "@haneul_fit",
    platform: "instagram",
    avatar_url: null,
    grade: "실버",
    followers: 42000,
    hidden: false,
    primary_channel: { platform: "instagram", handle: "@haneul_fit", url: "https://instagram.com/haneul_fit", followers: 42000, verified: true },
  },
};

describe("BRAND_TURN_STATUSES · brandNextAction — ST[*].turn === 'brand'", () => {
  it("브랜드 차례 4개 = 0015 app_brand_requests 기본 큐", () => {
    expect([...BRAND_TURN_STATUSES].sort()).toEqual(["SAMPLE_APPROVED", "SAMPLE_PURCHASED", "SAMPLE_REQUESTED", "SCHEDULE_PROPOSED"]);
  });
  it.each([
    ["SAMPLE_REQUESTED", "approve"],
    ["SAMPLE_APPROVED", "ship"],
    ["SAMPLE_PURCHASED", "ship"],
    ["SCHEDULE_PROPOSED", "confirm_schedule"],
    ["INVITED", "wait"],
    ["SAMPLE_SHIPPED", "wait"],
    ["TESTING", "wait"],
    ["SCHEDULE_CONFIRMED", "wait"],
    ["LIVE", "live"],
    ["CLEARING", "live"],
    ["SETTLED", "ended"],
    ["REJECTED", "ended"],
    ["nope", "wait"],
  ])("%s → %s", (status, kind) => {
    expect(brandNextAction(status).kind).toBe(kind);
  });
});

describe("parseBrandCampaignRow(s) · parseBrandCampaignDetail — 0015 jsonb", () => {
  it("정상 행 — 칩 · 액션 · 인플루언서 요약 · 수수료율 문자열→숫자", () => {
    const r = parseBrandCampaignRow(row);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.code).toBe("c7");
    expect(r.chip.label).toBe("샘플 요청");
    expect(r.chip.turn).toBe("brand");
    expect(r.action.kind).toBe("approve");
    expect(r.product.commission_rate).toBe(0.2);
    expect(r.seller.primary_channel?.verified).toBe(true);
    expect(r.seller.grade).toBe("실버");
    expect(r.has_shipping).toBe(true);
  });
  it("product · seller 가 빠지면 null · 배열 파서는 그 행을 버린다", () => {
    expect(parseBrandCampaignRow({ ...row, seller: null })).toBeNull();
    expect(parseBrandCampaignRow({ ...row, product: {} })).toBeNull();
    expect(parseBrandCampaignRows([row, { ...row, seller: null }, "x"]).map((r) => r.code)).toEqual(["c7"]);
    expect(parseBrandCampaignRows(null)).toEqual([]);
  });
  it("상세 — sample_shipping · events", () => {
    const d = parseBrandCampaignDetail({
      ...row,
      sample_shipping: { recipient: "홍길동", phone: "01012345678", postcode: "06236", address1: "서울 강남구", address2: "101호" },
      events: [
        { id: "e1", kind: "system", sender: "system", body: "요청", event_type: "sample_requested", payload: {}, leak_flag: false, created_at: "2026-09-21T00:00:00Z" },
        { id: "e2", kind: "chat", sender: "seller", body: "안녕하세요", event_type: null, payload: null, leak_flag: false, created_at: "2026-09-21T00:01:00Z" },
        { kind: "chat" },
      ],
    });
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.sample_shipping?.recipient).toBe("홍길동");
    expect(d.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(d.events[1].sender).toBe("seller");
    expect(parseBrandCampaignDetail(null)).toBeNull();
  });
});

describe("matchesBrandCampaignFilter — 데모 camps 칩 all · live · soon · prep · done", () => {
  it.each([
    ["LIVE", "live", true],
    ["LIVE", "prep", false],
    ["SCHEDULE_CONFIRMED", "soon", true],
    ["SAMPLE_REQUESTED", "prep", true],
    ["TESTING", "prep", true],
    ["CLEARING", "done", true],
    ["REJECTED", "done", true],
    ["REJECTED", "prep", false],
    ["SETTLED", "all", true],
  ] as const)("%s · %s → %s", (status, filter, expected) => {
    expect(matchesBrandCampaignFilter(status, filter)).toBe(expected);
  });
});

describe("parseShipInput · normalizeTrackingNo — 0015 app_brand_ship_sample 과 같은 조건", () => {
  it("정상 — 공백 제거, 하이픈 유지", () => {
    expect(parseShipInput({ courier: "CJ대한통운", tracking_no: " 6890 1234 5678 " })).toEqual({ ok: true, courier: "CJ대한통운", trackingNo: "689012345678" });
    expect(parseShipInput({ courier: "한진택배", tracking_no: "1234-5678-9012" })).toMatchObject({ ok: true, trackingNo: "1234-5678-9012" });
  });
  it("FormData", () => {
    const fd = new FormData();
    fd.set("courier", "롯데택배");
    fd.set("tracking_no", "ABC123456");
    expect(parseShipInput(fd)).toMatchObject({ ok: true, courier: "롯데택배", trackingNo: "ABC123456" });
  });
  it.each([
    ["경동택배", "123456789", "courier"],
    ["", "123456789", "courier"],
    ["CJ대한통운", "12345", "tracking_no"], // 6자 미만
    ["CJ대한통운", "abcdefg", "tracking_no"], // 숫자 없음
    ["CJ대한통운", "1".repeat(31), "tracking_no"],
    ["CJ대한통운", "1234_5678", "tracking_no"],
    ["CJ대한통운", "", "tracking_no"],
  ])("%s / %s → %s", (courier, tracking_no, field) => {
    expect(parseShipInput({ courier, tracking_no })).toMatchObject({ ok: false, field });
  });
  it("TRACKING_RE · normalizeTrackingNo", () => {
    expect(TRACKING_RE.test("689012345678")).toBe(true);
    expect(normalizeTrackingNo(" 12 34\t56 ")).toBe("123456");
    expect(normalizeTrackingNo(null)).toBe("");
  });
});

describe("parseRejectInput — 선택 사유 ≤ 200자", () => {
  it("cleanText · 빈 값 null · 넘치면 자른다", () => {
    expect(parseRejectInput({ reason: "  재고   부족 💙 " })).toEqual({ reason: "재고 부족" });
    expect(parseRejectInput({ reason: "" })).toEqual({ reason: null });
    expect(parseRejectInput({})).toEqual({ reason: null });
    expect(parseRejectInput({ reason: "a".repeat(250) }).reason?.length).toBe(200);
  });
});

describe("parseSampleActionResult · sampleActionFailMessage", () => {
  it("ok — already · ship 의 courier/tracking", () => {
    expect(parseSampleActionResult({ ok: true, already: false, campaign_id: "c", campaign_code: "c7", status: "SAMPLE_APPROVED" })).toEqual({
      ok: true,
      already: false,
      campaignId: "c",
      campaignCode: "c7",
      status: "SAMPLE_APPROVED",
      courier: null,
      trackingNo: null,
    });
    expect(parseSampleActionResult({ ok: true, already: true, campaign_id: "c", campaign_code: "c10", status: "SAMPLE_SHIPPED", courier: "CJ대한통운", tracking_no: "689012345678" })).toMatchObject({
      ok: true,
      already: true,
      courier: "CJ대한통운",
      trackingNo: "689012345678",
    });
  });
  it("ok:false 코드 · 계약 위반 · 낯선 코드 → DB_ERROR", () => {
    expect(parseSampleActionResult({ ok: false, code: "WRONG_STATUS", status: "REJECTED" })).toEqual({ ok: false, code: "WRONG_STATUS", status: "REJECTED" });
    expect(parseSampleActionResult({ ok: false, code: "NOT_FOUND" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(parseSampleActionResult({ ok: true })).toEqual({ ok: false, code: "DB_ERROR" });
    expect(parseSampleActionResult({ ok: false, code: "SOMETHING" })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseSampleActionResult("x")).toEqual({ ok: false, code: "DB_ERROR" });
  });
  it("문구 — WRONG_STATUS 는 상태 라벨 포함", () => {
    expect(sampleActionFailMessage({ code: "WRONG_STATUS", status: "REJECTED" })).toContain("거절됨");
    expect(sampleActionFailMessage({ code: "BAD_COURIER" })).toContain("택배사");
    expect(sampleActionFailMessage({ code: "BAD_TRACKING" })).toContain("송장번호");
    expect(sampleActionFailMessage({ code: "???" })).toContain("문제가 생겼어요");
  });
});

describe("shippingLine — 발송 패널 한 줄", () => {
  it("전화 하이픈 · 상세 주소 · 메모", () => {
    expect(shippingLine({ recipient: "홍길동", phone: "01012345678", postcode: "06236", address1: "서울 강남구 테헤란로 1", address2: "101호", memo: "부재 시 문 앞" })).toBe(
      "홍길동 · 010-1234-5678 · (06236) 서울 강남구 테헤란로 1 101호 · 메모: 부재 시 문 앞",
    );
    expect(shippingLine({ recipient: "김", phone: "021234567", postcode: "1", address1: "a" })).toBe("김 · 021234567 · (1) a");
    expect(shippingLine(null)).toBe("");
  });
});
