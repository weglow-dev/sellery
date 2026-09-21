// 판매 일정 제안 · 초대 응답 · 인플루언서 차례 규칙 — packages/db/src/partner/schedule-rules.ts (docs/brand-console-plan.md §1 · §4 "0016" · docs/period-policy.md)
import { describe, expect, it } from "vitest";
import {
  PERIOD_LEN_CHOICES,
  PERIOD_LEN_MAX,
  SELLER_TURN_STATUSES,
  endOfPeriod,
  parseDeclineInput,
  parseScheduleContext,
  parseScheduleInput,
  parseScheduleResult,
  parseSellerActionResult,
  periodLen,
  periodOverlaps,
  priorityHolders,
  scheduleFailMessage,
  scheduleLine,
  sellerActionFailMessage,
  sellerNextAction,
} from "../partner/schedule-rules";

const TODAY = "2026-09-21";

describe("기간 산술 (proposeSchedule en = st + len − 1 · periodHolders 겹침)", () => {
  it("endOfPeriod · periodLen 은 포함 기간", () => {
    expect(endOfPeriod("2026-09-24", 5)).toBe("2026-09-28");
    expect(endOfPeriod("2026-09-24", 1)).toBe("2026-09-24");
    expect(endOfPeriod("2026-09-24", 0)).toBe("2026-09-24"); // len 최소 1
    expect(periodLen("2026-09-24", "2026-09-28")).toBe(5);
    expect(periodLen("2026-09-24", "2026-09-24")).toBe(1);
    expect(Number.isNaN(periodLen("x", "2026-09-24"))).toBe(true);
  });

  it.each([
    ["2026-09-24", "2026-09-28", "2026-09-26", "2026-09-30", true], // 부분 겹침
    ["2026-09-24", "2026-09-28", "2026-09-28", "2026-09-30", true], // 끝날 = 시작날 (포함)
    ["2026-09-24", "2026-09-28", "2026-09-29", "2026-09-30", false], // 바로 다음 날
    ["2026-09-24", "2026-09-28", "2026-09-20", "2026-09-23", false], // 바로 전
    ["2026-09-24", "2026-09-28", "2026-09-25", "2026-09-26", true], // 안에 포함
    ["2026-09-24", "2026-09-28", "2026-09-01", "2026-10-30", true], // 감쌈
  ])("periodOverlaps(%s~%s, %s~%s) = %s", (as, ae, bs, be, want) => {
    expect(periodOverlaps(as, ae, bs, be)).toBe(want);
    expect(periodOverlaps(bs, be, as, ae)).toBe(want); // 대칭
  });

  it("scheduleLine — M/D 와 재고", () => {
    expect(scheduleLine("2026-09-24", "2026-09-28", 50)).toBe("9/24 – 9/28 · 재고 50");
    expect(scheduleLine("2026-09-24", "2026-10-01")).toBe("9/24 – 10/1");
    expect(scheduleLine("2026-09-24", "2026-09-28", 1200)).toBe("9/24 – 9/28 · 재고 1,200");
  });
});

describe("parseScheduleInput — 0016 app_propose_schedule 과 같은 검사 순서", () => {
  it("시작일 + 기간(len) → 종료일 계산", () => {
    const r = parseScheduleInput({ start: "2026-09-24", len: "5", qty: "50" }, TODAY);
    expect(r).toEqual({ ok: true, start: "2026-09-24", end: "2026-09-28", len: 5, qty: 50 });
  });
  it("시작일 + 종료일(end)", () => {
    const r = parseScheduleInput({ start: "2026-09-24", end: "2026-09-26", qty: 10 }, TODAY);
    expect(r).toEqual({ ok: true, start: "2026-09-24", end: "2026-09-26", len: 3, qty: 10 });
  });
  it("오늘 시작은 허용, 어제는 start 실패", () => {
    expect(parseScheduleInput({ start: TODAY, len: 3, qty: 1 }, TODAY)).toMatchObject({ ok: true, start: TODAY });
    expect(parseScheduleInput({ start: "2026-09-20", len: 3, qty: 1 }, TODAY)).toMatchObject({ ok: false, field: "start" });
  });
  it.each([
    [{}, "start"],
    [{ start: "2026/09/24", len: 3, qty: 1 }, "start"],
    [{ start: "2026-09-24", qty: 1 }, "end"], // len 도 end 도 없음
    [{ start: "2026-09-24", end: "2026-09-23", qty: 1 }, "end"],
    [{ start: "2026-09-24", len: 8, qty: 1 }, "len"],
    [{ start: "2026-09-24", end: "2026-10-01", qty: 1 }, "len"], // 8일
    [{ start: "2026-09-24", len: 3 }, "qty"],
    [{ start: "2026-09-24", len: 3, qty: 0 }, "qty"],
    [{ start: "2026-09-24", len: 3, qty: "abc" }, "qty"],
  ])("실패 필드 %j → %s", (input, field) => {
    const r = parseScheduleInput(input, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe(field);
      expect(r.message).toBeTruthy();
    }
  });
  it("maxLen 을 넘기면 그 값으로 검사 · 선택지 상수", () => {
    expect(parseScheduleInput({ start: "2026-09-24", len: 10, qty: 1 }, TODAY, 14)).toMatchObject({ ok: true, len: 10 });
    expect(PERIOD_LEN_CHOICES).toEqual([3, 5, 7]);
    expect(PERIOD_LEN_MAX).toBe(7);
  });
  it("FormData 도 받는다", () => {
    const fd = new FormData();
    fd.set("start", "2026-09-24");
    fd.set("len", "7");
    fd.set("qty", "100");
    expect(parseScheduleInput(fd, TODAY)).toMatchObject({ ok: true, end: "2026-09-30", qty: 100 });
  });
});

describe("parseDeclineInput", () => {
  it("공백·이모지 정리 · 200자 절단 · 비면 null", () => {
    expect(parseDeclineInput({ reason: "  일정이  안 맞아요 💙 " })).toEqual({ reason: "일정이 안 맞아요" });
    expect(parseDeclineInput({ reason: "가".repeat(250) }).reason).toHaveLength(200);
    expect(parseDeclineInput({})).toEqual({ reason: null });
  });
});

describe("parseScheduleContext (app_seller_schedule_context)", () => {
  const ctx = {
    ok: true,
    campaign_id: "c0000000-0000-4000-8000-000000000003",
    campaign_code: "c3",
    status: "TESTING",
    today: TODAY,
    len_choices: [3, 5, 7],
    max_len: 7,
    stock: 1500,
    allocated: 600,
    stock_left: 900,
    is_priority: false,
    proposed: null,
    holders: [
      { campaign_id: "x1", campaign_code: "c12", status: "LIVE", start: "2026-09-18", end: "2026-09-24", qty: 600, seller_id: "s8", name: "유나", handle: "@yuna", grade: "골드", is_priority: false },
      { campaign_id: "x2", campaign_code: "c107", status: "SCHEDULE_CONFIRMED", start: "2026-09-24", end: "2026-09-28", qty: 100, seller_id: "s4", name: "서아", handle: "@seoa", grade: "다이아", is_priority: true },
    ],
    price_locked: null,
    rate_locked: null,
  };
  it("파싱 · priorityHolders 는 우선권 인플루언서만 (내가 우선권이면 빈 배열)", () => {
    const c = parseScheduleContext(ctx)!;
    expect(c.stock_left).toBe(900);
    expect(c.holders).toHaveLength(2);
    expect(priorityHolders(c).map((h) => h.campaign_code)).toEqual(["c107"]);
    expect(priorityHolders({ ...c, is_priority: true })).toEqual([]);
  });
  it("ok:false · 형식 위반은 null · 선택지가 비면 기본값", () => {
    expect(parseScheduleContext({ ok: false, code: "NOT_FOUND" })).toBeNull();
    expect(parseScheduleContext(null)).toBeNull();
    expect(parseScheduleContext({ ...ctx, len_choices: [] })!.len_choices).toEqual([3, 5, 7]);
    expect(parseScheduleContext({ ...ctx, proposed: { start: "2026-09-24", end: "2026-09-28", qty: 50 } })!.proposed).toEqual({ start: "2026-09-24", end: "2026-09-28", qty: 50 });
  });
});

describe("parseScheduleResult · scheduleFailMessage (app_propose_schedule)", () => {
  it("성공", () => {
    const r = parseScheduleResult({ ok: true, campaign_id: "id", campaign_code: "c3", status: "SCHEDULE_PROPOSED", start: "2026-09-24", end: "2026-09-28", len: 5, qty: 50, left: 900, reproposed: false });
    expect(r).toEqual({ ok: true, campaignId: "id", campaignCode: "c3", status: "SCHEDULE_PROPOSED", start: "2026-09-24", end: "2026-09-28", len: 5, qty: 50, left: 900, reproposed: false });
  });
  it("PERIOD_BLOCKED — 선점 인플루언서 · 기간을 문구에", () => {
    const r = parseScheduleResult({ ok: false, code: "PERIOD_BLOCKED", by: "서아", handle: "@seoa_health", grade: "다이아", start: "2026-09-24", end: "2026-09-28", campaign_code: "c107" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.by).toBe("서아");
      expect(scheduleFailMessage(r)).toBe("이 기간은 다이아 등급 인플루언서(서아)가 선점했습니다 · 9/24 – 9/28 — 플래티넘 이상만 함께 판매할 수 있어요. 다른 날짜를 선택해주세요");
    }
  });
  it("QTY_EXCEEDS_STOCK — 잔여를 문구에 · BAD_PERIOD 필드별 · WRONG_STATUS 상태 라벨", () => {
    const q = parseScheduleResult({ ok: false, code: "QTY_EXCEEDS_STOCK", left: 900, stock: 1500, allocated: 600 });
    if (!q.ok) expect(scheduleFailMessage(q)).toBe("배정 가능한 재고를 초과했어요 (잔여 900개) — 수량을 줄여주세요");
    const p = parseScheduleResult({ ok: false, code: "BAD_PERIOD", field: "len", max_len: 7 });
    if (!p.ok) expect(scheduleFailMessage(p)).toBe("판매 기간은 최대 7일이에요");
    const s = parseScheduleResult({ ok: false, code: "BAD_PERIOD", field: "start", today: TODAY });
    if (!s.ok) expect(scheduleFailMessage(s)).toContain("시작일");
    const w = parseScheduleResult({ ok: false, code: "WRONG_STATUS", status: "LIVE" });
    if (!w.ok) expect(scheduleFailMessage(w)).toContain("판매 진행중");
  });
  it("낯선 code · 형식 위반은 DB_ERROR", () => {
    expect(parseScheduleResult({ ok: false, code: "WHAT" })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseScheduleResult({ ok: true })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseScheduleResult("x")).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
});

describe("parseSellerActionResult · sellerActionFailMessage (pass · accept · decline)", () => {
  it("성공 · already", () => {
    expect(parseSellerActionResult({ ok: true, already: true, campaign_id: "id", campaign_code: "c13", status: "SAMPLE_APPROVED" })).toEqual({
      ok: true,
      already: true,
      campaignId: "id",
      campaignCode: "c13",
      status: "SAMPLE_APPROVED",
    });
  });
  it("실패 코드 → 문구", () => {
    expect(sellerActionFailMessage({ code: "NOT_LISTED", status: "paused" })).toContain("노출 중단");
    expect(sellerActionFailMessage({ code: "EXCLUSIVE_LOCKED" })).toContain("독점권");
    expect(sellerActionFailMessage({ code: "BAD_SHIPPING" })).toContain("배송지");
    expect(sellerActionFailMessage({ code: "WRONG_STATUS", status: "DECLINED" })).toContain("제안 거절");
    expect(sellerActionFailMessage({ code: "???" })).toContain("문제가 생겼어요");
    expect(parseSellerActionResult({ ok: false, code: "BAD_SHIPPING", field: "phone" })).toEqual({ ok: false, code: "BAD_SHIPPING", status: null, field: "phone" });
  });
});

describe("sellerNextAction — ST[*].turn === 'seller' 와 정합", () => {
  it("인플루언서 차례 상태에는 실제 액션 종류가 붙는다", () => {
    expect(SELLER_TURN_STATUSES).toEqual(["INVITED", "SAMPLE_SHIPPED", "TESTING"]);
    expect(sellerNextAction("INVITED").kind).toBe("accept_invite");
    expect(sellerNextAction("SAMPLE_SHIPPED").kind).toBe("receive_sample");
    expect(sellerNextAction("TESTING").kind).toBe("propose_schedule");
  });
  it("브랜드 차례 · 시스템 · 종결은 wait/live/ended", () => {
    for (const s of ["SAMPLE_REQUESTED", "SAMPLE_APPROVED", "SAMPLE_PURCHASED", "SCHEDULE_PROPOSED", "SCHEDULE_CONFIRMED"]) expect(sellerNextAction(s).kind).toBe("wait");
    expect(sellerNextAction("LIVE").kind).toBe("live");
    expect(sellerNextAction("CLEARING").kind).toBe("live");
    for (const s of ["SETTLED", "DECLINED", "REJECTED", "PASSED"]) expect(sellerNextAction(s).kind).toBe("ended");
    expect(sellerNextAction("???").kind).toBe("wait");
  });
});
