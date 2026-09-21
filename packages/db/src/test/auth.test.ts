// safeNext · displayName · isPartnerUser — web/src/lib/auth.ts 의 동작을 그대로 (케이스: docs/app-plan.md §10.1 B 행 + §4.1 주석)
import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { displayName, isPartnerUser, safeNext } from "../auth";

describe("safeNext — 오픈 리다이렉트 방지", () => {
  it("app-plan §10.1 B 케이스", () => {
    expect(safeNext("//evil")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://x")).toBe("/");
    expect(safeNext("/auth/callback")).toBe("/");
    expect(safeNext("/login?next=/x")).toBe("/");
    expect(safeNext("/checkout?c=c1")).toBe("/checkout?c=c1");
  });

  it("비었거나 문자열이 아니면 /", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("탭·개행 삽입(WHATWG 파서가 제거하는 제어문자)은 거부", () => {
    expect(safeNext("/\t/evil.com")).toBe("/");
    expect(safeNext("/\n/evil.com")).toBe("/");
    expect(safeNext("/ok\r")).toBe("/");
    expect(safeNext("/x")).toBe("/");
  });

  it("같은 오리진 경로는 정규화한 pathname+search+hash 로 통과", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/account/orders")).toBe("/account/orders");
    expect(safeNext("/s/jiyu_beauty/c1#top")).toBe("/s/jiyu_beauty/c1#top");
    expect(safeNext("/influencer/home")).toBe("/influencer/home");
    expect(safeNext("/a/../b")).toBe("/b");
  });

  it("/auth/ · /login 접두는 루프라 제외 (/loginx 도 startsWith 로 제외 — web 과 동일)", () => {
    expect(safeNext("/auth/confirm?x=1")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext("/influencer/login")).toBe("/influencer/login");
  });
});

function user(meta: Record<string, unknown>, app: Record<string, unknown> = {}): User {
  return { id: "u1", user_metadata: meta, app_metadata: app } as unknown as User;
}

describe("displayName", () => {
  it("nickname → name → full_name → preferred_username → 고객", () => {
    expect(displayName(user({ nickname: " 지유 ", name: "x" }))).toBe("지유");
    expect(displayName(user({ name: "홍길동" }))).toBe("홍길동");
    expect(displayName(user({ full_name: "Full" }))).toBe("Full");
    expect(displayName(user({ preferred_username: "pref" }))).toBe("pref");
    expect(displayName(user({ nickname: "   " }))).toBe("고객");
    expect(displayName(user({}))).toBe("고객");
  });
});

describe("isPartnerUser — user_metadata.partner_role (비신뢰 값)", () => {
  it("seller · brand 만 true", () => {
    expect(isPartnerUser(user({ partner_role: "seller" }))).toBe(true);
    expect(isPartnerUser(user({ partner_role: "brand" }))).toBe(true);
    expect(isPartnerUser(user({ partner_role: "admin" }))).toBe(false);
    expect(isPartnerUser(user({}))).toBe(false);
    expect(isPartnerUser(null)).toBe(false);
  });
});
