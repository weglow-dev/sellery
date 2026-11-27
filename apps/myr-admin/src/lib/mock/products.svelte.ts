/** 상품(§4) 서버 흉내 — 목록 · 신규 심사 · 수정 심사 · 상품 관리의 판정 · 문구 · 동작(메모리 · 새로고침하면 시드로).
 *  기능 단계에서 RPC 로 바뀐다(0071~0074 상품 상태 · 수정본 · 반려 의견 — docs/myr-admin-plan.md). 화면은 여기서 받은 칩 · 안내 · 버튼 · 건수만 그린다. */
import { won } from '../format';
import { groupbuys } from './groupbuys.svelte';
import { ME, NOW, seedCreators } from './seed';
import type { Chip, LedgerRaw, LedgerRound, LogEntry, ProductOpinion, ProductRaw, ProductStatus, SecItem, SecNo } from './types';

const CREATORS = new Map(seedCreators().map((c) => [c.id, c]));
const me = () => `${ME.role} ${ME.name}`;
const stamp = () => `11월 17일 ${NOW.time}`;
const TODAY_LABEL = '11월 17일';

/** 섹션 이름(크리에이터 콘솔 상품 등록 8단계와 같은 순서) */
const SEC_NAME: Record<SecNo, string> = { 0: '전체', 1: '기본 정보', 2: '레시피 노트', 3: '왜 만들었나요', 4: '성분', 5: '섭취법', 6: '제품 정보', 7: 'FAQ' };
/** 의견 · 미리보기 칸 이름 — "01 기본 정보" ~ "07 FAQ" · "전체" */
const secLabel = (k: SecNo) => (k ? `0${k} ${SEC_NAME[k]}` : '전체');
/** 미리보기 안 소제목 — 샵 상세 번호(01 · 왜 만들었나요 ~ 05 · FAQ) */
const shopHead = (k: SecNo) => `0${k - 2} · ${SEC_NAME[k]}`;
const OP_LEN = 300;

/** 자주 쓰는 의견(문구는 운영팀이 정한다 — §4-2) — 지금 고른 의견 글 뒤에 덧붙인다 */
const QUICK: { label: string; text: string }[] = [
	{ label: '효능 · 최상급 표현', text: '"최고", "30% 감소"처럼 효능을 단정하거나 최상급으로 쓴 표현은 쓸 수 없어요. 문장을 바꿔 주세요.' },
	{ label: '의약품 오인 표현', text: '질병을 예방 · 치료한다고 읽힐 수 있는 표현이에요. 표시 기준에 맞게 바꿔 주세요.' },
	{ label: '함량 근거 필요', text: '표시한 함량의 근거(시험 성적서)를 올려 주세요.' },
	{ label: '사진 해상도', text: '대표 사진 해상도가 낮아요. 1200px 이상으로 다시 올려 주세요.' }
];

/** 제조금액 입력 — 숫자만 · ₩10,000 이상(서버 판정 자리 · 0087 myr_mfg_add 의 금액 검사) */
const MFG_MIN = 10000;
/** 보증금 = 제조금액의 25%(서버 판정 자리 · 0087) — 이 파일 안에서도 이 함수 하나만 쓴다 */
const depositOf = (amount: number) => Math.round(amount / 4 / 100) * 100;

/** 서버 판정 자리(기능 단계에서 DB 함수) — 승인된 상품(판매 중 · 일시중지 · myr_product_status_approved) · 품절(재고 0 · myr_product_sold_out). 이 파일 안에서도 이 둘만 쓴다 */
const approved = (s: ProductStatus) => s === 'live' || s === 'paused';
const soldOut = (p: { stock: number | null }) => p.stock === 0;
/** 반려된 상품 — 심사 탭 아래쪽에 남겨 보여 준다(서버 판정 자리 · 0116 상품 console 묶음) */
const rejected = (s: ProductStatus) => s === 'rejected';

const STATUS_CHIP: Record<ProductStatus, Chip> = {
	draft: { label: '임시저장', tone: 'grey' },
	review: { label: '심사 대기', tone: 'orange' },
	live: { label: '판매 중', tone: 'mint' },
	paused: { label: '일시중지', tone: 'grey' },
	rejected: { label: '반려', tone: 'red' },
	ended: { label: '판매 종료', tone: 'grey' }
};
const STATUS_DAYS: Record<ProductStatus, string> = { draft: '저장', review: '요청', live: '승인', paused: '일시중지', rejected: '반려', ended: '판매 종료' };

const i = (h: string, t: string): SecItem => ({ h, t });
const P = (
	n: number,
	creatorId: string,
	name: string,
	category: string,
	price: number,
	unit: string,
	tile: string,
	icon: string,
	status: ProductStatus,
	stock: number | null,
	days: number,
	x: Partial<ProductRaw> = {}
): ProductRaw => ({
	id: `p${n}`,
	code: `MYR-${1000 + n}`,
	creatorId,
	name,
	category,
	price,
	unit,
	tile,
	icon,
	status,
	stock,
	days,
	submittedAt: null,
	content: null,
	rejects: [],
	sent: null,
	rev: null,
	ledger: approved(status) || status === 'ended' ? led(price * 25) : null,
	log: [],
	...x
});
/** 제조 원장 시드 — 초도 1차 · 정산월마다 정산금에서 상계(repaid = 갚은 비율) */
const rd = (n: number, amount: number, depositAt: string | null, refunded: boolean, memo: string, by: string, isVoid = false): LedgerRound => ({ n, amount, depositAt, refunded, memo, by, void: isVoid });
function led(total: number, repaid = 0.5, x: Partial<LedgerRaw> = {}): LedgerRaw {
	const paid = Math.round((total * repaid) / 100) * 100;
	const sep = Math.round((paid * 0.6) / 100) * 100;
	return {
		rounds: [rd(1, total, '9월 18일', repaid >= 1, '초도 생산', '운영 박서연')],
		offsets: [
			{ month: '9월분', amount: sep },
			{ month: '10월분', amount: paid - sep }
		].filter((o) => o.amount > 0),
		...x
	};
}

/** 원장 합계 · 상태(서버 자리 — 0103 myr_mfg_* 판정 · 화면은 이 값만 쓴다) */
function ledSum(l: LedgerRaw) {
	const alive = l.rounds.filter((r) => !r.void);
	const total = alive.reduce((a, r) => a + r.amount, 0);
	const repaid = Math.min(total, l.offsets.reduce((a, o) => a + o.amount, 0));
	const remain = total - repaid;
	const depWait = alive.some((r) => !r.depositAt);
	const depKeep = alive.some((r) => r.depositAt && !r.refunded);
	return {
		total,
		repaid,
		remain,
		deposit: depositOf(total),
		pct: total ? Math.round((repaid / total) * 100) : 0,
		depWait,
		stateChip: (remain ? { label: '상환 중', tone: 'orange' } : { label: '상환 완료', tone: 'grey' }) as Chip,
		depChip: (depWait ? { label: '보증금 입금 확인 전', tone: 'red' } : depKeep ? { label: '보증금 보관 중', tone: 'orange' } : { label: '보증금 환급 완료', tone: 'grey' }) as Chip
	};
}

/** 39개 — 크리에이터 시드의 상품 수(판매 중 / 전체)와 지급 건 상품 이름에 맞춘다 */
export const seedProducts = (): ProductRaw[] => [
	P(1, 'c1', '포도 글루타치온 젤리', '이너뷰티', 32000, '14포 / 2주분', 'grape', 'jelly', 'live', 184, 45, {
		ebutCode: 'EB2048101',
		ledger: led(600000, 1),
		rev: {
			at: '11월 16일 오후 2:40',
			days: 1,
			diff: [
				[1, [i('상품명', '포도 글루타치온 젤리'), i('한 줄 소개', '글루타치온 · 하루 한 포')], [i('상품명', '포도 글루타치온 젤리'), i('한 줄 소개', '글루타치온 · 식후 한 포로 가볍게')]],
				[3, [i('', '피부 루틴 콘텐츠를 3년 넘게 하면서 "뭐 먹어요?"라는 질문을 가장 많이 받았어요.')], [i('', '피부 루틴 콘텐츠를 3년 넘게 하면서 "뭐 먹어요?"라는 질문을 가장 많이 받았어요.'), i('', '그래서 식사 뒤 입가심 하나만 바꾸는 걸로 시작했고, 6개월째 이어 가고 있어요.')]],
				[7, [i('언제 먹는 게 좋아요?', '식후 30분 안에 드세요.')], [i('언제 먹는 게 좋아요?', '식후 30분 안에 드세요.'), i('저녁에 먹어도 되나요?', '네, 저녁 식사 뒤에 드셔도 괜찮아요.')]]
			],
			history: ['10월 14일 반영 승인 · 가격 ₩34,000 → ₩32,000', '9월 30일 반려 · 의견 1개']
		},
		log: [
			{ at: '10월 3일 오후 2:10', text: '승인 · 재고 300개', who: '운영 박서연' },
			{ at: '11월 16일 오후 2:40', text: '크리에이터가 수정 심사를 요청했어요', who: '크리에이터' }
		]
	}),
	P(2, 'c1', '레몬 콜라겐 스틱', '이너뷰티', 36000, '14포 / 2주분', 'lemon', 'stick', 'live', 96, 15, {
		ebutCode: 'EB2048102',
		ledger: {
			rounds: [rd(1, 800000, '9월 12일', false, '초도 4,000포', '운영 박서연'), rd(2, 400000, null, false, '재생산 2,000포', '운영 김지수')],
			offsets: [
				{ month: '9월분', amount: 300000 },
				{ month: '10월분', amount: 212400 }
			]
		}
	}),
	P(3, 'c1', '히알루론 젤리', '이너뷰티', 34000, '14포 / 2주분', 'straw', 'jelly', 'live', 220, 9, {
		ledger: led(850000, 0.4, { rounds: [rd(1, 850000, '8월 30일', false, '초도 2,500포', '운영 박서연'), rd(2, 300000, null, false, '금액 잘못 입력', '운영 김지수', true)] })
	}),
	P(4, 'c1', '모닝 루틴 티', '멘탈 웰니스', 22000, '20티백', 'plum', 'stick', 'draft', null, 2),
	P(5, 'c2', '히알루론 필름', '이너뷰티', 28000, '30매 / 1개월', 'peach', 'film', 'live', 58, 61),
	P(6, 'c2', '굿나잇 구미', '멘탈 웰니스', 26000, '30구미 / 1개월', 'plum', 'gummy', 'live', 132, 40),
	P(7, 'c3', '단백질 쉐이크 바닐라', '다이어트', 39000, '10포', 'slate', 'powder', 'live', 7, 74, {
		ledger: led(975000, 0, { rounds: [rd(1, 975000, null, false, '초도 1,000포', '운영 김지수')] })
	}),
	P(8, 'c3', 'BCAA 스틱', '스포츠', 33000, '10포', 'navy', 'stick', 'paused', 23, 11, {
		log: [{ at: '11월 6일 오후 3:20', text: '일시중지 · 원료 수급 확인 중', who: '운영 김지수' }]
	}),
	P(9, 'c4', '비오틴 캡슐', '헤어', 24000, '60캡슐 / 2개월', 'lemon', 'pill', 'live', 0, 52),
	P(10, 'c4', '세라마이드 앰플', '더마', 34000, '30ml', 'teal', 'liquid', 'live', 41, 48),
	P(11, 'c4', '클렌즈 티', '다이어트', 24000, '20티백', 'teal', 'stick', 'rejected', null, 12, {
		sent: [
			[3, '"먹기만 해도 체지방이 빠지는" 표현은 쓸 수 없어요. 문장을 바꿔 주세요.'],
			[1, '대표 사진 해상도가 낮아요. 1200px 이상으로 다시 올려 주세요.']
		],
		log: [
			{ at: '11월 3일 오후 4:10', text: '크리에이터가 심사를 요청했어요', who: '크리에이터' },
			{ at: '11월 5일 오전 11:02', text: '반려 · 의견 2개', who: '운영 김지수' }
		]
	}),
	P(12, 'c5', '유산균 파우더', '이너뷰티', 30000, '30포 / 1개월', 'navy', 'powder', 'live', 143, 80),
	P(13, 'c5', '발효 곡물 스틱', '다이어트', 27000, '14포 / 2주분', 'slate', 'stick', 'live', 77, 26),
	P(14, 'c6', '마그네슘 젤리', '멘탈 웰니스', 29000, '14포 / 2주분', 'plum', 'jelly', 'live', 64, 58),
	P(15, 'c7', '콜라겐 젤리 스틱', '이너뷰티', 31000, '14포 / 2주분', 'straw', 'jelly', 'live', 88, 44),
	P(16, 'c7', '무드 허브티', '멘탈 웰니스', 22000, '20티백', 'plum', 'stick', 'live', 51, 21),
	P(17, 'c8', '토마토 리코펜 스틱', '이너뷰티', 29000, '14포 / 2주분', 'straw', 'stick', 'live', 120, 66),
	P(18, 'c8', '흑마늘 젤리', '이너뷰티', 33000, '14포 / 2주분', 'slate', 'jelly', 'live', 96, 50),
	P(19, 'c8', '현미 누룽지 바', '다이어트', 21000, '6개입', 'peach', 'powder', 'live', 210, 30),
	P(20, 'c9', '요가 회복 단백질', '스포츠', 38000, '10포', 'teal', 'powder', 'live', 74, 70),
	P(21, 'c9', '숙면 마그네슘 스틱', '멘탈 웰니스', 26000, '14포 / 2주분', 'plum', 'stick', 'live', 132, 41),
	P(22, 'c9', '요가 전해질 워터', '스포츠', 18000, '10포', 'teal', 'liquid', 'ended', 0, 28, {
		log: [{ at: '10월 20일 오전 10:12', text: '판매 종료 · 크리에이터 요청', who: '운영 박서연' }]
	}),
	P(23, 'c10', '단호박 쿠키 단백질', '다이어트', 30000, '10개입', 'peach', 'powder', 'live', 150, 40),
	P(24, 'c11', '그린 클렌즈 주스 파우더', '다이어트', 32000, '14포 / 2주분', 'teal', 'powder', 'live', 88, 38),
	P(25, 'c11', '케일 스무디', '다이어트', 32000, '14포 / 2주분', 'teal', 'powder', 'live', 67, 19),
	P(26, 'c12', '보리 녹차 스틱', '다이어트', 22000, '20포', 'teal', 'stick', 'live', 96, 36),
	P(27, 'c13', '어성초 진정 필름', '더마', 28000, '30매 / 1개월', 'teal', 'film', 'live', 59, 33),
	P(28, 'c13', '시카 진정 젤리', '더마', 29000, '14포 / 2주분', 'teal', 'jelly', 'review', null, 1, {
		submittedAt: '11월 16일 오전 11:05',
		rejects: ['11월 7일 반려 · 의견 2개(효능 표현 · 사진 해상도)'],
		content: [
			[2, [i('', '병풀 추출물 · 판테놀 · 히알루론산 / 젤리 / 청포도 향')]],
			[3, [i('', '피부가 예민해지는 환절기마다 손이 가던 진정 루틴을, 먹는 젤리로 옮겨 봤어요. 하루 한 포 간식처럼 챙기기 쉬워요.')]],
			[4, [i('병풀 추출물 200mg', '부원료'), i('히알루론산 120mg', '피부 보습에 도움을 줄 수 있음'), i('판테놀', '부원료')]],
			[5, [i('', '하루 1포를 그대로 드세요. 냉장 보관하면 더 맛있어요.')]],
			[6, [i('내용량', '20g × 14포'), i('제조원', 'MYR 협력 GMP 공장'), i('소비기한', '제조일로부터 12개월')]],
			[7, [i('아이도 먹어도 되나요?', '만 12세 이상부터 권장해요.')]]
		],
		log: [
			{ at: '11월 5일 오후 2:30', text: '크리에이터가 심사를 요청했어요', who: '크리에이터' },
			{ at: '11월 7일 오전 10:40', text: '반려 · 의견 2개', who: '운영 김지수' },
			{ at: '11월 16일 오전 11:05', text: '크리에이터가 고쳐서 다시 심사를 요청했어요', who: '크리에이터' }
		]
	}),
	P(29, 'c14', '러너 전해질 스틱', '스포츠', 24000, '14포', 'lemon', 'stick', 'live', 130, 34),
	P(30, 'c15', '산책 후 단백질 바', '다이어트', 26000, '6개입', 'peach', 'powder', 'live', 118, 29),
	P(31, 'c15', '아르기닌 젤리', '스포츠', 31000, '14포 / 2주분', 'grape', 'jelly', 'live', 72, 22),
	P(32, 'c16', '코어 콜라겐 워터', '이너뷰티', 28000, '10병', 'navy', 'liquid', 'live', 40, 31),
	P(33, 'c17', '데일리 비타민 구미', '이너뷰티', 25000, '30구미 / 1개월', 'lemon', 'gummy', 'live', 155, 27),
	P(34, 'c18', '홈카페 디카페인 스틱', '멘탈 웰니스', 23000, '20포', 'slate', 'stick', 'review', null, 3, {
			photos: [
				['slate', 'stick'],
				['lemon', 'stick'],
				['teal', 'powder'],
				['plum', 'liquid']
			],
		submittedAt: '11월 14일 오후 6:20',
		content: [
			[2, [i('', '디카페인 원두 · 치커리 뿌리 · 귀리 분말 / 분말 스틱 / 고소한 맛')]],
			[3, [i('', '저녁에도 커피 한 잔의 여유를 놓치기 싫어서 만들었어요. 물이나 우유에 타면 30초 만에 끝나요.'), i('', '마시기만 해도 불면증이 사라지는 최고의 수면 커피예요.')]],
			[4, [i('디카페인 원두 분말 1.2g', '카페인 97% 이상 제거'), i('치커리 뿌리 추출물', '부원료'), i('귀리 분말', '부원료')]],
			[5, [i('', '하루 1포를 따뜻한 물이나 우유 150ml에 타서 드세요.')]],
			[6, [i('내용량', '2.5g × 20포'), i('제조원', 'MYR 협력 GMP 공장'), i('소비기한', '제조일로부터 18개월')]],
			[7, []]
		],
		log: [{ at: '11월 14일 오후 6:20', text: '크리에이터가 심사를 요청했어요', who: '크리에이터' }]
	}),
	P(35, 'c19', '가든 허브 젤리', '멘탈 웰니스', 27000, '14포 / 2주분', 'plum', 'jelly', 'live', 66, 6, { ledger: null }),
	P(36, 'c20', '밸런스 식이섬유 젤리', '다이어트', 25000, '14포 / 2주분', 'grape', 'jelly', 'live', 88, 24),
	P(37, 'c21', '글로우 콜라겐 샷', '이너뷰티', 34000, '10병', 'straw', 'liquid', 'live', 102, 50),
	P(38, 'c21', '비타C 구미', '이너뷰티', 25000, '30구미 / 1개월', 'peach', 'gummy', 'live', 140, 37),
	P(39, 'c21', '세라마이드 젤리', '더마', 32000, '14포 / 2주분', 'teal', 'jelly', 'live', 79, 18)
];


/** 상품 목록 탭(§4-1) — 심사(신규 · 수정 · 반려) / 판매 중(판매 중 · 일시중지) / 판매 종료.
 *  탭 숫자는 이름 그대로의 건만 센다(반려 · 일시중지 상품은 목록 아래쪽에만 보인다) */
export type ProductTab = 'review' | 'live' | 'ended';
type Kind = 'new' | 'rev' | 'etc';

/** 상세 미리보기 한 칸 모양 — 레시피 노트(2) · 이야기(3 · 5) · 표(1 · 4 · 6) · 질문(7) · 빈 칸 */
type SecKind = 'note' | 'story' | 'rows' | 'faq' | 'empty';
const kindOf = (k: SecNo, has: boolean): SecKind => (!has ? 'empty' : k === 2 ? 'note' : k === 3 || k === 5 ? 'story' : k === 7 ? 'faq' : 'rows');
/** 바뀐 줄 표시 — 수정본 쪽만(지금 샵과 같은 자리 줄이 다르면) */
const marked = (arr: SecItem[], old?: SecItem[]) => arr.map((it, n) => ({ ...it, changed: !!old && (!old[n] || old[n].h !== it.h || old[n].t !== it.t) }));

class ProductsServer {
	raw = $state<ProductRaw[]>(seedProducts());
	/** 심사 중 의견(상품마다 · 섹션마다 하나 · 화면을 오가도 남는다) */
	ops = $state<Record<string, ProductOpinion[]>>({});
	/** 지금 고른 의견(따로 고르지 않았으면 마지막 의견) */
	opSel = $state<Record<string, number | null>>({});

	private find(id: string) {
		return this.raw.find((p) => p.id === id) ?? null;
	}
	private creator(id: string) {
		const c = CREATORS.get(id)!;
		// 연락처 원문은 [보기] 때만 쓴다(기능 단계에서 열람 API · 기록)
		return { name: c.name, handle: c.handle, phone: c.phoneMasked, phoneRaw: c.phoneMasked.replace('****', '2048'), initial: c.initial, avatarBg: c.avatarBg, channel: '인스타그램' };
	}
	private patch(id: string, f: (p: ProductRaw) => Partial<ProductRaw>, text: string) {
		this.raw = this.raw.map((p) => (p.id === id ? { ...p, ...f(p), log: [...p.log, { at: stamp(), text, who: me() }] } : p));
	}
	private openRev = (p: ProductRaw) => !!p.rev && approved(p.status);
	private waiting = (p: ProductRaw) => p.status === 'review' || this.openRev(p);
	private dayText = (p: ProductRaw) => (p.days ? `${p.days}일 전 ${STATUS_DAYS[p.status]}` : `오늘 ${STATUS_DAYS[p.status]}`);
	private clearOps(id: string) {
		this.ops = { ...this.ops, [id]: [] };
		this.opSel = { ...this.opSel, [id]: null };
	}

	// ───────── 판정 · 건수(홈 · 메뉴 배지와 같은 값) ─────────

	get counts() {
		const v = this.raw;
		return {
			newReview: v.filter((p) => p.status === 'review').length,
			revReview: v.filter(this.openRev).length,
			live: v.filter((p) => p.status === 'live').length,
			/** 제조 원장이 없는 판매 중 · 일시중지 상품 — 이대로면 다음 정산에서 보류(§10-1) */
			noLedger: v.filter((p) => approved(p.status) && !p.ledger).length
		};
	}

	get summary() {
		const c = this.counts;
		return { reviewN: c.newReview + c.revReview, liveN: c.live };
	}

	/** 상품 메뉴 안 화면 고르기(상품 | 공구 링크 · 2026-11-27 — 공구 링크 메뉴를 상품으로 합침) · 상품 배지 = 심사 대기(메뉴 배지와 같은 값) */
	subs(): { key: string; label: string; href: string; n?: number }[] {
		return [
			{ key: 'products', label: '상품', href: '/products', n: this.summary.reviewN },
			{ key: 'groupbuys', label: '공구 링크', href: '/products/groupbuys' }
		];
	}

	tabs() {
		const v = this.raw;
		return [
			{ id: 'review' as const, name: '심사', count: v.filter(this.waiting).length },
			{ id: 'live' as const, name: '판매 중', count: v.filter((p) => p.status === 'live').length },
			{ id: 'ended' as const, name: '판매 종료', count: v.filter((p) => p.status === 'ended').length }
		];
	}

	/** 목록(§4-1) — 표 한 줄: 상품코드 · 상품(크리에이터) · 카테고리 · 용량 · 가격 · 재고 · 상태(칩 + 처리 시점).
	 *  심사 탭은 기다리는 건 먼저(오래 기다린 순) · 반려는 아래, 판매 중 탭은 일시중지가 아래 */
	list(tab: ProductTab) {
		const inTab: Record<ProductTab, (p: ProductRaw) => boolean> = {
			review: (p) => this.waiting(p) || rejected(p.status),
			live: (p) => approved(p.status),
			ended: (p) => p.status === 'ended'
		};
		let v = this.raw.filter(inTab[tab]);
		if (tab === 'review') {
			const w = (p: ProductRaw) => (p.status === 'review' ? p.days : this.openRev(p) ? p.rev!.days : -1);
			v = [...v].sort((a, b) => Number(this.waiting(b)) - Number(this.waiting(a)) || w(b) - w(a));
		}
		if (tab === 'live') v = [...v].sort((a, b) => Number(a.status === 'paused') - Number(b.status === 'paused'));
		const rows = v.map((p) => {
			const c = this.creator(p.creatorId);
			const kind: Kind = tab !== 'review' ? 'etc' : p.status === 'review' ? 'new' : this.openRev(p) ? 'rev' : 'etc';
			const chips: Chip[] = [kind === 'new' ? { label: '신규 심사', tone: 'orange' } : kind === 'rev' ? { label: '수정 심사', tone: 'orange' } : STATUS_CHIP[p.status]];
			/** 공구 칩(시안) — 판매 중 상품에 진행 중인 공구가 있으면 상태 칩 바로 뒤 "공구 중 15%"(공구 서버 값) */
			const gb = p.status === 'live' && kind === 'etc' ? groupbuys.chipOf(p.id) : null;
			if (gb) chips.push(gb);
			if (this.openRev(p) && kind !== 'rev') chips.push({ label: '수정 심사 중', tone: 'orange' });
			if (p.status === 'live' && soldOut(p)) chips.push({ label: '품절', tone: 'red' });
			const meta =
				kind === 'new'
					? `${p.days ? `심사 ${p.days}일째` : '오늘 요청'} · ${p.submittedAt} 제출`
					: kind === 'rev'
						? `${p.rev!.days ? `요청 ${p.rev!.days}일째` : '오늘 요청'} · ${p.rev!.at}`
						: this.dayText(p);
			return {
				id: p.id,
				code: p.code,
				name: p.name,
				tile: p.tile,
				icon: p.icon,
				creator: `${c.name} ${c.handle}`,
				cat: `${p.category} · ${p.unit}`,
				priceText: won(p.price),
				stockText: p.stock === null ? '—' : `${p.stock.toLocaleString('ko-KR')}개`,
				/** 재고 숫자 색 — 아직 없음(흐리게) · 품절(빨강) */
				stockTone: (p.stock === null ? 'dim' : soldOut(p) ? 'red' : 'plain') as 'dim' | 'red' | 'plain',
				chips,
				meta,
				href: kind === 'rev' ? `/products/${p.id}/revision` : `/products/${p.id}`
			};
		});
		return { rows, empty: { review: '심사를 기다리는 상품이 없어요', live: '판매 중인 상품이 없어요', ended: '판매 종료한 상품이 없어요' }[tab] };
	}

	/** 크리에이터 상세(§5-3) 상품 표 — 상품명 · 상태 칩 · 가격 · 재고 · 상품 상세 링크(삭제 · 임시저장 제외 없이 전부) */
	byCreator(creatorId: string) {
		const v = this.raw.filter((p) => p.creatorId === creatorId);
		return {
			live: v.filter((p) => p.status === 'live').length,
			total: v.length,
			rows: v.map((p) => ({
				id: p.id,
				name: p.name,
				chip: STATUS_CHIP[p.status],
				priceText: won(p.price),
				stockText: p.stock === null ? '—' : `${p.stock.toLocaleString('ko-KR')}개`,
				href: `/products/${p.id}`
			}))
		};
	}

	// ───────── 상품 관리(§4-4) ─────────

	/** 상품 관리 — 왼쪽 상품 정보 · 수정 심사 안내 · 제조금액 원장 · 보낸 의견 · 처리 이력 / 오른쪽 상태 · 버튼 */
	view(id: string) {
		const p = this.find(id);
		if (!p) return null;
		const c = this.creator(p.creatorId);
		const headChips: Chip[] = [STATUS_CHIP[p.status]];
		if (this.openRev(p)) headChips.push({ label: '수정 심사 중', tone: 'orange' });
		const l = p.ledger ? ledSum(p.ledger) : null;
		return {
			id: p.id,
			status: p.status,
			name: p.name,
			tile: p.tile,
			icon: p.icon,
			headChips,
			sub: `${p.category} · ${won(p.price)}`,
			/** 모바일 머리 한 줄 — 크리에이터 · 채널(시안 "MYR Admin" · 상태 카드 대신) */
			subMobile: `${c.name} ${c.handle} · ${c.channel}`,
			info: [
				{ k: '상품코드', v: p.code, red: false },
				{ k: '카테고리', v: p.category, red: false },
				{ k: '가격', v: won(p.price), red: false },
				{ k: '용량', v: p.unit, red: false },
				{ k: '재고', v: p.stock === null ? '—' : soldOut(p) ? '품절 · 0개' : `${p.stock.toLocaleString('ko-KR')}개`, red: soldOut(p) },
				{ k: '최근 처리', v: this.dayText(p), red: false }
			],
			/** 이벗 상품코드 줄(판매 중 · 일시중지 · 종료) — 재고 조회용 · 주문은 상품코드로 나간다 */
			ebut:
				approved(p.status) || p.status === 'ended'
					? {
							code: p.ebutCode ?? null,
							canEdit: approved(p.status),
							orderCode: p.code,
							/** 입력 · 수정 창 안내 — 재고가 바뀐다는 것 */
							info: p.ebutCode
								? `이벗 상품코드를 바꾸면 재고도 새 코드의 이벗 재고로 바뀌어요 · 주문은 상품코드(${p.code})로 보내요`
								: `등록하면 지금 넣어 둔 재고 대신 이벗 연동 재고로 바뀌어요 · 주문은 상품코드(${p.code})로 보내요`
						}
					: null,
			revNote: this.openRev(p) ? `수정 심사 중이에요 · ${p.rev!.at} 요청 · 승인 전까지 샵은 지금 내용으로 판매돼요` : null,
			/** 판매 종료 상품은 원장이 있을 때만 보여 주고, 없어도 제조금액 입력을 받지 않는다 */
			showLedger: approved(p.status) || (p.status === 'ended' && !!l),
			ledger: l
				? { chips: [l.stateChip, l.depChip], rows: [['제조금액 합', won(l.total)], ['보증금 (25%)', won(l.deposit)], ['남은 제조금액', won(l.remain)]] as [string, string][], pct: l.pct, barText: `${l.pct}% 상계`, href: `/settle/ledger/${p.id}` }
				: null,
			noLedgerNote: '제조금액 원장이 없어요 · 정산일 전에 제조금액을 입력하지 않으면 정산이 보류돼요',
			sent: rejected(p.status) ? (p.sent ?? []).map(([k, t]) => ({ h: k ? `${k} ${SEC_NAME[k]}` : '전체', t })) : [],
			log: p.log,
			/** 공구 링크 칸(지금 공구 · 링크 주소 · 지난 공구) — 공구를 만든 적 없으면 null */
			creator: c,
			sideNote: p.status === 'ended' ? '판매 종료한 상품은 읽기 전용이에요' : rejected(p.status) ? '크리에이터가 고쳐서 다시 요청하면 신규 심사에 올라와요' : p.status === 'draft' ? '크리에이터가 아직 심사를 요청하지 않은 임시저장이에요' : null,
			/** 오른쪽 패널 버튼(§4-4) — 서버가 정한다 */
			can: { pause: p.status === 'live', resume: p.status === 'paused', stock: approved(p.status), end: approved(p.status) },
			/** [재고 수정] 비활성 이유 — 이벗 상품코드가 있으면 재고는 이벗에서 가져온다 */
			stockLock: p.ebutCode ? '이벗 상품코드가 등록돼 있어서 재고는 이벗에서 가져와요' : null,
			pauseNote: '일시중지하면 샵에서 바로 내려가요 · [다시 판매]로 언제든 다시 올릴 수 있어요',
			endNote: '되돌릴 수 없어요, 다시 팔려면 새 상품으로 등록해야 해요',
			stock: p.stock
		};
	}

	// ───────── 심사(§4-2 신규 · §4-3 수정) ─────────

	/** 심사 화면 공통 — 머리 · 검수 정보 줄 · 미리보기 칸 머리(태그 · [의견 달기]) */
	private reviewBase(p: ProductRaw) {
		const c = this.creator(p.creatorId);
		const ops = this.ops[p.id] ?? [];
		const photos = (p.photos?.length ? p.photos : [[p.tile, p.icon] as [string, string]]).map(([tile, icon], n) => ({ tile, icon, main: n === 0, label: `사진 ${n + 1}` }));
		return {
			id: p.id,
			name: p.name,
			code: p.code,
			tile: p.tile,
			icon: p.icon,
			cat: p.category,
			unit: p.unit,
			priceText: won(p.price),
			creator: `${c.name} ${c.handle}`,
			cr: { name: c.name, handle: c.handle, initial: c.initial, bg: c.avatarBg },
			phone: { masked: c.phone, raw: c.phoneRaw },
			tags: [p.category, ...p.unit.split(' / ')].filter(Boolean),
			photos,
			photoNote: `사진 ${photos.length}장 · 첫 번째가 대표 사진이에요 · 샵에서는 옆으로 넘겨서 봐요`,
			noteTitle: `${c.name}의 레시피 노트`,
			/** 칸 머리 — 의견이 있으면 주황 테두리 · [의견 고치기] */
			box: (k: SecNo) => {
				const on = ops.some((o) => o.sec === k);
				return { k, tag: k === 1 ? '01 기본 정보 · 구매 패널' : secLabel(k), on, opLabel: on ? '의견 고치기' : '의견 달기' };
			}
		};
	}

	/** 신규 심사 — 샵 상세에 보이는 모양 그대로(구매 패널 → 레시피 노트 → 01~05) */
	review(id: string) {
		const p = this.find(id);
		if (!p || p.status !== 'review') return null;
		const b = this.reviewBase(p);
		return {
			...b,
			at: p.submittedAt ?? '—',
			shopName: `${b.cr.name}의 샵`,
			basic: b.box(1),
			secs: (p.content ?? []).map(([k, arr]) => ({ ...b.box(k), kind: kindOf(k, arr.length > 0), head: shopHead(k), ing: k === 4, items: marked(arr) }))
		};
	}

	/** 수정 심사 — 바뀐 섹션만 [지금 샵 / 수정본]을 위아래로 · 바뀐 줄 표시 · 안 바뀐 섹션은 한 줄 */
	revision(id: string) {
		const p = this.find(id);
		if (!p || !this.openRev(p)) return null;
		const b = this.reviewBase(p);
		const rev = p.rev!;
		const BASIC_KEYS = ['상품명', '한 줄 소개', '가격'];
		const side = (k: SecNo, arr: ReturnType<typeof marked>, on: boolean) => {
			const get = (h: string) => arr.find((it) => it.h === h);
			const list = k === 1 ? arr.filter((it) => !BASIC_KEYS.includes(it.h)) : arr;
			return {
				label: on ? '수정본' : '지금 샵',
				on,
				basic: k === 1,
				kind: k === 1 ? (list.length ? 'rows' : null) : kindOf(k, list.length > 0),
				head: k === 1 ? '그 밖의 기본 정보' : shopHead(k),
				ing: k === 4,
				items: list,
				bName: get('상품명') ?? { t: p.name, changed: false },
				bIntro: get('한 줄 소개') ?? null,
				bPrice: get('가격') ?? { t: won(p.price), changed: false }
			};
		};
		const ks: SecNo[] = [1, 2, 3, 4, 5, 6, 7];
		return {
			...b,
			at: rev.at,
			revSum: `바뀐 섹션 ${rev.diff.length}개 · 그대로 ${7 - rev.diff.length}개`,
			secs: ks.map((k) => {
				const df = rev.diff.find(([x]) => x === k);
				if (!df) return { k, same: true as const, label: secLabel(k) };
				return { ...b.box(k), same: false as const, sides: [side(k, marked(df[1]), false), side(k, marked(df[2], df[1]), true)] };
			})
		};
	}

	// ───────── 의견 — 섹션마다 하나 · [의견 달기]가 이미 있으면 그 의견을 고른다 ─────────

	opsOf(id: string) {
		const ops = this.ops[id] ?? [];
		const sel = ops.length ? Math.min(ops.length - 1, Math.max(0, this.opSel[id] ?? ops.length - 1)) : -1;
		return {
			list: ops.map((o, n) => ({
				sec: o.sec,
				secLabel: secLabel(o.sec),
				text: o.text,
				preview: o.text.trim() || '아직 적지 않았어요',
				blank: !o.text.trim(),
				count: `${o.text.length}/${OP_LEN}`,
				rows: Math.min(9, Math.max(3, o.text.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 24)), 0))),
				on: n === sel
			})),
			countText: `${ops.length}개`,
			valid: ops.filter((o) => o.text.trim()).length,
			/** 의견이 하나라도 있으면 승인 · 반영 승인은 잠긴다 */
			locked: ops.length > 0,
			quick: QUICK,
			canQuick: sel >= 0,
			quickHint: sel < 0 ? '[의견 달기]를 먼저 눌러 주세요' : '누르면 지금 고른 의견에 덧붙여요'
		};
	}
	addOp(id: string, sec: SecNo) {
		const ops = this.ops[id] ?? [];
		const at = ops.findIndex((o) => o.sec === sec);
		if (at >= 0) return void (this.opSel = { ...this.opSel, [id]: at });
		this.ops = { ...this.ops, [id]: [...ops, { sec, text: '' }] };
		this.opSel = { ...this.opSel, [id]: ops.length };
	}
	pickOp(id: string, n: number) {
		this.opSel = { ...this.opSel, [id]: n };
	}
	setOpText(id: string, n: number, text: string) {
		this.ops = { ...this.ops, [id]: (this.ops[id] ?? []).map((o, j) => (j === n ? { ...o, text: text.slice(0, OP_LEN) } : o)) };
		this.opSel = { ...this.opSel, [id]: n };
	}
	delOp(id: string, n: number) {
		const ops = this.ops[id] ?? [];
		this.ops = { ...this.ops, [id]: ops.filter((_, j) => j !== n) };
		this.opSel = { ...this.opSel, [id]: Math.max(0, Math.min(n, ops.length - 2)) };
	}
	/** 자주 쓰는 의견 — 지금 고른 의견 글 뒤에만 덧붙인다(의견이 없으면 아무 일도 하지 않는다) · 넘치면 안내 문구 */
	quickAdd(id: string, text: string): string | null {
		const ops = this.ops[id] ?? [];
		const sel = ops.length ? Math.min(ops.length - 1, Math.max(0, this.opSel[id] ?? ops.length - 1)) : -1;
		if (sel < 0) return null;
		const cur = ops[sel].text.replace(/\s+$/, '');
		const next = (cur ? `${cur}\n` : '') + text;
		if (next.length > OP_LEN) return `의견 하나는 ${OP_LEN}자까지예요 · 새 의견으로 나눠 주세요`;
		this.setOpText(id, sel, next);
		return null;
	}
	private takeOps(id: string): [SecNo, string][] {
		const v = (this.ops[id] ?? []).filter((o) => o.text.trim()).map((o) => [o.sec, o.text.trim()] as [SecNo, string]);
		this.clearOps(id);
		return v;
	}

	// ───────── 제조금액 원장 ─────────

	/** 제조 원장 상세(§10-1 · 상품 관리 [원장 열기]) — 요약 4칸 + 상계 막대 · 제조 차수 표 · 상계 이력(최근 회차부터) · 오른쪽 원장 정보 · 버튼 */
	ledger(id: string) {
		const p = this.find(id);
		if (!p || !p.ledger) return null;
		const c = this.creator(p.creatorId);
		const l = ledSum(p.ledger);
		let left = l.total;
		const offsets = p.ledger.offsets.map((o) => {
			left = Math.max(0, left - o.amount);
			return { month: o.month, text: '정산금에서 상계', amountText: won(o.amount), afterText: won(left) };
		});
		return {
			id: p.id,
			name: p.name,
			tile: p.tile,
			icon: p.icon,
			creator: c,
			statusChip: STATUS_CHIP[p.status],
			chips: [l.stateChip, l.depChip],
			stats: [
				{ k: '제조금액 합', v: won(l.total), hot: false },
				{ k: '상계한 금액', v: won(l.repaid), hot: false },
				{ k: '남은 제조금액', v: won(l.remain), hot: l.remain > 0 },
				{ k: '보증금 (25%)', v: won(l.deposit), hot: false }
			],
			pct: l.pct,
			barText: `${l.pct}% 상계 · ${l.remain ? '상환 중' : '상환 완료'}`,
			rounds: p.ledger.rounds.map((r) => ({
				n: `${r.n}차`,
				// 입금 확인일 — 무효 차수는 기다리지 않으니 "—", 아직이면 "확인 전"(빨강)
				deposit: r.depositAt ? { label: r.depositAt, wait: false } : r.void ? { label: '—', wait: false } : { label: '확인 전', wait: true },
				refund: (r.void ? { label: '무효', tone: 'dim' } : !r.depositAt ? { label: '—', tone: 'dim' } : r.refunded ? { label: '환급 완료', tone: 'plain' } : { label: '보관 중', tone: 'grey' }) as { label: string; tone: 'dim' | 'plain' | 'grey' },
				memo: `${r.memo || '메모 없음'} · ${r.by.replace('운영 ', '')}`,
				amountText: won(r.amount),
				depositText: won(depositOf(r.amount)),
				void: r.void,
				// 줄의 [정정] — 무효된 차수는 없음 · 보증금을 돌려준 차수는 막는다(0087 myr_mfg_fix REFUNDED)
				fix: r.void ? null : r.refunded ? { ok: false, why: '보증금을 돌려준 차수는 정정할 수 없어요' } : { ok: true, why: '' }
			})),
			offsets: offsets.reverse(),
			offsetsEmpty: '아직 상계한 금액이 없어요 · 첫 정산에서 상계가 시작돼요',
			note: '제조금액은 매달 정산금에서 상계해요 · 다 갚으면 보증금을 그 정산에서 돌려줘요',
			// 오른쪽 패널 버튼 — [제조 차수 추가] · [금액 정정](고칠 수 있는 차수가 하나라도 있을 때)
			can: { fix: p.ledger.rounds.some((r) => !r.void && !r.refunded) }
		};
	}

	// ───────── 입력 확인 · 동작(RPC 자리) — 거절은 문구로 돌려준다 ─────────

	/** 재고 입력 — 0 이상 정수 · 0 이면 품절 안내(§4-2 승인 · §4-4 재고 수정) */
	private stockOf(input: string): { ok: boolean; n: number; msg: string | null } {
		const t = input.replace(/[,\s]/g, '');
		if (!t) return { ok: false, n: 0, msg: null };
		if (!/^\d+$/.test(t)) return { ok: false, n: 0, msg: '재고는 0 이상의 숫자로 적어 주세요' };
		const n = Number(t);
		if (n > 99999) return { ok: false, n, msg: '재고는 99,999개까지 적을 수 있어요' };
		return { ok: true, n, msg: null };
	}
	/** 제조금액 입력 — 숫자만 · ₩10,000 이상 */
	private amountOf(input: string): { ok: boolean; n: number; msg: string | null } {
		const t = input.replace(/[,\s₩]/g, '');
		if (!t) return { ok: false, n: 0, msg: '제조금액을 적어 주세요' };
		if (!/^\d+$/.test(t)) return { ok: false, n: 0, msg: '제조금액은 숫자로 적어 주세요' };
		const n = Number(t);
		if (n < MFG_MIN) return { ok: false, n, msg: `제조금액이 너무 작아요 — ${won(MFG_MIN)} 이상으로 적어 주세요` };
		return { ok: true, n, msg: null };
	}
	/** 제조금액 칸 안내 — 적으면 보증금(25%)을 보여 준다 */
	private amountHint(input: string) {
		const a = this.amountOf(input);
		return a.ok ? `보증금 (25%) ${won(depositOf(a.n))} · 크리에이터에게 입금 안내가 가요` : '보증금은 제조금액의 25%로 자동 계산해요';
	}

	/** 승인 모달 안내 — 처음 재고 · 제조금액(§4-2 · 승인하면 원장이 함께 만들어진다) */
	/** 이벗 상품코드 입력 형식 — 영문 · 숫자 · - · _ · 40자(화면도 보지만 최종 판정은 서버) */
	private ebutOf(input: string): { ok: boolean; code: string; msg: string | null } {
		const code = input.trim();
		if (!code) return { ok: false, code, msg: null };
		if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) return { ok: false, code, msg: '이벗 상품코드는 영문 · 숫자 · - · _ 로 40자까지 적어 주세요' };
		return { ok: true, code, msg: null };
	}

	/** 승인 모달 안내 — 이벗 상품코드(있으면 재고는 이벗에서) · 없으면 처음 재고 직접 · 제조금액(§4-2 · 승인하면 원장이 함께 만들어진다).
	 *  needStock = 이벗 상품코드를 비웠을 때만 처음 재고 칸을 보여 준다 */
	approveHints(stockIn: string, amountIn: string, ebutIn: string) {
		const e = this.ebutOf(ebutIn);
		const s = this.stockOf(stockIn);
		const zero = s.ok && s.n === 0;
		return {
			ebut: e.code ? '승인하면 재고를 이벗에서 가져와요(5분마다) · 처음 재고는 넣지 않아요' : '비워 둘 시 아래에 임의로 재고를 직접 넣어요',
			needStock: !e.code,
			stock: zero ? '재고 0으로 승인하면 샵에서 품절로 보여요' : '상품 관리 상세페이지에서 이벗 상품코드를 등록하면 이벗 연동 재고로 바뀌어요',
			stockRed: zero,
			amount: this.amountHint(amountIn)
		};
	}
	approve(id: string, stockIn: string, amountIn: string, ebutIn = ''): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || p.status !== 'review') return { ok: false, msg: '상품 상태가 바뀌었어요 · 목록에서 다시 열어 주세요' };
		const e = this.ebutOf(ebutIn);
		if (e.code && !e.ok) return { ok: false, msg: e.msg! };
		const s = this.stockOf(stockIn);
		if (!e.code && !s.ok) return { ok: false, msg: s.msg ?? '처음 재고를 적거나 이벗 상품코드를 넣어 주세요' };
		const a = this.amountOf(amountIn);
		if (!a.ok) return { ok: false, msg: a.msg! };
		this.clearOps(id);
		const ledger = { rounds: [rd(1, a.n, null, false, '', me())], offsets: [] };
		if (e.code) {
			// 재고는 이벗에서 가져온다(목은 이벗 재고가 없어 비워 둔다 · 기능 단계에서 판매 가능 재고 함수)
			this.patch(id, () => ({ status: 'live', ebutCode: e.code, stock: null, days: 0, submittedAt: null, ledger }), `승인 · 이벗 상품코드 ${e.code} · 제조금액 ${won(a.n)}`);
			return { ok: true, msg: '승인했어요 · 재고는 이벗에서 가져오고 제조금액 원장을 만들었어요' };
		}
		this.patch(id, () => ({ status: 'live', stock: s.n, days: 0, submittedAt: null, ledger }), `승인 · 재고 ${s.n}개 · 제조금액 ${won(a.n)}`);
		return { ok: true, msg: '승인했어요 · 샵에 올라갔고 제조금액 원장을 만들었어요' };
	}

	/** 제조금액 입력(원장이 없는 판매 중 상품 · §10-1) — 1차를 만든다 */
	ledgerHint(amountIn: string) {
		return this.amountHint(amountIn);
	}
	addLedger(id: string, amountIn: string, memo: string): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || !approved(p.status)) return { ok: false, msg: '상품 상태가 바뀌었어요 · 목록에서 다시 열어 주세요' };
		if (p.ledger) return { ok: false, msg: '이미 원장이 있어요 · 원장에서 제조 차수를 추가해 주세요' };
		const a = this.amountOf(amountIn);
		if (!a.ok) return { ok: false, msg: a.msg! };
		this.patch(id, () => ({ ledger: { rounds: [rd(1, a.n, null, false, memo.trim(), me())], offsets: [] } }), `제조금액 입력 · 1차 ${won(a.n)}`);
		return { ok: true, msg: `1차 제조금액 ${won(a.n)}을 더했어요 · 보증금 ${won(depositOf(a.n))} 입금을 기다려요` };
	}

	reject(id: string): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || p.status !== 'review') return { ok: false, msg: '상품 상태가 바뀌었어요 · 목록에서 다시 열어 주세요' };
		if (!this.opsOf(id).valid) return { ok: false, msg: '의견을 1개 이상 적어 주세요' };
		const sent = this.takeOps(id);
		this.patch(id, () => ({ status: 'rejected', sent, days: 0, submittedAt: null, rejects: [...p.rejects, `${TODAY_LABEL} 반려 · 의견 ${sent.length}개`] }), `반려 · 의견 ${sent.length}개`);
		return { ok: true, msg: `반려했어요 · 의견 ${sent.length}개를 크리에이터에게 보냈어요` };
	}

	applyRevision(id: string): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || !this.openRev(p)) return { ok: false, msg: '상품 상태가 바뀌었어요 · 수정본이 이미 정리됐어요' };
		if ((this.ops[id] ?? []).length) return { ok: false, msg: '의견이 있어서 반영 승인은 잠겨 있어요' };
		this.clearOps(id);
		this.patch(id, () => ({ rev: null }), '수정 반영 승인');
		return { ok: true, msg: '수정본을 샵에 반영했어요' };
	}

	rejectRevision(id: string): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || !this.openRev(p)) return { ok: false, msg: '상품 상태가 바뀌었어요 · 수정본이 이미 정리됐어요' };
		if (!this.opsOf(id).valid) return { ok: false, msg: '의견을 1개 이상 적어 주세요' };
		const sent = this.takeOps(id);
		this.patch(id, () => ({ rev: null }), `수정 반려 · 의견 ${sent.length}개`);
		return { ok: true, msg: '수정본을 반려했어요 · 샵은 지금 내용 그대로예요' };
	}

	pause(id: string) {
		this.patch(id, () => ({ status: 'paused', days: 0 }), '일시중지');
		return '일시중지했어요';
	}
	resume(id: string) {
		this.patch(id, () => ({ status: 'live', days: 0 }), '다시 판매');
		return '다시 판매를 시작했어요';
	}
	/** 이벗 상품코드 저장 — 입력 형식(영문 · 숫자 · - · _ · 40자)은 화면도 보지만 최종 판정은 서버. 재고 조회에만 쓴다 */
	setEbutCode(id: string, input: string): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || !approved(p.status)) return { ok: false, msg: '상품 상태가 바뀌었어요 · 목록에서 다시 열어 주세요' };
		const e = this.ebutOf(input);
		if (!e.code) return { ok: false, msg: '이벗 상품코드를 적어 주세요' };
		if (!e.ok) return { ok: false, msg: e.msg! };
		const code = e.code;
		if (code === p.ebutCode) return { ok: false, msg: '바뀐 내용이 없어요' };
		this.patch(id, () => ({ ebutCode: code }), p.ebutCode ? `이벗 상품코드 ${p.ebutCode} → ${code}` : `이벗 상품코드 입력 · ${code}`);
		return { ok: true, msg: '이벗 상품코드를 저장했어요' };
	}

	/** 재고 수정 모달 안내 */
	stockHint(input: string) {
		const s = this.stockOf(input);
		const zero = s.ok && s.n === 0;
		return { text: zero ? '0으로 저장하면 샵에서 품절로 보여요' : '저장하면 샵에 바로 반영돼요', red: zero };
	}
	setStock(id: string, input: string): { ok: boolean; msg: string } {
		const p = this.find(id);
		if (!p || !approved(p.status)) return { ok: false, msg: '상품 상태가 바뀌었어요 · 목록에서 다시 열어 주세요' };
		if (p.ebutCode) return { ok: false, msg: '이벗 상품코드가 등록된 상품은 재고를 이벗에서 가져와요' };
		const s = this.stockOf(input);
		if (!s.ok) return { ok: false, msg: s.msg ?? '재고를 적어 주세요' };
		this.patch(id, () => ({ stock: s.n }), `재고 ${p.stock ?? 0}개 → ${s.n}개`);
		return { ok: true, msg: `재고를 ${s.n}개로 바꿨어요` };
	}
	end(id: string) {
		const p = this.find(id)!;
		const hadRev = this.openRev(p);
		this.clearOps(id);
		this.patch(id, () => ({ status: 'ended', rev: null, days: 0 }), hadRev ? '판매 종료 · 열려 있던 수정본 취소' : '판매 종료');
		return '판매를 종료했어요 · 샵에서 내려갔어요';
	}
}

export const products = new ProductsServer();
export type ProductView = NonNullable<ReturnType<ProductsServer['view']>>;
export type ReviewView = NonNullable<ReturnType<ProductsServer['review']>>;
export type RevisionView = NonNullable<ReturnType<ProductsServer['revision']>>;
export type { LogEntry };
