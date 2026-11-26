import { describe, expect, it } from "vitest";
import {
  META_CONNECT_SCOPES,
  buildMetaConnectionRow,
  decryptMetaToken,
  encryptMetaToken,
  metaAuthorizeUrl,
  metaGraphError,
  missingMetaScopes,
  newMetaState,
  parseDebugToken,
  parseMetaConnection,
  parseMetaPages,
  pickMetaCredentials,
  pickMetaPage,
  sameMetaState,
  type MetaGraph,
} from "../admin/meta-connect";

const APP_ID = "610000000000001";
const SECRET = "app-secret-for-tests";
const REDIRECT = "https://sellery.life/admin/outreach/meta/callback";
const PAGES = {
  data: [
    { id: "p1", name: "Make Your Recipe", access_token: "PAGE-TOKEN-1", instagram_business_account: { id: "ig1", username: "makeyour.recipe" } },
    { id: "p2", name: "Other", access_token: "PAGE-TOKEN-2", instagram_business_account: { id: "ig2", username: "other_brand" } },
    { id: "p3", name: "No Instagram", access_token: "PAGE-TOKEN-3" },
  ],
};

describe("Instagram 연결 — 순수 규칙", () => {
  it("로그인 창 주소 — 앱 ID · 리디렉션 · state · 권한(메시지 권한 없음) · 시크릿 없음", () => {
    const u = new URL(metaAuthorizeUrl({ appId: APP_ID, redirectUri: REDIRECT, state: "st4te" }));
    expect(u.origin + u.pathname).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/);
    expect(u.searchParams.get("client_id")).toBe(APP_ID);
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("response_type")).toBe("code");
    const scopes = (u.searchParams.get("scope") ?? "").split(",");
    expect(scopes).toEqual([...META_CONNECT_SCOPES]);
    expect(scopes).toContain("instagram_basic");
    expect(scopes).toContain("instagram_creator_marketplace_discovery");
    expect(scopes.some((s) => s.includes("messag"))).toBe(false);
    expect(u.search).not.toContain("secret");
  });

  it("필수 권한 — 빠진 것만", () => {
    expect(missingMetaScopes(["pages_show_list", "instagram_basic", "instagram_creator_marketplace_discovery", "email"])).toEqual([]);
    expect(missingMetaScopes(["pages_show_list", "instagram_basic"])).toEqual(["instagram_creator_marketplace_discovery"]);
    expect(missingMetaScopes([])).toHaveLength(3);
  });

  it("페이지 목록 — Instagram 비즈니스 계정과 토큰이 있는 페이지만", () => {
    const pages = parseMetaPages(PAGES);
    expect(pages.map((p) => p.igUsername)).toEqual(["makeyour.recipe", "other_brand"]);
    expect(pages[0]).toEqual({ pageId: "p1", pageName: "Make Your Recipe", pageToken: "PAGE-TOKEN-1", igUserId: "ig1", igUsername: "makeyour.recipe" });
    expect(parseMetaPages(null)).toEqual([]);
    expect(parseMetaPages({ data: [{ id: "p9", instagram_business_account: { id: "ig9" } }] })).toEqual([]);
  });

  it("페이지 고르기 — 선호 계정 · 하나뿐 · 여럿이면 고르지 않음 · 없음", () => {
    const pages = parseMetaPages(PAGES);
    expect(pickMetaPage(pages, [null, "ig2"])).toMatchObject({ ok: true, page: { igUserId: "ig2" } });
    expect(pickMetaPage(pages, ["ig1", "ig2"])).toMatchObject({ ok: true, page: { igUserId: "ig1" } });
    expect(pickMetaPage(pages.slice(0, 1), ["ig-missing"])).toMatchObject({ ok: true, page: { igUserId: "ig1" } });
    expect(pickMetaPage(pages, ["ig-missing"])).toEqual({ ok: false, code: "NEED_CHOICE", usernames: ["makeyour.recipe", "other_brand"] });
    expect(pickMetaPage([], ["ig1"])).toEqual({ ok: false, code: "NO_INSTAGRAM", usernames: [] });
  });

  it("debug_token — 유효 · 앱 · 권한 · 만료 0 은 없음", () => {
    expect(parseDebugToken({ data: { is_valid: true, app_id: APP_ID, type: "PAGE", scopes: ["instagram_basic", 3], expires_at: 0 } })).toEqual({ valid: true, appId: APP_ID, type: "PAGE", scopes: ["instagram_basic"], expiresAt: null });
    expect(parseDebugToken({ data: { is_valid: false, expires_at: 1900000000 } })).toMatchObject({ valid: false, appId: null, expiresAt: 1900000000 });
    expect(parseDebugToken(null)).toMatchObject({ valid: false, scopes: [] });
  });

  it("Graph 오류 문장 — 시크릿은 가린다", () => {
    expect(metaGraphError({ data: [] })).toBeNull();
    expect(metaGraphError({ error: { message: "Invalid code SECRET-CODE", code: 100 } }, ["SECRET-CODE", null])).toBe("Invalid code [가림] (code 100)");
  });

  it("연결 줄 → 화면 정보(토큰 없음)", () => {
    const c = parseMetaConnection({ slot: "outreach", page_id: "p1", page_name: "Make Your Recipe", ig_user_id: "ig1", ig_username: "makeyour.recipe", token_enc: "v1.aaaa.bbbb", scopes: ["instagram_basic"], connected_by: "ops@weglow.test", connected_at: "2026-11-26T03:00:00Z" });
    expect(c).toEqual({ pageId: "p1", pageName: "Make Your Recipe", igUserId: "ig1", igUsername: "makeyour.recipe", scopes: ["instagram_basic"], connectedBy: "ops@weglow.test", connectedAt: "2026-11-26T03:00:00Z" });
    expect(JSON.stringify(c)).not.toContain("v1.aaaa.bbbb");
    expect(parseMetaConnection({ page_id: "p1" })).toBeNull();
    expect(parseMetaConnection(null)).toBeNull();
  });

  it("수집 자격 증명 — 연결(토큰을 풀었을 때)이 환경변수보다 우선 · 못 풀면 환경변수 · 둘 다 없으면 null", () => {
    const connection = parseMetaConnection({ page_id: "p1", ig_user_id: "ig1", ig_username: "makeyour.recipe" });
    expect(pickMetaCredentials({ connection, pageToken: "PAGE-TOKEN-1", envPageToken: "ENV-TOKEN", envIgUserId: "ig-env" })).toEqual({ pageToken: "PAGE-TOKEN-1", igUserId: "ig1", source: "connection" });
    expect(pickMetaCredentials({ connection, pageToken: null, envPageToken: "ENV-TOKEN", envIgUserId: "ig-env" })).toEqual({ pageToken: "ENV-TOKEN", igUserId: "ig-env", source: "env" });
    expect(pickMetaCredentials({ connection: null, pageToken: null, envPageToken: "ENV-TOKEN", envIgUserId: "ig-env" })).toMatchObject({ source: "env" });
    expect(pickMetaCredentials({ connection, pageToken: null })).toBeNull();
    expect(pickMetaCredentials({ connection: null, pageToken: null, envPageToken: "ENV-TOKEN", envIgUserId: null })).toBeNull();
  });
});

describe("Instagram 연결 — 토큰 암호화 · state", () => {
  it("암호문은 v1 형식 · 평문이 없고 · 매번 다르며 · 같은 시크릿으로만 풀린다", async () => {
    const a = await encryptMetaToken("EAAG-page-token", SECRET);
    const b = await encryptMetaToken("EAAG-page-token", SECRET);
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(a).not.toContain("EAAG");
    expect(a).not.toBe(b);
    expect(await decryptMetaToken(a, SECRET)).toBe("EAAG-page-token");
    expect(await decryptMetaToken(a, "another-secret")).toBeNull();
  });

  it("변조 · 형식 밖은 null (예외 없음)", async () => {
    const enc = await encryptMetaToken("EAAG-page-token", SECRET);
    const [v, iv, ct] = enc.split(".");
    const flipped = ct.startsWith("A") ? `B${ct.slice(1)}` : `A${ct.slice(1)}`;
    expect(await decryptMetaToken([v, iv, flipped].join("."), SECRET)).toBeNull();
    expect(await decryptMetaToken([v, iv, ct, "extra"].join("."), SECRET)).toBeNull();
    expect(await decryptMetaToken("EAAG-plain-token", SECRET)).toBeNull();
    expect(await decryptMetaToken("v2.aaaa.bbbb", SECRET)).toBeNull();
    expect(await decryptMetaToken("v1.!!.??", SECRET)).toBeNull();
    expect(await decryptMetaToken("", SECRET)).toBeNull();
  });

  it("state — 매번 다른 값 · 같을 때만 통과 · 비면 거부", () => {
    const a = newMetaState();
    const b = newMetaState();
    expect(a).toMatch(/^[\w-]{32}$/);
    expect(a).not.toBe(b);
    expect(sameMetaState(a, a)).toBe(true);
    expect(sameMetaState("abc", "abd")).toBe(false);
    expect(sameMetaState("abc", "abcd")).toBe(false);
    expect(sameMetaState(undefined, "abc")).toBe(false);
    expect(sameMetaState("abc", null)).toBe(false);
    expect(sameMetaState("", "")).toBe(false);
  });
});

type Reply = unknown | (() => unknown);
/** 경로별 응답을 주는 Graph 흉내 — 호출을 기록한다 */
function fakeGraph(replies: Record<string, Reply>) {
  const calls: { key: string; params: Record<string, string>; bearer: string | null }[] = [];
  const graph: MetaGraph = async (path, params, bearer) => {
    const key = path === "oauth/access_token" ? (params.grant_type === "fb_exchange_token" ? "oauth:long" : "oauth:short") : path;
    calls.push({ key, params, bearer: bearer ?? null });
    const r = replies[key];
    return typeof r === "function" ? (r as () => unknown)() : (r ?? null);
  };
  return { graph, calls };
}

const OK_GRAPH: Record<string, Reply> = {
  "oauth:short": { access_token: "SHORT-USER-TOKEN" },
  "oauth:long": { access_token: "LONG-USER-TOKEN" },
  "me/accounts": PAGES,
  debug_token: { data: { is_valid: true, app_id: APP_ID, type: "PAGE", expires_at: 0, scopes: ["pages_show_list", "instagram_basic", "instagram_creator_marketplace_discovery"] } },
};
const build = (replies: Record<string, Reply>, preferred: (string | null)[] = []) => {
  const g = fakeGraph(replies);
  return {
    calls: g.calls,
    result: buildMetaConnectionRow({ appId: APP_ID, appSecret: SECRET, redirectUri: REDIRECT, code: "AUTH-CODE", actor: "ops@weglow.test", preferredIgUserIds: preferred, graph: g.graph, now: () => new Date("2026-11-26T03:00:00Z") }),
  };
};

describe("Instagram 연결 — code → 저장할 한 줄", () => {
  it("선호 계정을 골라 암호문으로 만든다 — 줄에 평문 토큰이 없다", async () => {
    const { calls, result } = build(OK_GRAPH, [null, "ig1"]);
    const r = await result;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({ slot: "outreach", page_id: "p1", page_name: "Make Your Recipe", ig_user_id: "ig1", ig_username: "makeyour.recipe", connected_by: "ops@weglow.test", connected_at: "2026-11-26T03:00:00.000Z" });
    expect(r.row.scopes).toContain("instagram_creator_marketplace_discovery");
    expect(r.row.token_enc).toMatch(/^v1\./);
    expect(JSON.stringify(r.row)).not.toContain("PAGE-TOKEN");
    expect(await decryptMetaToken(r.row.token_enc, SECRET)).toBe("PAGE-TOKEN-1");
    // 호출 순서와 인자 — code 교환에 리디렉션 URI 가 글자 그대로, 페이지 조회는 장기 토큰을 헤더로, 검증은 앱 토큰으로
    expect(calls.map((c) => c.key)).toEqual(["oauth:short", "oauth:long", "me/accounts", "debug_token"]);
    expect(calls[0].params).toMatchObject({ client_id: APP_ID, client_secret: SECRET, redirect_uri: REDIRECT, code: "AUTH-CODE" });
    expect(calls[1].params.fb_exchange_token).toBe("SHORT-USER-TOKEN");
    expect(calls[2].bearer).toBe("LONG-USER-TOKEN");
    expect(calls[2].params.access_token).toBeUndefined();
    expect(calls[3].params).toMatchObject({ input_token: "PAGE-TOKEN-1", access_token: `${APP_ID}|${SECRET}` });
  });

  it("거부 — 교환 실패(시크릿·code 가림) · 계정 여러 개 · Instagram 없음 · 다른 앱 토큰 · 무효 토큰 · 권한 빠짐", async () => {
    expect(await build({ ...OK_GRAPH, "oauth:short": { error: { message: `Bad code AUTH-CODE for secret ${SECRET}`, code: 100 } } }).result).toEqual({ ok: false, code: "EXCHANGE_FAILED", error: "Bad code [가림] for secret [가림] (code 100)" });
    expect(await build({ ...OK_GRAPH, "oauth:long": {} }).result).toEqual({ ok: false, code: "EXCHANGE_FAILED", error: null });
    expect(await build({ ...OK_GRAPH, "me/accounts": { error: { message: "Session expired", code: 190 } } }).result).toEqual({ ok: false, code: "EXCHANGE_FAILED", error: "Session expired (code 190)" });
    expect(await build(OK_GRAPH).result).toEqual({ ok: false, code: "NEED_CHOICE", error: "@makeyour.recipe · @other_brand" });
    expect(await build({ ...OK_GRAPH, "me/accounts": { data: [PAGES.data[2]] } }).result).toEqual({ ok: false, code: "NO_INSTAGRAM", error: null });
    const one = { data: [PAGES.data[0]] };
    expect(await build({ ...OK_GRAPH, "me/accounts": one, debug_token: { data: { is_valid: true, app_id: "999", scopes: [] } } }).result).toEqual({ ok: false, code: "TOKEN_INVALID" });
    expect(await build({ ...OK_GRAPH, "me/accounts": one, debug_token: { data: { is_valid: false, app_id: APP_ID } } }).result).toEqual({ ok: false, code: "TOKEN_INVALID" });
    expect(await build({ ...OK_GRAPH, "me/accounts": one, debug_token: { data: { is_valid: true, app_id: APP_ID, scopes: ["pages_show_list", "instagram_basic"] } } }).result).toEqual({ ok: false, code: "MISSING_SCOPE", error: "instagram_creator_marketplace_discovery" });
  });

  it("실패하면 뒤 단계를 부르지 않는다 — 교환 실패 뒤 페이지 조회 없음", async () => {
    const { calls, result } = build({ ...OK_GRAPH, "oauth:short": { error: { message: "expired", code: 100 } } });
    await result;
    expect(calls.map((c) => c.key)).toEqual(["oauth:short"]);
  });

  it("네트워크 예외 — 던지지 않고 EXCHANGE_FAILED · 메시지의 시크릿과 받은 토큰을 가린다", async () => {
    const r = await build({
      ...OK_GRAPH,
      "me/accounts": () => {
        throw new Error(`ECONNRESET sending LONG-USER-TOKEN with ${SECRET}`);
      },
    }).result;
    expect(r).toEqual({ ok: false, code: "EXCHANGE_FAILED", error: "ECONNRESET sending [가림] with [가림]" });
  });
});
