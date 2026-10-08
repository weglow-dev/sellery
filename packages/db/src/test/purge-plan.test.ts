// 시드 정리 스크립트 순수 부분 — packages/db/scripts/lib/purge-plan.mjs (0043 admin_purge_demo_data 호출자 purge-seed.mjs)
import { describe, expect, it } from "vitest";
import { hostLabel, isLocalHost, OWNER_EMAILS, parseArgs, parseList, PURGE_TABLES, storagePrefixesFor } from "../../scripts/lib/purge-plan.mjs";

describe("parseArgs", () => {
  it("기본 = dry-run · 아무것도 남기지 않음", () => {
    const a = parseArgs([]);
    expect(a).toMatchObject({ confirm: false, confirmRaw: null, keepEmails: [], keepCodes: [], resetSeq: false, skipStorage: false, json: false });
  });
  it("--confirm 은 정확히 PURGE 만 · 다른 값은 confirmRaw 로 안내", () => {
    expect(parseArgs(["--confirm", "PURGE"]).confirm).toBe(true);
    expect(parseArgs(["--confirm", "purge"])).toMatchObject({ confirm: false, confirmRaw: "purge" });
    expect(parseArgs(["--confirm"])).toMatchObject({ confirm: false, confirmRaw: "(값 없음)" });
  });
  it("--keep-email 소문자·중복 제거 · --keep-owner 가 대표 계정을 더한다 · --keep 코드", () => {
    const a = parseArgs(["--keep-email", "A@B.com, a@b.com,c@d.kr", "--keep-owner", "--keep", "s104,b101", "--reset-seq", "--skip-storage", "--json"]);
    expect(a.keepEmails.slice(0, 2)).toEqual(["a@b.com", "c@d.kr"]);
    for (const e of OWNER_EMAILS) expect(a.keepEmails).toContain(e);
    expect(a.keepCodes).toEqual(["s104", "b101"]);
    expect(a).toMatchObject({ resetSeq: true, skipStorage: true, json: true });
  });
  it("parseList — 빈 값 · true(값 없는 플래그)", () => {
    expect(parseList(undefined)).toEqual([]);
    expect(parseList(true)).toEqual([]);
    expect(parseList(" x ,, y ")).toEqual(["x", "y"]);
  });
});

describe("storagePrefixesFor · host", () => {
  it("인플루언서 partner-docs/sellers/<id> · 브랜드 partner-docs/brands + public-assets/brands + public-assets/products", () => {
    const p = storagePrefixesFor({ seller_ids: ["s-1"], brand_ids: ["b-1"], product_ids: ["p-1"] });
    expect(p).toEqual([
      { bucket: "partner-docs", prefix: "sellers/s-1" },
      { bucket: "partner-docs", prefix: "brands/b-1" },
      { bucket: "public-assets", prefix: "brands/b-1" },
      { bucket: "public-assets", prefix: "products/b-1" },
    ]);
    expect(storagePrefixesFor(null)).toEqual([]);
  });
  it("hostLabel · isLocalHost — 키 없이 호스트만", () => {
    expect(hostLabel("http://127.0.0.1:54321")).toBe("127.0.0.1:54321");
    expect(isLocalHost("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalHost("https://ocxppeuoiysnkwwujvko.supabase.co")).toBe(false);
    expect(hostLabel("nope")).toBe("(?)");
  });
  it("PURGE_TABLES — 자식이 부모보다 앞(orders < campaigns < products < brands · payouts < settlements)", () => {
    const i = (t: string) => PURGE_TABLES.indexOf(t);
    expect(i("payouts")).toBeLessThan(i("settlements"));
    expect(i("settlements")).toBeLessThan(i("campaigns"));
    expect(i("orders")).toBeLessThan(i("campaigns"));
    expect(i("campaigns")).toBeLessThan(i("products"));
    expect(i("products")).toBeLessThan(i("brands"));
    expect(i("seller_channels")).toBeLessThan(i("sellers"));
    expect(i("customers")).toBeLessThan(i("profiles"));
  });
});
