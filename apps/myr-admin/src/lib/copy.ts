import { app } from './state.svelte';

/** 을/를 — 마지막 글자에 받침이 없으면 를(링크 코드 · 승인번호 · 공구 링크), 있으면 을(송장) */
const objParticle = (w: string) => {
	const c = w.charCodeAt(w.length - 1) - 0xac00;
	return c >= 0 && c <= 11171 && c % 28 === 0 ? '를' : '을';
};

/** 클립보드 복사 + 토스트 — 시안 "복사" 버튼(링크 코드 · 승인번호 · 송장) */
export async function copyText(text: string, what = '값') {
	try {
		await navigator.clipboard?.writeText(text);
	} catch {
		/* 클립보드를 못 쓰는 환경 — 토스트만 */
	}
	app.showToast(`${what}${objParticle(what)} 복사했어요`);
}
