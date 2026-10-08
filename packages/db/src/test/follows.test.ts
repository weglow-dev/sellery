import { describe, expect, it } from "vitest";
import { FOLLOW_MESSAGES, followButtonView, followMessage, followRank } from "../follows";

/**
 * 인플루언서 팔로우 순수 규칙 (0045). DB 를 타는 `server/follows.server.ts` 는
 * 결정 E 에 따라 여기서 테스트하지 않고 DB 스모크로 확인한다.
 */

describe("followRank — 홈 정렬 키", () => {
  const followed = new Set(["s1", "s2"]);

  it("팔로우한 셀러는 1, 아니면 0", () => {
    expect(followRank("s1", followed, true)).toBe(1);
    expect(followRank("s9", followed, true)).toBe(0);
  });

  it("링크 보호 중(allowed=false)에는 팔로우해도 올리지 않는다 — 보호의 뜻이 사라진다", () => {
    expect(followRank("s1", followed, false)).toBe(0);
  });

  it("빈 집합(비로그인·조회 실패)에서는 전부 0 — 기본 정렬로 돌아간다", () => {
    expect(followRank("s1", new Set(), true)).toBe(0);
  });

  it("★ 추천(유료)보다 뒤 순위다 — 제안서 p.8 '가장 먼저' 약속을 깨지 않는다", () => {
    // 홈은 feat → fol → 기존 키 순으로 비교한다. 유료 노출이 붙은 카드는 팔로우 여부와 무관하게 앞선다.
    const cmp = (a: { feat: 0 | 1; fol: 0 | 1 }, b: { feat: 0 | 1; fol: 0 | 1 }) => b.feat - a.feat || b.fol - a.fol;
    const paidNotFollowed = { feat: 1 as const, fol: 0 as const };
    const followedNotPaid = { feat: 0 as const, fol: 1 as const };
    expect(cmp(paidNotFollowed, followedNotPaid)).toBeLessThan(0); // 유료가 앞
    expect(cmp(followedNotPaid, { feat: 0 as const, fol: 0 as const })).toBeLessThan(0); // 팔로우는 일반보다 앞
  });
});

describe("followButtonView", () => {
  it("비로그인은 로그인 안내 — 팔로우는 회원 전용", () => {
    expect(followButtonView({ signedIn: false, following: false }).kind).toBe("login");
    // 비로그인인데 following=true 는 있을 수 없지만, 들어와도 로그인으로 보낸다
    expect(followButtonView({ signedIn: false, following: true }).kind).toBe("login");
  });

  it("회원은 상태에 따라 팔로우·해제 토글", () => {
    expect(followButtonView({ signedIn: true, following: false }).kind).toBe("follow");
    expect(followButtonView({ signedIn: true, following: true }).kind).toBe("unfollow");
  });

  it("모든 상태에 문구가 있다", () => {
    for (const s of [
      { signedIn: false, following: false },
      { signedIn: true, following: false },
      { signedIn: true, following: true },
    ]) {
      const v = followButtonView(s);
      expect(v.label, v.kind).not.toBe("");
      expect(v.title, v.kind).not.toBe("");
    }
  });

  it("안내 문구가 메일을 약속하지 않는다 — 이 기능은 홈 정렬만 바꾼다", () => {
    for (const s of [
      { signedIn: false, following: false },
      { signedIn: true, following: false },
      { signedIn: true, following: true },
    ]) {
      const v = followButtonView(s);
      expect(`${v.label} ${v.title}`, v.kind).not.toMatch(/메일|이메일|알림을 보내|알려드려요/);
    }
    for (const [k, v] of Object.entries(FOLLOW_MESSAGES)) {
      expect(v, k).not.toMatch(/메일|이메일/);
    }
  });
});

describe("followMessage", () => {
  it("아는 키만 문구로 바꾼다", () => {
    expect(followMessage("on")).toBe(FOLLOW_MESSAGES.on);
    expect(followMessage("off_already")).toBe(FOLLOW_MESSAGES.off_already);
  });

  it("모르는 키·빈 값은 null — 주소로 들어온 값을 반사하지 않는다", () => {
    expect(followMessage("wat")).toBeNull();
    expect(followMessage("")).toBeNull();
    expect(followMessage(null)).toBeNull();
    expect(followMessage("<script>")).toBeNull();
  });
});
