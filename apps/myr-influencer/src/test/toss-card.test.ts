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
		// 2026-11-20 — 토스 셀러가 없음(서버 toss_ask register): 동의했으면 [다시 등록하기] · 동의가 없으면 [수정하기](동의하고 저장) · 다른 상태에는 둘 다 없음
		const reg = (agreed: boolean) => tossCardOf('none', settleInfoFromJson({ has_biz_no: true, toss_ask: 'register', toss_agreed: agreed }));
		expect([reg(true).canRegister, reg(true).needConsent, reg(true).lead]).toEqual([true, false, '토스페이먼츠 등록이 끝나지 않았어요.']);
		expect([reg(false).canRegister, reg(false).needConsent]).toEqual([false, true]);
		// 토스 응답 대기(서버 toss_ask waiting · 마지막 등록 뒤 5분) — 버튼 없이 안내만
		const waiting = tossCardOf('none', settleInfoFromJson({ has_biz_no: true, toss_ask: 'waiting', toss_agreed: true }));
		expect([waiting.canRegister, waiting.needConsent, waiting.chip.label, waiting.lead]).toEqual([false, false, '등록 중', '토스페이먼츠 응답을 기다리고 있어요.']);
		expect(TOSS_CARD_STATES.filter((s) => c[s].canRegister || c[s].needConsent)).toEqual([]);
		// 0124 — 승인 때 토스에 반영할 변경이 있으면 한 줄(서버 toss_after_review) · 없으면 없음
		expect([tossCardOf('partial', settleInfoFromJson({ toss_after_review: true })).review, tossCardOf('partial', settleInfoFromJson({})).review, tossCardOf('partial', null).review]).toEqual(['변경한 정보는 운영팀 확인 뒤 토스페이먼츠에 반영돼요.', null, null]);
	});
	it('[인증을 마쳤어요] 미리보기 — 첫 확인은 "아직", 두 번째부터 다음 상태', () => {
		expect(previewTossCardCheck('wait', 1, info)).toMatchObject({ state: 'wait', notYet: true });
		expect(previewTossCardCheck('wait', 2, info).state).toBe('partial');
		expect(previewTossCardCheck('kyc', 2, info).state).toBe('approved');
	});
});
