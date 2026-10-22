/**
 * 관리자 콘솔 "아웃리치" 배럴 — `@sellery/db/server/admin/{outreach,outreach-collect}`(크리에이터 후보 큐 · 0055 · 제공사 수집).
 * `./money` · `./partners` 와 나란히 두는 별도 배럴. 게이트는 각 page · action 의 `requireAdmin()`.
 * 비밀 주입: `MODASH_API_KEY`(선택 — 없으면 "조건으로 수집" 버튼이 안내만) · `MODASH_KR_LOCATION_ID`(선택 — 자동 조회 실패 시) — Vercel `sellery-admin`.
 */
import './env';
import { env } from '$env/dynamic/private';
import { configureOutreachCollect } from '@sellery/db/server/admin/outreach-collect';

configureOutreachCollect({ modashApiKey: env.MODASH_API_KEY, modashKrLocationId: env.MODASH_KR_LOCATION_ID });

export * from '@sellery/db/server/admin/outreach';
export * from '@sellery/db/server/admin/outreach-collect';
