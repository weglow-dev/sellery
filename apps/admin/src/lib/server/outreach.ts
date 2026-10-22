/**
 * 관리자 콘솔 "아웃리치" 배럴 — `@sellery/db/server/admin/{outreach,outreach-collect}`(크리에이터 후보 큐 · 0055 · 제공사 수집).
 * `./money` · `./partners` 와 나란히 두는 별도 배럴. 게이트는 각 page · action 의 `requireAdmin()`.
 * 비밀 주입(전부 선택 · Vercel `sellery-admin`): `META_PAGE_ACCESS_TOKEN` + `META_IG_USER_ID`(메타 공식 크리에이터 마켓플레이스 — 우선) · `MODASH_API_KEY` · `MODASH_KR_LOCATION_ID`. 아무것도 없으면 "조건으로 수집" 버튼이 안내만.
 */
import './env';
import { env } from '$env/dynamic/private';
import { configureOutreachCollect } from '@sellery/db/server/admin/outreach-collect';

configureOutreachCollect({
	// 메타 공식(무료) — 브랜드 IG 비즈니스 계정(@sellery.official)에 연결된 페이지의 Page access token · IG 사용자 id. App Review 전엔 모의 데이터
	metaPageToken: env.META_PAGE_ACCESS_TOKEN,
	metaIgUserId: env.META_IG_USER_ID,
	modashApiKey: env.MODASH_API_KEY,
	modashKrLocationId: env.MODASH_KR_LOCATION_ID
});

export * from '@sellery/db/server/admin/outreach';
export * from '@sellery/db/server/admin/outreach-collect';
