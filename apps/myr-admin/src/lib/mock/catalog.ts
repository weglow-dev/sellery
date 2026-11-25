/** 운영 화면(주문 · CS · 공구 · 정산 · 톡)이 같이 보는 크리에이터 · 상품 요약 — 상품 목록은 상품 화면(design/myr-admin-products · lib/mock/products.svelte.ts seedProducts)과 같은 39개.
 *  상품 화면이 합쳐지면 이 표는 seedProducts() 로 바꾼다(id · 이름 · 크리에이터 · 타일 · 그림 · 가격 · 상태가 같다). 크리에이터는 seed.ts 와 같은 21명 */
import { seedCreators } from './seed';
import type { CreatorRaw } from './types';

export type CatalogStatus = 'draft' | 'review' | 'live' | 'paused' | 'rejected' | 'ended';
export interface CatalogProduct {
	id: string;
	code: string;
	creatorId: string;
	name: string;
	category: string;
	price: number;
	unit: string;
	/** 사진 자리 — ProductThumb 의 tile · icon */
	tile: string;
	icon: string;
	status: CatalogStatus;
	stock: number | null;
	/** 상태 바뀐 뒤 지난 날 */
	days: number;
}

const P = (n: number, creatorId: string, name: string, category: string, price: number, unit: string, tile: string, icon: string, status: CatalogStatus, stock: number | null, days: number): CatalogProduct => ({
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
	days
});

export const PRODUCTS: CatalogProduct[] = [
	P(1, 'c1', '포도 글루타치온 젤리', '이너뷰티', 32000, '14포 / 2주분', 'grape', 'jelly', 'live', 184, 45),
	P(2, 'c1', '레몬 콜라겐 스틱', '이너뷰티', 36000, '14포 / 2주분', 'lemon', 'stick', 'live', 96, 15),
	P(3, 'c1', '히알루론 젤리', '이너뷰티', 34000, '14포 / 2주분', 'straw', 'jelly', 'live', 220, 9),
	P(4, 'c1', '모닝 루틴 티', '멘탈 웰니스', 22000, '20티백', 'plum', 'stick', 'draft', null, 2),
	P(5, 'c2', '히알루론 필름', '이너뷰티', 28000, '30매 / 1개월', 'peach', 'film', 'live', 58, 61),
	P(6, 'c2', '굿나잇 구미', '멘탈 웰니스', 26000, '30구미 / 1개월', 'plum', 'gummy', 'live', 132, 40),
	P(7, 'c3', '단백질 쉐이크 바닐라', '다이어트', 39000, '10포', 'slate', 'powder', 'live', 7, 74),
	P(8, 'c3', 'BCAA 스틱', '스포츠', 33000, '10포', 'navy', 'stick', 'paused', 23, 11),
	P(9, 'c4', '비오틴 캡슐', '헤어', 24000, '60캡슐 / 2개월', 'lemon', 'pill', 'live', 0, 52),
	P(10, 'c4', '세라마이드 앰플', '더마', 34000, '30ml', 'teal', 'liquid', 'live', 41, 48),
	P(11, 'c4', '클렌즈 티', '다이어트', 24000, '20티백', 'teal', 'stick', 'rejected', null, 12),
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
	P(22, 'c9', '요가 전해질 워터', '스포츠', 18000, '10포', 'teal', 'liquid', 'ended', 0, 28),
	P(23, 'c10', '단호박 쿠키 단백질', '다이어트', 30000, '10개입', 'peach', 'powder', 'live', 150, 40),
	P(24, 'c11', '그린 클렌즈 주스 파우더', '다이어트', 32000, '14포 / 2주분', 'teal', 'powder', 'live', 88, 38),
	P(25, 'c11', '케일 스무디', '다이어트', 32000, '14포 / 2주분', 'teal', 'powder', 'live', 67, 19),
	P(26, 'c12', '보리 녹차 스틱', '다이어트', 22000, '20포', 'teal', 'stick', 'live', 96, 36),
	P(27, 'c13', '어성초 진정 필름', '더마', 28000, '30매 / 1개월', 'teal', 'film', 'live', 59, 33),
	P(28, 'c13', '시카 진정 젤리', '더마', 29000, '14포 / 2주분', 'teal', 'jelly', 'review', null, 1),
	P(29, 'c14', '러너 전해질 스틱', '스포츠', 24000, '14포', 'lemon', 'stick', 'live', 130, 34),
	P(30, 'c15', '산책 후 단백질 바', '다이어트', 26000, '6개입', 'peach', 'powder', 'live', 118, 29),
	P(31, 'c15', '아르기닌 젤리', '스포츠', 31000, '14포 / 2주분', 'grape', 'jelly', 'live', 72, 22),
	P(32, 'c16', '코어 콜라겐 워터', '이너뷰티', 28000, '10병', 'navy', 'liquid', 'live', 40, 31),
	P(33, 'c17', '데일리 비타민 구미', '이너뷰티', 25000, '30구미 / 1개월', 'lemon', 'gummy', 'live', 155, 27),
	P(34, 'c18', '홈카페 디카페인 스틱', '멘탈 웰니스', 23000, '20포', 'slate', 'stick', 'review', null, 3),
	P(35, 'c19', '가든 허브 젤리', '멘탈 웰니스', 27000, '14포 / 2주분', 'plum', 'jelly', 'live', 66, 6),
	P(36, 'c20', '밸런스 식이섬유 젤리', '다이어트', 25000, '14포 / 2주분', 'grape', 'jelly', 'live', 88, 24),
	P(37, 'c21', '글로우 콜라겐 샷', '이너뷰티', 34000, '10병', 'straw', 'liquid', 'live', 102, 50),
	P(38, 'c21', '비타C 구미', '이너뷰티', 25000, '30구미 / 1개월', 'peach', 'gummy', 'live', 140, 37),
	P(39, 'c21', '세라마이드 젤리', '더마', 32000, '14포 / 2주분', 'teal', 'jelly', 'live', 79, 18)
];

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
export const productOf = (id: string): CatalogProduct => BY_ID.get(id)!;

/** 크리에이터 요약 — 이름 · 핸들 · 아바타 · 연락처(가림 + 원문 · 원문은 열람 기록이 남는다 · UI 단계라 원문은 가린 값으로 만든 가짜) */
export interface CreatorBrief {
	id: string;
	name: string;
	handle: string;
	initial: string;
	avatarBg: string;
	phoneMasked: string;
	phone: string;
	/** 사업자 · 정산 정보(없으면 null) — 원문 열람은 기록이 남는다 */
	biz: CreatorRaw['biz'];
	active: boolean;
}
const CREATORS = new Map(
	seedCreators().map((c, i) => [
		c.id,
		{
			id: c.id,
			name: c.name,
			handle: c.handle,
			initial: c.initial,
			avatarBg: c.avatarBg,
			phoneMasked: c.phoneMasked,
			phone: `010-${String(2100 + i * 173).slice(-4)}-${c.phoneMasked.slice(-4)}`,
			biz: c.biz,
			active: c.active
		} satisfies CreatorBrief
	])
);
export const creatorOf = (id: string): CreatorBrief => CREATORS.get(id)!;
export const creatorList = (): CreatorBrief[] => [...CREATORS.values()];
