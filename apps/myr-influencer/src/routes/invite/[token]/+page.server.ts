import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

/**
 * 초대 가입 `/invite/<토큰>` — **UI 단계(목)**. 시안 "MYR Influencer Signup"(모바일) · "… PC" 의 네 화면(초대장 · 가입 폼 · 환영 · 만료).
 * 아직 초대 토큰 · 가입 저장이 없다(docs/myr.md §4.2.1 10번 · 다음 단계에서 `myr_invites` 표 + 가입 함수로 바꾼다):
 *   - `demo` 토큰은 로컬 dev 와 Vercel Preview 에서만 열린다(예시 초대: minji@myr.kr · 7일 남음). 운영(Production)에서는 열리지 않는다.
 *   - `expired` 토큰과 그 밖의 모든 토큰은 만료 화면.
 *   - 가입 폼 제출은 브라우저에서 환영 화면으로만 넘어간다(저장하지 않는다).
 */
const DEMO_TAKEN = ['minji', 'soy.clean', 'myr', 'admin', 'myr.official'];

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const demoAllowed = dev || env.VERCEL_ENV === 'preview';
	if (params.token === 'demo' && demoAllowed) {
		return {
			state: 'valid' as const,
			demo: true,
			email: 'minji@myr.kr',
			expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
			prefill: { name: '', handle: '' },
			takenHandles: DEMO_TAKEN
		};
	}
	return { state: 'expired' as const, demo: demoAllowed && params.token === 'expired' };
};

export const actions: Actions = {
	/** 만료 화면의 "새 초대 요청하기" — 요청을 받을 곳(초대 기록 · 운영 알림)이 아직 없다. 미리보기에서는 성공으로 보이고, 운영에서는 직접 연락을 안내한다 */
	request: async () => {
		const demoAllowed = dev || env.VERCEL_ENV === 'preview';
		return demoAllowed ? { requested: true as const } : { requested: false as const };
	}
};
