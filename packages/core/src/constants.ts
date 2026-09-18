/* ============ 정책 상수 (js/00-core.js · js/02-state.js) ============ */
import type { Grade, Status } from './types';

/* ---- 상태 머신 ---- */
export const ST: Record<Status, { l: string; c: string; turn?: 'brand' | 'seller' }> = {
	SAMPLE_REQUESTED: { l: '샘플 요청', c: 'blue', turn: 'brand' },
	INVITED: { l: '브랜드 제안 · 수락 대기', c: 'blue', turn: 'seller' },
	DECLINED: { l: '제안 거절', c: 'gray' },
	REJECTED: { l: '거절됨', c: 'red' },
	SAMPLE_APPROVED: { l: '샘플 발송 대기', c: 'blue', turn: 'brand' },
	SAMPLE_PURCHASED: { l: '샘플 구매 · 발송 대기', c: 'blue', turn: 'brand' },
	SAMPLE_SHIPPED: { l: '샘플 배송중', c: 'blue', turn: 'seller' },
	TESTING: { l: '테스트 중', c: 'amber', turn: 'seller' },
	PASSED: { l: '인플루언서 패스', c: 'gray' },
	SCHEDULE_PROPOSED: { l: '일정 승인 대기', c: 'amber', turn: 'brand' },
	SCHEDULE_CONFIRMED: { l: '일정 확정', c: 'green' },
	LIVE: { l: '판매 진행중', c: 'live' },
	CLEARING: { l: '교환·환불 기간', c: 'amber' },
	SETTLED: { l: '정산 완료', c: 'green' }
};
export const FLOW: Status[] = ['SAMPLE_REQUESTED', 'SAMPLE_APPROVED', 'SAMPLE_SHIPPED', 'TESTING', 'SCHEDULE_PROPOSED', 'SCHEDULE_CONFIRMED', 'LIVE', 'CLEARING', 'SETTLED'];
export const FLOW_L = ['샘플요청', '샘플승인', '배송', '테스트', '일정제안', '일정확정', '판매 LIVE', '환불기간', '정산'];
export const DONE_STATES: Status[] = ['LIVE', 'CLEARING', 'SETTLED'];
export const ACTIVE_BLOCKERS: Status[] = ['REJECTED', 'PASSED', 'DECLINED', 'SETTLED']; // 같은 상품 재요청 가능 상태

/* ---- 수수료·정산 ---- */
export const PG_RATE = 0.019, PLAT_RATE = 0.10, WHT = 0.033, CLEAR_DAYS = 21;
export const BREF_RATE = 0.01, BREF_DISC = 0.01, BREF_TIMES = 3;
export const REF_RATE = 0.02, REF_BOOST = 0.01, REF_TIMES = 5;
export const TEST_DAYS = 14;

/* ---- 저장 키 ---- */
export const LS = 'sellery-proto-v30';
export const LINKCTX_KEY = 'slry-linkctx', CUST_KEY = 'sellery-cust', CART_KEY = 'sellery-cart', SESSION_KEY = 'sellery-session';

/* ---- 셀러리(🥬) 포인트 경제 ---- */
export const CELERY_PER = 5000000; // 확정 매출 ₩500만당 1🥬
export const SAMPLE_CEL_WON = 20000; // 1🥬 = ₩20,000
export const OPEX_DEF: Record<string, number> = { server: 30000, db: 35000, cs: 50000, domain: 15000, misc: 30000, pgFixed: 0, kakaoPer: 15, claudePerCrawl: 120, claudePerMatch: 300 };
export const DATA_PRICE: Record<Grade, number> = { 스타터: 1, 브론즈: 1, 실버: 2, 골드: 2, 플래티넘: 3, 다이아: 4, 블랙: 5 };
export const BG_DISC: Partial<Record<Grade, number>> = { 블랙: 0.02, 다이아: 0.015, 플래티넘: 0.01, 골드: 0.005 };
export const DEMO_REAL_ONLY = false;
export const TOPUP = [{ n: 5, won: 100000 }, { n: 10, won: 190000 }, { n: 30, won: 540000 }];

export interface ShopItem { id: string; name: string; price: number | string; desc: string; auto?: boolean; days?: number; repeat?: boolean }
export const SHOP: { seller: ShopItem[]; brand: ShopItem[] } = {
	seller: [
		{ id: 'samplepay', name: '샘플 구매 셀러리 결제', price: '1 = ₩20,000', desc: '무상 기준 등급 미달·상품당 1회 소진·이달 한도 소진 시 샘플을 구매합니다(판매가 − 내 수수료, 또는 브랜드 지정가). 결제 시 셀러리를 1🥬=₩20,000으로 사용, 부족분은 현금 — 구매 화면에서 자동 안내', auto: true },
		{ id: 'datapass', name: '매출 데이터 확인권', price: 2, desc: '상품별 익명 판매 실적(팔로워·참여율·매출) 전체 열람 — 1회 구매로 계정에 영구 적용' },
		{ id: 'featured', name: '프로필 상단 노출 (7일)', price: 3, desc: '브랜드 인플루언서 갤러리 추천 카드 최상단 고정 + 추천 뱃지' },
		{ id: 'homefeature', name: '고객 홈 상단 노출 (7일)', price: 3, desc: 'sellery.co.kr 고객 홈 "진행 중인 판매" 최상단에 내 진행 중·예정 판매 고정 + 추천 뱃지' },
		{ id: 'regongu', name: '재판매 우선권 (30일)', price: 2, desc: '같은 상품 재판매 시 일정 제안이 브랜드 승인 없이 즉시 확정 (겹치는 기간 제외)' }
	],
	brand: [
		{ id: 'diamond', name: '다이아↑ 인플루언서 제안권', price: 10, desc: '다이아·블랙 등급 인플루언서에게 판매 제안 1회 — 제안 시 자동 차감', auto: true },
		{ id: 'ref', name: '익명 레퍼런스 열람권', price: '1–5', desc: '비공개 인플루언서의 상세 지표 열람 후 바로 제안 — 등급별 가격 (스타터·브론즈 1 / 실버·골드 2 / 플래티넘 3 / 다이아 4 / 블랙 5), 스카우트·홈 TOP5에서 자동 사용', auto: true },
		{ id: 'sdata', name: '인플루언서 데이터 확인', price: '1–5', desc: '갤러리에서 인플루언서 1명의 매출·판매당 평균·참여율·이력·외부 판매 예상 열람 — 등급별 가격 (스타터·브론즈 1 / 실버·골드 2 / 플래티넘 3 / 다이아 4 / 블랙 5), 카드에서 자동 사용. 함께 판매한 인플루언서는 무료', auto: true },
		{ id: 'datapass', name: '인플루언서 데이터 패스 (30일)', price: 30, desc: '30일간 갤러리 전체 인플루언서 데이터 무제한 열람 — 만료 후 재구매', days: 30 },
		{ id: 'boost', name: '상품 상단 부스트 (7일)', price: 3, desc: '내 대표 상품을 인플루언서 상품 갤러리 최상단에 고정 + 부스트 뱃지' },
		{ id: 'homefeature', name: '고객 홈 상단 노출 (7일)', price: 5, desc: 'sellery.co.kr 고객 홈 "진행 중인 판매" 최상단에 내 상품의 진행 중·예정 판매 고정 + 추천 뱃지' },
		{ id: 'fastreview', name: '우선 검수권', price: 1, desc: '검수 대기 상품을 즉시 노출 승인' }
	]
};

/* ---- 등급 ---- */
export interface Tier { g: Grade; min: number; bonus: number; pct: number; perk: string }
export const GRADES: Tier[] = [
	{ g: '블랙', min: 100000000, bonus: 3, pct: 1, perk: '수수료 +3%p · 샘플 월 5회 · 전담 매니저 · 판매 기간 우선권 · 독점권 우선 협상' },
	{ g: '다이아', min: 50000000, bonus: 2, pct: 3, perk: '수수료 +2%p · 샘플 월 5회 · 독점권 신청 · 판매 기간 우선권 · 스카우트 최상단' },
	{ g: '플래티넘', min: 30000000, bonus: 1.5, pct: 8, perk: '수수료 +1.5%p · 샘플 월 5회 · 신상품 우선 제안권 · 판매 기간 우선권' },
	{ g: '골드', min: 15000000, bonus: 1, pct: 18, perk: '수수료 +1%p · 샘플 월 2회' },
	{ g: '실버', min: 8000000, bonus: 0.5, pct: 35, perk: '수수료 +0.5%p · 샘플 월 2회' },
	{ g: '브론즈', min: 3000000, bonus: 0.3, pct: 60, perk: '수수료 +0.3%p · 샘플 월 1회' },
	{ g: '스타터', min: 0, bonus: 0, pct: 100, perk: '기본 수수료율 · 샘플 월 1회' }
];
export interface BTier { g: Grade; min: number; pct: number; perk: string }
export const BGRADES: BTier[] = [
	{ g: '블랙', min: 1000000000, pct: 1, perk: '플랫폼 수수료 −2%p · 전담 파트너 매니저 · 기획전 최상단' },
	{ g: '다이아', min: 500000000, pct: 3, perk: '수수료 −1.5%p · 스카우트 열람권 월 5회 무료' },
	{ g: '플래티넘', min: 200000000, pct: 8, perk: '수수료 −1%p · 상위 인플루언서 우선 매칭' },
	{ g: '골드', min: 80000000, pct: 18, perk: '수수료 −0.5%p · 카탈로그 상단 노출' },
	{ g: '실버', min: 30000000, pct: 35, perk: '상품 검수 우선 처리' },
	{ g: '브론즈', min: 10000000, pct: 60, perk: '인증 브랜드 뱃지' },
	{ g: '스타터', min: 0, pct: 100, perk: '기본 조건' }
];
/** 기간 우선권 등급 — 이 등급 이상이 확정한 기간에는 이 등급 이상만 진입 */
export const PRIORITY_TIER: Grade = '플래티넘';

/* ---- 카테고리 (건강·웰니스 전용) ---- */
export const CATS = ['전체', '다이어트·체형', '이너뷰티·피부', '비타민·영양', '눈·뇌 건강', '장·소화', '활력·수면', '웰니스 푸드'];
export const CAT_INFO: Record<string, { en: string; desc: string; ex: string }> = {
	'다이어트·체형': { en: 'Body', desc: '체지방·탄수화물 컷·식욕 조절', ex: '가르시니아, 시서스, 프로틴 쉐이크' },
	'이너뷰티·피부': { en: 'Inner Beauty', desc: '먹는 피부 관리와 더마 스킨케어', ex: '콜라겐, 글루타치온, 히알루론산, 세라마이드' },
	'비타민·영양': { en: 'Nutrition', desc: '매일 채우는 기본 영양', ex: '멀티비타민, 오메가3, 마그네슘, 비타민D' },
	'눈·뇌 건강': { en: 'Eye & Brain', desc: '눈 피로·집중력·기억력', ex: '루테인, 아스타잔틴, 포스파티딜세린' },
	'장·소화': { en: 'Gut', desc: '장 건강과 소화 편안함', ex: '프로바이오틱스, 식이섬유, 소화효소' },
	'활력·수면': { en: 'Energy & Sleep', desc: '피로 회복과 편안한 밤', ex: '홍삼, 테아닌, 마그네슘, 밀크씨슬' },
	'웰니스 푸드': { en: 'Wellness Food', desc: '건강한 식습관을 위한 식품', ex: '저당 간식, 곤약, 단백질 식품, 건강차' }
};
export const CAT_POLICY = '셀러리는 건강·웰니스 상품만 다룹니다 — 건강기능식품·이너뷰티·더마 스킨케어·웰니스 푸드. 색조 화장품, 가전, 패션·잡화는 등록되지 않으며, 인플루언서도 건강·웰니스 판매 레퍼런스가 있는 채널만 활동합니다.';
export const CATMAP: Record<string, string[]> = { 건강기능식품: ['다이어트·체형', '비타민·영양', '눈·뇌 건강', '장·소화', '활력·수면', '웰니스 푸드'], 이너뷰티: ['이너뷰티·피부'] };
export const CAT_TRENDS = [
	{ cat: '눈·뇌 건강', g: '+112%', note: '3040 눈 건강 관심 급상승' },
	{ cat: '다이어트·체형', g: '+64%', note: '여름 시즌 · 검색량 급증' },
	{ cat: '이너뷰티·피부', g: '+38%', note: '콜라겐 숏폼 바이럴' }
];

/* ---- 기타 표시용 ---- */
export const PLAT_NAMES: Record<string, string> = { instagram: '인스타그램', youtube: '유튜브', naver: '네이버 블로그', tiktok: '틱톡' };
export const SEMOJI: Record<string, string> = { s1: '💄', s2: '🛋️', s3: '🏃‍♀️', s6: '💪', s7: '🌸', s8: '🥗' };
export const CS_TYPES = ['배송 문의', '교환·반품', '상품 문의', '기타'];
export const COURIERS = ['CJ대한통운', '우체국택배', '한진택배', '롯데택배', '로젠택배'];
export const BANKS = ['선택', '국민', '신한', '우리', '하나', '농협', '카카오뱅크', '토스뱅크', '기업', 'SC제일'];
export const BUYER_NAMES = ['김*은', '이*아', '박*희', '최*진', '정*수', '한*별', '윤*서', '장*미', '오*랑', '신*혜'];

/* ---- 고객 카카오 로그인 ---- */
export const KAKAO_JS_KEY = ''; // 실서비스: 카카오 개발자 콘솔 JavaScript 키. 비어 있으면 데모 계정 선택 창
export const KAKAO_DEMO = [
	{ id: 'k1', name: '김서연', email: 'seoyeon@kakao.demo' },
	{ id: 'k2', name: '박지훈', email: 'jihoon@kakao.demo' },
	{ id: 'k3', name: '이하은', email: 'haeun@kakao.demo' }
];
