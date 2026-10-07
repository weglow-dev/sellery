// JWE dir · A256GCM 왕복 — packages/payments/src/jwe.ts (토스 지급대행 암호화 · 0040). 고정 키로 암호화 → 복호 · 헤더 · 변조 거부.
import { describe, expect, it } from "vitest";
import { b64urlDecode, b64urlEncode, hexKeyBytes, isJweCompact, jweDecrypt, jweEncrypt, jweHeaderOf, tossIat } from "../jwe";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 hex = 32 bytes (테스트 전용 · 실제 키 아님)

describe("base64url · 키", () => {
  it("base64url 왕복 (패딩 없음 · -_)", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const s = b64urlEncode(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(Array.from(b64urlDecode(s))).toEqual(Array.from(bytes));
  });
  it("hexKeyBytes — 64자 16진수만 · 32바이트", () => {
    expect(hexKeyBytes(KEY).length).toBe(32);
    expect(hexKeyBytes(KEY)[0]).toBe(0x01);
    expect(() => hexKeyBytes("abc")).toThrow(/64 hex/);
    expect(() => hexKeyBytes("zz" + KEY.slice(2))).toThrow();
  });
  it("tossIat — KST +09:00 · 초 단위", () => {
    expect(tossIat(new Date("2026-10-07T00:30:15.123Z"))).toBe("2026-10-07T09:30:15+09:00");
    expect(tossIat(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01T00:00:00+09:00");
  });
});

describe("JWE 왕복", () => {
  it("encrypt → 5조각 compact · 헤더 alg dir / enc A256GCM / iat / nonce", async () => {
    const compact = await jweEncrypt('{"hello":"셀러리"}', KEY, { iat: "2026-10-07T09:00:00+09:00", nonce: "n-1" });
    expect(isJweCompact(compact)).toBe(true);
    const parts = compact.split(".");
    expect(parts.length).toBe(5);
    expect(parts[1]).toBe(""); // dir 은 암호화된 키 없음
    expect(jweHeaderOf(compact)).toEqual({ alg: "dir", enc: "A256GCM", iat: "2026-10-07T09:00:00+09:00", nonce: "n-1" });
    expect(await jweDecrypt(compact, KEY)).toBe('{"hello":"셀러리"}');
  });
  it("같은 평문도 iv 가 달라 암호문이 다르다 · 기본 iat/nonce 자동", async () => {
    const a = await jweEncrypt("x", KEY);
    const b = await jweEncrypt("x", KEY);
    expect(a).not.toBe(b);
    const h = jweHeaderOf(a);
    expect(h?.iat).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    expect(h?.nonce).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("고정 iv 로 결정적 암호문 — 복호 가능", async () => {
    const iv = new Uint8Array(12);
    const c1 = await jweEncrypt("abc", KEY, { iat: "2026-10-07T09:00:00+09:00", nonce: "n", iv });
    const c2 = await jweEncrypt("abc", KEY, { iat: "2026-10-07T09:00:00+09:00", nonce: "n", iv });
    expect(c1).toBe(c2);
    expect(await jweDecrypt(c1, KEY)).toBe("abc");
  });
  it("다른 키 · 변조된 태그 · 헤더 변조는 복호 실패", async () => {
    const compact = await jweEncrypt("secret", KEY);
    const otherKey = "f".repeat(64);
    await expect(jweDecrypt(compact, otherKey)).rejects.toThrow();
    const parts = compact.split(".");
    const tag = parts[4];
    parts[4] = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
    await expect(jweDecrypt(parts.join("."), KEY)).rejects.toThrow();
    // 헤더(AAD) 변조
    const p2 = compact.split(".");
    p2[0] = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: "dir", enc: "A256GCM", iat: "x", nonce: "y" })));
    await expect(jweDecrypt(p2.join("."), KEY)).rejects.toThrow();
  });
  it("지원하지 않는 alg/enc 는 거부", async () => {
    const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RSA-OAEP", enc: "A256GCM" })));
    await expect(jweDecrypt(`${header}..AAAA.AAAA.AAAA`, KEY)).rejects.toThrow(/unsupported/);
  });
  it("isJweCompact — JSON 본문은 false", () => {
    expect(isJweCompact('{"code":"X"}')).toBe(false);
    expect(isJweCompact("")).toBe(false);
    expect(isJweCompact("a.b.c")).toBe(false);
    expect(isJweCompact("eyJh..aXY.Y3Q.dGFn")).toBe(true);
  });
});
