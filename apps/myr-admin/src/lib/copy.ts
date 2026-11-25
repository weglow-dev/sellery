import { app } from './state.svelte';

/** 클립보드 복사 + 토스트 — 시안 "복사" 버튼(링크 코드 · 승인번호 · 송장) */
export async function copyText(text: string, what = '값') {
	try {
		await navigator.clipboard?.writeText(text);
	} catch {
		/* 클립보드를 못 쓰는 환경 — 토스트만 */
	}
	app.showToast(`${what}을 복사했어요`);
}
