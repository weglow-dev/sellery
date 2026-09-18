import { S } from '@sellery/core';
export const ssr = false;
export const prerender = false;
/* 역할 지정은 렌더 밖(load)에서 — 컴포넌트 init 안에서 상태를 바꾸면 state_unsafe_mutation */
export function load() { S.role = 'brand'; }
