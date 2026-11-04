// 초대 가입 미리보기 주소 — lib/invite-preview.ts
import { describe, expect, it } from 'vitest';
import { INVITE_DAYS } from '@sellery/myr-core/invite-rules';
import { PREVIEW_EMAIL, isPreviewToken, previewInvite } from '../lib/invite-preview';

describe('미리보기 주소', () => {
	it('세 주소만 · 진짜 토큰 형식(64 hex)과 겹치지 않는다', () => {
		for (const t of ['preview', 'preview-used', 'preview-expired']) expect(isPreviewToken(t), t).toBe(true);
		for (const t of ['demo', 'preview-x', 'a1'.repeat(32), '']) expect(isPreviewToken(t), t).toBe(false);
	});
	it('preview = 유효한 초대(예시 이메일 · 기본 기간) · used/expired = 닫힌 링크 이유', () => {
		const now = new Date('2026-11-04T00:00:00Z');
		expect(previewInvite('preview', now)).toEqual({ state: 'valid', email: PREVIEW_EMAIL, expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString() });
		expect(previewInvite('preview-used', now)).toEqual({ state: 'expired', reason: 'USED' });
		expect(previewInvite('preview-expired', now)).toEqual({ state: 'expired', reason: 'EXPIRED' });
	});
});
