/**
 * 사이트 컴포넌트가 브라우저에서 필요로 하는 공개값 — 앱 레이아웃이 `$env/static/public` 값을 `setSiteEnv()` 로 Svelte 컨텍스트에 넣는다.
 * 컴포넌트는 `$env` 를 import 할 수 없으므로(패키지) 컨텍스트로 받는다 — props-only 원칙의 예외가 아니라 "앱이 넘긴 데이터" 다.
 *   · VerifyLauncher(홈 카드 "인증 확인"): anon `rpc('campaign_card')` — supabaseUrl · supabaseAnonKey
 * 값이 비어 있으면(키 없는 로컬 · CI) 인증 확인은 "인증 정보를 불러오지 못했어요" 토스트로 끝난다.
 */
import { getContext, setContext } from 'svelte';

export type SiteEnv = { supabaseUrl: string; supabaseAnonKey: string };

const KEY = 'sellery:site-env';

export function setSiteEnv(env: SiteEnv): void {
	setContext<SiteEnv>(KEY, env);
}

/** 컴포넌트 init 에서만 호출 (getContext 규칙). 레이아웃이 안 넣었으면 빈 값. */
export function getSiteEnv(): SiteEnv {
	return getContext<SiteEnv | undefined>(KEY) ?? { supabaseUrl: '', supabaseAnonKey: '' };
}
