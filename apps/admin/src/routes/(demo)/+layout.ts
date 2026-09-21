import { S } from '@sellery/core';

/**
 * `(demo)` 그룹 — localStorage 데모(@sellery/core 의 모듈 수준 $state 싱글턴)는 SSR 하지 않는다 (docs/monorepo-migration.md 결정 4 · C).
 * `@sellery/core` 데모 상태 import 는 이 그룹 안에서만 — 실서비스 관리자 화면(`(admin)` 그룹, 다음 PR)은 `@sellery/db` 를 쓴다.
 * 역할 지정은 렌더 밖(load)에서 — 컴포넌트 init 안에서 상태를 바꾸면 state_unsafe_mutation.
 */
export const ssr = false;
export const prerender = false;
export function load() {
	S.role = 'admin';
}
