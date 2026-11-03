/** UI 단계 — 상태가 브라우저 메모리(lib/state.svelte.ts)에만 있으므로 SSR 을 끈다.
 *  서버 렌더에서는 이 모듈이 요청 사이에 공유돼 목 상태가 섞이고, 사진 미리보기(URL.createObjectURL)도 브라우저 전용이다.
 *  인증(Supabase SSR hooks)·서버 load 를 붙일 때 이 줄을 지운다 (docs/myr.md §7 M2). */
export const ssr = false;
