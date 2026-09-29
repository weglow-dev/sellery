/**
 * 독점권 규칙(`partner/exclusive-rules.ts`) 테스트 — 파서 · 버튼 문구.
 * 등급 비교는 DB(0025 `seller_exclusive_eligible`)가 하므로 여기서는 검증하지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  exclusiveButton,
  exclusiveFailMessage,
  parseBrandExclusiveRequests,
  parseEligibility,
  parseMyExclusiveRequests,
  parseRequestResult,
  type ExclusiveEligibility,
  type MyExclusiveRequest,
} from "../partner/exclusive-rules";

const ok: ExclusiveEligibility = { eligible: true, grade: "다이아", needGrade: "다이아", reason: "OK" };

function mine(over: Partial<MyExclusiveRequest>): MyExclusiveRequest {
  return {
    id: "x1",
    status: "PENDING",
    productCode: "p1",
    productName: "버닝온",
    label: "인스타그램 판매 독점권 · 3개월",
    needGrade: "다이아",
    lockedByMe: false,
    createdAt: "2026-09-29T00:00:00Z",
    decidedAt: null,
    ...over,
  };
}

describe("parseEligibility", () => {
  it("returns table 한 행을 좁힌다", () => {
    expect(parseEligibility({ eligible: true, grade: "다이아", need_grade: "다이아", reason: "OK" })).toEqual(ok);
  });

  it("모르는 사유는 NO_OFFER 로 떨어뜨린다 — 신청을 열지 않는다", () => {
    const e = parseEligibility({ eligible: false, reason: "WAT" });
    expect(e.reason).toBe("NO_OFFER");
    expect(e.eligible).toBe(false);
  });

  it("빈 문자열 등급은 null 이다", () => {
    expect(parseEligibility({ grade: "", need_grade: "" }).grade).toBeNull();
  });

  it("null 도 안전하다", () => {
    expect(parseEligibility(null).eligible).toBe(false);
  });
});

describe("parseMyExclusiveRequests · parseBrandExclusiveRequests", () => {
  it("status 나 id 가 없는 행은 버린다", () => {
    const rows = parseMyExclusiveRequests({
      rows: [
        { id: "a", status: "PENDING" },
        { id: "b", status: "WAT" }, // 모르는 상태
        { status: "APPROVED" }, // id 없음
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("locked_by_me · locked 는 true 만 true", () => {
    expect(parseMyExclusiveRequests({ rows: [{ id: "a", status: "APPROVED", locked_by_me: true }] })[0].lockedByMe).toBe(
      true,
    );
    expect(parseMyExclusiveRequests({ rows: [{ id: "a", status: "APPROVED", locked_by_me: "yes" }] })[0].lockedByMe).toBe(
      false,
    );
  });

  it("브랜드 행은 인플루언서 프로필을 담는다 — 신청 시 공개되기 때문", () => {
    const [r] = parseBrandExclusiveRequests({
      rows: [
        {
          id: "x1",
          status: "PENDING",
          seller_name: "서아",
          seller_handle: "@seoa_health",
          seller_grade: "다이아",
          seller_followers: 120000,
          seller_m3_sales: 48000000,
          locked: false,
        },
      ],
    });
    expect(r.sellerName).toBe("서아");
    expect(r.sellerFollowers).toBe(120000);
    expect(r.locked).toBe(false);
  });

  it("숫자가 아니면 null — NaN 을 화면에 흘리지 않는다", () => {
    const [r] = parseBrandExclusiveRequests({
      rows: [{ id: "x", status: "PENDING", seller_followers: "많음", seller_m3_sales: null }],
    });
    expect(r.sellerFollowers).toBeNull();
    expect(r.sellerM3Sales).toBeNull();
  });

  it("rows 가 없으면 빈 배열", () => {
    expect(parseMyExclusiveRequests({ ok: true })).toEqual([]);
    expect(parseBrandExclusiveRequests(undefined)).toEqual([]);
  });
});

describe("parseRequestResult", () => {
  it("성공 · 멱등 · 자동거절 수", () => {
    const r = parseRequestResult({ ok: true, already: false, status: "APPROVED", seller_name: "서아", auto_rejected: 2 });
    expect(r).toEqual({ ok: true, already: false, status: "APPROVED", sellerName: "서아", autoRejected: 2 });
  });

  it("실패는 code 와 등급을 그대로 전한다 — 화면이 '내 등급 / 필요 등급' 을 보여준다", () => {
    expect(parseRequestResult({ ok: false, code: "GRADE", grade: "골드", need_grade: "다이아" })).toEqual({
      ok: false,
      code: "GRADE",
      grade: "골드",
      needGrade: "다이아",
    });
  });

  it("ok 가 없으면 실패로 본다", () => {
    expect(parseRequestResult({}).ok).toBe(false);
  });
});

describe("exclusiveButton — 프로토타입 ProductDetailModal 분기 순서", () => {
  it("확정되면 '나 🎉' 이고 누를 수 없다", () => {
    const b = exclusiveButton(ok, mine({ status: "APPROVED", lockedByMe: true }));
    expect(b.kind).toBe("mine");
    expect(b.enabled).toBe(false);
    expect(b.label).toContain("나 🎉");
  });

  it("대기 중이면 승인 대기 · 프로필 공개 상태를 알린다", () => {
    const b = exclusiveButton(ok, mine({ status: "PENDING" }));
    expect(b.kind).toBe("pending");
    expect(b.enabled).toBe(false);
    expect(b.hint).toContain("공개");
  });

  it("자격이 있으면 등급 충족을 보여주고 누를 수 있다", () => {
    const b = exclusiveButton(ok, null);
    expect(b.kind).toBe("request");
    expect(b.enabled).toBe(true);
    expect(b.label).toContain("다이아");
    expect(b.hint).toContain("프로필");
  });

  it("거절된 뒤에는 '다시 신청' — 재신청을 허용한다", () => {
    const b = exclusiveButton(ok, mine({ status: "REJECTED", decidedAt: "2026-09-28T00:00:00Z" }));
    expect(b.kind).toBe("rejected");
    expect(b.enabled).toBe(true);
    expect(b.label).toContain("다시 신청");
  });

  it("등급 미달은 내 등급과 필요 등급을 함께 보여준다", () => {
    const b = exclusiveButton({ eligible: false, grade: "골드", needGrade: "다이아", reason: "GRADE" }, null);
    expect(b.enabled).toBe(false);
    expect(b.label).toContain("골드");
    expect(b.label).toContain("다이아");
  });

  it("남이 확정한 상품은 익명으로 알린다 — 누구인지 밝히지 않는다", () => {
    const b = exclusiveButton({ eligible: false, grade: "다이아", needGrade: "다이아", reason: "LOCKED" }, null);
    expect(b.kind).toBe("disabled");
    expect(b.label).toContain("○○○");
  });

  it("내 신청 상태가 자격 판정보다 앞선다 — 잠긴 상품이라도 내가 주인이면 '나'", () => {
    const b = exclusiveButton(
      { eligible: false, grade: "다이아", needGrade: "다이아", reason: "LOCKED" },
      mine({ status: "APPROVED", lockedByMe: true }),
    );
    expect(b.kind).toBe("mine");
  });
});

describe("exclusiveFailMessage", () => {
  it("아는 코드는 그 문구, 모르는 코드는 기본 문구", () => {
    expect(exclusiveFailMessage("GRADE")).toContain("등급");
    expect(exclusiveFailMessage("LOCKED")).toContain("확정");
    expect(exclusiveFailMessage("WAT")).toContain("다시 시도");
  });
});
