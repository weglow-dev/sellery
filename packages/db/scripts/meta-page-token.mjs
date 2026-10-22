#!/usr/bin/env node
/**
 * 메타 공식 크리에이터 마켓플레이스용 **만료 없는 Page access token** 만들기 (2026-10-22)
 *
 *   node --env-file=.env.cloud.local packages/db/scripts/meta-page-token.mjs [.env.cloud.local]
 *
 * 왜 스크립트인가: 시스템 사용자 토큰에는 `instagram_creator_marketplace_discovery` 가 못 들어간다(권한 목록에 없음).
 * 그래서 그래프 API 탐색기의 **사용자 토큰(1시간)** → 장기 사용자 토큰(60일) → 그 토큰으로 받은 **페이지 토큰(만료 없음)** 순서로 만든다.
 *
 * 입력(env): META_APP_ID · META_APP_SECRET(앱 설정 → 기본 설정 → 앱 시크릿 코드) · META_USER_TOKEN(탐색기에서 복사한 사용자 토큰)
 *            META_PAGE_ID(브랜드 IG 가 연결된 페이지) · META_IG_USER_ID(검증 호출용)
 * 출력: 첫 번째 인자 파일의 `META_PAGE_ACCESS_TOKEN=` 줄을 채우고, `META_USER_TOKEN=` 줄은 비운다. **토큰 값은 화면에 찍지 않는다.**
 */
import { readFileSync, writeFileSync } from "node:fs";

const V = "v25.0";
const env = (k) => (process.env[k] ?? "").trim();
const need = (k) => {
  const v = env(k);
  if (!v) {
    console.error(`[meta-page-token] ${k} 가 비어 있어요`);
    process.exit(1);
  }
  return v;
};
const file = process.argv[2] ?? ".env.cloud.local";
const appId = need("META_APP_ID");
const appSecret = need("META_APP_SECRET");
const userToken = need("META_USER_TOKEN");
const pageId = need("META_PAGE_ID");
const igId = env("META_IG_USER_ID");

const get = async (path, params) => {
  const q = new URLSearchParams(params);
  const r = await fetch(`https://graph.facebook.com/${V}/${path}?${q}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) throw new Error(`${path}: ${j?.error?.message ?? r.status}`);
  return j;
};

const long = await get("oauth/access_token", { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: userToken });
console.log(`[meta-page-token] 장기 사용자 토큰 OK (${long.expires_in ? Math.round(long.expires_in / 86400) + "일" : "만료 정보 없음"})`);

const page = await get(pageId, { fields: "name,access_token", access_token: long.access_token });
const dbg = await get("debug_token", { input_token: page.access_token, access_token: `${appId}|${appSecret}` });
const d = dbg.data ?? {};
console.log(`[meta-page-token] 페이지 토큰 OK — 페이지 "${page.name}" · type ${d.type} · expires_at ${d.expires_at === 0 ? "없음(만료 안 함)" : d.expires_at} · scopes ${(d.scopes ?? []).join(",")}`);

if (igId) {
  try {
    const t = await get(`${igId}/creator_marketplace_creators`, { creator_min_followers: "50000", limit: "2", fields: "id,username", access_token: page.access_token });
    console.log(`[meta-page-token] 마켓플레이스 검증 호출 OK — ${(t.data ?? []).length}건 (예: ${(t.data ?? []).map((x) => x.username).join(", ")})`);
  } catch (e) {
    console.log(`[meta-page-token] 마켓플레이스 검증 호출 실패: ${e.message}`);
  }
}

let text = readFileSync(file, "utf8");
const setLine = (key, value) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.replace(/\n?$/, "\n")}${key}=${value}\n`;
};
setLine("META_PAGE_ACCESS_TOKEN", page.access_token);
setLine("META_USER_TOKEN", "");
writeFileSync(file, text);
console.log(`[meta-page-token] ${file} 의 META_PAGE_ACCESS_TOKEN 을 채웠고 META_USER_TOKEN 은 비웠어요`);
