// 거래 메일 템플릿 — packages/db/src/mail/{layout,templates}.ts (순수 · 이스케이프 · 링크 · 금액 · 멱등 키)
import { describe, expect, it } from "vitest";
import { COMPANY } from "../company";
import { escapeHtml, mailIdempotencyKey, renderMailHtml, renderMailText } from "../mail/layout";
import {
  csOpenedBrandMail,
  csRepliedMail,
  orderPageUrl,
  orderPaidBrandMail,
  orderPaidCustomerMail,
  orderRefundedMail,
  orderShippedMail,
  previewOf,
  type MailCs,
  type MailOrder,
} from "../mail/templates";

const CTX = { siteUrl: "https://sellery.life" };

const ORDER: MailOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "o2001",
  productName: "버닝온",
  optionName: "1박스 (30포)",
  qty: 2,
  amount: 59800,
  buyerName: "김셀러",
  isMember: true,
  shipping: { recipient: "김셀러", phone: "01012345678", postcode: "04781", address1: "부산시 해운대구 마린시티1로 7", address2: "1201호" },
  brandName: "바인허브",
  sellerHandle: "@jiyu_beauty",
  campaignCode: "c1",
  campaignEndDate: "2026-09-24",
  clearDays: 21,
  courier: null,
  trackingNo: null,
  refundAmount: null,
  refundReason: null,
  paidAt: "2026-09-22T03:00:00Z",
};

describe("레이아웃", () => {
  it("escapeHtml 은 & < > \" ' 를 전부 바꾼다", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
    expect(escapeHtml(null)).toBe("");
  });

  it("HTML 은 로고 · 배경 · 버튼 색 · 사업자 푸터를 포함하고 값은 이스케이프된다", () => {
    const html = renderMailHtml({
      title: "제목",
      intro: "본문",
      rows: [{ label: "라벨", value: "<script>alert(1)</script>" }],
      quote: "인용 <x>",
      button: { label: "버튼", url: "https://sellery.life/a?b=1&c=2" },
      notes: ["안내 <n>"],
    });
    expect(html).toContain("https://sellery.life/email/celery.png");
    expect(html).toContain("#eef3dc");
    expect(html).toContain("background:#4f8a2c");
    expect(html).toContain(COMPANY.bizNo);
    expect(html).toContain(COMPANY.email);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("인용 &lt;x&gt;");
    expect(html).toContain("안내 &lt;n&gt;");
    expect(html).toContain('href="https://sellery.life/a?b=1&amp;c=2"');
  });

  it("text 대체본은 표 · 인용 · 버튼 URL 을 한 줄씩 담는다", () => {
    const text = renderMailText({ title: "T", intro: "I", rows: [{ label: "L", value: "V" }], quote: "Q", button: { label: "B", url: "https://x/y" } });
    expect(text).toContain("L: V");
    expect(text).toContain("> Q");
    expect(text).toContain("B: https://x/y");
    expect(text).toContain(COMPANY.email);
  });

  it("멱등 키 = <event>:<id…> — ASCII 만(헤더 안전): 공백·콜론은 _ · 한글은 코드포인트 토큰, 빈 조각은 제외, 200자 제한", () => {
    expect(mailIdempotencyKey("order_paid", "customer", "abc")).toBe("order_paid:customer:abc");
    expect(mailIdempotencyKey("order_shipped", "id", null, "CJ 대한통운", "1234 5678")).toBe("order_shipped:id:CJ__b300__d55c__d1b5__c6b4_:1234_5678");
    expect(mailIdempotencyKey("x", "가 나")).toMatch(/^[\x21-\x7e]+$/);
    expect(mailIdempotencyKey("x", "a".repeat(300)).length).toBe(200);
  });
});

describe("주문 확인", () => {
  it("고객 — 주문번호 대문자 · 상품/옵션/수량 · 금액 · 배송지 · 브랜드 · 회원 링크 · 환불 기한(D+21)", () => {
    const m = orderPaidCustomerMail(ORDER, CTX);
    expect(m.subject).toBe("[셀러리] 주문이 접수되었어요 · O2001");
    expect(m.html).toContain("O2001");
    expect(m.html).toContain("버닝온 · 1박스 (30포) × 2");
    expect(m.html).toContain("₩59,800");
    expect(m.html).toContain("부산시 해운대구 마린시티1로 7 1201호");
    expect(m.html).toContain("바인허브");
    expect(m.html).toContain("@jiyu_beauty");
    expect(m.html).toContain('href="https://sellery.life/account/orders/o2001"');
    expect(m.html).toContain("21일(10/15)까지");
    expect(m.text).toContain("결제 금액: ₩59,800");
    expect(m.idempotencyKey).toBe(`order_paid:customer:${ORDER.id}`);
    expect(m.tag).toBe("order_paid");
  });

  it("비회원 — /orders/lookup 링크 + 조회 안내", () => {
    const m = orderPaidCustomerMail({ ...ORDER, isMember: false }, CTX);
    expect(m.html).toContain('href="https://sellery.life/orders/lookup"');
    expect(m.html).toContain("주문번호와 결제 때 입력한 연락처");
    expect(orderPageUrl({ code: "o1", isMember: false }, CTX)).toBe("https://sellery.life/orders/lookup");
  });

  it("사용자 입력(옵션명 · 배송지)은 이스케이프된다", () => {
    const m = orderPaidCustomerMail({ ...ORDER, optionName: "<img src=x onerror=alert(1)>", shipping: { ...ORDER.shipping!, address1: "<b>주소</b>" } }, CTX);
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(m.html).not.toContain("<b>주소</b>");
  });

  it("브랜드 — 배송지·연락처 없이 주문번호·상품·금액·주문자·콘솔 링크", () => {
    const m = orderPaidBrandMail(ORDER, CTX);
    expect(m.subject).toBe("[셀러리] 새 주문 · O2001 · 버닝온");
    expect(m.html).toContain('href="https://sellery.life/brand/orders?campaign=c1"');
    expect(m.html).toContain("김셀러");
    expect(m.html).not.toContain("01012345678");
    expect(m.html).not.toContain("마린시티");
    expect(m.idempotencyKey).toBe(`order_paid:brand:${ORDER.id}`);
    expect(m.tag).toBe("order_paid_brand");
  });
});

describe("배송 시작", () => {
  it("택배사 · 송장 · 조회 링크(trackingUrlOf) · 멱등 키에 송장 포함", () => {
    const m = orderShippedMail({ ...ORDER, courier: "CJ대한통운", trackingNo: "1234-5678-9012" }, CTX);
    expect(m.subject).toBe("[셀러리] 상품이 발송되었어요 · O2001");
    expect(m.html).toContain("CJ대한통운");
    expect(m.html).toContain("1234-5678-9012");
    expect(m.html).toContain('href="https://trace.cjlogistics.com/next/tracking.html?wblNo=123456789012"');
    expect(m.idempotencyKey).toBe(`order_shipped:${ORDER.id}:CJ_b300__d55c__d1b5__c6b4_:1234-5678-9012`);
  });

  it("모르는 택배사면 주문 화면 링크로 대체", () => {
    const m = orderShippedMail({ ...ORDER, courier: "기타택배", trackingNo: "999" }, CTX);
    expect(m.html).toContain('href="https://sellery.life/account/orders/o2001"');
  });
});

describe("환불 완료", () => {
  it("환불 금액 · 사유 · 카드 안내", () => {
    const m = orderRefundedMail({ ...ORDER, refundAmount: 59800, refundReason: "단순 변심 — <메모>" }, CTX);
    expect(m.subject).toBe("[셀러리] 환불이 완료되었어요 · O2001");
    expect(m.html).toContain("₩59,800");
    expect(m.html).toContain("단순 변심 — &lt;메모&gt;");
    expect(m.html).toContain("3~7일");
    expect(m.idempotencyKey).toBe(`order_refunded:${ORDER.id}`);
  });

  it("refund_amount 가 없으면 주문 금액", () => {
    const m = orderRefundedMail({ ...ORDER, refundAmount: null, refundReason: null }, CTX);
    expect(m.text).toContain("환불 금액: ₩59,800");
    expect(m.html).not.toContain("사유");
  });
});

const CS: MailCs = {
  conversationId: "22222222-2222-4222-8222-222222222222",
  code: "cs100",
  type: "배송 문의",
  buyerName: "김셀러",
  orderCode: "o2001",
  productName: "버닝온",
  campaignCode: "c1",
  brandName: "바인허브",
  isMember: false,
};

describe("고객 문의", () => {
  it("답변 → 고객: 미리보기(200자 · 이스케이프) · /cs/<code> · 비회원 안내 · 멱등 키 = 메시지 id", () => {
    const body = "<b>안녕하세요</b> " + "가".repeat(300);
    const m = csRepliedMail(CS, { messageId: "m1", body }, CTX);
    expect(m.subject).toBe("[셀러리] 문의에 답변이 달렸어요 · CS100");
    expect(m.html).toContain('href="https://sellery.life/cs/cs100"');
    expect(m.html).not.toContain("<b>안녕하세요</b>");
    expect(m.html).toContain("&lt;b&gt;안녕하세요&lt;/b&gt;");
    expect(m.html).toContain("주문 조회 화면에서 다시 열 수 있어요");
    expect(m.text).not.toContain("가".repeat(201));
    expect(m.idempotencyKey).toBe("cs_replied:m1");
    expect(csRepliedMail({ ...CS, isMember: true }, { messageId: "m2", body: "x" }, CTX).html).not.toContain("주문 조회 화면에서 다시");
  });

  it("접수 → 브랜드: 유형 · 상품 · 고객명 · 주문번호 · /brand/cs/<code> · 연락처 없음", () => {
    const m = csOpenedBrandMail(CS, { messageId: CS.conversationId, body: "배송이 언제 오나요?", followUp: false }, CTX);
    expect(m.subject).toBe("[셀러리] 새 고객 문의 · CS100 · 배송 문의");
    expect(m.html).toContain('href="https://sellery.life/brand/cs/cs100"');
    expect(m.html).toContain("O2001");
    expect(m.html).toContain("배송이 언제 오나요?");
    expect(m.idempotencyKey).toBe(`cs_opened:${CS.conversationId}`);
    expect(m.tag).toBe("cs_opened");
  });

  it("추가 문의 → 브랜드: 제목·키가 다르다", () => {
    const m = csOpenedBrandMail({ ...CS, orderCode: null }, { messageId: "m9", body: "추가로요", followUp: true }, CTX);
    expect(m.subject).toBe("[셀러리] 추가 문의 · CS100 · 배송 문의");
    expect(m.idempotencyKey).toBe("cs_followup:m9");
    expect(m.html).not.toContain("주문번호");
  });

  it("previewOf 는 공백을 접고 200자에서 자른다", () => {
    expect(previewOf("  a \n\n b  ")).toBe("a b");
    expect(previewOf("x".repeat(250)).length).toBe(200);
    expect(previewOf(null)).toBe("");
  });
});
