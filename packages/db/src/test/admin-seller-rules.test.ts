import { describe, expect, it } from "vitest";
import {
  SELLER_ACTION_MESSAGES,
  SELLER_FILTERS,
  SELLER_FILTER_LABELS,
  accountLinkLabel,
  channelPendingSince,
  channelStatusChip,
  isChannelPending,
  parseSellerFilter,
  sellerSearchHit,
  sellerStatusChip,
} from "../admin/seller-rules";

/**
 * 관리자 파트너 관리 — 인플루언서 규칙(순수). DB 를 타는 `server/admin/sellers.server.ts` 는
 * 결정 E(테스트는 순수 규칙만)에 따라 여기서 테스트하지 않고 화면 시나리오로 확인한다.
 */

describe("parseSellerFilter", () => {
  it("아는 값은 그대로", () => {
    for (const f of SELLER_FILTERS) expect(parseSellerFilter(f)).toBe(f);
  });
  it("모르는 값 · 빈 값 · null 은 all", () => {
    expect(parseSellerFilter("nope")).toBe("all");
    expect(parseSellerFilter("")).toBe("all");
    expect(parseSellerFilter(null)).toBe("all");
    expect(parseSellerFilter(undefined)).toBe("all");
  });
  it("필터마다 라벨이 있다", () => {
    for (const f of SELLER_FILTERS) expect(SELLER_FILTER_LABELS[f]).toBeTruthy();
  });
});

describe("sellerStatusChip — 정지가 비공개보다 우선", () => {
  it("활동 중", () => {
    expect(sellerStatusChip({ active: true, hidden: false })).toEqual({ label: "활동 중", tone: "green" });
  });
  it("비공개", () => {
    expect(sellerStatusChip({ active: true, hidden: true })).toEqual({ label: "비공개", tone: "amber" });
  });
  it("정지 — hidden 이어도 정지로 표시한다(로그인 자체가 막히는 쪽이 더 센 상태)", () => {
    expect(sellerStatusChip({ active: false, hidden: false }).label).toBe("정지");
    expect(sellerStatusChip({ active: false, hidden: true }).label).toBe("정지");
  });
});

describe("channelStatusChip — 0010 계약(verified 는 운영자만)", () => {
  it("인증됨", () => {
    expect(channelStatusChip({ verified: true, vcode_confirmed_at: "2026-09-22T00:00:00Z" }).label).toBe("✓ 인증됨");
    expect(channelStatusChip({ verified: true, vcode_confirmed_at: null }).label).toBe("✓ 인증됨");
  });
  it("[인증 확인] 만 누른 상태는 '인증 대기'", () => {
    expect(channelStatusChip({ verified: false, vcode_confirmed_at: "2026-09-22T00:00:00Z" })).toEqual({
      label: "인증 대기",
      tone: "amber",
    });
  });
  it("미인증", () => {
    expect(channelStatusChip({ verified: false, vcode_confirmed_at: null })).toEqual({ label: "미인증", tone: "gray" });
  });
});

describe("isChannelPending — 서버 목록 필터와 같은 조건", () => {
  it("verified=false and vcode_confirmed_at is not null 만 대기", () => {
    expect(isChannelPending({ verified: false, vcode_confirmed_at: "2026-09-22T00:00:00Z" })).toBe(true);
    expect(isChannelPending({ verified: false, vcode_confirmed_at: null })).toBe(false);
    expect(isChannelPending({ verified: true, vcode_confirmed_at: "2026-09-22T00:00:00Z" })).toBe(false);
    expect(isChannelPending({ verified: true, vcode_confirmed_at: null })).toBe(false);
  });
});

describe("channelPendingSince", () => {
  const now = new Date("2026-09-22T09:00:00Z");
  it("대기 일수를 내림 계산", () => {
    expect(channelPendingSince({ verified: false, vcode_confirmed_at: "2026-09-22T08:00:00Z" }, now)).toBe(0);
    expect(channelPendingSince({ verified: false, vcode_confirmed_at: "2026-09-20T09:00:00Z" }, now)).toBe(2);
  });
  it("대기가 아니면 null", () => {
    expect(channelPendingSince({ verified: true, vcode_confirmed_at: "2026-09-20T09:00:00Z" }, now)).toBeNull();
    expect(channelPendingSince({ verified: false, vcode_confirmed_at: null }, now)).toBeNull();
  });
  it("날짜 파싱 실패는 null · 미래 시각은 0(음수로 내려가지 않는다)", () => {
    expect(channelPendingSince({ verified: false, vcode_confirmed_at: "not-a-date" }, now)).toBeNull();
    expect(channelPendingSince({ verified: false, vcode_confirmed_at: "2026-09-23T09:00:00Z" }, now)).toBe(0);
  });
});

describe("accountLinkLabel", () => {
  it("연결되면 앞 8자만 보여 준다", () => {
    expect(accountLinkLabel("256fe4b3-3487-46f1-a2b9-43d055045474")).toBe("연결 (256fe4b3…)");
  });
  it("null · undefined 는 미연결 — 초대가 필요한 시드·계약 행", () => {
    expect(accountLinkLabel(null)).toBe("미연결");
    expect(accountLinkLabel(undefined)).toBe("미연결");
  });
});

describe("sellerSearchHit", () => {
  const s = { name: "지유", handle: "@jiyu_beauty", code: "s1", email: "jiyu@sellery.demo" };
  it("빈 검색어는 전부 통과", () => {
    expect(sellerSearchHit(s, "")).toBe(true);
    expect(sellerSearchHit(s, "   ")).toBe(true);
  });
  it("활동명 · 핸들 · code · 이메일에서 찾는다", () => {
    expect(sellerSearchHit(s, "지유")).toBe(true);
    expect(sellerSearchHit(s, "jiyu_b")).toBe(true);
    expect(sellerSearchHit(s, "s1")).toBe(true);
    expect(sellerSearchHit(s, "sellery.demo")).toBe(true);
  });
  it("대소문자를 무시한다 (서버의 ilike 와 같은 결과)", () => {
    expect(sellerSearchHit(s, "JIYU")).toBe(true);
  });
  it("없는 값은 false · null 필드에서 터지지 않는다", () => {
    expect(sellerSearchHit(s, "혜린")).toBe(false);
    expect(sellerSearchHit({ name: "민지", handle: "@minji", code: null, email: null }, "s1")).toBe(false);
  });
});

describe("SELLER_ACTION_MESSAGES", () => {
  it("서버가 돌려주는 코드마다 문구가 있다", () => {
    for (const code of [
      "suspended",
      "reactivated",
      "hidden",
      "shown",
      "channel_verified",
      "channel_unverified",
      "err_not_found",
      "err",
    ]) {
      expect(SELLER_ACTION_MESSAGES[code]).toBeTruthy();
    }
  });
});
