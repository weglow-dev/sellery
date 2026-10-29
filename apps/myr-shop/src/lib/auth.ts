/** 표시명 · next 검증 — `packages/db/src/auth.ts` 의 순수부 복사(MYR 은 셀러리 패키지를 import 하지 않는다 · docs/myr.md 결정 11).
 *  브라우저·서버 어디서나 import 가능 — Supabase 클라이언트를 만들지 않는다. */
import type { User } from '@supabase/supabase-js';

/** user_metadata.nickname ?? name ?? full_name ?? preferred_username ?? "고객" (카카오는 nickname) */
export function displayName(user: User): string {
	const m = (user.user_metadata ?? {}) as Record<string, unknown>;
	for (const key of ['nickname', 'name', 'full_name', 'preferred_username']) {
		const v = m[key];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return '고객';
}

/** 카카오 프로필 사진 — user_metadata.avatar_url ?? picture */
export function avatarOf(user: User): string | null {
	const m = (user.user_metadata ?? {}) as Record<string, unknown>;
	return typeof m.avatar_url === 'string' ? m.avatar_url : typeof m.picture === 'string' ? m.picture : null;
}

/**
 * 같은 오리진의 경로만 통과시키는 next 검증 (오픈 리다이렉트 방지). 판정은 WHATWG URL 파서 기준 —
 * `/` 로 시작 · `//`·`/\` 금지 · C0 제어문자·DEL 금지 · 파싱 결과 origin 이 같아야 함 · `/auth/` `/login` 은 루프라 제외. 실패하면 "/".
 */
const SAFE_NEXT_RE = /^\/(?![/\\])/;
const SAFE_NEXT_BASE = 'http://myr.invalid';

function hasControlChar(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c < 0x20 || c === 0x7f) return true;
	}
	return false;
}

export function safeNext(next: string | null | undefined): string {
	if (typeof next !== 'string' || !next) return '/';
	if (!SAFE_NEXT_RE.test(next) || hasControlChar(next)) return '/';
	let parsed: URL;
	try {
		parsed = new URL(next, SAFE_NEXT_BASE);
	} catch {
		return '/';
	}
	if (parsed.origin !== SAFE_NEXT_BASE) return '/';
	const out = `${parsed.pathname}${parsed.search}${parsed.hash}`;
	if (!out.startsWith('/') || out.startsWith('//')) return '/';
	if (out.startsWith('/auth/') || out.startsWith('/login')) return '/';
	return out;
}
