// 샘플 요청 · 캠페인 표시 규칙 — packages/db/src/partner/sample-rules.ts (0011 app_sample_quote 계약 · 프로토타입 sampleBtn · sampleLine · reqSample)
import { describe, expect, it } from "vitest";
import {
  BUY_COMING_SOON,
  CAMPAIGN_STEPS,
  SAMPLE_BUY_ENABLED,
  samplePayHref,
  campaignChip,
  isRequestFreeSampleCode,
  notFreeMessage,
  parseSampleQuote,
  parseShippingInput,
  parseStoredShipping,
  sampleButton,
  sampleLine,
  sampleStatus,
  stepIndex,
  type SampleQuote,
  parseSampleRefundRequest,
  parseSampleRefundState,
  sampleRefundReadyLine,
  sampleRefundRequestFailMessage,
  sampleShipDeadlineLine,
} from "../partner/sample-rules";

/** 0047 app_sample_quote 의 실제 응답 (s101 스타터 × p2 치팅온 ₩26,900 · rate 0.2 · use_cel=true) — quota·left 는 호환용 중립값(null) */
const RAW_BUY = {
  mode: "buy",
  reason: "GRADE_BELOW",
  free: false,
  price: 21520,
  cel: 1,
  cash: 1520,
  use_cel: true,
  method: "cel",
  balance: 3,
  cel_won: 20000,
  free_grade: "브론즈",
  seller_grade: "스타터",
  free_eligible: false,
  had_free: false,
  quota: null,
  extra: 0,
  used: 0,
  left: null,
  buy_mode: "auto",
  fixed_price: 0,
  refund: false,
  exclusive_grade: null,
  exclusive_locked: false,
  campaign_code: null,
  campaign_status: null,
  seller_id: "40dfa17a-f3a5-4843-940b-2f9189a3680d",
  product_id: "d0000000-0000-4000-8000-000000000002",
};

const q = (patch: Partial<SampleQuote>): SampleQuote => ({ ...(parseSampleQuote(RAW_BUY) as SampleQuote), ...patch });

describe("parseSampleQuote — 0011 jsonb 계약", () => {
  it("실제 RPC 응답을 그대로 좁힌다", () => {
    const p = parseSampleQuote(RAW_BUY);
    expect(p).not.toBeNull();
    expect(p!.mode).toBe("buy");
    expect(p!.reason).toBe("GRADE_BELOW");
    expect(p!.price).toBe(21520);
    expect(p!.cel).toBe(1);
    expect(p!.cash).toBe(1520);
    expect(p!.method).toBe("cel");
    expect(p!.free).toBe(false);
    expect(p!.free_grade).toBe("브론즈");
    expect(p!.quota).toBeNull();
    expect(p!.left).toBeNull();
  });
  it("옛 응답(0011 · 숫자 quota)도 그대로 좁히되 문구에는 쓰지 않는다 · QUOTA_EXHAUSTED 는 더 이상 사유가 아니다(0047)", () => {
    const old = parseSampleQuote({ ...RAW_BUY, reason: "QUOTA_EXHAUSTED", quota: 1, extra: 0, used: 1, left: 0 });
    expect(old?.quota).toBe(1);
    expect(old?.left).toBe(0);
    expect(old?.reason).toBeNull();
    expect(sampleButton(old).title).toBeNull();
    expect(sampleStatus(old).mine).not.toContain("한도");
  });
  it("unlisted 는 가격이 null 이어도 통과", () => {
    const p = parseSampleQuote({ mode: "unlisted", reason: "NOT_LISTED", free: false, price: null, cel: null, cash: null });
    expect(p?.mode).toBe("unlisted");
    expect(p?.price).toBeNull();
    expect(p?.cel_won).toBe(20000);
  });
  it("낯선 mode · 비객체는 null", () => {
    expect(parseSampleQuote({ mode: "paid" })).toBeNull();
    expect(parseSampleQuote(null)).toBeNull();
    expect(parseSampleQuote("free")).toBeNull();
    expect(parseSampleQuote([])).toBeNull();
  });
  it("낯선 reason 은 null 로 (mode 는 유지)", () => {
    expect(parseSampleQuote({ ...RAW_BUY, reason: "WHATEVER" })?.reason).toBeNull();
  });
});

describe("sampleButton — 프로토타입 sampleBtn 분기 · 문구", () => {
  it("free → 무상 샘플 요청 (활성)", () => {
    const b = sampleButton(q({ mode: "free", reason: null, free: true }));
    expect(b).toMatchObject({ kind: "free", label: "무상 샘플 요청", disabled: false, title: null, price: null });
  });
  it("buy → 샘플 구매 ₩N — 4단계부터 활성 · title 은 사유만 (예고 문구 없음)", () => {
    const b = sampleButton(q({}));
    expect(b.kind).toBe("buy");
    expect(b.label).toBe("샘플 구매 ₩21,520");
    expect(b.price).toBe(21520);
    expect(SAMPLE_BUY_ENABLED).toBe(true);
    expect(b.disabled).toBe(false);
    expect(b.title).toBe("무상 기준 등급 미달");
    expect(b.title).not.toContain(BUY_COMING_SOON);
  });
  it("samplePayHref → /influencer/pay/new?product=<code> (인코딩)", () => {
    expect(samplePayHref("p4")).toBe("/influencer/pay/new?product=p4");
    expect(samplePayHref("p 4/x")).toBe("/influencer/pay/new?product=p%204%2Fx");
  });
  it("buy 사유 HAD_FREE → 무상 샘플은 상품당 1회", () => {
    expect(sampleButton(q({ reason: "HAD_FREE" })).title).toContain("무상 샘플은 상품당 1회");
  });
  it("locked → 독점 잠김 (비활성)", () => {
    const b = sampleButton(q({ mode: "locked", reason: "EXCLUSIVE_LOCKED", exclusive_locked: true }));
    expect(b).toMatchObject({ kind: "locked", label: "독점 잠김", disabled: true });
  });
  it("active → 진행 중 + 캠페인 코드", () => {
    const b = sampleButton(q({ mode: "active", reason: "ALREADY_ACTIVE", campaign_code: "c1", campaign_status: "LIVE" }));
    expect(b).toMatchObject({ kind: "active", label: "진행 중", disabled: false, campaignCode: "c1" });
  });
  it("unlisted · null → 판매 준비 중 (비활성)", () => {
    expect(sampleButton(null)).toMatchObject({ kind: "unlisted", label: "판매 준비 중", disabled: true });
    expect(sampleButton(q({ mode: "unlisted", reason: "NOT_LISTED" }))).toMatchObject({ kind: "unlisted", disabled: true });
  });
});

describe("sampleLine · sampleStatus — 카드 안내 (프로토타입 sampleLine 원문 · 월 한도 없음)", () => {
  it("최대 🥬 분할은 잔액과 무관", () => {
    // quote.cel 은 잔액(3)으로 잘린 값 · 안내는 floor(21520/20000)=1 + ₩1,520
    expect(sampleLine(q({ cel: 0, use_cel: false }))).toBe("브론즈 이상 무상 1회 · 미달 시 ₩21,520 구매 (🥬 1 + ₩1,520)");
  });
  it("지정가 · 환급 옵션", () => {
    expect(sampleLine(q({ price: 15000, free_grade: "골드", buy_mode: "fixed", fixed_price: 15000, refund: true }))).toBe(
      "골드 이상 무상 1회 · 미달 시 ₩15,000 구매 · 브랜드 지정가 · 판매 확정 시 환급",
    );
  });
  it("🥬 로 나누어떨어지면 현금 없음", () => {
    expect(sampleLine(q({ price: 40000 }))).toBe("브론즈 이상 무상 1회 · 미달 시 ₩40,000 구매 (🥬 2)");
  });
  it("가격이 없으면 빈 문자열", () => {
    expect(sampleLine(null)).toBe("");
    expect(sampleLine(q({ price: null }))).toBe("");
  });
  it("sampleStatus — free 는 '무상 요청 가능' 으로 끝난다(이달 N회 남음 없음 · 0047)", () => {
    const st = sampleStatus(q({ mode: "free", reason: null, free: true, free_eligible: true, seller_grade: "골드" }), "무상 3개");
    expect(st.rule).toBe("브론즈 이상 무상 제공 3개(1회)");
    expect(st.mine).toBe("내 등급 골드 → 무상 요청 가능");
  });
  it("sampleStatus — HAD_FREE 는 '이미 무상으로 받은 상품 · 샘플 구매 ₩N'", () => {
    const st = sampleStatus(q({ reason: "HAD_FREE", had_free: true, free_eligible: true, seller_grade: "골드" }));
    expect(st.mine).toBe("이미 무상으로 받은 상품 · 샘플 구매 ₩21,520 (🥬 1 + ₩1,520)");
  });
});

describe("notFreeMessage · isRequestFreeSampleCode", () => {
  it.each([
    ["GRADE_BELOW", "무상 샘플은 브론즈 등급 이상 — 샘플 구매로 진행할 수 있어요"],
    ["HAD_FREE", "이 상품의 무상 샘플은 이미 받았어요 (상품당 1회) — 샘플 구매로 진행"],
  ] as const)("%s", (reason, text) => {
    expect(notFreeMessage(reason, "브론즈")).toBe(text);
  });
  it("알 수 없는 사유는 NOT_FREE 기본 문구 — 월 한도 문구는 없다(0047)", () => {
    expect(notFreeMessage(null, "브론즈")).toBe("무상 샘플 조건에 맞지 않아요 — 샘플 구매로 진행할 수 있어요.");
  });
  it("코드 판별", () => {
    expect(isRequestFreeSampleCode("ALREADY_ACTIVE")).toBe(true);
    expect(isRequestFreeSampleCode("NOT_FREE")).toBe(true);
    expect(isRequestFreeSampleCode("nope")).toBe(false);
    expect(isRequestFreeSampleCode(1)).toBe(false);
  });
});

describe("parseShippingInput — 0011 app_request_free_sample 과 같은 조건", () => {
  const ok = { recipient: " 신  쿤 ", phone: "010-1234-5678", postcode: "06236", address1: "서울 강남구 테헤란로 1", address2: "", memo: " 문 앞 " };
  it("정규화: 공백 정리 · 연락처 숫자만 · 빈 address2 는 키 제거", () => {
    const r = parseShippingInput(ok);
    expect(r).toEqual({ ok: true, shipping: { recipient: "신 쿤", phone: "01012345678", postcode: "06236", address1: "서울 강남구 테헤란로 1", memo: "문 앞" } });
  });
  it.each([
    ["recipient", { ...ok, recipient: "  " }],
    ["phone", { ...ok, phone: "12" }],
    ["phone", { ...ok, phone: "0101234567812345" }],
    ["postcode", { ...ok, postcode: "" }],
    ["address1", { ...ok, address1: "" }],
  ] as const)("필수 %s 누락 · 형식 밖", (field, raw) => {
    expect(parseShippingInput(raw)).toEqual({ ok: false, field });
  });
  it("객체가 아니면 shipping", () => {
    expect(parseShippingInput(null)).toEqual({ ok: false, field: "shipping" });
    expect(parseShippingInput("x")).toEqual({ ok: false, field: "shipping" });
  });
  it("FormData 도 받는다", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(ok)) fd.set(k, v);
    const r = parseShippingInput(fd);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.shipping.phone).toBe("01012345678");
  });
  it("길이 상한 (수취인 40)", () => {
    const r = parseShippingInput({ ...ok, recipient: "가".repeat(50) });
    expect(r.ok && r.shipping.recipient.length).toBe(40);
  });
});

describe("parseStoredShipping — 저장된 jsonb", () => {
  it("필수 키가 문자열이면 통과 · 빈 address2/memo 는 제외", () => {
    expect(parseStoredShipping({ recipient: "a", phone: "01012345678", postcode: "1", address1: "x", address2: "", memo: "m" })).toEqual({
      recipient: "a",
      phone: "01012345678",
      postcode: "1",
      address1: "x",
      memo: "m",
    });
  });
  it("필수 키가 빠지면 null", () => {
    expect(parseStoredShipping({ recipient: "a" })).toBeNull();
    expect(parseStoredShipping(null)).toBeNull();
  });
});

describe("campaignChip · stepIndex — 프로토타입 ST · FLOW · stepper", () => {
  it.each([
    ["SAMPLE_REQUESTED", "샘플 요청", "blue", "brand", false],
    ["SAMPLE_SHIPPED", "샘플 배송중", "blue", "seller", false],
    ["TESTING", "테스트 중", "amber", "seller", false],
    ["LIVE", "판매 진행중", "green", null, true],
    ["REJECTED", "거절됨", "red", null, false],
    ["SETTLED", "정산 완료", "green", null, false],
  ] as const)("%s → %s", (status, label, tone, turn, live) => {
    expect(campaignChip(status)).toEqual({ label, tone, turn, live });
  });
  it("낯선 상태는 원문 gray", () => {
    expect(campaignChip("WHAT")).toEqual({ label: "WHAT", tone: "gray", turn: null, live: false });
  });
  it("스테퍼 9칸 · 매핑", () => {
    expect(CAMPAIGN_STEPS.map((s) => s.label)).toEqual(["샘플요청", "샘플승인", "배송", "테스트", "일정제안", "일정확정", "판매 LIVE", "환불기간", "정산"]);
    expect(stepIndex("SAMPLE_REQUESTED")).toBe(0);
    expect(stepIndex("INVITED")).toBe(0);
    expect(stepIndex("SAMPLE_PURCHASED")).toBe(1);
    expect(stepIndex("TESTING")).toBe(3);
    expect(stepIndex("SETTLED")).toBe(8);
    expect(stepIndex("REJECTED")).toBe(-1);
  });
});

describe("미발송 환불 요청 (0033 · 운영 확인 2026-10-02)", () => {
  it("기한 안내는 '환불된다' 가 아니라 '요청할 수 있다' — 자동이 아니다", () => {
    const t = sampleShipDeadlineLine(5);
    expect(t).toContain("영업일 5일");
    expect(t).toContain("요청할 수 있어요");
    expect(t).not.toContain("환불돼요"); // 자동 환불로 읽히는 표현을 쓰지 않는다
    // 반대 방향도 함께 알린다 — 받은 뒤 진행 안 하면 브랜드 지급
    expect(t).toContain("받은 뒤");
    expect(t).toContain("환불되지 않아요");
  });

  it("기한 경과 안내는 요청을 권한다", () => {
    const t = sampleRefundReadyLine(5);
    expect(t).toContain("영업일 5일이 지났");
    expect(t).toContain("요청할 수 있어요");
  });

  it("일수는 platform_settings 값을 그대로 쓴다", () => {
    expect(sampleShipDeadlineLine(3)).toContain("영업일 3일");
    expect(sampleRefundReadyLine(7)).toContain("영업일 7일");
  });

  it("parseSampleRefundState — applicable/eligible/requestedAt 을 좁힌다", () => {
    const s = parseSampleRefundState({ ok: true, applicable: true, ship_days: 5, due_on: "2026-09-29", eligible: true, requested_at: "2026-10-02T07:05:05Z" });
    expect(s).toEqual({ applicable: true, shipDays: 5, dueOn: "2026-09-29", eligible: true, requestedAt: "2026-10-02T07:05:05Z" });
  });

  it("applicable 이 아니면 화면이 블록을 숨긴다 (LIVE·발송 완료 등)", () => {
    const s = parseSampleRefundState({ ok: true, applicable: false, ship_days: 5 });
    expect(s.applicable).toBe(false);
    expect(s.eligible).toBe(false);
    expect(s.requestedAt).toBeNull();
  });

  it("ship_days 가 0/누락이면 5 로 떨어진다 — 문구가 비지 않게", () => {
    expect(parseSampleRefundState({ ok: true, ship_days: 0 }).shipDays).toBe(5);
    expect(parseSampleRefundState({}).shipDays).toBe(5);
  });

  it("parseSampleRefundRequest — 성공·멱등·실패", () => {
    expect(parseSampleRefundRequest({ ok: true, already: false, due_on: "2026-09-29" })).toEqual({ ok: true, already: false, dueOn: "2026-09-29" });
    // 유니온이라 ok 로 좁힌 뒤에 읽는다 (ok:false 분기에는 already 가 없다)
    const again = parseSampleRefundRequest({ ok: true, already: true, due_on: "2026-09-29" });
    expect(again.ok && again.already).toBe(true);
    expect(parseSampleRefundRequest({ ok: false, code: "TOO_EARLY", due_on: "2026-10-09" })).toEqual({ ok: false, code: "TOO_EARLY", dueOn: "2026-10-09" });
  });

  it("실패 문구 — 기한 전·발송 완료는 이유를 알려준다", () => {
    expect(sampleRefundRequestFailMessage("TOO_EARLY")).toContain("기한");
    expect(sampleRefundRequestFailMessage("ALREADY_SHIPPED")).toContain("발송");
    expect(sampleRefundRequestFailMessage("WAT")).toContain("다시 시도");
  });
});
