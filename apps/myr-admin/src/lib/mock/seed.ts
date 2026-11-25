/** 목 데이터 — 10월분 정산(11월 1일 오후 1시 확정)이 자동 이체로 나가는 중인 11월 17일(화) 오전 10:20.
 *  지급 건 상태가 한 화면에 다 보이도록 고른 예시(docs/myr-admin-screens.md §11 표의 네 실패 종류 · 보류 이유 세 가지 · 보류 + 실패 겹침 · 송금 중 · 0원).
 *  금액 · 세금계산서 공급가액 · 세액은 서버가 보내는 값을 그대로 적었다(화면에서 나누지 않는다). */
import type { CreatorRaw, PayoutRaw, TaxRaw } from './types';

/** nextBizDay — 오늘 실행이 끝난 뒤의 다음 영업일(토스 바로지급은 영업일만 · 주말 · 공휴일은 건너뛴다) · expressOpen — 지금이 토스 바로지급 접수 시간(영업일 08:00~15:00)인지(false 로 바꾸면 [다시 보내기] 막힘을 볼 수 있다) */
export const NOW = { date: '11월 17일(화)', time: '오전 10:20', beforeRun: true, runLeft: '2시간 40분 뒤', nextBizDay: '11월 18일(수)', expressOpen: true };
export const ME = { name: '김지수', role: '운영' };

const A = ['#ff7a3d', '#a8dcc8', '#b8c4f5', '#f5c26b', '#e8a0bf', '#9ad0f5', '#c9b8f5', '#f59a7a'];

type C = Omit<CreatorRaw, 'initial' | 'avatarBg' | 'log' | 'resubmitNote' | 'redoWhy' | 'active' | 'phoneMasked'> & Partial<Pick<CreatorRaw, 'log' | 'resubmitNote' | 'redoWhy' | 'active'>>;
const biz = (firm: string, owner: string, email: string, no: string, bank: string, acct: string, submittedAt: string, holder = owner) => ({
	firm,
	owner,
	email,
	bizNo: no,
	bizNoMasked: `***-**-${no.slice(-5)}`,
	bank,
	account: acct,
	accountMasked: `${bank} ****${acct.replace(/\D/g, '').slice(-4)}`,
	holder,
	holderMasked: `${holder.slice(0, 1)}**`,
	submittedAt
});
const mk = (c: C, i: number): CreatorRaw => ({
	initial: c.name.slice(0, 1),
	avatarBg: A[i % A.length],
	phoneMasked: `010-****-${String(4100 + i * 137).slice(-4)}`,
	active: true,
	resubmitNote: null,
	redoWhy: null,
	// 사업자 정보 확인이 끝나면 서버가 토스 셀러로 등록한다 — 목은 본인인증까지 끝난 상태가 기본(하루만 본인인증 전)
	toss: c.settle === 'ok' ? 'PARTIALLY_APPROVED' : undefined,
	log: [],
	...c
});

export const seedCreators = (): CreatorRaw[] =>
	[
		{ id: 'c1', name: '민지', handle: '@minji.routine', joinedAt: '2026년 9월 2일', products: { live: 3, total: 4 }, settle: 'ok', biz: biz('민지루틴', '김민지', 'tax@minjiroutine.kr', '214-87-30215', '국민', '123456-04-305678', '9월 3일 오후 2:10') },
		{ id: 'c2', name: '하루', handle: '@haru.well', joinedAt: '2026년 9월 5일', products: { live: 2, total: 2 }, settle: 'ok', toss: 'APPROVAL_REQUIRED', biz: biz('하루웰', '이하루', 'haru@haruwell.kr', '105-22-48190', '신한', '110-482-901122', '9월 6일 오전 11:40') },
		{ id: 'c3', name: '준', handle: '@jun.fit', joinedAt: '2026년 9월 8일', products: { live: 1, total: 2 }, settle: 'ok', biz: biz('준피트', '박준', 'jun@junfit.co', '317-81-55021', '카카오뱅크', '3333-08-7712045', '9월 9일 오후 4:22') },
		{ id: 'c4', name: '소이', handle: '@soy.clean', joinedAt: '2026년 9월 11일', products: { live: 2, total: 3 }, settle: 'ok', biz: biz('소이클린', '정소이', 'soy@soyclean.kr', '220-19-77104', '우리', '1002-552-440198', '9월 12일 오전 9:05') },
		{ id: 'c5', name: '온유', handle: '@onyu.table', joinedAt: '2026년 9월 12일', products: { live: 2, total: 2 }, settle: 'ok', biz: biz('온유테이블', '최온유', 'onyu@onyutable.kr', '409-08-22917', '농협', '302-1145-8821-21', '9월 13일 오후 1:48') },
		{ id: 'c6', name: '리나', handle: '@rina.daily', joinedAt: '2026년 9월 15일', products: { live: 1, total: 1 }, settle: 'ok', biz: biz('리나데일리', '한리나', 'rina@rinadaily.kr', '128-30-90433', '하나', '620-219904-11307', '9월 16일 오전 10:30') },
		{
			id: 'c7',
			name: '서아',
			handle: '@seoa.mood',
			joinedAt: '2026년 9월 18일',
			products: { live: 2, total: 2 },
			settle: 'wait',
			biz: biz('서아무드', '윤서아', 'seoa@seoamood.kr', '506-17-30882', '국민', '942802-01-118834', '11월 16일 오후 7:30'),
			resubmitNote: '계좌 확인 필요로 이체가 실패한 뒤 정산 계좌를 다시 입력했어요 · 예금주 이름을 홈택스 상호와 대조해 주세요',
			log: [
				{ at: '9월 19일 오후 3:00', text: '사업자 · 정산 정보 확인 완료', who: '운영 박서연' },
				{ at: '11월 13일 오후 1:00', text: '자동 이체 실패 · 예금주가 정산 계좌 정보와 달라요', who: '자동' },
				{ at: '11월 16일 오후 7:30', text: '정산 계좌를 다시 입력했어요', who: '크리에이터' }
			]
		},
		{ id: 'c8', name: '다온', handle: '@daon.cook', joinedAt: '2026년 9월 20일', products: { live: 3, total: 3 }, settle: 'ok', biz: biz('다온쿡', '오다온', 'daon@daoncook.kr', '211-45-60713', '기업', '011-220918-04-012', '9월 21일 오후 5:12') },
		{ id: 'c9', name: '하늘', handle: '@haneul.yoga', joinedAt: '2026년 9월 22일', products: { live: 2, total: 3 }, settle: 'ok', biz: biz('하늘요가', '강하늘', 'haneul@haneulyoga.kr', '133-90-12478', '신한', '110-330-772910', '9월 23일 오전 8:55') },
		{ id: 'c10', name: '유나', handle: '@yuna.bake', joinedAt: '2026년 9월 25일', products: { live: 1, total: 1 }, settle: 'ok', biz: biz('유나베이크', '서유나', 'yuna@yunabake.kr', '601-11-38025', '토스뱅크', '1000-4471-2093', '9월 26일 오후 2:40') },
		{ id: 'c11', name: '로라', handle: '@lola.green', joinedAt: '2026년 9월 27일', products: { live: 2, total: 2 }, settle: 'ok', biz: biz('로라그린', '문로라', 'lola@lolagreen.kr', '304-25-61190', '국민', '470301-01-552019', '9월 28일 오전 10:18') },
		{ id: 'c12', name: '지유', handle: '@jiyu.tea', joinedAt: '2026년 10월 1일', products: { live: 1, total: 1 }, settle: 'ok', biz: biz('지유티', '배지유', 'jiyu@jiyutea.kr', '119-63-40871', '우리', '1002-901-334120', '10월 2일 오후 3:30') },
		{
			id: 'c13',
			name: '혜린',
			handle: '@hyerin.skin',
			joinedAt: '2026년 10월 6일',
			products: { live: 1, total: 2 },
			settle: 'wait',
			biz: biz('혜린스킨', '노혜린', 'hyerin@hyerinskin.kr', '742-02-11853', '하나', '356-910233-77107', '11월 14일 오후 4:05'),
			log: [{ at: '11월 14일 오후 4:05', text: '사업자 · 정산 정보를 처음 냈어요', who: '크리에이터' }]
		},
		{ id: 'c14', name: '소민', handle: '@somin.run', joinedAt: '2026년 10월 8일', products: { live: 1, total: 1 }, settle: 'ok', biz: biz('소민런', '장소민', 'somin@sominrun.kr', '208-14-90376', '케이뱅크', '100-188-402271', '10월 9일 오전 11:12') },
		{ id: 'c15', name: '서윤', handle: '@seoyun.walk', joinedAt: '2026년 10월 10일', products: { live: 2, total: 2 }, settle: 'ok', biz: biz('서윤워크', '임서윤', 'seoyun@seoyunwalk.kr', '415-27-88304', '농협', '351-0981-2210-43', '10월 11일 오후 6:20') },
		{ id: 'c16', name: '채원', handle: '@chaewon.pilates', joinedAt: '2026년 10월 12일', products: { live: 1, total: 1 }, settle: 'ok', biz: biz('채원필라테스', '권채원', 'chaewon@cwpilates.kr', '135-55-20419', '신한', '110-612-338845', '10월 13일 오전 9:30') },
		{ id: 'c17', name: '가은', handle: '@gaeun.daily', joinedAt: '2026년 10월 14일', products: { live: 1, total: 1 }, settle: 'ok', biz: biz('가은데일리', '신가은', 'gaeun@gaeundaily.kr', '622-38-10945', '국민', '061901-04-228813', '10월 15일 오후 12:40') },
		{
			id: 'c18',
			name: '나래',
			handle: '@narae.home',
			joinedAt: '2026년 11월 10일',
			products: { live: 0, total: 1 },
			settle: 'none',
			biz: null
		},
		{
			id: 'c19',
			name: '봄',
			handle: '@bom.garden',
			joinedAt: '2026년 11월 3일',
			products: { live: 1, total: 1 },
			settle: 'redo',
			biz: biz('봄가든', '유봄', 'bom@bomgarden.kr', '238-71-50226', '우리', '1002-447-901553', '11월 5일 오후 2:15', '유봄(봄가든)'),
			redoWhy: '통장 사본의 예금주가 사업자 대표자와 달라요',
			log: [
				{ at: '11월 5일 오후 2:15', text: '사업자 · 정산 정보를 처음 냈어요', who: '크리에이터' },
				{ at: '11월 6일 오전 10:40', text: '다시 입력 요청 · 통장 사본의 예금주가 사업자 대표자와 달라요', who: '운영 김지수' }
			]
		},
		// 토스 본인인증 전 — 사업자 정보는 확인됐고 토스 셀러로 등록됐지만 크리에이터가 휴대폰 본인인증을 안 함(APPROVAL_REQUIRED)
		{
			id: 'c20',
			name: '다인',
			handle: '@dain.balance',
			joinedAt: '2026년 10월 20일',
			products: { live: 1, total: 1 },
			settle: 'ok',
			toss: 'APPROVAL_REQUIRED',
			biz: biz('다인밸런스', '문다인', 'dain@dainbalance.kr', '317-42-66081', '하나', '356-910482-55307', '10월 21일 오후 4:05'),
			log: [
				{ at: '10월 21일 오후 4:05', text: '사업자 · 정산 정보를 처음 냈어요', who: '크리에이터' },
				{ at: '11월 14일 오전 10:30', text: '확인 완료 · 토스 지급대행 셀러 등록 · 본인인증 기다리는 중', who: '운영 김지수' }
			]
		},
		// 토스 본인인증 전 + 세금계산서 확인 중 — 한 주 1천만원을 넘겨 토스 KYC 재심사로 바뀐 경우(KYC_REQUIRED · 같은 라벨)
		{
			id: 'c21',
			name: '예린',
			handle: '@yerin.glow',
			joinedAt: '2026년 9월 28일',
			products: { live: 3, total: 3 },
			settle: 'ok',
			toss: 'KYC_REQUIRED',
			biz: biz('예린글로우', '오예린', 'yerin@yeringlow.kr', '742-19-30558', '우리', '1002-338-117429', '9월 29일 오전 10:50'),
			log: [
				{ at: '9월 29일 오전 10:50', text: '사업자 · 정산 정보를 처음 냈어요', who: '크리에이터' },
				{ at: '9월 30일 오후 2:20', text: '확인 완료 · 토스 지급대행 셀러 등록', who: '운영 박서연' },
				{ at: '11월 12일 오후 1:03', text: '토스 KYC 심사 필요로 바뀜 · 크리에이터 본인 확인 기다리는 중', who: '자동' }
			]
		}
	].map((c, i) => mk(c as C, i));

const created = { at: '11월 1일 오후 1:00', text: '10월분 정산이 확정돼 지급 건이 만들어졌어요', who: '자동' };
const P = (
	creatorId: string,
	amount: number,
	account: string,
	lines: PayoutRaw['lines'],
	x: Partial<PayoutRaw> = {}
): PayoutRaw => ({
	id: `pay-${creatorId}`,
	creatorId,
	month: '10월분',
	amount,
	lines,
	account,
	paid: null,
	sending: null,
	fail: null,
	opsHold: null,
	tries: 0,
	attempts: [],
	memo: null,
	...x,
	log: [created, ...(x.log ?? [])]
});

export const seedPayouts = (): PayoutRaw[] => [
	P('c1', 412800, '국민 ****5678', [{ product: '포도 글루타치온 젤리', month: '10월분', amount: 268400 }, { product: '레몬 콜라겐 스틱', month: '10월분', amount: 144400 }], {
		paid: { at: '11월 7일 오후 1:02', by: '자동 이체', manual: false },
		tries: 1,
		attempts: [{ at: '11월 7일 오후 1:02', result: '이체 완료', tone: 'grey', raw: 'SUCCESS · 거래번호 T20261107-00412' }],
		log: [
			{ at: '11월 6일 오후 4:10', text: '세금계산서 확인 · 지급 대기', who: '운영 김지수' },
			{ at: '11월 7일 오후 1:02', text: '자동 이체 완료 · 국민 ****5678', who: '자동' }
		]
	}),
	P('c2', 186000, '신한 ****1122', [{ product: '히알루론 필름', month: '10월분', amount: 186000 }], {
		log: [{ at: '11월 16일 오후 3:10', text: '세금계산서 확인 · 토스 본인인증 전이라 지급 보류 · 크리에이터가 인증하면 자동으로 지급 대기', who: '운영 박서연' }]
	}),
	P('c3', 98400, '카카오뱅크 ****2045', [{ product: '단백질 쉐이크 바닐라', month: '10월분', amount: 98400 }]),
	P('c4', 74100, '우리 ****0198', [{ product: '비오틴 캡슐', month: '10월분', amount: 52600 }, { product: '세라마이드 앰플', month: '9월분 · 보류 해제', amount: 21500 }]),
	P('c5', 238500, '농협 ****2121', [{ product: '유산균 파우더', month: '10월분', amount: 238500 }], {
		paid: { at: '11월 16일 오후 1:02', by: '자동 이체', manual: false },
		tries: 1,
		attempts: [{ at: '11월 16일 오후 1:02', result: '이체 완료', tone: 'grey', raw: 'SUCCESS · 거래번호 T20261116-00238' }],
		log: [
			{ at: '11월 15일 오후 2:30', text: '세금계산서 확인 · 지급 대기', who: '운영 김지수' },
			{ at: '11월 16일 오후 1:02', text: '자동 이체 완료 · 농협 ****2121', who: '자동' }
		]
	}),
	P('c6', 152300, '하나 ****1307', [{ product: '마그네슘 젤리', month: '10월분', amount: 152300 }], {
		opsHold: { memo: '정산 계좌 변경 요청 확인 필요 · 계정 정지 검토 중', by: '운영 김지수 · 11월 4일 오후 2:31' },
		log: [
			{ at: '11월 4일 오후 2:31', text: '운영 보류 · 정산 계좌 변경 요청 확인 필요', who: '운영 김지수' },
			{ at: '11월 8일 오후 1:12', text: '세금계산서 다시 제출 요청 · 승인번호가 홈택스에서 조회되지 않아요', who: '운영 김지수' }
		]
	}),
	P('c7', 129600, '국민 ****8834', [{ product: '콜라겐 젤리 스틱', month: '10월분', amount: 129600 }], {
		fail: { kind: 'account', why: '예금주가 정산 계좌 정보와 달라요', at: '11월 13일 오후 1:01' },
		tries: 1,
		attempts: [{ at: '11월 13일 오후 1:01', result: '실패 · 계좌 확인 필요', tone: 'red', raw: 'E4102 · ACCOUNT_HOLDER_MISMATCH' }],
		log: [
			{ at: '11월 12일 오후 5:40', text: '세금계산서 확인 · 지급 대기', who: '운영 박서연' },
			{ at: '11월 13일 오후 1:01', text: '자동 이체 실패 · 예금주 불일치', who: '자동' },
			{ at: '11월 16일 오후 7:30', text: '크리에이터가 정산 계좌를 다시 입력했어요 · 정산 정보 확인 대기', who: '크리에이터' }
		]
	}),
	P('c8', 205700, '기업 ****4012', [{ product: '토마토 리코펜 스틱', month: '10월분', amount: 142300 }, { product: '흑마늘 젤리', month: '10월분', amount: 63400 }], {
		// 웹훅 기준(§11) — 은행 답 없음 → 송금 중으로 웹훅을 기다리며 매시간 자동 확인 → 24시간이 지나도 모름 → 결과 확인 필요(자동 확인은 계속)
		fail: {
			kind: 'check',
			why: '하루 넘게 확인했지만 은행이 답을 안 줘요',
			at: '11월 16일 오후 1:01',
			check: { sentAt: '11월 15일 오후 1:01' }
		},
		tries: 1,
		attempts: [
			{ at: '11월 15일 오후 1:01', result: '은행 답 없음 · 기다리는 중', tone: 'orange', raw: 'POST /v2/payouts · IN_PROGRESS · 지급 요청 po_c8_1015 · Idempotency-Key PAY-c8-1015' },
			{ at: '11월 17일 오전 10:01', result: '매시간 자동 확인 45번 · 은행도 아직 몰라요', tone: 'red', raw: 'GET /v2/payouts/po_c8_1015 · IN_PROGRESS · 11월 15일 오후 2:01부터 매시간' }
		],
		log: [
			{ at: '11월 14일 오전 11:05', text: '세금계산서 확인 · 지급 대기', who: '운영 김지수' },
			{ at: '11월 15일 오후 1:01', text: '자동 이체 요청 · 은행이 답을 안 줘서 기다리는 중 · 매시간 자동 확인', who: '자동' },
			{ at: '11월 16일 오후 1:01', text: '24시간 동안 확인했지만 은행도 아직 몰라요 · 결과 확인 필요 · 자동 확인은 계속해요', who: '자동' }
		]
	}),
	P('c9', 318200, '신한 ****2910', [{ product: '요가 회복 단백질', month: '10월분', amount: 210600 }, { product: '숙면 마그네슘 스틱', month: '10월분', amount: 107600 }], {
		fail: { kind: 'ops', why: '일일 이체 한도 초과', at: '11월 16일 오후 1:02' },
		tries: 1,
		attempts: [{ at: '11월 16일 오후 1:02', result: '실패 · 운영 조치 필요', tone: 'red', raw: 'FAILED · 일일 이체 한도 초과' }],
		log: [
			{ at: '11월 15일 오후 4:20', text: '세금계산서 확인 · 지급 대기', who: '운영 박서연' },
			{ at: '11월 16일 오후 1:02', text: '자동 이체 실패 · 일일 이체 한도 초과', who: '자동' }
		]
	}),
	P('c10', 87300, '토스뱅크 ****2093', [{ product: '단호박 쿠키 단백질', month: '10월분', amount: 87300 }], {
		fail: { kind: 'retry', why: '은행 점검 시간', at: '11월 16일 오후 1:02' },
		tries: 2,
		attempts: [
			{ at: '11월 15일 오후 1:01', result: '실패 · 재시도 대기', tone: 'orange', raw: 'E3001 · BANK_MAINTENANCE' },
			{ at: '11월 16일 오후 1:02', result: '실패 · 재시도 대기', tone: 'orange', raw: 'E3001 · BANK_MAINTENANCE' }
		],
		log: [
			{ at: '11월 14일 오후 6:00', text: '세금계산서 확인 · 지급 대기', who: '운영 김지수' },
			{ at: '11월 15일 오후 1:01', text: '자동 이체 실패 · 은행 점검 시간 · 다음 영업일 오후 1시 자동 재시도', who: '자동' },
			{ at: '11월 16일 오후 1:02', text: '자동 이체 실패 · 은행 점검 시간 · 다음 영업일 오후 1시 자동 재시도', who: '자동' }
		]
	}),
	P('c11', 164900, '국민 ****2019', [{ product: '그린 클렌즈 주스 파우더', month: '10월분', amount: 164900 }], {
		// 은행 답 없음 — 결과 확인 필요로 바로 보내지 않고 송금 중으로 웹훅을 기다리며 매시간 자동 확인(§11)
		sending: { at: '11월 17일 오전 10:05', noReply: { waited: '15분째', nextCheck: '오전 11:05' } },
		tries: 2,
		attempts: [
			{ at: '11월 16일 오후 1:02', result: '실패 · 운영 조치 필요', tone: 'red', raw: 'FAILED · 일일 이체 한도 초과' },
			{ at: '11월 17일 오전 10:05', result: '은행 답 없음 · 기다리는 중', tone: 'orange', raw: 'POST /v2/payouts · IN_PROGRESS · 지급 요청 po_c11_1017 · Idempotency-Key PAY-c11-1017' }
		],
		log: [
			{ at: '11월 15일 오전 9:30', text: '세금계산서 확인 · 지급 대기', who: '운영 박서연' },
			{ at: '11월 16일 오후 1:02', text: '자동 이체 실패 · 일일 이체 한도 초과', who: '자동' },
			{ at: '11월 17일 오전 10:05', text: '한도 조정 뒤 다시 보내기 · 송금 중', who: '운영 김지수' },
			{ at: '11월 17일 오전 10:05', text: '은행이 답을 안 줘서 기다리는 중 · 매시간 자동으로 확인해요', who: '자동' }
		]
	}),
	P('c12', 0, '우리 ****4120', [{ product: '보리 녹차 스틱', month: '10월분', amount: 0 }], {
		log: [{ at: '11월 1일 오후 1:00', text: '정산금이 전부 제조금액 상계에 쓰여 지급할 금액이 없어요', who: '자동' }]
	}),
	P('c13', 143000, '하나 ****7107', [{ product: '어성초 진정 필름', month: '10월분', amount: 143000 }]),
	P('c14', 96800, '케이뱅크 ****2271', [{ product: '러너 전해질 스틱', month: '10월분', amount: 96800 }], {
		fail: { kind: 'account', why: '없는 계좌예요', at: '11월 13일 오후 1:01' },
		opsHold: { memo: '크리에이터가 계좌 변경을 문의함 · 새 계좌 받을 때까지 보류', by: '운영 박서연 · 11월 14일 오전 10:12' },
		tries: 1,
		attempts: [{ at: '11월 13일 오후 1:01', result: '실패 · 계좌 확인 필요', tone: 'red', raw: 'E4101 · ACCOUNT_NOT_FOUND' }],
		log: [
			{ at: '11월 12일 오후 2:00', text: '세금계산서 확인 · 지급 대기', who: '운영 김지수' },
			{ at: '11월 13일 오후 1:01', text: '자동 이체 실패 · 없는 계좌', who: '자동' },
			{ at: '11월 14일 오전 10:12', text: '운영 보류 · 새 계좌 받을 때까지', who: '운영 박서연' }
		]
	}),
	P('c15', 153500, '농협 ****2143', [{ product: '산책 후 단백질 바', month: '10월분', amount: 101200 }, { product: '아르기닌 젤리', month: '10월분', amount: 52300 }], {
		log: [{ at: '11월 17일 오전 9:40', text: '세금계산서 확인 · 지급 대기 · 오늘 오후 1시 자동 이체 예정', who: '운영 김지수' }]
	}),
	P('c16', 58900, '신한 ****8845', [{ product: '코어 콜라겐 워터', month: '10월분', amount: 58900 }], {
		paid: { at: '11월 12일 오후 4:30', by: '수동 기록 · 운영 김지수', manual: true },
		memo: '지급대행 장애로 회사 계좌에서 직접 이체',
		tries: 1,
		attempts: [{ at: '11월 12일 오후 1:00', result: '실패 · 지급대행 장애', tone: 'red', raw: 'E5000 · PROVIDER_UNAVAILABLE' }],
		log: [
			{ at: '11월 11일 오후 3:00', text: '세금계산서 확인 · 지급 대기', who: '운영 박서연' },
			{ at: '11월 12일 오후 1:00', text: '자동 이체 실패 · 지급대행 장애', who: '자동' },
			{ at: '11월 12일 오후 4:30', text: '지급 완료 기록 · 회사 계좌에서 직접 이체', who: '운영 김지수' }
		]
	}),
	P('c17', 112200, '국민 ****8813', [{ product: '데일리 비타민 구미', month: '10월분', amount: 112200 }]),
	P('c20', 134700, '하나 ****5307', [{ product: '밸런스 식이섬유 젤리', month: '10월분', amount: 134700 }], {
		log: [{ at: '11월 14일 오후 5:20', text: '세금계산서 확인 · 토스 본인인증 전이라 지급 보류 · 크리에이터가 인증하면 자동으로 지급 대기', who: '운영 김지수' }]
	}),
	P('c21', 91200, '우리 ****7429', [{ product: '글로우 콜라겐 샷', month: '10월분', amount: 91200 }])
];

const T = (creatorId: string, total: number, supply: number, vat: number, status: TaxRaw['status'], x: Partial<TaxRaw> = {}): TaxRaw => ({
	id: `tax-${creatorId}`,
	creatorId,
	payoutId: `pay-${creatorId}`,
	month: '10월분',
	total,
	supply,
	vat,
	writeDate: '10월 31일',
	due: '11월 10일',
	status,
	approvalNo: null,
	submittedAt: null,
	waited: null,
	overdue: false,
	sentTotal: null,
	redoWhy: null,
	log: [],
	...x
});
const sub = (at: string, who = '크리에이터') => ({ at, text: '승인번호를 냈어요', who });
const ok = (at: string, who: string) => ({ at, text: '수취 확인', who });

export const seedTaxes = (): TaxRaw[] => [
	T('c3', 98400, 89455, 8945, 'chk', {
		approvalNo: '20261115-41000012-34567891',
		submittedAt: '11월 15일 오후 5:02',
		waited: '2일째',
		sentTotal: 96000,
		log: [{ at: '11월 15일 오후 5:02', text: '승인번호를 냈어요 · 낸 합계 ₩96,000', who: '크리에이터' }]
	}),
	T('c17', 112200, 102000, 10200, 'chk', { approvalNo: '20261116-41000090-21557740', submittedAt: '11월 16일 오전 11:20', waited: '23시간', log: [sub('11월 16일 오전 11:20')] }),
	T('c21', 91200, 82909, 8291, 'chk', { approvalNo: '20261116-41000131-73302816', submittedAt: '11월 16일 오후 6:40', waited: '16시간', log: [sub('11월 16일 오후 6:40')] }),
	T('c13', 143000, 130000, 13000, 'chk', { approvalNo: '20261116-41000033-70215566', submittedAt: '11월 16일 오후 8:15', waited: '14시간', log: [sub('11월 16일 오후 8:15')] }),
	T('c6', 152300, 138455, 13845, 'redo', {
		approvalNo: '20261107-41000008-11203345',
		submittedAt: '11월 7일 오전 10:20',
		overdue: true,
		redoWhy: '승인번호가 홈택스에서 조회되지 않아요',
		log: [sub('11월 7일 오전 10:20'), { at: '11월 8일 오후 1:12', text: '다시 제출 요청 · 승인번호가 홈택스에서 조회되지 않아요', who: '운영 김지수' }]
	}),
	T('c4', 74100, 67364, 6736, 'none', { overdue: true }),
	T('c1', 412800, 375273, 37527, 'ok', { approvalNo: '20261105-41000012-88120034', submittedAt: '11월 5일 오전 9:40', log: [sub('11월 5일 오전 9:40'), ok('11월 6일 오후 4:10', '운영 김지수')] }),
	T('c2', 186000, 169091, 16909, 'ok', { approvalNo: '20261116-41000044-30128867', submittedAt: '11월 16일 오전 8:50', log: [sub('11월 16일 오전 8:50'), ok('11월 16일 오후 3:10', '운영 박서연')] }),
	T('c5', 238500, 216819, 21681, 'ok', { approvalNo: '20261114-41000021-45009812', submittedAt: '11월 14일 오후 2:25', log: [sub('11월 14일 오후 2:25'), ok('11월 15일 오후 2:30', '운영 김지수')] }),
	T('c7', 129600, 117819, 11781, 'ok', { approvalNo: '20261112-41000017-63318840', submittedAt: '11월 12일 오후 4:08', log: [sub('11월 12일 오후 4:08'), ok('11월 12일 오후 5:40', '운영 박서연')] }),
	T('c8', 205700, 187000, 18700, 'ok', { approvalNo: '20261113-41000044-21009877', submittedAt: '11월 13일 오후 2:10', log: [sub('11월 13일 오후 2:10'), ok('11월 14일 오전 11:05', '운영 김지수')] }),
	T('c9', 318200, 289273, 28927, 'ok', { approvalNo: '20261115-41000051-30277410', submittedAt: '11월 15일 오전 11:20', log: [sub('11월 15일 오전 11:20'), ok('11월 15일 오후 4:20', '운영 박서연')] }),
	T('c10', 87300, 79364, 7936, 'ok', { approvalNo: '20261114-41000062-77104528', submittedAt: '11월 14일 오전 9:40', log: [sub('11월 14일 오전 9:40'), ok('11월 14일 오후 6:00', '운영 김지수')] }),
	T('c11', 164900, 149910, 14990, 'ok', { approvalNo: '20261114-41000070-55320981', submittedAt: '11월 14일 오후 8:30', log: [sub('11월 14일 오후 8:30'), ok('11월 15일 오전 9:30', '운영 박서연')] }),
	T('c14', 96800, 88000, 8800, 'ok', { approvalNo: '20261111-41000083-61190334', submittedAt: '11월 11일 오후 9:05', log: [sub('11월 11일 오후 9:05'), ok('11월 12일 오후 2:00', '운영 김지수')] }),
	T('c15', 153500, 139546, 13954, 'ok', { approvalNo: '20261116-41000101-90233871', submittedAt: '11월 16일 오후 10:12', log: [sub('11월 16일 오후 10:12'), ok('11월 17일 오전 9:40', '운영 김지수')] }),
	T('c16', 58900, 53546, 5354, 'ok', { approvalNo: '20261110-41000110-11930224', submittedAt: '11월 10일 오전 8:00', log: [sub('11월 10일 오전 8:00'), ok('11월 11일 오후 3:00', '운영 박서연')] }),
	T('c20', 134700, 122455, 12245, 'ok', { approvalNo: '20261113-41000120-40917735', submittedAt: '11월 13일 오후 9:10', log: [sub('11월 13일 오후 9:10'), ok('11월 14일 오후 5:20', '운영 김지수')] })
];

/** 아직 화면을 만들지 않은 메뉴의 홈 숫자 — 기능 단계에서 각 RPC(심사 대기 · 발송 대기 · 문의 · 정산)가 보낸다 */
export const OTHER_COUNTS = {
	orders: { toShip: 4, toShipOldest: '2일째', noDelivered: 2, noDeliveredOldest: '9일째' },
	cs: { inqLate: 1, inqLateOldest: '26시간', refundRetry: 1, refundOldest: '4일째', creatorLate: 1, creatorLateOldest: '1일 넘김', pickup: 2, resend: 1, inqOpen: 3 },
	creators: { inviteAsk: 1, inviteOldest: '하루째' },
	/** 파트너팀 톡(0125) — 크리에이터가 마지막으로 말한 방 = 답할 차례 */
	talk: { waiting: 2 },
	settle: { nextAt: '12월 1일(화) 오후 1시', dday: 14, heldLines: 2 }
};

/** 지급대행 · 크론 — 잔액 · 마지막 실행 (서비스가 정해지면 지급대행 API · docs/myr-admin-screens.md §13) */
export const seedProvider = () => ({
	// 토스 지급대행 잔액(GET /v2/balances) — 재원은 MYR 샵 판매 정산대금(충전 아님). available = 지금 보낼 수 있음 · pending = 토스 정산 전
	available: 200000,
	pending: 450000,
	lastRun: { at: '11월 16일 오후 1:02', n: 4, ok: 1, fail: 3, unknown: 0 },
	crons: [
		{ name: '정산', at: '11월 1일 오후 1:00', ok: true, next: '12월 1일 오후 1시' },
		{ name: '이체', at: '11월 16일 오후 1:02', ok: true, next: '오늘 오후 1시' },
		// 은행 답이 없는 건의 결과를 매시간 지급대행에 묻는다(웹훅을 못 받았을 때 대비 · §11)
		{ name: '결과 확인', at: '11월 17일 오전 10:05', ok: true, next: '매시간' }
	]
});
