// 크리에이터 초대 규칙 — 토큰 형식 · 링크 · 핸들 확인 결과 · 운영 발급 입력 · 문구 (0070 · docs/myr.md §4.2.1 10번)
import { describe, expect, it } from 'vitest';
import { INVITE_CLOSED, handleStatusOf, inviteLink, isInviteClosed, isInviteListState, isInviteToken, issueMessage, parseIssueInput } from '../invite-rules';
import { rateLimit } from '../rate-limit';

const TOKEN = 'a1'.repeat(32);

describe('토큰 · 링크', () => {
	it('64자리 소문자 hex 만 토큰', () => {
		expect(isInviteToken(TOKEN)).toBe(true);
		for (const bad of ['', 'demo', TOKEN.toUpperCase(), TOKEN.slice(1), `${TOKEN}0`, 'g'.repeat(64), null, 123]) expect(isInviteToken(bad), String(bad)).toBe(false);
	});
	it('링크 = 콘솔 주소 + /invite/<토큰> · 끝 슬래시 정리', () => {
		expect(inviteLink('https://myr-influencer.vercel.app/', TOKEN)).toBe(`https://myr-influencer.vercel.app/invite/${TOKEN}`);
		expect(inviteLink('http://localhost:5179', TOKEN)).toBe(`http://localhost:5179/invite/${TOKEN}`);
	});
	it('닫힌 링크 코드', () => {
		expect(INVITE_CLOSED).toEqual(['NOT_FOUND', 'EXPIRED', 'USED', 'REVOKED']);
		expect(isInviteClosed('USED')).toBe(true);
		expect(isInviteClosed('DB_ERROR')).toBe(false);
	});
});

describe('handleStatusOf — 0070 handle_check 응답', () => {
	it('available · 이유별 상태 · 모르는 값은 null', () => {
		expect(handleStatusOf({ available: true })).toBe('available');
		expect(handleStatusOf({ available: false, code: 'TAKEN' })).toBe('taken');
		expect(handleStatusOf({ available: false, code: 'RESERVED' })).toBe('reserved');
		expect(handleStatusOf({ available: false, code: 'BAD_HANDLE' })).toBe('bad');
		expect(handleStatusOf({ available: false, code: 'X' })).toBeNull();
		expect(handleStatusOf(null)).toBeNull();
	});
});

describe('운영 발급 입력 · 문구', () => {
	it('이메일 소문자 정리 · 보낸 사람 메모 40자', () => {
		expect(parseIssueInput({ email: ' Creator@MYR.kr ', by: '  소윤 ' })).toEqual({ ok: true, email: 'creator@myr.kr', by: '소윤' });
		expect(parseIssueInput({ email: 'a@b.co', by: 'x'.repeat(60) })).toMatchObject({ ok: true, by: 'x'.repeat(40) });
		expect(parseIssueInput({ email: 'a@b.co' })).toEqual({ ok: true, email: 'a@b.co', by: null });
	});
	it('이메일이 아니면 거절', () => {
		for (const b of [null, {}, { email: 'nope' }, { email: 'a@b.c' }, { email: 42 }]) expect(parseIssueInput(b).ok, JSON.stringify(b)).toBe(false);
	});
	it('코드별 문구 · 모르는 코드는 DB_ERROR 문구', () => {
		expect(issueMessage('ALREADY_CREATOR')).toContain('myr-creators.mjs account');
		expect(issueMessage('EMAIL_HAS_ACCOUNT')).toContain('로그인 계정');
		expect(issueMessage('???')).toBe(issueMessage('DB_ERROR'));
	});
	it('목록 상태 값', () => {
		for (const s of ['pending', 'used', 'expired', 'revoked', 'requested']) expect(isInviteListState(s)).toBe(true);
		expect(isInviteListState('all')).toBe(false);
	});
});

describe('rateLimit — 창 안 max 건까지', () => {
	it('max 건 통과 · 그 다음 거절 · 창이 지나면 다시', () => {
		const key = `t-${Math.random()}`;
		const t0 = 1_000_000;
		for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 1000, t0 + i)).toBe(true);
		expect(rateLimit(key, 3, 1000, t0 + 10)).toBe(false);
		expect(rateLimit(key, 3, 1000, t0 + 1500)).toBe(true);
	});
});
