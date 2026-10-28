import type { Step } from '$lib/components/funnel/shared';

/** 퍼널 단계를 브라우저 히스토리 항목에 싣는다(SvelteKit shallow routing — Funnel.svelte setStep → pushState · popstate → page.state.step).
 *  URL 은 그대로 두고 항목만 쌓여서, 뒤로가기가 사이트 이탈이 아니라 "이전 질문"이 된다. */
declare global {
	namespace App {
		interface PageState {
			step?: Step;
		}
	}
}

export {};
