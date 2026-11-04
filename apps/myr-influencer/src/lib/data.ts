/** 콘솔 데이터 모양 + 목 데이터 — 디자인(Claude Design "MYR Influencer Admin")의 seedCs · seedProducts 를 그대로 옮겼다.
 *  UI 단계라 서버가 없다. 인증·DB 를 붙이면 이 시드는 `myr_products` · `myr_cs_*` · `myr_orders` 조회로 바뀐다(docs/myr.md §3 · §4.2).
 *  $app · $env 를 import 하지 않는 순수 모듈 — vitest 가 읽는다. */

/** 제품 비주얼 타일 — 사진이 없을 때의 그라데이션 배경. 키마다 제형 아이콘이 정해져 있다(TILE_ICON) */
export type TileKey = 'grape' | 'lemon' | 'peach' | 'plum' | 'slate' | 'teal';

export const TILE_BG: Record<TileKey, string> = {
	grape: 'linear-gradient(145deg,#B9A6F2,#6E57C8)',
	lemon: 'linear-gradient(145deg,#FFF0A8,#E6C04A)',
	peach: 'linear-gradient(145deg,#FFD0B5,#F2905F)',
	slate: 'linear-gradient(145deg,#D6DAE3,#8A93A6)',
	plum: 'linear-gradient(145deg,#E3BDF5,#A86BD1)',
	teal: 'linear-gradient(145deg,#B4EDE3,#4FB8A8)'
};

export const TILE_ICON: Record<TileKey, string> = {
	grape: 'grape',
	lemon: 'lemon',
	peach: 'film',
	plum: 'gummy',
	slate: 'powder',
	teal: 'pill'
};

export const TILE_KEYS = Object.keys(TILE_BG) as TileKey[];

/** 로그인한 크리에이터 — `(console)/+layout.server.ts` 가 sellers 행에서 만들어 `page.data.me` 로 넘긴다.
 *  initial · avatarBg 는 샵 상품 카드와 같은 계산(`@sellery/myr-core/creator` creatorStyle) — 같은 사람이 두 앱에서 같은 모양 */
export type Me = { id: string; name: string; handle: string; avatarUrl: string | null; initial: string; avatarBg: string };

/* ---------- 교환 · 환불 CS ---------- */

export type CsType = 'refund' | 'exchange';
export type CsStatus = 'pending' | 'progress' | 'done' | 'rejected';
/** 처리 방법 — 환불 요청: refund · partial · reship(교환 전환) / 교환 요청: reship · reship_collect · refund(환불 전환). 반려는 reject */
export type Resolution = 'refund' | 'partial' | 'reship' | 'reship_collect' | 'reject';
export type CsReason = '단순 변심' | '파손 · 누액' | '오배송';
export type TimelineEntry = { title: string; when: string };

export type CsRequest = {
	id: string;
	no: string;
	type: CsType;
	status: CsStatus;
	product: string;
	tile: TileKey;
	qty: number;
	amount: number;
	customer: string;
	/** 마스킹된 연락처 */
	phone: string;
	reason: CsReason;
	message: string;
	/** 고객이 올린 사진(지금은 자리표시 라벨) */
	photos: string[];
	/** 요청이 들어온 시점 */
	ago: string;
	/** 고객이 제품을 받은 시점 */
	receivedAgo: string;
	orderNo: string;
	/** 답변 기한(일) — 1 = 오늘 */
	due: number;
	urgent: boolean;
	resolution?: Resolution;
	timeline?: TimelineEntry[];
};

export function seedCs(): CsRequest[] {
	return [
		{ id: 'cs1', no: 'CS-2410', type: 'refund', status: 'pending', product: '민지의 포도 다이어트 젤리', tile: 'grape', qty: 1, amount: 32000, customer: '김서연', phone: '010-****-2231', reason: '단순 변심', message: '맛은 좋은데 생각보다 양이 적게 느껴져서요. 미개봉 상태 그대로 있어요.', photos: ['사진 1'], ago: '20분 전', receivedAgo: '3일 전', orderNo: 'MYR-884120', due: 1, urgent: true },
		{ id: 'cs2', no: 'CS-2409', type: 'exchange', status: 'pending', product: '민지 글루타치온 스틱 — 레몬', tile: 'lemon', qty: 2, amount: 72000, customer: '박지훈', phone: '010-****-7710', reason: '파손 · 누액', message: '배송 박스가 눌려서 스틱 3개가 터져 있었어요. 사진 첨부합니다.', photos: ['사진 1', '사진 2'], ago: '2시간 전', receivedAgo: '어제', orderNo: 'MYR-884097', due: 2, urgent: true },
		{ id: 'cs3', no: 'CS-2407', type: 'refund', status: 'pending', product: '민지의 포도 다이어트 젤리', tile: 'grape', qty: 1, amount: 32000, customer: '이하늘', phone: '010-****-0912', reason: '오배송', message: '레몬 스틱을 주문했는데 포도 젤리가 왔어요.', photos: ['사진 1'], ago: '어제', receivedAgo: '2일 전', orderNo: 'MYR-883950', due: 3, urgent: false },
		{
			id: 'cs4', no: 'CS-2402', type: 'exchange', status: 'progress', product: '민지의 포도 다이어트 젤리', tile: 'grape', qty: 1, amount: 32000, customer: '최은우', phone: '010-****-3345', reason: '파손 · 누액', message: '한 포가 새어 있었어요.', photos: ['사진 1'], ago: '3일 전', receivedAgo: '5일 전', orderNo: 'MYR-883411', due: 0, urgent: false, resolution: 'reship',
			timeline: [
				{ title: '요청 접수', when: '3일 전' },
				{ title: '재발송 승인', when: '2일 전 · 민지 루틴' },
				{ title: '새 제품 출고', when: '어제 · 송장 6204-1182-33' },
				{ title: '고객 수령', when: '배송 중' }
			]
		},
		{
			id: 'cs5', no: 'CS-2391', type: 'refund', status: 'done', product: '민지 글루타치온 스틱 — 레몬', tile: 'lemon', qty: 1, amount: 36000, customer: '정다은', phone: '010-****-5560', reason: '단순 변심', message: '', photos: [], ago: '6일 전', receivedAgo: '8일 전', orderNo: 'MYR-882877', due: 0, urgent: false, resolution: 'refund',
			timeline: [
				{ title: '요청 접수', when: '6일 전' },
				{ title: '환불 승인', when: '5일 전 · 민지 루틴' },
				{ title: '회수 완료', when: '3일 전' },
				{ title: '환불 완료', when: '2일 전 · 카카오페이 ₩36,000' }
			]
		},
		{
			id: 'cs6', no: 'CS-2388', type: 'exchange', status: 'rejected', product: '민지의 포도 다이어트 젤리', tile: 'grape', qty: 1, amount: 32000, customer: '한지민', phone: '010-****-8821', reason: '단순 변심', message: '개봉 후 맛이 안 맞아서요.', photos: [], ago: '7일 전', receivedAgo: '20일 전', orderNo: 'MYR-882103', due: 0, urgent: false, resolution: 'reject',
			timeline: [
				{ title: '요청 접수', when: '7일 전' },
				{ title: '반려', when: '7일 전 · 수령 7일 경과, 개봉 제품' }
			]
		}
	];
}

/* ---------- 내 제품 · 상품 등록 ---------- */

/** live 판매 중 · review 심사 중(운영팀 검수 대기) · draft 임시저장 · ended 판매 종료 */
export type ProductStatus = 'live' | 'review' | 'draft' | 'ended';

export type Ingredient = { name: string; why: string; amount: string };
export type HowtoStep = { title: string; desc: string };
export type Faq = { q: string; a: string };

/** 상품 등록 에디터의 입력값 — 단계 1~7 이 이 객체 하나를 채운다. price 는 화면 표시용 콤마 문자열("36,000") */
export type ProductDraft = {
	images: string[];
	name: string;
	price: string;
	unit: string;
	cat: string | null;
	tile: TileKey;
	chips: string[];
	note: string;
	storyTitle: string;
	story: string;
	ingredients: Ingredient[];
	steps: HowtoStep[];
	info: string[];
	faq: Faq[];
};

export type Product = {
	id: string;
	name: string;
	price: number;
	stock: number;
	status: ProductStatus;
	tile: TileKey;
	thumbUrl?: string | null;
	sold: number;
	/** 상태 옆 보조 문구("2주 전 승인" · "심사 1일차") */
	meta: string;
	/** 임시저장 상품의 에디터 입력값 — 다시 열면 이어서 쓴다 */
	draft?: ProductDraft;
};

export function seedProducts(): Product[] {
	return [
		{ id: 'p1', name: '민지의 포도 다이어트 젤리', price: 32000, stock: 184, status: 'live', tile: 'grape', sold: 412, meta: '2주 전 승인' },
		{ id: 'p7', name: '민지 글루타치온 스틱 — 레몬', price: 36000, stock: 96, status: 'live', tile: 'lemon', sold: 231, meta: '5일 전 승인' },
		{ id: 'p9', name: '민지 굿나잇 구미', price: 27000, stock: 0, status: 'review', tile: 'plum', sold: 0, meta: '심사 1일차' },
		{ id: 'p10', name: '프로틴 스틱 (초안)', price: 0, stock: 0, status: 'draft', tile: 'slate', sold: 0, meta: '어제 저장' },
		{ id: 'p11', name: '민지 콜라겐 필름 (1차)', price: 28000, stock: 0, status: 'ended', tile: 'peach', sold: 1020, meta: '판매 종료' }
	];
}

/** 상품 카테고리 — 디자인 기본 3개. 인플루언서가 에디터에서 [+ 추가] 로 늘릴 수 있다(목 · 운영 정책은 docs/myr.md §9-5) */
export type Category = { id: string; name: string };
export const BASE_CATEGORIES: Category[] = [
	{ id: 'diet', name: '다이어트' },
	{ id: 'inner', name: '이너뷰티' },
	{ id: 'mental', name: '멘탈 웰니스' }
];

/** 제품 정보 표 — 라벨과 자리표시 (에디터 6단계) */
export const INFO_ROWS: { label: string; ph: string }[] = [
	{ label: '제형 / 포장', ph: '액상 / 스틱포' },
	{ label: '내용량', ph: '14포 / 2주분' },
	{ label: '제조', ph: 'MYR 파트너 제조시설' },
	{ label: '유통기한', ph: '제조일로부터 24개월' },
	{ label: '보관', ph: '직사광선을 피해 서늘한 곳' }
];

/** 홈 지표(목) — 주문 수 · CS 비율 · 최근 7일 판매 막대. 실적 RPC(myr_app_seller_sales)를 붙이면 바뀐다 */
export const MOCK_STATS = {
	monthOrders: 587,
	csRate: '1.2%',
	week: [12, 18, 9, 22, 27, 31, 19],
	weekDays: ['월', '화', '수', '목', '금', '토', '일']
};
