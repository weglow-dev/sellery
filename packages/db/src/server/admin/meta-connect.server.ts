/**
 * 아웃리치 "Instagram 연결" — 서버 (0128 `outreach_meta_connection` · service_role 전용). 규칙·흐름·암호화는 순수 모듈 `admin/meta-connect.ts`
 * (vitest 로 고정) — 여기는 환경값 주입 · Graph fetch · DB 읽기/쓰기만 한다.
 *
 *   configureMetaConnect({ appId, appSecret, redirectUri, envPageToken?, envIgUserId? })  — 관리자 앱이 env 에서 1회 주입
 *   beginMetaConnect()                         → { url, state } — Facebook 로그인 창 주소 + CSRF state(앱이 HttpOnly 쿠키에 둔다)
 *   completeMetaConnect({ code, actor })       → 토큰 교환 · 페이지 선택 · 검증(`buildMetaConnectionRow`) → 한 줄 저장
 *   disconnectMeta(actor)                      → 연결 줄 삭제(환경변수 토큰이 있으면 그쪽으로 돌아간다)
 *   metaConnectStatus()                        → 화면용 상태(토큰 없음)
 *   resolveMetaCredentials()                   → [조건으로 수집] 이 쓰는 페이지 토큰 + IG 사용자 id — **자격 증명을 읽는 곳은 여기 하나**
 *
 * 우선순위(`pickMetaCredentials`): 콘솔에서 연결한 계정(DB) → 환경변수(`META_PAGE_ACCESS_TOKEN` + `META_IG_USER_ID` · 버튼 이전 방식).
 * 앱 시크릿을 바꾸면 저장된 토큰이 풀리지 않으므로 [다시 연결] 이 필요하다(그동안은 환경변수 토큰으로 돌아간다).
 * 토큰·시크릿은 로그·반환값·리다이렉트 주소에 넣지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMetaConnectionRow,
  decryptMetaToken,
  metaAuthorizeUrl,
  newMetaState,
  parseMetaConnection,
  pickMetaCredentials,
  type MetaConnectFailCode,
  type MetaConnection,
  type MetaCredentials,
  type MetaGraph,
} from "../../admin/meta-connect";
import { META_GRAPH_VERSION } from "../../admin/outreach-providers";
import { createAdminClient, type Admin } from "../admin.server";

export { sameMetaState } from "../../admin/meta-connect";
export type { MetaConnectFailCode, MetaConnection, MetaCredentials } from "../../admin/meta-connect";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TABLE = "outreach_meta_connection";
const SLOT = "outreach";

type MetaConnectConfig = {
  appId?: string | null;
  appSecret?: string | null;
  /** 메타 앱에 등록한 리디렉션 URI 와 글자까지 같아야 한다 (`<PUBLIC_SITE_URL>/admin/outreach/meta/callback`) */
  redirectUri?: string | null;
  /** 버튼 이전 방식 — 환경변수 페이지 토큰(연결이 없을 때만 쓴다) */
  envPageToken?: string | null;
  envIgUserId?: string | null;
};
let cfg: MetaConnectConfig = {};

export function configureMetaConnect(c: MetaConnectConfig): void {
  cfg = { ...cfg, ...c };
}

/** [Instagram 연결] 버튼을 쓸 수 있는가 — 앱 ID · 시크릿 · 리디렉션 URI 가 다 있어야 한다 */
export function metaConnectReady(): boolean {
  return Boolean(cfg.appId && cfg.appSecret && cfg.redirectUri);
}

// ---------- DB ----------

/** `database.types.ts` 는 0055 이후 다시 만들지 않았다 — 이 표는 타입 없는 클라이언트로 읽고 쓴다 */
const table = (admin: Admin) => (admin as unknown as SupabaseClient).from(TABLE);

type Loaded = { connection: MetaConnection | null; pageToken: string | null };

/** 연결 줄 + 푼 토큰. 표가 아직 없거나(0128 미적용) 조회가 실패하면 연결 없음으로 본다 — 환경변수 방식이 계속 동작해야 한다 */
async function loadConnection(admin: Admin): Promise<Loaded> {
  const { data, error } = await table(admin).select("*").eq("slot", SLOT).maybeSingle();
  if (error) {
    console.error("[meta-connect] 연결 조회 실패:", error.message);
    return { connection: null, pageToken: null };
  }
  const connection = parseMetaConnection(data);
  const enc = (data as { token_enc?: unknown } | null)?.token_enc;
  if (!connection || typeof enc !== "string") return { connection: null, pageToken: null };
  const pageToken = cfg.appSecret ? await decryptMetaToken(enc, cfg.appSecret) : null;
  if (!pageToken) console.error("[meta-connect] 저장된 토큰을 풀지 못했어요 — META_APP_SECRET 이 바뀌었으면 [다시 연결] 이 필요합니다");
  return { connection, pageToken };
}

const credentialsOf = (loaded: Loaded): MetaCredentials | null =>
  pickMetaCredentials({ connection: loaded.connection, pageToken: loaded.pageToken, envPageToken: cfg.envPageToken, envIgUserId: cfg.envIgUserId });

/** [조건으로 수집] 이 쓰는 자격 증명. 없으면 null(메타 수집 꺼짐) */
export async function resolveMetaCredentials(admin: Admin = createAdminClient()): Promise<MetaCredentials | null> {
  return credentialsOf(await loadConnection(admin));
}

export type MetaConnectStatus = {
  /** 버튼 사용 가능(앱 ID · 시크릿 · 리디렉션 URI) */
  ready: boolean;
  /** 콘솔에서 연결한 계정(없으면 null) */
  connection: MetaConnection | null;
  /** 저장된 연결이 있지만 토큰을 못 푼다 — [다시 연결] 필요 */
  stale: boolean;
  /** 지금 수집이 쓰는 출처 */
  source: MetaCredentials["source"] | null;
};

export async function metaConnectStatus(admin: Admin = createAdminClient()): Promise<MetaConnectStatus> {
  const loaded = await loadConnection(admin);
  return { ready: metaConnectReady(), connection: loaded.connection, stale: Boolean(loaded.connection && !loaded.pageToken), source: credentialsOf(loaded)?.source ?? null };
}

// ---------- 연결 ----------

export function beginMetaConnect(): { ok: true; url: string; state: string } | { ok: false; code: "NOT_CONFIGURED" } {
  if (!cfg.appId || !cfg.appSecret || !cfg.redirectUri) return { ok: false, code: "NOT_CONFIGURED" };
  const state = newMetaState();
  return { ok: true, url: metaAuthorizeUrl({ appId: cfg.appId, redirectUri: cfg.redirectUri, state }), state };
}

const graphGet: MetaGraph = async (path, params, bearer) => {
  const res = await fetch(`${GRAPH}/${path}?${new URLSearchParams(params).toString()}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  return (await res.json().catch(() => null)) as unknown;
};

export type MetaConnectResult = { ok: true; connection: MetaConnection } | { ok: false; code: MetaConnectFailCode; error?: string | null };

/**
 * 콜백의 `code` 로 연결을 끝낸다. 호출 전에 앱이 (1) 관리자 게이트 (2) state 쿠키 대조를 마쳐야 한다.
 * `actor` 는 서버 세션의 운영자 이메일 — 요청 본문에서 받지 않는다.
 */
export async function completeMetaConnect(opts: { code: string; actor: string | null }, admin: Admin = createAdminClient()): Promise<MetaConnectResult> {
  const { appId, appSecret, redirectUri } = cfg;
  if (!appId || !appSecret || !redirectUri) return { ok: false, code: "NOT_CONFIGURED" };
  const before = await loadConnection(admin);
  const built = await buildMetaConnectionRow({
    appId,
    appSecret,
    redirectUri,
    code: opts.code,
    actor: opts.actor,
    preferredIgUserIds: [before.connection?.igUserId, cfg.envIgUserId],
    graph: graphGet,
  });
  if (!built.ok) return built;

  // 한 줄(slot)로 저장 — 다시 연결 = 덮어쓰기
  const { data, error } = await table(admin).upsert(built.row, { onConflict: "slot" }).select("*").maybeSingle();
  const connection = parseMetaConnection(data);
  if (error || !connection) {
    console.error("[meta-connect] 연결 저장 실패:", error?.message ?? "행 없음");
    return { ok: false, code: "SAVE_FAILED", error: error?.message ?? null };
  }
  console.info(`[meta-connect] 연결됨 — @${connection.igUsername ?? connection.igUserId} · 페이지 ${connection.pageId} · by ${opts.actor ?? "?"}`);
  return { ok: true, connection };
}

/** 연결 줄을 지운다 — 메타 쪽 앱 권한은 건드리지 않는다(환경변수 토큰과 다른 통합이 같은 권한을 쓴다) */
export async function disconnectMeta(actor: string | null, admin: Admin = createAdminClient()): Promise<boolean> {
  const { error } = await table(admin).delete().eq("slot", SLOT);
  if (error) {
    console.error("[meta-connect] 연결 해제 실패:", error.message);
    return false;
  }
  console.info(`[meta-connect] 연결 해제 — by ${actor ?? "?"}`);
  return true;
}
