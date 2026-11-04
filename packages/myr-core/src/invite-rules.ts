/**
 * 크리에이터 초대 규칙(순수) — 토큰 형식 · 초대 링크 · 응답 코드 · 운영 문구(docs/myr.md 결정 14 · §4.2.1 10번 · 0070).
 * 콘솔(apps/myr-influencer)의 초대 화면 · 운영 API 와 이후 운영 콘솔(myr-admin)이 같이 쓴다. DB·환경 없음 — src/test/invite-rules.test.ts.
 * 핸들 형식 · 예약어의 정답은 0070 SQL(`myr_handle_problem`) 이다 — 여기는 코드만 다룬다.
 */

/** 초대 링크 유효기간(일) — 0070 `myr_app_admin_invite_create` 의 기본값과 같다(2026-11-04 대표 결정 30일) */
export const INVITE_DAYS = 30;

/** 토큰 = 64자리 소문자 hex(0070 `gen_random_bytes(32)`). 형식이 아니면 DB 를 부르지 않는다 */
export const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/;
export const isInviteToken = (v: unknown): v is string => typeof v === 'string' && INVITE_TOKEN_RE.test(v);

/** 초대 링크 — 콘솔 주소 + `/invite/<토큰>` (끝 슬래시 정리) */
export const inviteLink = (consoleUrl: string, token: string): string => `${consoleUrl.replace(/\/+$/, '')}/invite/${token}`;

/** 링크가 열리지 않는 이유(0070 `myr_invite_state`) */
export type InviteClosedCode = 'NOT_FOUND' | 'EXPIRED' | 'USED' | 'REVOKED';
export const INVITE_CLOSED: readonly InviteClosedCode[] = ['NOT_FOUND', 'EXPIRED', 'USED', 'REVOKED'];
export const isInviteClosed = (code: unknown): code is InviteClosedCode => INVITE_CLOSED.includes(code as InviteClosedCode);

/** 핸들 확인 결과(0070 `myr_app_invite_handle_check`) — available 이 아니면 이유 */
export type HandleProblem = 'BAD_HANDLE' | 'RESERVED' | 'TAKEN';
export type HandleStatus = 'available' | 'taken' | 'reserved' | 'bad';
export function handleStatusOf(r: { available?: unknown; code?: unknown } | null | undefined): HandleStatus | null {
	if (!r) return null;
	if (r.available === true) return 'available';
	if (r.code === 'TAKEN') return 'taken';
	if (r.code === 'RESERVED') return 'reserved';
	if (r.code === 'BAD_HANDLE') return 'bad';
	return null;
}

/** 가입 실패 코드(0070 `myr_app_invite_accept` + 서버가 계정을 만들 때) */
export type AcceptCode =
	| InviteClosedCode
	| 'EMAIL_MISMATCH'
	| 'ALREADY_LINKED'
	| 'ALREADY_CREATOR'
	| 'INVALID_INPUT'
	| 'RESERVED_HANDLE'
	| 'HANDLE_TAKEN'
	| 'EMAIL_HAS_ACCOUNT'
	| 'WEAK_PASSWORD'
	| 'DB_ERROR';

/** 발급 실패 코드(0070 `myr_app_admin_invite_create`) → 운영자에게 보여줄 문구 */
export type IssueCode = 'BAD_EMAIL' | 'ALREADY_CREATOR' | 'EMAIL_HAS_ACCOUNT' | 'NO_SERVICE_KEY' | 'DB_ERROR';
const ISSUE_MESSAGE: Record<IssueCode, string> = {
	BAD_EMAIL: '이메일 형식이 아니에요',
	ALREADY_CREATOR: '이미 크리에이터로 등록된 이메일이에요 — 초대 대신 myr-creators.mjs account 로 계정을 연결하세요',
	EMAIL_HAS_ACCOUNT: '이 이메일로 만든 로그인 계정이 이미 있어요(샵 고객 등) — 다른 이메일로 초대하거나 myr-creators.mjs account 로 연결하세요',
	NO_SERVICE_KEY: '콘솔 서버에 SUPABASE_SERVICE_ROLE_KEY 가 없어요',
	DB_ERROR: '초대를 만들지 못했어요 — 잠시 후 다시 시도해주세요'
};
export const issueMessage = (code: string): string => ISSUE_MESSAGE[code as IssueCode] ?? ISSUE_MESSAGE.DB_ERROR;

/** 운영 목록의 상태(0070 `myr_app_admin_invite_list` state) */
export const INVITE_STATES = ['pending', 'used', 'expired', 'revoked', 'requested'] as const;
export type InviteListState = (typeof INVITE_STATES)[number];
export const isInviteListState = (v: unknown): v is InviteListState => INVITE_STATES.includes(v as InviteListState);
export const INVITE_STATE_LABEL: Record<Exclude<InviteListState, 'requested'>, string> = { pending: '대기', used: '가입 완료', expired: '만료', revoked: '취소' };

/** 운영 API 발급 요청 본문 검증 — { email, by? } */
export function parseIssueInput(body: unknown): { ok: true; email: string; by: string | null } | { ok: false; message: string } {
	const b = (body ?? {}) as Record<string, unknown>;
	const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return { ok: false, message: ISSUE_MESSAGE.BAD_EMAIL };
	const by = typeof b.by === 'string' && b.by.trim() ? b.by.trim().slice(0, 40) : null;
	return { ok: true, email, by };
}
