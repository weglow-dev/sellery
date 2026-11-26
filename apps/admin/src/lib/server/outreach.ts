/**
 * 관리자 콘솔 "아웃리치" 배럴 — `@sellery/db/server/admin/{outreach,outreach-collect,meta-connect}`(크리에이터 후보 큐 · 0055 · 제공사 수집 · Instagram 연결 0128).
 * `./money` · `./partners` 와 나란히 두는 별도 배럴. 게이트는 각 page · action 의 `requireAdmin()`.
 * 비밀 주입(전부 선택 · Vercel `sellery-admin`):
 *   · `META_APP_ID` + `META_APP_SECRET` — 콘솔 [Instagram 연결] 버튼(Facebook 로그인 → 페이지 토큰을 암호화해 DB 에 저장). 메타 앱의
 *     "유효한 OAuth 리디렉션 URI" 에 `META_REDIRECT_URI`(= `<PUBLIC_SITE_URL>/admin/outreach/meta/callback`)가 등록돼 있어야 한다.
 *   · `META_PAGE_ACCESS_TOKEN` + `META_IG_USER_ID` — 버튼 이전 방식. 콘솔 연결이 없을 때만 쓴다.
 *   · `MODASH_API_KEY` · `MODASH_KR_LOCATION_ID` — 메타가 없을 때.
 * 아무것도 없으면 "조건으로 수집" 버튼이 안내만.
 */
import { SITE_URL } from './env';
import { env } from '$env/dynamic/private';
import { META_CALLBACK_PATH } from '@sellery/db/admin/meta-connect';
import { configureMetaConnect } from '@sellery/db/server/admin/meta-connect';
import { configureOutreachCollect } from '@sellery/db/server/admin/outreach-collect';
import { adminPath } from './admin';

/** 메타 앱에 등록하는 리디렉션 URI — 브라우저 오리진(sellery.life) 기준. `event.url.origin` 은 리라이트 뒤의 Vercel 호스트일 수 있어 쓰지 않는다 */
export const META_REDIRECT_URI = `${SITE_URL}${adminPath(META_CALLBACK_PATH)}`;

configureMetaConnect({
	appId: env.META_APP_ID,
	appSecret: env.META_APP_SECRET,
	redirectUri: META_REDIRECT_URI,
	// 버튼 이전 방식(환경변수 페이지 토큰) — 콘솔 연결이 없을 때의 대체. App Review 전엔 모의 데이터
	envPageToken: env.META_PAGE_ACCESS_TOKEN,
	envIgUserId: env.META_IG_USER_ID
});
configureOutreachCollect({
	modashApiKey: env.MODASH_API_KEY,
	modashKrLocationId: env.MODASH_KR_LOCATION_ID
});

export * from '@sellery/db/server/admin/outreach';
export * from '@sellery/db/server/admin/outreach-collect';
export * from '@sellery/db/server/admin/meta-connect';
