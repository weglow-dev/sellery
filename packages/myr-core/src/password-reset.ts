/**
 * 크리에이터 비밀번호 재설정(순수) — 재설정 링크 · 레이트리밋 상한. DB·환경 없음 · src/test/password-reset.test.ts.
 * 메일은 Supabase 기본 메일(프로젝트당 템플릿 1벌 = 셀러리 문구)이 아니라 MYR 서버가 보낸다(2026-11-05) — server/password-reset.
 * 링크는 콘솔 `/auth/confirm?token_hash=…&type=recovery&next=/password/new` — 초대 · 셀러리 메일과 같은 token_hash 방식(다른 기기에서 열어도 된다).
 */

/** 같은 이메일 · 같은 IP 로 보낼 수 있는 횟수(함수 인스턴스 메모리 — 느슨한 상한) */
export const RESET_PER_EMAIL = { max: 3, windowMs: 10 * 60 * 1000 } as const;
export const RESET_PER_IP = { max: 10, windowMs: 30 * 60 * 1000 } as const;

/** Supabase generateLink 의 hashed_token(16진) — 형식이 아니면 링크를 만들지 않는다 */
export const isTokenHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{20,128}$/.test(v);

/** 콘솔 주소 + `/auth/confirm?token_hash=…&type=recovery&next=/password/new` */
export function recoveryLink(consoleUrl: string, tokenHash: string): string {
	const q = new URLSearchParams({ token_hash: tokenHash, type: 'recovery', next: '/password/new' });
	return `${consoleUrl.replace(/\/+$/, '')}/auth/confirm?${q}`;
}
