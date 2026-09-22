// 고객 문의(CS) 규칙 — packages/db/src/cs/cs-rules.ts (docs/brand-console-plan.md §4 "0018 app_cs_*" · §5 /brand/cs)
import { describe, expect, it } from "vitest";
import {
  CS_BODY_MAX,
  CS_TYPES,
  countCsOpen,
  csFailMessage,
  csSenderLabel,
  csStatusChip,
  csTokenCookieName,
  isCsType,
  normalizeCsBody,
  parseCsActionResult,
  parseCsConversation,
  parseCsConversations,
  parseCsOpenInput,
  parseCsOpenResult,
  parseCsReplyInput,
  parseCsThread,
  sortCsConversations,
} from "../cs/cs-rules";

const conv = {
  id: "a3758ec0-ca21-4f6b-852d-51a7d30b5be6",
  code: "cs100",
  status: "OPEN",
  type: "배송 문의",
  buyer_name: "김준호",
  order_code: "O188",
  order_id: null,
  order: null,
  is_member: false,
  last_preview: "언제 발송되나요?",
  last_message_at: "2026-09-22T01:38:30+00:00",
  replied_at: null,
  closed_at: null,
  created_at: "2026-09-22T01:38:30+00:00",
  updated_at: "2026-09-22T01:38:30+00:00",
  message_count: 1,
  campaign: {
    id: "c0000000-0000-4000-8000-000000000001",
    code: "c1",
    status: "LIVE",
    brand: { id: "b1", code: "b1", name: "바인허브" },
    product: { id: "p1", code: "p1", name: "버닝온", emoji: "🔥", thumb_url: null },
    seller: { id: "s1", code: "s1", name: "지유", handle: "@jiyu_beauty" },
  },
};

describe("CS_TYPES · isCsType", () => {
  it("코어 상수 4개 그대로 (0005 제약)", () => {
    expect(CS_TYPES).toEqual(["배송 문의", "교환·반품", "상품 문의", "기타"]);
    expect(isCsType("교환·반품")).toBe(true);
    expect(isCsType("환불")).toBe(false);
  });
});

describe("normalizeCsBody", () => {
  it("제어문자 제거 · CRLF → LF · 빈 줄 3개 → 2개 · trim (0018 cs_normalize_body 와 같은 결과)", () => {
    expect(normalizeCsBody("  a\r\n\r\n\r\n\r\nb" + String.fromCharCode(7) + " ")).toBe("a\n\nb");
    expect(normalizeCsBody("탭\t유지")).toBe("탭\t유지");
    expect(normalizeCsBody(null)).toBe("");
  });
});

describe("parseCsOpenInput", () => {
  it("정상 — 이름·주문번호 선택", () => {
    expect(parseCsOpenInput({ type: "배송 문의", body: " 언제 오나요? ", buyer_name: " 김 준호 ", order_code: "o2001" })).toEqual({
      ok: true,
      type: "배송 문의",
      body: "언제 오나요?",
      buyerName: "김 준호",
      orderCode: "o2001",
    });
    expect(parseCsOpenInput({ type: "기타", body: "x" })).toMatchObject({ ok: true, buyerName: null, orderCode: null });
  });
  it("FormData", () => {
    const fd = new FormData();
    fd.set("type", "상품 문의");
    fd.set("body", "성분이 궁금해요");
    expect(parseCsOpenInput(fd)).toMatchObject({ ok: true, type: "상품 문의" });
  });
  it("실패 필드 순서 — type → body → buyer_name → order_code", () => {
    expect(parseCsOpenInput({ type: "환불", body: "x" })).toMatchObject({ ok: false, field: "type" });
    expect(parseCsOpenInput({ type: "기타", body: "   " })).toMatchObject({ ok: false, field: "body" });
    expect(parseCsOpenInput({ type: "기타", body: "a".repeat(CS_BODY_MAX + 1) })).toMatchObject({ ok: false, field: "body" });
    expect(parseCsOpenInput({ type: "기타", body: "x", buyer_name: "가".repeat(41) })).toMatchObject({ ok: false, field: "buyer_name" });
    expect(parseCsOpenInput({ type: "기타", body: "x", order_code: "o 1" })).toMatchObject({ ok: false, field: "order_code" });
  });
  it("parseCsReplyInput", () => {
    expect(parseCsReplyInput({ body: "\n답변\n" })).toEqual({ ok: true, body: "답변" });
    expect(parseCsReplyInput({ body: "" })).toMatchObject({ ok: false, field: "body" });
  });
});

describe("행 · 스레드 파서", () => {
  it("parseCsConversation — 주문 요약 · 캠페인 요약", () => {
    const c = parseCsConversation({ ...conv, order_id: "o", order: { code: "o188", status: "PAID", qty: 2, amount: 53800, option_name: null, courier: null, tracking_no: null, shipped_at: null, paid_at: "t" } })!;
    expect(c.code).toBe("cs100");
    expect(c.order?.amount).toBe(53800);
    expect(c.campaign.brand?.name).toBe("바인허브");
    expect(c.campaign.seller?.handle).toBe("@jiyu_beauty");
  });
  it("계약 위반은 null · parseCsConversations 는 걸러낸다", () => {
    expect(parseCsConversation({ ...conv, status: "WEIRD" })).toBeNull();
    expect(parseCsConversation({ ...conv, campaign: null })).toBeNull();
    expect(parseCsConversations([conv, null, { x: 1 }])).toHaveLength(1);
    expect(parseCsConversations("nope")).toEqual([]);
  });
  it("parseCsThread — 메시지 sender 검증", () => {
    const t = parseCsThread({
      conversation: conv,
      messages: [
        { id: "m1", sender: "customer", actor_role: "customer", body: "a", created_at: "t1" },
        { id: "m2", sender: "brand", actor_role: "admin", body: "b", created_at: "t2" },
        { id: "m3", sender: "system", body: "c", created_at: "t3" },
      ],
    })!;
    expect(t.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(t.messages[1].actor_role).toBe("admin");
    expect(parseCsThread({ conversation: null })).toBeNull();
  });
});

describe("RPC 결과", () => {
  it("parseCsOpenResult", () => {
    const r = parseCsOpenResult({ ok: true, conversation_id: "x", conversation_code: "cs100", client_token: "t", brand_id: "b", brand_name: "바인허브", order_id: null, order_matched: false });
    expect(r).toEqual({ ok: true, conversationId: "x", conversationCode: "cs100", clientToken: "t", brandId: "b", brandName: "바인허브", orderId: null, orderMatched: false });
    expect(parseCsOpenResult({ ok: false, code: "WRONG_STATUS", status: "TESTING" })).toEqual({ ok: false, code: "WRONG_STATUS", status: "TESTING" });
    expect(parseCsOpenResult({ ok: true })).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
  it("parseCsActionResult", () => {
    const r = parseCsActionResult({ ok: true, conversation_id: "x", conversation_code: "cs100", status: "ANSWERED", message: { id: "m", sender: "brand", actor_role: "brand", body: "b", created_at: "t" } });
    expect(r).toMatchObject({ ok: true, already: false, status: "ANSWERED" });
    if (r.ok) expect(r.message?.body).toBe("b");
    expect(parseCsActionResult({ ok: true, already: true, conversation_id: "x", conversation_code: "cs100", status: "CLOSED" })).toMatchObject({ ok: true, already: true, message: null });
    expect(parseCsActionResult({ ok: false, code: "CLOSED" })).toEqual({ ok: false, code: "CLOSED" });
    expect(parseCsActionResult({ ok: false, code: "???" })).toEqual({ ok: false, code: "DB_ERROR" });
  });
  it("csFailMessage", () => {
    expect(csFailMessage({ code: "CLOSED" })).toContain("처리 종료");
    expect(csFailMessage({ code: "nope" })).toBe("잠시 후 다시 시도해주세요");
  });
});

describe("칩 · 정렬 · 라벨 · 쿠키", () => {
  it("csStatusChip — 데모 M 표", () => {
    expect(csStatusChip("OPEN")).toEqual({ label: "답변 대기", tone: "amber" });
    expect(csStatusChip("ANSWERED")).toEqual({ label: "답변 완료", tone: "green" });
    expect(csStatusChip("CLOSED")).toEqual({ label: "처리 종료", tone: "gray" });
    expect(csStatusChip("X")).toEqual({ label: "X", tone: "gray" });
  });
  it("sortCsConversations — OPEN → ANSWERED → CLOSED · 최근순 · countCsOpen", () => {
    const mk = (code: string, status: string, at: string) => parseCsConversation({ ...conv, code, status, last_message_at: at })!;
    const list = [mk("a", "CLOSED", "3"), mk("b", "OPEN", "1"), mk("c", "ANSWERED", "9"), mk("d", "OPEN", "2")];
    expect(sortCsConversations(list).map((x) => x.code)).toEqual(["d", "b", "c", "a"]);
    expect(countCsOpen(list)).toBe(2);
  });
  it("csSenderLabel · csTokenCookieName", () => {
    expect(csSenderLabel("customer")).toBe("고객");
    expect(csSenderLabel("brand", "바인허브")).toBe("바인허브");
    expect(csSenderLabel("brand", null)).toBe("브랜드");
    expect(csSenderLabel("admin")).toBe("셀러리 운영팀");
    expect(csTokenCookieName("CS100")).toBe("slry_cs_cs100");
  });
});
