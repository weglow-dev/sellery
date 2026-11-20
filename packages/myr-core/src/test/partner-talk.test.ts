import { describe, expect, it } from 'vitest';
import { PARTNER_BODY_MAX, PARTNER_TALK_HREF, partnerBodyOk, partnerFailMessage, partnerMessagesFromJson } from '../partner-talk';

describe('파트너팀 톡(0125)', () => {
	it('본문 입력 형식 — 앞뒤 공백 뺀 1~2000자(서버 myr_partner_body_ok 와 같은 형식)', () => {
		expect([partnerBodyOk('안녕'), partnerBodyOk('   '), partnerBodyOk(''), partnerBodyOk('가'.repeat(PARTNER_BODY_MAX)), partnerBodyOk('가'.repeat(PARTNER_BODY_MAX + 1))]).toEqual([true, false, false, true, false]);
		expect(PARTNER_TALK_HREF).toBe('/messages');
	});
	it('응답 읽기 — 모양이 다른 줄은 건너뛴다', () => {
		const rows = partnerMessagesFromJson([
			{ id: 'a', sender: 'seller', body: '안녕', created_at: '2026-11-20T07:00:00Z' },
			{ id: 'b', sender: 'admin', body: '네', created_at: '2026-11-20T07:01:00Z' },
			{ id: 'c', sender: 'robot', body: 'x', created_at: '2026-11-20T07:02:00Z' },
			{ bad: 1 }
		]);
		expect(rows).toEqual([
			{ id: 'a', sender: 'seller', body: '안녕', createdAt: '2026-11-20T07:00:00Z' },
			{ id: 'b', sender: 'admin', body: '네', createdAt: '2026-11-20T07:01:00Z' }
		]);
		expect(partnerMessagesFromJson(null)).toEqual([]);
	});
	it('보내기 실패 문구 — 서버 거부 코드 그대로', () => {
		expect(partnerFailMessage('BAD_BODY')).toBe('메시지는 1~2,000자로 써 주세요');
		expect(partnerFailMessage('TOO_FAST')).toContain('너무 빠르게');
		expect(partnerFailMessage(undefined)).toContain('보내지 못했어요');
	});
});
