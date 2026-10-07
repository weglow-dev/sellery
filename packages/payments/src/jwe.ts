/**
 * 토스페이먼츠 지급대행 API 암호화 — JWE compact (alg "dir" · enc "A256GCM") · 순수 모듈 (WebCrypto · @types/node 불필요).
 * 문서: docs.tosspayments.com/guides/v2/payouts "암호화" — 보안 키는 64자 16진수(32바이트)이고 그대로 AES-256-GCM 키다.
 *   헤더: { alg:"dir", enc:"A256GCM", iat:"yyyy-MM-dd'T'HH:mm:ss±hh:mm", nonce:<uuid> } — iat 는 토스가 재전송 창을 보는 값이라 **현재 시각**이어야 한다.
 *   본문: base64url(header) . "" . base64url(iv 12B) . base64url(ciphertext) . base64url(tag 16B), AAD = ASCII(base64url(header)).
 *   응답(암호화 엔드포인트)은 같은 키로 복호한다 — `jweDecrypt`.
 *
 *   jweEncrypt(plaintext, keyHex, { iat?, nonce? }) → compact 문자열
 *   jweDecrypt(compact, keyHex)                     → 평문 (헤더 검사: alg dir · enc A256GCM)
 *   isJweCompact(text)                              → 5조각 compact 형태인지(응답이 암호문인지 JSON 인지 분기)
 *   tossIat(date)                                   → 'yyyy-MM-dd'T'HH:mm:ss+09:00' (KST 고정 · 서버 TZ 무관)
 */

const te = new TextEncoder();
const td = new TextDecoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type Bytes = Uint8Array<ArrayBuffer>;

export function b64urlDecode(s: string): Bytes {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 64자 16진수 → 32바이트. 형식이 아니면 throw (키 값은 메시지에 싣지 않는다) */
export function hexKeyBytes(keyHex: string): Bytes {
  const h = String(keyHex ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error("TOSS_PAYOUT_SECURITY_KEY must be 64 hex chars (32-byte AES-256 key)");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 토스 iat 형식 — KST(+09:00) 고정. 밀리초 없음. */
export function tossIat(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}T${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:${p(kst.getUTCSeconds())}+09:00`;
}

export type JweHeader = { alg: "dir"; enc: "A256GCM"; iat: string; nonce: string };

async function importKey(keyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexKeyBytes(keyHex), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function jweEncrypt(plaintext: string, keyHex: string, opts: { iat?: string; nonce?: string; iv?: Bytes } = {}): Promise<string> {
  const header: JweHeader = { alg: "dir", enc: "A256GCM", iat: opts.iat ?? tossIat(), nonce: opts.nonce ?? crypto.randomUUID() };
  const protectedHeader = b64urlEncode(te.encode(JSON.stringify(header)));
  const iv: Bytes = opts.iv ?? crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(keyHex);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(protectedHeader), tagLength: 128 }, key, te.encode(plaintext)),
  );
  const ciphertext = sealed.slice(0, sealed.length - 16);
  const tag = sealed.slice(sealed.length - 16);
  return `${protectedHeader}..${b64urlEncode(iv)}.${b64urlEncode(ciphertext)}.${b64urlEncode(tag)}`;
}

export function isJweCompact(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t || t.startsWith("{") || t.startsWith("[")) return false;
  const parts = t.split(".");
  return parts.length === 5 && parts.every((p, i) => (i === 1 ? p === "" : /^[A-Za-z0-9_-]+$/.test(p)));
}

export async function jweDecrypt(compact: string, keyHex: string): Promise<string> {
  const parts = String(compact ?? "").trim().split(".");
  if (parts.length !== 5) throw new Error("JWE compact must have 5 parts");
  const [protectedHeader, , ivB64, ctB64, tagB64] = parts;
  let header: Partial<JweHeader>;
  try {
    header = JSON.parse(td.decode(b64urlDecode(protectedHeader))) as Partial<JweHeader>;
  } catch {
    throw new Error("JWE header is not JSON");
  }
  if (header.alg !== "dir" || header.enc !== "A256GCM") throw new Error(`unsupported JWE alg/enc ${String(header.alg)}/${String(header.enc)}`);
  const iv = b64urlDecode(ivB64);
  const ct = b64urlDecode(ctB64);
  const tag = b64urlDecode(tagB64);
  const sealed: Bytes = new Uint8Array(ct.length + tag.length);
  sealed.set(ct, 0);
  sealed.set(tag, ct.length);
  const key = await importKey(keyHex);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: te.encode(protectedHeader), tagLength: 128 }, key, sealed);
  return td.decode(plain);
}

/** 복호한 평문 헤더만 읽는다(디버깅 · 테스트) */
export function jweHeaderOf(compact: string): Partial<JweHeader> | null {
  try {
    return JSON.parse(td.decode(b64urlDecode(String(compact).split(".")[0] ?? ""))) as Partial<JweHeader>;
  } catch {
    return null;
  }
}
