/**
 * 아웃리치 "Instagram 연결" — 순수 규칙 (관리자 콘솔 · 0128 `outreach_meta_connection`). 환경변수·DB·fetch 를 쓰지 않는다.
 *
 * 흐름(서버는 `server/admin/meta-connect.server.ts`): 운영자가 콘솔에서 [Instagram 연결] → Facebook 로그인 창(`metaAuthorizeUrl`)
 * → 콜백(code · state) → 사용자 토큰 → 장기 토큰 → `/me/accounts`(페이지 + 연결된 Instagram 비즈니스 계정) → `pickMetaPage`
 * → 페이지 토큰 검증(`parseDebugToken` · `missingMetaScopes`) → 암호화해 저장. 이후 [조건으로 수집] 이 그 연결을 쓴다.
 */
import { META_GRAPH_VERSION } from "./outreach-providers";

/** 로그인 창에서 요청하는 권한 — 크리에이터 마켓플레이스 조회에 필요한 것만(메시지 권한은 요청하지 않는다) */
export const META_CONNECT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "business_management",
  "instagram_basic",
  "instagram_creator_marketplace_discovery",
] as const;

/** 이 권한이 빠지면 연결을 저장하지 않는다 — 운영자가 로그인 창에서 체크를 풀었을 때 */
export const META_REQUIRED_SCOPES = ["pages_show_list", "instagram_basic", "instagram_creator_marketplace_discovery"] as const;

/** 콜백 경로(관리자 앱 base `/admin` 아래) — 메타 앱의 "유효한 OAuth 리디렉션 URI" 에 `<사이트>/admin/outreach/meta/callback` 을 등록해야 한다 */
export const META_CALLBACK_PATH = "/outreach/meta/callback";

/** state 쿠키 이름 · 수명(초) */
export const META_STATE_COOKIE = "slry_meta_oauth";
export const META_STATE_MAX_AGE = 600;

export function metaAuthorizeUrl(o: { appId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: o.appId,
    redirect_uri: o.redirectUri,
    state: o.state,
    response_type: "code",
    scope: META_CONNECT_SCOPES.join(","),
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${q.toString()}`;
}

export function missingMetaScopes(granted: readonly string[]): string[] {
  const have = new Set(granted);
  return META_REQUIRED_SCOPES.filter((s) => !have.has(s));
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Graph 오류 응답 → 짧은 문장(토큰이 섞이지 않게 `secrets` 는 가린다). 오류가 아니면 null */
export function metaGraphError(json: unknown, secrets: readonly (string | null | undefined)[] = []): string | null {
  const err = obj(obj(json)?.error);
  if (!err) return null;
  let msg = `${str(err.message) ?? "Graph API 오류"}${err.code ? ` (code ${String(err.code)})` : ""}`;
  for (const s of secrets) if (s) msg = msg.split(s).join("[가림]");
  return msg.slice(0, 240);
}

export type MetaPageCandidate = { pageId: string; pageName: string | null; pageToken: string; igUserId: string; igUsername: string | null };

/** `/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}` → Instagram 비즈니스 계정이 연결된 페이지만 */
export function parseMetaPages(json: unknown): MetaPageCandidate[] {
  const data = obj(json)?.data;
  const out: MetaPageCandidate[] = [];
  for (const it of Array.isArray(data) ? data : []) {
    const p = obj(it);
    const ig = obj(p?.instagram_business_account);
    const pageId = str(p?.id);
    const pageToken = str(p?.access_token);
    const igUserId = str(ig?.id);
    if (!p || !pageId || !pageToken || !igUserId) continue;
    out.push({ pageId, pageName: str(p.name), pageToken, igUserId, igUsername: str(ig?.username) });
  }
  return out;
}

export type MetaPagePick =
  | { ok: true; page: MetaPageCandidate }
  | { ok: false; code: "NO_INSTAGRAM" | "NEED_CHOICE"; usernames: string[] };

/**
 * 연결할 페이지 고르기 — (1) 선호 Instagram 계정(이미 연결된 계정 · `META_IG_USER_ID`)이 후보에 있으면 그것,
 * (2) 후보가 하나면 그것, (3) 여럿이면 고르지 않는다(운영자가 로그인 창에서 계정을 하나만 선택해야 한다).
 */
export function pickMetaPage(candidates: readonly MetaPageCandidate[], preferredIgUserIds: readonly (string | null | undefined)[] = []): MetaPagePick {
  if (!candidates.length) return { ok: false, code: "NO_INSTAGRAM", usernames: [] };
  for (const id of preferredIgUserIds) {
    const hit = id ? candidates.find((c) => c.igUserId === id) : undefined;
    if (hit) return { ok: true, page: hit };
  }
  if (candidates.length === 1) return { ok: true, page: candidates[0] };
  return { ok: false, code: "NEED_CHOICE", usernames: candidates.map((c) => c.igUsername ?? c.igUserId) };
}

export type MetaTokenInfo = { valid: boolean; appId: string | null; type: string | null; scopes: string[]; expiresAt: number | null };

/** `/debug_token` 응답 → 유효 여부 · 앱 · 권한. `expires_at` 0 = 만료 없음(null) */
export function parseDebugToken(json: unknown): MetaTokenInfo {
  const d = obj(obj(json)?.data);
  const exp = typeof d?.expires_at === "number" ? d.expires_at : null;
  return {
    valid: d?.is_valid === true,
    appId: str(d?.app_id),
    type: str(d?.type),
    scopes: Array.isArray(d?.scopes) ? d.scopes.filter((s): s is string => typeof s === "string") : [],
    expiresAt: exp && exp > 0 ? exp : null,
  };
}

/** 화면에 보여 주는 연결 정보 — 토큰은 없다 */
export type MetaConnection = {
  pageId: string;
  pageName: string | null;
  igUserId: string;
  igUsername: string | null;
  scopes: string[];
  connectedBy: string | null;
  connectedAt: string | null;
};

export function parseMetaConnection(row: unknown): MetaConnection | null {
  const r = obj(row);
  const pageId = str(r?.page_id);
  const igUserId = str(r?.ig_user_id);
  if (!r || !pageId || !igUserId) return null;
  return {
    pageId,
    pageName: str(r.page_name),
    igUserId,
    igUsername: str(r.ig_username),
    scopes: Array.isArray(r.scopes) ? r.scopes.filter((s): s is string => typeof s === "string") : [],
    connectedBy: str(r.connected_by),
    connectedAt: str(r.connected_at),
  };
}

/** 연결 실패 코드 — 화면 문구는 관리자 앱이 정한다 */
export type MetaConnectFailCode =
  | "NOT_CONFIGURED" // META_APP_ID · META_APP_SECRET · 사이트 주소 없음
  | "EXCHANGE_FAILED" // code → 토큰 교환 실패
  | "NO_INSTAGRAM" // 선택한 페이지에 Instagram 비즈니스 계정이 없다
  | "NEED_CHOICE" // Instagram 계정이 여러 개 — 하나만 선택
  | "TOKEN_INVALID" // 페이지 토큰 검증 실패(다른 앱 · 무효)
  | "MISSING_SCOPE" // 필수 권한을 부여하지 않음
  | "SAVE_FAILED"; // DB 저장 실패(0128 미적용 등)

// ---------- 토큰 암호화 (AES-256-GCM · 'v1.<iv>.<ciphertext+tag>' base64url) ----------
// 키는 메타 앱 시크릿에서 HKDF 로 유도한다(추가 환경변수 없음). 시크릿을 바꾸면 풀리지 않는다 → [다시 연결].
// Web Crypto(`crypto.subtle`)만 쓴다 — 이 패키지는 Node 전용 모듈을 import 하지 않는다.

const utf8 = new TextEncoder();
const b64u = (b: Uint8Array): string => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function unb64u(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function tokenKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8.encode("sellery-outreach"), info: utf8.encode("meta-page-token-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMetaToken(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(secret), utf8.encode(plain)));
  return ["v1", b64u(iv), b64u(ct)].join(".");
}

/** 형식이 다르거나 키가 달라 인증에 실패하면 null — 예외를 던지지 않는다 */
export async function decryptMetaToken(enc: string, secret: string): Promise<string | null> {
  const parts = enc.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const iv = unb64u(parts[1]);
  const ct = unb64u(parts[2]);
  if (!iv || !ct || iv.length !== 12) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await tokenKey(secret), ct);
    return new TextDecoder().decode(plain) || null;
  } catch {
    return null;
  }
}

// ---------- state (CSRF) ----------

export function newMetaState(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(24))));
}

/** 길이가 같을 때만 끝까지 비교한다(일찍 끝내지 않는다) */
export function sameMetaState(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- 수집 자격 증명 — 출처 우선순위는 여기 하나 ----------

export type MetaCredentials = { pageToken: string; igUserId: string; source: "connection" | "env" };

/** 콘솔에서 연결한 계정(토큰을 풀 수 있을 때) → 환경변수 토큰(버튼 이전 방식) → 없음 */
export function pickMetaCredentials(o: {
  connection: MetaConnection | null;
  /** 연결 줄의 토큰을 푼 값 — 못 풀었으면 null */
  pageToken: string | null;
  envPageToken?: string | null;
  envIgUserId?: string | null;
}): MetaCredentials | null {
  if (o.connection && o.pageToken) return { pageToken: o.pageToken, igUserId: o.connection.igUserId, source: "connection" };
  if (o.envPageToken && o.envIgUserId) return { pageToken: o.envPageToken, igUserId: o.envIgUserId, source: "env" };
  return null;
}

// ---------- 연결 흐름 (code → 저장할 한 줄) ----------

/** Graph API GET — `path` 는 버전 뒤 경로(`me/accounts`), `bearer` 가 있으면 Authorization 헤더로 보낸다 */
export type MetaGraph = (path: string, params: Record<string, string>, bearer?: string) => Promise<unknown>;

/** `outreach_meta_connection` 에 넣는 한 줄 — 토큰은 암호문만 */
export type MetaConnectionRow = {
  slot: "outreach";
  page_id: string;
  page_name: string | null;
  ig_user_id: string;
  ig_username: string | null;
  token_enc: string;
  scopes: string[];
  connected_by: string | null;
  connected_at: string;
};

export type MetaConnectionBuild = { ok: true; row: MetaConnectionRow } | { ok: false; code: MetaConnectFailCode; error?: string | null };

const tokenOf = (json: unknown): string | null => str(obj(json)?.access_token);

/**
 * 콜백의 `code` 로 저장할 연결 줄을 만든다(저장은 호출자).
 *   1) code → 단기 사용자 토큰 → 장기 사용자 토큰(여기서 받은 페이지 토큰은 만료가 없다)
 *   2) `/me/accounts` — 운영자가 로그인 창에서 고른 페이지 + 그 페이지의 Instagram 비즈니스 계정 → `pickMetaPage`
 *   3) `/debug_token` — 우리 앱의 유효한 토큰인지 · 필수 권한이 부여됐는지
 *   4) 페이지 토큰을 암호화해 줄로
 * 실패 문장에서는 시크릿 · code · 토큰을 가린다. 예외(네트워크)는 EXCHANGE_FAILED 로 돌려준다 — 던지지 않는다.
 */
export async function buildMetaConnectionRow(o: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  /** 서버 세션의 운영자 이메일 */
  actor: string | null;
  /** 선호 Instagram 계정 — 이미 연결된 계정 · `META_IG_USER_ID` 순 */
  preferredIgUserIds?: readonly (string | null | undefined)[];
  graph: MetaGraph;
  now?: () => Date;
}): Promise<MetaConnectionBuild> {
  const secrets: string[] = [o.appSecret, o.code];
  const scrub = (msg: string) => secrets.reduce((acc, s) => acc.split(s).join("[가림]"), msg).slice(0, 240);
  const fail = (code: MetaConnectFailCode, json?: unknown): MetaConnectionBuild => ({ ok: false, code, error: metaGraphError(json, secrets) });
  try {
    const shortJson = await o.graph("oauth/access_token", { client_id: o.appId, client_secret: o.appSecret, redirect_uri: o.redirectUri, code: o.code });
    const shortToken = tokenOf(shortJson);
    if (!shortToken) return fail("EXCHANGE_FAILED", shortJson);
    secrets.push(shortToken);
    const longJson = await o.graph("oauth/access_token", { grant_type: "fb_exchange_token", client_id: o.appId, client_secret: o.appSecret, fb_exchange_token: shortToken });
    const userToken = tokenOf(longJson);
    if (!userToken) return fail("EXCHANGE_FAILED", longJson);
    secrets.push(userToken);

    const pagesJson = await o.graph("me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" }, userToken);
    if (metaGraphError(pagesJson)) return fail("EXCHANGE_FAILED", pagesJson);
    const pick = pickMetaPage(parseMetaPages(pagesJson), o.preferredIgUserIds ?? []);
    if (!pick.ok) return { ok: false, code: pick.code, error: pick.usernames.length ? pick.usernames.map((u) => `@${u}`).join(" · ") : null };
    const page = pick.page;
    secrets.push(page.pageToken);

    const info = parseDebugToken(await o.graph("debug_token", { input_token: page.pageToken, access_token: `${o.appId}|${o.appSecret}` }));
    if (!info.valid || info.appId !== o.appId) return { ok: false, code: "TOKEN_INVALID" };
    const missing = missingMetaScopes(info.scopes);
    if (missing.length) return { ok: false, code: "MISSING_SCOPE", error: missing.join(", ") };

    return {
      ok: true,
      row: {
        slot: "outreach",
        page_id: page.pageId,
        page_name: page.pageName,
        ig_user_id: page.igUserId,
        ig_username: page.igUsername,
        token_enc: await encryptMetaToken(page.pageToken, o.appSecret),
        scopes: info.scopes,
        connected_by: o.actor,
        connected_at: (o.now?.() ?? new Date()).toISOString(),
      },
    };
  } catch (e) {
    return { ok: false, code: "EXCHANGE_FAILED", error: scrub(e instanceof Error ? e.message : String(e)) };
  }
}
