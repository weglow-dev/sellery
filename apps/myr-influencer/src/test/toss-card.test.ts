// 내 정보 "토스 본인인증" 카드 — 상태 이름(lib/toss-card.ts) · 미리보기 목(lib/server/toss-card-preview.ts · 토스 연동 전)
import { describe, expect, it } from 'vitest';
import { TOSS_CARD_STATES, isTossCardState } from '../lib/toss-card';
import { PARTIAL_LIMIT, tossCardOf, previewTossCardCheck } from '../lib/server/toss-card-preview';
import { settleInfoFromJson } from '@sellery/myr-core/settle-info';

const info = settleInfoFromJson({ ceo_phone: '01055556666', tax_email: 'creator@myr.test' });

describe('토스 카드 상태', () => {
	it('상태 이름 — 일곱 가지(서버 myr_toss_card_state 와 같은 이름) · 모르는 값은 거른다', () => {
		expect(TOSS_CARD_STATES).toEqual(['none', 'rejected', 'wait', 'partial', 'kyc', 'approved', 'corporate']);
		expect([isTossCardState('wait'), isTossCardState('weird'), isTossCardState(null)]).toEqual([true, false, false]);
	});
	it('상태마다 칩 · 할 수 있는 일', () => {
		const c = Object.fromEntries(TOSS_CARD_STATES.map((s) => [s, tossCardOf(s, info)]));
		expect(TOSS_CARD_STATES.map((s) => c[s].chip.tone)).toEqual(['muted', 'danger', 'accent', 'ok', 'danger', 'ok', 'ok']);
		// 시안 문장 — 인증 전은 굵은 번호(대표자 휴대폰) + 뒷문장 · 결과 확인 버튼 / 추가 인증은 이메일 안내 · 결과 확인 버튼 / 정보 확인 필요는 고칠 칸
		expect([c.wait.lead, c.wait.tail]).toEqual(['', '로 온 토스페이먼츠 문자에서 대표자 본인 명의로 인증해 주세요.']);
		expect([c.wait.phone, c.wait.canCheck]).toEqual(['01055556666', true]);
		expect([c.kyc.note?.includes('이메일'), c.kyc.canCheck]).toEqual([true, true]);
		expect(c.rejected.fixField).toBe('account');
		expect([c.partial.lead.startsWith(PARTIAL_LIMIT), c.corporate.lead.includes(PARTIAL_LIMIT), c.approved.lead]).toEqual([true, true, '금액 제한 없이 정산금을 받을 수 있어요.']);
		expect(TOSS_CARD_STATES.filter((s) => c[s].canCheck)).toEqual(['wait', 'kyc']);
		expect(TOSS_CARD_STATES.filter((s) => c[s].phoneHelp)).toEqual(['wait']);
		// 등록 전 — 정보를 넣었으면 "등록 전" · 안 넣었으면 "시작 전" / 거절 — 서버가 준 칸(toss_fix)으로
		expect([tossCardOf('none', settleInfoFromJson({ has_biz_no: true })).chip.label, tossCardOf('none', null).chip.label]).toEqual(['등록 전', '시작 전']);
		expect(tossCardOf('rejected', settleInfoFromJson({ toss_fix: 'bizNo' })).fixField).toBe('bizNo');
	});
	it('[인증을 마쳤어요] 미리보기 — 첫 확인은 "아직", 두 번째부터 다음 상태', () => {
		expect(previewTossCardCheck('wait', 1, info)).toMatchObject({ state: 'wait', notYet: true });
		expect(previewTossCardCheck('wait', 2, info).state).toBe('partial');
		expect(previewTossCardCheck('kyc', 2, info).state).toBe('approved');
	});
});
