import type { PageServerLoad } from './$types';
import { absoluteUrl } from '$lib/server/db';

/**
 * /about — 셀러리 소개. DB 를 읽지 않는 정적 문구 페이지(프로토타입 vCustAbout).
 * canonical 만 서버에서 만든다(PUBLIC_SITE_URL 은 $lib/server/env 에서만 읽는다 — 결정 11). 레이아웃 persona(세션) 때문에 /terms 와 같이 prerender 하지 않는다.
 */
export const load: PageServerLoad = () => ({ canonical: absoluteUrl('/about') });
