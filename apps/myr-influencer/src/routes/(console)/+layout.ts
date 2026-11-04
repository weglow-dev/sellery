/** 콘솔 화면 — 목 상태(lib/state.svelte.ts)가 브라우저 메모리에만 있으므로 SSR 을 끈다.
 *  서버 렌더에서는 이 모듈이 요청 사이에 공유돼 목 상태가 섞이고, 사진 미리보기(URL.createObjectURL)도 브라우저 전용이다.
 *  로그인 게이트는 SSR 과 무관하게 서버에서 돈다(hooks · +layout.server.ts). 화면이 서버 데이터로 바뀌면(docs/myr.md §4.2.1 3번~) 이 줄을 지운다.
 *  로그인 · 비밀번호 화면은 이 그룹 밖이라 서버에서 그린다(JS 없이도 동작). */
export const ssr = false;
