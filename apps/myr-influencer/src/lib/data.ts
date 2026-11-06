/** 콘솔 데이터 모양 + 목 데이터 — 디자인(Claude Design "MYR Influencer Admin")의 seedProducts 를 그대로 옮겼다(교환 · 환불 목 seedCs 는 7번 · 0078 에서 서버로 바뀌어 지웠다).
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

/* ---------- 내 제품 · 상품 등록 ---------- */

/** live 판매 중 · paused 일시중지 · review 심사 중(운영팀 검수 대기) · rejected 반려 · draft 임시저장 · ended 판매 종료
 *  DB(0071 myr_products.status)와의 대응은 lib/product-row.ts STATUS_FROM_DB */
export type ProductStatus = 'live' | 'paused' | 'review' | 'rejected' | 'draft' | 'ended';

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
	/** 6단계 제품 정보 — 제형/포장("액상 / 스틱포") · 유통기한 · 보관. 내용량은 1단계 unit 과 같은 값 · 제조는 고정(INFO_MAKER) */
	formPack: string;
	shelfLife: string;
	storageMethod: string;
	faq: Faq[];
	/** DB 상품의 원래 비주얼(그라데이션 · 아이콘) — 운영팀이 넣은 상품은 콘솔 색 6개 밖의 값일 수 있다. 크리에이터가 색(tile)을 바꾸지 않았으면 이 값을 그대로 저장한다(product-draft draftVisual) */
	keepVisual?: { key: TileKey; tile: string | null; icon: string };
};

export type Product = {
	id: string;
	name: string;
	price: number;
	stock: number;
	status: ProductStatus;
	tile: TileKey;
	thumbUrl?: string | null;
	/** DB 상품의 비주얼 — 타일 배경(CSS gradient) · 제형 아이콘 id. 있으면 tile 키 대신 이 값으로 그린다(샵과 같은 그림) */
	bg?: string | null;
	iconId?: string;
	/** 샵 주소 /p/<code> */
	code?: string;
	rejectReason?: string | null;
	/** 판매 중 상품의 수정 심사(0074 · 4-2) — review 면 "수정 심사 중" 칩 + meta("수정 심사 1일차") · rejected 면 "수정 반려" 칩 + 사유. 샵은 승인 전까지 지금 내용 */
	revision?: { state: 'review' | 'rejected'; meta: string } | null;
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

/** 제품 정보 표(에디터 6단계 · 샵 "04 · 제품 정보") — 제조만 고정, 나머지는 크리에이터 입력(2026-11-05 대표 결정) */
export const INFO_MAKER = 'MYR 파트너 제조시설';
export const INFO_PH = { formPack: '액상 / 스틱포', unit: '14포 / 2주분', shelfLife: '제조일로부터 24개월', storageMethod: '직사광선을 피해 서늘한 곳' } as const;
