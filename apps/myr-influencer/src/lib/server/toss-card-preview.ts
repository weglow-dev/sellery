/**
 * 내 정보 "토스 본인인증" 카드 — 상태(서버 0121 myr_toss_card_state 가 정한 값 · 미리보기는 주소로 고른 값) → 칩 · 문구(순수 · 서버 전용 · env 없음 → vitest).
 * 상태 판정은 DB 가 한다 — 여기는 상태별 문구만. 토스 연동 뒤에도 이 문구표를 쓴다(미리보기 스위치 · [인증을 마쳤어요] 목만 지운다).
 */
import { SETTLE_TOSS_AFTER_REVIEW, type SettleInfo } from '@sellery/myr-core/settle-info';
import type { TossCard, TossCardState } from '$lib/toss-card';

/** 토스 지급대행 PARTIALLY_APPROVED(본인인증 끝 · 법인 등록 직후) 한도 — 토스 문서 "주간 1천만원 미만"(기간 정의는 토스 문서에 없다) */
export const PARTIAL_LIMIT = '한 주에 1,000만 원 미만';

const DEMO_PHONE = '01012345678';

/** 미리보기 카드 — 상태별 칩 · 문구(화면은 그대로 그린다) */
export function tossCardOf(state: TossCardState, info: SettleInfo | null, notYet = false): TossCard {
	// review — 승인 때 토스에 반영할 할 일이 있으면(서버 tossAfterReview · 0124) 카드에 한 줄
	const base = { phone: null, tail: '', note: null, fixField: null, canCheck: false, phoneHelp: false, notYet: false, review: info?.tossAfterReview ? SETTLE_TOSS_AFTER_REVIEW : null, canRegister: false, needConsent: false } as const;
	const fixAccount = info?.tossFix !== 'bizNo';
	switch (state) {
		case 'none':
			// 2026-11-20: 사업자번호는 있는데 토스 셀러가 없음(서버 toss_ask register — 첫 등록이 우리 쪽 거절 · 결과 불명이었는데 실패 · 0124 전에 저장) — 크론이 없으니 [다시 등록하기]
			// 마지막 등록의 토스 응답을 기다리는 중(서버 toss_ask waiting · 등록 시도 뒤 5분) — 결과 불명이 실제로 성공했으면 웹훅이 곧 셀러를 적는다. 그동안 다시 등록하지 않는다
			if (info?.tossAsk === 'waiting')
				return { ...base, state, chip: { label: '등록 중', tone: 'muted' }, lead: '토스페이먼츠 응답을 기다리고 있어요.', note: '보통 몇 분 안에 결과가 와요. 잠시 뒤 새로고침해 주세요. 5분이 지나도 그대로면 다시 등록할 수 있어요.' };
			if (info?.tossAsk === 'register')
				return info.tossAgreed
					? { ...base, state, chip: { label: '등록 전', tone: 'accent' }, lead: '토스페이먼츠 등록이 끝나지 않았어요.', note: '아래 버튼을 누르면 다시 등록하고, 대표자 휴대폰으로 본인인증 안내가 가요.', canRegister: true }
					: { ...base, state, chip: { label: '등록 전', tone: 'accent' }, lead: '토스페이먼츠 등록이 끝나지 않았어요.', note: '[수정하기]에서 토스페이먼츠 정보 제공에 동의하고 저장하면 등록돼요.', needConsent: true };
			return info?.hasBizNo
				? { ...base, state, chip: { label: '등록 전', tone: 'muted' }, lead: '토스페이먼츠 등록을 기다리고 있어요.', note: '등록되면 대표자 휴대폰으로 본인인증 문자가 가요. 인증을 마쳐야 정산금을 받을 수 있어요.' }
				: { ...base, state, chip: { label: '시작 전', tone: 'muted' }, lead: '사업자 · 정산 정보를 넣으면 토스페이먼츠가 대표자 휴대폰으로 본인인증 문자를 보내요.', note: '인증을 마쳐야 정산금을 받을 수 있어요.' };
		case 'rejected':
			return {
				...base,
				state,
				chip: { label: '정보 확인 필요', tone: 'danger' },
				lead: fixAccount ? '토스페이먼츠가 정산 계좌를 확인하지 못했어요.' : '토스페이먼츠가 사업자등록번호를 확인하지 못했어요.',
				note: fixAccount ? '계좌번호와 예금주를 확인해 고쳐 저장하면 다시 등록해요.' : '사업자등록증의 번호와 같은지 확인해 고쳐 저장하면 다시 등록해요.',
				fixField: fixAccount ? 'account' : 'bizNo'
			};
		case 'wait':
			return { ...base, state, chip: { label: '인증 전', tone: 'accent' }, lead: '', phone: info?.ceoPhone || DEMO_PHONE, tail: '로 온 토스페이먼츠 문자에서 대표자 본인 명의로 인증해 주세요.', note: '인증한 뒤 아래 버튼을 누르면 확인돼요. 인증을 마쳐야 정산금을 받을 수 있어요.', canCheck: true, phoneHelp: true, notYet };
		case 'partial':
			return { ...base, state, chip: { label: '인증 완료', tone: 'ok' }, lead: `${PARTIAL_LIMIT}까지 정산금을 받을 수 있어요.`, note: '그 이상이면 토스페이먼츠가 이메일로 추가 인증을 안내해요.' };
		case 'kyc':
			return { ...base, state, chip: { label: '추가 인증 필요', tone: 'danger' }, lead: '한 주에 1,000만 원 이상 받게 되어 추가 인증이 필요해요.', note: '토스페이먼츠가 보낸 이메일에서 인증을 마칠 때까지 정산금 지급이 멈춰요.', canCheck: true, notYet };
		case 'approved':
			return { ...base, state, chip: { label: '인증 완료', tone: 'ok' }, lead: '금액 제한 없이 정산금을 받을 수 있어요.', note: '토스페이먼츠가 1~3년마다 다시 확인을 요청할 수 있어요. 그때 이메일로 안내해요.' };
		case 'corporate':
			return { ...base, state, chip: { label: '필요 없음 · 법인', tone: 'ok' }, lead: `법인은 본인인증 없이 등록돼요. ${PARTIAL_LIMIT}까지 정산금을 받을 수 있어요.`, note: '그 이상이면 토스페이먼츠가 이메일로 추가 인증을 안내해요.' };
	}
}

/** 미리보기 [인증을 마쳤어요] — 첫 확인은 "아직", 두 번째부터 다음 상태(인증 전 → 인증 완료 · 추가 인증 → 한도 없음) */
export function previewTossCardCheck(state: TossCardState, attempt: number, info: SettleInfo | null): TossCard {
	if (attempt < 2) return tossCardOf(state, info, true);
	return tossCardOf(state === 'kyc' ? 'approved' : 'partial', info);
}
