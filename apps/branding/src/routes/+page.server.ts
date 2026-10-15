import { applyActions } from '$lib/server/apply-action';

/** 폼 액션이 있는 페이지는 프리렌더할 수 없다 — 홈도 Vercel 서버리스 함수로 처리된다. */
export const prerender = false;
export const actions = applyActions;
