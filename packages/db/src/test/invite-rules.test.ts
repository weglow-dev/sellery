// 브랜드 직접 제안(초대) 규칙 — packages/db/src/brand/invite-rules.ts (docs/brand-console-plan.md §4 "0016 app_brand_invite_seller" · §8 등급 게이트)
import { describe, expect, it } from "vitest";
import {
  INVITE_GATED_GRADES,
  INVITE_MAX_GRADE,
  INVITE_MESSAGE_MAX,
  inviteDoneMessage,
  inviteFailMessage,
  isInvitableGrade,
  matchesCandidateQuery,
  parseInviteCandidates,
  parseInviteInput,
  parseInviteResult,
} from "../brand/invite-rules";
import { parseBrandCampaignRow, parseScheduleActionResult, periodLine, scheduleActionFailMessage } from "../brand/campaign-rules";

const S6 = "a0000000-0000-4000-8000-000000000006";
const P3 = "d0000000-0000-4000-8000-000000000003";

describe("등급 게이트 — 3단계는 플래티넘 이하 (다이아·블랙 = grade_tiers.invite_cost_cel 10 = 6단계 🥬 · 0017)", () => {
  it("게이트 등급은 GRADES 의 상위 2개 — 플래티넘은 기간 우선권은 있어도 제안은 무료", () => {
    expect(INVITE_MAX_GRADE).toBe("플래티넘");
    expect(INVITE_GATED_GRADES).toEqual(["블랙", "다이아"]);
    for (const g of ["플래티넘", "골드", "실버", "브론즈", "스타터"]) expect(isInvitableGrade(g)).toBe(true);
    for (const g of ["다이아", "블랙"]) expect(isInvitableGrade(g)).toBe(false);
    expect(isInvitableGrade(null)).toBe(false);
  });
});

describe("parseInviteInput", () => {
  it("uuid 2개 + 메시지(개행 유지 · 제어문자 제거 · 비면 null)", () => {
    expect(parseInviteInput({ seller_id: S6, product_id: P3, message: " 하늘님\r\n같이 해봐요 " })).toEqual({ ok: true, sellerId: S6, productId: P3, message: "하늘님\n같이 해봐요" });
    expect(parseInviteInput({ seller_id: S6, product_id: P3 })).toMatchObject({ ok: true, message: null });
    expect(parseInviteInput({ seller_id: S6.toUpperCase(), product_id: P3 })).toMatchObject({ ok: true });
  });
  it.each([
    [{}, "seller_id"],
    [{ seller_id: "s6", product_id: P3 }, "seller_id"],
    [{ seller_id: S6 }, "product_id"],
    [{ seller_id: S6, product_id: "p3" }, "product_id"],
    [{ seller_id: S6, product_id: P3, message: "a".repeat(INVITE_MESSAGE_MAX + 1) }, "message"],
  ])("실패 %j → %s", (input, field) => {
    const r = parseInviteInput(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe(field);
  });
  it("FormData", () => {
    const fd = new FormData();
    fd.set("seller_id", S6);
    fd.set("product_id", P3);
    fd.set("message", "");
    expect(parseInviteInput(fd)).toEqual({ ok: true, sellerId: S6, productId: P3, message: null });
  });
});

describe("parseInviteCandidates (app_brand_invite_candidates)", () => {
  const json = {
    ok: true,
    product: { id: P3, code: "p3", name: "벨리라잇", category: "장·소화", status: "listed", exclusive_seller_id: null },
    candidates: [
      { id: S6, code: "s6", name: "하늘", handle: "@haneul_fit", platform: "instagram", avatar_url: null, grade: "실버", followers: 62000, category: "다이어트·체형", category_fit: true, primary_channel: { platform: "instagram", handle: "@haneul_fit", url: null, followers: 62000, verified: true } },
      { id: "bad" }, // name·handle 없음 → 제외
    ],
  };
  it("파싱 · 계약 위반 후보 제외", () => {
    const c = parseInviteCandidates(json)!;
    expect(c.product.name).toBe("벨리라잇");
    expect(c.candidates).toHaveLength(1);
    expect(c.candidates[0]).toMatchObject({ code: "s6", grade: "실버", category_fit: true });
    expect(c.candidates[0].primary_channel?.verified).toBe(true);
  });
  it("ok:false(NOT_FOUND · NOT_LISTED) 는 null", () => {
    expect(parseInviteCandidates({ ok: false, code: "NOT_LISTED", status: "pending" })).toBeNull();
    expect(parseInviteCandidates(null)).toBeNull();
  });
  it("matchesCandidateQuery — 이름·핸들 부분 일치", () => {
    const c = parseInviteCandidates(json)!.candidates[0];
    expect(matchesCandidateQuery(c, "하늘")).toBe(true);
    expect(matchesCandidateQuery(c, "HANEUL")).toBe(true);
    expect(matchesCandidateQuery(c, "  ")).toBe(true);
    expect(matchesCandidateQuery(c, "지유")).toBe(false);
  });
});

describe("parseInviteResult · inviteFailMessage (app_brand_invite_seller)", () => {
  it("성공", () => {
    const r = parseInviteResult({ ok: true, campaign_id: "id", campaign_code: "c109", status: "INVITED", seller: { id: S6, name: "하늘", handle: "@haneul_fit", grade: "실버" } });
    expect(r).toEqual({ ok: true, campaignId: "id", campaignCode: "c109", status: "INVITED", seller: { id: S6, name: "하늘", handle: "@haneul_fit", grade: "실버" } });
    expect(inviteDoneMessage("하늘")).toBe("하늘님에게 제안 발송 — 수락 대기");
    expect(inviteDoneMessage(null)).toBe("인플루언서에게 제안 발송 — 수락 대기");
  });
  it("PRIORITY_INVITE_GATED — 등급·🥬 수를 문구에 · ALREADY_ACTIVE — 캠페인 코드", () => {
    const g = parseInviteResult({ ok: false, code: "PRIORITY_INVITE_GATED", grade: "다이아", cost_cel: 10 });
    expect(g).toMatchObject({ ok: false, code: "PRIORITY_INVITE_GATED", grade: "다이아", costCel: 10 });
    if (!g.ok) expect(inviteFailMessage(g)).toBe("다이아 등급 인플루언서 제안은 🥬 제안권 10개과 함께 다음 단계에서 열려요");
    const a = parseInviteResult({ ok: false, code: "ALREADY_ACTIVE", campaign_code: "c7", campaign_status: "SAMPLE_REQUESTED" });
    if (!a.ok) expect(inviteFailMessage(a)).toBe("이 인플루언서와는 같은 상품으로 진행 중인 캠페인(c7)이 있어요");
    const e = parseInviteResult({ ok: false, code: "EXCLUSIVE_LOCKED" });
    if (!e.ok) expect(inviteFailMessage(e)).toContain("독점");
    const h = parseInviteResult({ ok: false, code: "SELLER_HIDDEN" });
    if (!h.ok) expect(inviteFailMessage(h)).toContain("익명");
    expect(parseInviteResult({ ok: false, code: "???" })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseInviteResult({ ok: true })).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
});

describe("브랜드 일정 승인·반려 결과 (campaign-rules · 0016 app_brand_confirm_schedule)", () => {
  it("확정 성공 — 스냅샷 값", () => {
    const r = parseScheduleActionResult({ ok: true, already: false, campaign_id: "id", campaign_code: "c9", status: "SCHEDULE_CONFIRMED", start: "2026-09-27", end: "2026-10-01", qty: 600, price_locked: 24900, rate_locked: 0.18, priority: false });
    expect(r).toMatchObject({ ok: true, campaignCode: "c9", start: "2026-09-27", end: "2026-10-01", qty: 600, priceLocked: 24900, rateLocked: 0.18, priority: false });
    expect(periodLine("2026-09-27", "2026-10-01", 600)).toBe("9/27 – 10/1 · 배정 600");
    expect(periodLine("2026-09-27", "2026-10-01")).toBe("9/27 – 10/1");
    expect(periodLine(null, null, 1)).toBe("");
  });
  it("반려 성공 · 실패 문구", () => {
    expect(parseScheduleActionResult({ ok: true, already: true, campaign_id: "id", campaign_code: "c3", status: "TESTING" })).toMatchObject({ ok: true, already: true, status: "TESTING" });
    const s = parseScheduleActionResult({ ok: false, code: "STOCK_SHORT", left: 100, qty: 600, stock: 100, allocated: 0 });
    if (!s.ok) expect(scheduleActionFailMessage(s)).toBe("잔여 재고(100개)보다 많은 수량(600개)입니다 — 재고를 늘리거나 반려하세요");
    const b = parseScheduleActionResult({ ok: false, code: "PERIOD_BLOCKED", by: "서아", grade: "다이아", start: "2026-09-24", end: "2026-09-28" });
    if (!b.ok) expect(scheduleActionFailMessage(b)).toBe("제안 이후 다이아 등급 인플루언서(서아)가 이 기간을 선점했어요 — 반려하고 재제안을 요청하세요");
    const p = parseScheduleActionResult({ ok: false, code: "PERIOD_PAST", start: "2026-09-20", today: "2026-09-21" });
    if (!p.ok) expect(scheduleActionFailMessage(p)).toContain("이미 지났어요");
    const w = parseScheduleActionResult({ ok: false, code: "WRONG_STATUS", status: "LIVE" });
    if (!w.ok) expect(scheduleActionFailMessage(w)).toContain("판매 진행중");
    expect(parseScheduleActionResult({ ok: false, code: "nope" })).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
  it("brand_campaign_json 의 3단계 열 — price_locked · rate_locked · stock_left · seller.is_priority", () => {
    const row = parseBrandCampaignRow({
      id: "id",
      code: "c9",
      status: "SCHEDULE_CONFIRMED",
      price_locked: 24900,
      rate_locked: "0.1800",
      stock: 1200,
      stock_left: 600,
      product: { id: P3, name: "벨리라잇" },
      seller: { id: "s2", name: "혜린", handle: "@hyerin_pick", is_priority: false },
    })!;
    expect(row.price_locked).toBe(24900);
    expect(row.rate_locked).toBe(0.18);
    expect(row.stock).toBe(1200);
    expect(row.stock_left).toBe(600);
    expect(row.seller.is_priority).toBe(false);
    const bare = parseBrandCampaignRow({ id: "id", code: "c7", status: "SAMPLE_REQUESTED", product: { id: P3, name: "x" }, seller: { id: "s", name: "n", handle: "@h" } })!;
    expect(bare.price_locked).toBeNull();
    expect(bare.rate_locked).toBeNull();
    expect(bare.stock_left).toBe(0);
  });
});
