// 캠페인 스레드 채팅 규칙 — packages/db/src/partner/chat-rules.ts (프로토타입 helpers.ts pushChat · 0016 app_campaign_chat / campaign_leak_detected)
import { describe, expect, it } from "vitest";
import { CHAT_MAX, LEAK_RE, chatFailMessage, detectLeak, isMine, normalizeChatBody, parseChatInput, parseChatResult, senderLabel } from "../partner/chat-rules";

describe("LEAK_RE · detectLeak — 프로토타입 pushChat 정규식 그대로 (0016 campaign_leak_detected 와 같은 케이스)", () => {
  it.each([
    ["010-1234-5678", true],
    ["01012345678", true],
    ["010 1234 5678", true],
    ["010.1234.5678", true],
    ["011-123-4567", true], // 3자리 국번
    ["016-9999-0000", true],
    ["제 번호는 010-1234-5678 입니다", true],
    ["카톡 주세요", true],
    ["카카오톡으로 연락", true],
    ["kakao id: abc", true],
    ["my KaKao id", true], // 대소문자 무시
    ["02-123-4567", false], // 유선 번호는 감지 안 함 (프로토타입 동일)
    ["010-12-5678", false], // 국번 2자리
    ["012-1234-5678", false], // 012 는 목록 밖
    ["가격 29,900원 · 수량 1,234개", false],
    ["안녕하세요", false],
    ["", false],
  ])("%j → %s", (body, want) => {
    expect(detectLeak(body)).toBe(want);
    expect(LEAK_RE.test(body)).toBe(want);
  });
  it("regex 원문이 코어와 같다", () => {
    expect(LEAK_RE.source).toBe("01[016789][-\\s.]?\\d{3,4}[-\\s.]?\\d{4}|카톡|카카오톡|kakao");
    expect(LEAK_RE.flags).toBe("i");
  });
});

describe("normalizeChatBody · parseChatInput", () => {
  it("제어문자 제거 · CRLF → LF · 개행은 유지 · 이모지 유지 · 앞뒤 공백 제거", () => {
    expect(normalizeChatBody("  안녕\r\n하세요\x07 💚 \t끝 ")).toBe("안녕\n하세요 💚 \t끝");
  });
  it("본문 · leak 플래그", () => {
    expect(parseChatInput({ body: " 안녕하세요 " })).toEqual({ ok: true, body: "안녕하세요", leak: false });
    expect(parseChatInput({ body: "카톡 주세요" })).toEqual({ ok: true, body: "카톡 주세요", leak: true });
  });
  it("비면 empty · 1000자 초과 long · 1000자는 통과", () => {
    expect(parseChatInput({ body: "   " })).toMatchObject({ ok: false, field: "body", message: "내용을 입력해주세요" });
    expect(parseChatInput({})).toMatchObject({ ok: false, field: "body" });
    expect(parseChatInput({ body: "가".repeat(CHAT_MAX + 1) })).toMatchObject({ ok: false, field: "body", message: `메시지는 ${CHAT_MAX}자까지 보낼 수 있어요` });
    expect(parseChatInput({ body: "가".repeat(CHAT_MAX) })).toMatchObject({ ok: true });
  });
  it("FormData", () => {
    const fd = new FormData();
    fd.set("body", "네 확인했습니다");
    expect(parseChatInput(fd)).toMatchObject({ ok: true, body: "네 확인했습니다" });
  });
});

describe("parseChatResult · chatFailMessage (app_campaign_chat)", () => {
  const ev = { id: "e1", campaign_id: "c", kind: "chat", sender: "seller", actor_role: "seller", body: "안녕", event_type: null, payload: {}, leak_flag: false, created_at: "2026-09-21T00:00:00+00:00" };
  it("성공 — 이벤트 · leak · 경고 행 id", () => {
    const r = parseChatResult({ ok: true, campaign_id: "c", campaign_code: "c1", event: { ...ev, leak_flag: true }, leak_flag: true, warn_event_id: "w1" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.leak_flag).toBe(true);
      expect(r.leak).toBe(true);
      expect(r.warnEventId).toBe("w1");
      expect(r.event.sender).toBe("seller");
    }
    const r2 = parseChatResult({ ok: true, campaign_id: "c", campaign_code: "c1", event: ev, leak_flag: false, warn_event_id: null });
    if (r2.ok) expect(r2.warnEventId).toBeNull();
  });
  it("실패 코드 · 낯선 코드 · 형식 위반", () => {
    expect(parseChatResult({ ok: false, code: "NOT_FOUND" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(parseChatResult({ ok: false, code: "BAD_BODY", max: 1000 })).toEqual({ ok: false, code: "BAD_BODY" });
    expect(parseChatResult({ ok: false, code: "???" })).toEqual({ ok: false, code: "DB_ERROR" });
    expect(parseChatResult({ ok: true, campaign_id: "c" })).toEqual({ ok: false, code: "DB_ERROR" });
    expect(chatFailMessage({ code: "NOT_FOUND" })).toBe("캠페인을 찾을 수 없어요");
    expect(chatFailMessage({ code: "BAD_BODY" })).toContain("1000자");
    expect(chatFailMessage({ code: "x" })).toContain("전송 중 문제");
  });
});

describe("senderLabel · isMine (프로토타입 L3564)", () => {
  it("발신자 표시명", () => {
    expect(senderLabel("seller", { seller: "지유" })).toBe("지유");
    expect(senderLabel("seller")).toBe("인플루언서");
    expect(senderLabel("brand", { brand: "바인허브" })).toBe("바인허브");
    expect(senderLabel("admin")).toBe("셀러리 운영팀");
    expect(senderLabel("system")).toBe("시스템");
  });
  it("내 말풍선", () => {
    expect(isMine("seller", "seller")).toBe(true);
    expect(isMine("brand", "seller")).toBe(false);
    expect(isMine("admin", "brand")).toBe(false);
  });
});
