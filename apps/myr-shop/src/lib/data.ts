/** 샵의 상품 모델 · 카테고리 · 표시 헬퍼 + 목 데이터(키 없는 로컬 · CI 폴백).
 *  실데이터는 `lib/server/db.ts` 가 0056 `myr_home_products` · `myr_product_card` 응답을 이 타입으로 바꾼다.
 *  상세페이지 섹션(`Detail`)은 인플루언서가 상품 등록 때 채우는 템플릿이다(디자인 "MYR Shop PC" 2026-10-29). */

export type Cat = { id: string; name: string; ic: string };
export type Creator = { id: string; name: string; handle: string; avatarUrl: string | null };
export type Spec = { ic: string; k: string; v: string };
export type Point = { big: string; t: string; d: string };
export type IngredientRow = { name: string; why: string; amount: string };
export type Step = { t: string; d: string };
export type Faq = { q: string; a: string };
export type Detail = {
	storyTitle: string;
	story: string;
	points: Point[];
	ingredientRows: IngredientRow[];
	howtoTitle: string;
	howtoSteps: Step[];
	faq: Faq[];
};
export type Product = {
	id: string;
	/** 상품 페이지 경로 `/p/<code>` = myr_products.code */
	code: string;
	cat: string;
	creator: Creator;
	name: string;
	sub: string;
	price: number;
	unit: string;
	/** 타일 배경(그라데이션) — 실제 제품 사진(thumbUrl)이 없을 때 */
	tile: string;
	thumbUrl: string | null;
	ic: string;
	form: string;
	pack: string;
	flavor: string;
	tag: 'BEST' | 'NEW' | '';
	chips: string[];
	ingredients: string[];
	note: string;
	howto: string;
	specs: Spec[];
	soldOut: boolean;
} & Detail;

export const CATS: Cat[] = [
	{ id: 'all', name: '전체', ic: 'grid' },
	{ id: 'diet', name: '다이어트', ic: 'diet' },
	{ id: 'inner', name: '이너뷰티', ic: 'inner' },
	{ id: 'derma', name: '더마', ic: 'derma' },
	{ id: 'hair', name: '헤어 & 바디', ic: 'hair' },
	{ id: 'mental', name: '멘탈 웰니스', ic: 'mental' },
	{ id: 'mens', name: '맨즈 웰니스', ic: 'mens' }
];

/** 크리에이터 아바타 — 사진이 없으면 이니셜 + 핸들 해시로 고른 배경색. 디자인의 네 명은 디자인 색 그대로 */
const AVATAR_BG = ['#FFB088', '#C4B5FD', '#86EFAC', '#FDE68A', '#7DA8FF', '#F9A8D4', '#99F6E4'];
const DESIGN_BG: Record<string, string> = { 'minji.routine': '#FFB088', 'haru.well': '#C4B5FD', 'jun.fit': '#86EFAC', 'soy.clean': '#FDE68A' };
export const handleSlug = (handle: string): string => handle.replace(/^@+/, '').toLowerCase();
export function creatorStyle(c: Creator): { bg: string; initial: string } {
	const slug = handleSlug(c.handle);
	let h = 0;
	for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return { bg: DESIGN_BG[slug] ?? AVATAR_BG[h % AVATAR_BG.length], initial: (c.name.trim()[0] ?? 'M').toUpperCase() };
}

/** 04 제품 정보 표 — 공통 항목(제조·유통기한·보관)은 서버 정책이라 상품 입력이 아니다 */
export const infoRowsOf = (p: Product): { k: string; v: string }[] => [
	{ k: '제품명', v: p.name },
	{ k: '제형 / 포장', v: `${p.form} / ${p.pack}` },
	{ k: '내용량', v: p.unit },
	{ k: '제조', v: 'MYR 파트너 제조시설 (식약처 인증)' },
	{ k: '유통기한', v: '제조일로부터 24개월' },
	{ k: '보관', v: '직사광선을 피해 서늘한 곳' }
];

/** 상세 섹션 앵커 칩 */
export const DETAIL_ANCHORS = [
	{ id: 'note', name: '레시피 노트' },
	{ id: 'why', name: '왜 만들었나요' },
	{ id: 'ingredients', name: '성분' },
	{ id: 'howto', name: '섭취법' },
	{ id: 'info', name: '제품 정보' },
	{ id: 'faq', name: 'FAQ' }
];

/** 정책 숫자 — 실서비스에서는 서버 규칙(docs/myr.md §6.2 · §9-11). 디자인 Tweaks 의 freeShipping 기본값 */
export const FREE_SHIPPING = 50000;
export const SHIPPING_FEE = 3000;
/** 한 줄 최대 수량 (디자인 9 · 실서비스 체크아웃 가드 1..10 과 맞춘다) */
export const MAX_QTY = 9;

export const catName = (id: string): string => CATS.find((c) => c.id === id)?.name ?? '전체';
export const won = (n: number): string => '₩' + n.toLocaleString('ko-KR');

/** 목록에서 크리에이터만 모아 상품 수와 함께 — 홈 "지금 뜨는 브랜드" */
export function creatorsOf(products: Product[]): (Creator & { count: number })[] {
	const map = new Map<string, Creator & { count: number }>();
	for (const p of products) {
		const c = map.get(p.creator.id) ?? { ...p.creator, count: 0 };
		c.count++;
		map.set(p.creator.id, c);
	}
	return [...map.values()];
}

/** 같은 카테고리 또는 같은 크리에이터 · 최대 4 — 목 폴백용(실데이터는 RPC 가 `related` 로 준다) */
export const relatedOf = (p: Product, all: Product[]): Product[] =>
	all.filter((x) => x.id !== p.id && (x.cat === p.cat || x.creator.id === p.creator.id)).slice(0, 4);

// ---------------------------------------------------------------------------------------------
// 목 데이터 — 키 없는 로컬·CI 폴백. 실데이터 시드는 packages/db/scripts/myr-products.seed.json (같은 내용).
// ---------------------------------------------------------------------------------------------
const MOCK_CREATORS: Record<string, Creator> = {
	c1: { id: 'c1', name: '민지 루틴', handle: '@minji.routine', avatarUrl: null },
	c2: { id: 'c2', name: '하루 웰', handle: '@haru.well', avatarUrl: null },
	c3: { id: 'c3', name: '준 피트', handle: '@jun.fit', avatarUrl: null },
	c4: { id: 'c4', name: '소이 클린', handle: '@soy.clean', avatarUrl: null }
};
const T = {
	grape: 'linear-gradient(145deg,#5b3cc4,#2a1a5e)',
	peach: 'linear-gradient(145deg,#ff9a62,#8a3d1a)',
	lemon: 'linear-gradient(145deg,#e6c33a,#6b5a12)',
	teal: 'linear-gradient(145deg,#3fb8aa,#145048)',
	navy: 'linear-gradient(145deg,#4f7fe8,#1c2f6b)',
	plum: 'linear-gradient(145deg,#a05ac8,#3f1f57)',
	slate: 'linear-gradient(145deg,#6b7280,#262a33)'
};
type Base = Omit<Product, keyof Detail | 'creator' | 'thumbUrl' | 'soldOut'> & { creator: string };
const spec = (ic: string, k: string, v: string): Spec => ({ ic, k, v });
const pt = (big: string, t: string, d: string): Point => ({ big, t, d });
const ig = (name: string, why: string, amount: string): IngredientRow => ({ name, why, amount });
const st = (t: string, d: string): Step => ({ t, d });
const qa = (q: string, a: string): Faq => ({ q, a });

const BASE: Base[] = [
	{ id: 'p1', code: 'minji-grape-jelly', cat: 'diet', creator: 'c1', name: '민지의 포도 다이어트 젤리', sub: '가르시니아 · 하루 한 포', price: 32000, unit: '14포 / 2주분', tile: T.grape, ic: 'grape', form: '젤리', pack: '스틱포', flavor: '포도', tag: 'BEST', chips: ['젤리', '스틱포', '포도맛'], ingredients: ['가르시니아 HCA', '녹차추출물', '차전자피', '비타민B군'], note: '먹는 게 스트레스가 되면 안 되잖아요. 식사 대신이 아니라, 식사 뒤에 입가심처럼 먹는 포도젤리로 만들었어요.', howto: '하루 1포, 점심 식사 후 30분 안에 드세요. 차갑게 먹으면 더 맛있어요.', specs: [spec('clock', '섭취', '하루 1포'), spec('jelly', '제형', '스틱 젤리'), spec('box', '구성', '14포')] },
	{ id: 'p2', code: 'haru-collagen-film', cat: 'inner', creator: 'c2', name: '하루 콜라겐 필름', sub: '저분자 콜라겐 · 혀에 녹는', price: 28000, unit: '30매 / 1개월', tile: T.peach, ic: 'film', form: '필름', pack: '개별 포장', flavor: '복숭아', tag: 'NEW', chips: ['필름', '복숭아맛', '물 없이'], ingredients: ['저분자 피쉬콜라겐', '히알루론산', '비오틴', '비타민C'], note: '물 없이 어디서든. 지하철에서도, 촬영장에서도 혀에 올리면 끝나는 콜라겐을 원했어요.', howto: '하루 1매, 자기 전에 혀 위에 올려 녹여 드세요.', specs: [spec('clock', '섭취', '하루 1매'), spec('film', '제형', '구강용해 필름'), spec('box', '구성', '30매')] },
	{ id: 'p3', code: 'jun-protein-vanilla', cat: 'diet', creator: 'c3', name: '준의 프로틴 스틱 — 바닐라', sub: '단백질 20g · 물에 타는', price: 39000, unit: '10포', tile: T.slate, ic: 'powder', form: '분말', pack: '스틱포', flavor: '바닐라', tag: '', chips: ['분말', '스틱포', '20g 단백질'], ingredients: ['분리유청단백', 'BCAA', '식이섬유', '마그네슘'], note: '운동 끝나고 쉐이커 흔들기도 귀찮은 날. 생수병에 바로 털어 넣어도 안 뭉치게 입자를 잡았어요.', howto: '물 300ml에 1포를 넣고 10초만 흔들어 드세요. 운동 후 30분 이내 권장.', specs: [spec('clock', '섭취', '운동 후 1포'), spec('powder', '제형', '분말 스틱'), spec('box', '구성', '10포')] },
	{ id: 'p4', code: 'haru-goodnight-gummy', cat: 'mental', creator: 'c2', name: '하루 굿나잇 구미', sub: '테아닌 · 마그네슘', price: 26000, unit: '30구미 / 1개월', tile: T.plum, ic: 'gummy', form: '캔디', pack: '보틀', flavor: '포도', tag: '', chips: ['구미', '보틀', '포도맛'], ingredients: ['L-테아닌', '마그네슘', '감태추출물', '락티움'], note: '자기 전 핸드폰 대신 구미 하나. 달지 않게, 그렇지만 간식처럼 기다려지게 만들었어요.', howto: '취침 30분 전 1~2개를 씹어 드세요.', specs: [spec('clock', '섭취', '취침 전 1~2개'), spec('gummy', '제형', '구미'), spec('bottle', '구성', '30개 보틀')] },
	{ id: 'p5', code: 'soy-ceramide-ampoule', cat: 'derma', creator: 'c4', name: '소이 세라마이드 앰플', sub: '장벽 케어 · 저자극', price: 34000, unit: '30ml', tile: T.teal, ic: 'liquid', form: '액상', pack: '보틀', flavor: '', tag: 'BEST', chips: ['앰플', '30ml', '민감성'], ingredients: ['세라마이드 NP', '판테놀', '병풀추출물', '나이아신아마이드'], note: '성분표에 모르는 이름이 없게. 제가 매일 바르는 것 중 꼭 필요한 다섯 가지만 남겼어요.', howto: '세안 후 토너 다음 단계에서 2~3방울을 얼굴 전체에 펴 바르세요.', specs: [spec('clock', '사용', '아침 · 저녁'), spec('liquid', '제형', '앰플'), spec('bottle', '구성', '30ml')] },
	{ id: 'p6', code: 'soy-biotin-capsule', cat: 'hair', creator: 'c4', name: '소이 비오틴 캡슐', sub: '헤어 · 손톱 · 하루 1캡슐', price: 24000, unit: '60캡슐 / 2개월', tile: T.lemon, ic: 'pill', form: '알약', pack: 'PTP', flavor: '', tag: '', chips: ['캡슐', 'PTP', '2개월분'], ingredients: ['비오틴 5000㎍', '맥주효모', '케라틴', '아연'], note: '한 알로 끝내고 싶은 사람을 위한 가장 심플한 구성. 대신 함량은 타협 안 했어요.', howto: '하루 1캡슐을 물과 함께 드세요.', specs: [spec('clock', '섭취', '하루 1캡슐'), spec('pill', '제형', '하드캡슐'), spec('ptp', '구성', '60캡슐')] },
	{ id: 'p7', code: 'minji-glutathione-lemon', cat: 'inner', creator: 'c1', name: '민지 글루타치온 스틱 — 레몬', sub: '이너 글로우 · 짜먹는', price: 36000, unit: '14포 / 2주분', tile: T.lemon, ic: 'lemon', form: '액상', pack: '스틱포', flavor: '레몬', tag: 'NEW', chips: ['짜먹는', '스틱포', '레몬맛'], ingredients: ['글루타치온', '비타민C', '엘더베리', '히알루론산'], note: '아침 공복에 상큼하게. 쓴맛 때문에 못 먹던 글루타치온을 레몬청 느낌으로 바꿨어요.', howto: '아침 공복에 1포를 그대로 짜서 드세요.', specs: [spec('clock', '섭취', '아침 1포'), spec('stick', '제형', '액상 스틱'), spec('box', '구성', '14포')] },
	{ id: 'p8', code: 'jun-daily-multi-mens', cat: 'mens', creator: 'c3', name: '준 데일리 멀티 — 맨즈', sub: '아르기닌 · 아연 · 마카', price: 29000, unit: '30정 / 1개월', tile: T.navy, ic: 'pill', form: '알약', pack: '보틀', flavor: '', tag: '', chips: ['정제', '보틀', '1개월분'], ingredients: ['L-아르기닌', '아연', '마카', '비타민D'], note: '매일 챙겨야 할 걸 한 통으로. 출근길 가방에 넣고 다니기 좋게 작은 보틀로 만들었어요.', howto: '하루 1정을 아침 식사 후 드세요.', specs: [spec('clock', '섭취', '하루 1정'), spec('pill', '제형', '타정'), spec('bottle', '구성', '30정 보틀')] }
];

const DETAIL: Record<string, Detail> = {
	p1: {
		storyTitle: '다이어트 중에도 입은 즐거워야 하니까',
		story: '다이어트 콘텐츠를 5년 넘게 하면서 가장 많이 받은 질문이 "뭐 먹어요?"였어요. 참는 다이어트는 결국 요요로 돌아왔고, 저는 "식사 후 입가심" 하나를 바꾸는 걸로 습관을 만들었어요. 그 루틴을 그대로 제품으로 옮긴 게 이 젤리예요. 설탕 대신 알룰로스, 포도 향은 천연 농축과즙만 썼어요.',
		points: [pt('0g', '설탕', '알룰로스로 단맛만'), pt('14일', '루틴', '한 박스 = 2주 챌린지'), pt('9kcal', '한 포', '간식 죄책감 없이')],
		ingredientRows: [ig('가르시니아 HCA', '탄수화물이 지방으로 합성되는 걸 억제해요', '750mg'), ig('녹차추출물', '카테킨으로 체지방 감소를 도와요', '300mg'), ig('차전자피', '포만감을 오래 유지해줘요', '500mg'), ig('비타민B군', '에너지 대사에 필요해요', '1일 권장량 100%')],
		howtoTitle: '점심 후 30분, 한 포면 충분해요',
		howtoSteps: [st('식사 후 30분', '점심 식사를 마친 뒤 30분 안에 드세요.'), st('차갑게', '냉장 보관하면 포도 젤리 식감이 더 좋아요.'), st('14일 루틴', '하루 한 포, 2주를 채우면 습관이 돼요.')],
		faq: [qa('식사 대용인가요?', '아니요. 식사 뒤 입가심으로 드시는 보조 제품이에요. 끼니를 거르지 마세요.'), qa('임산부도 먹어도 되나요?', '가르시니아가 들어 있어 임신·수유 중에는 권하지 않아요.'), qa('하루 두 포 먹어도 되나요?', '1일 1포를 권장해요. 그 이상은 효과가 더 커지지 않아요.')]
	},
	p2: {
		storyTitle: '물 없이, 어디서든 끝나는 콜라겐',
		story: '촬영 다니면서 콜라겐 젤리나 앰플을 챙기는 게 생각보다 번거로웠어요. 가방에서 새고, 물이 필요하고. "혀에 올리면 끝"인 필름 제형을 알게 됐을 때 바로 이거다 싶었죠. 복숭아 향은 제가 가장 좋아하는 맛으로 골랐어요.',
		points: [pt('3초', '녹는 시간', '물 없이 혀 위에서'), pt('1,000mg', '저분자 콜라겐', '한 장에 가득'), pt('30매', '한 달', '얇은 케이스 하나')],
		ingredientRows: [ig('저분자 피쉬콜라겐', '흡수가 빠른 500Da 이하 분자', '1,000mg'), ig('히알루론산', '피부 수분 유지를 도와요', '120mg'), ig('비오틴', '피부·모발 건강 유지', '1일 권장량 100%'), ig('비타민C', '콜라겐 합성에 필요해요', '100mg')],
		howtoTitle: '자기 전, 혀 위에 한 장',
		howtoSteps: [st('한 장 꺼내기', '케이스에서 필름 한 장을 꺼내요.'), st('혀 위에', '혀 위에 올리면 3초 안에 녹아요.'), st('매일 밤', '자기 전 루틴으로 꾸준히 드세요.')],
		faq: [qa('맛이 쓰지 않나요?', '복숭아 향으로 쓴맛을 거의 느끼지 못해요.'), qa('언제 먹는 게 좋아요?', '피부 재생이 활발한 밤에 드시는 걸 권해요.'), qa('다른 콜라겐과 같이 먹어도 되나요?', '네, 함량이 과하지 않아 함께 드셔도 괜찮아요.')]
	}
};

/** 상세를 안 쓴 제품의 기본 템플릿 — 운영 스크립트 myr-products.mjs withDetail 과 같은 문구 */
export function genericDetail(p: { ingredients: string[]; howto: string }): Detail {
	const why = ['핵심 기능성 성분이에요', '흡수와 효과를 돕는 보조 성분이에요', '매일 필요한 기본 영양소예요', '안정성과 밸런스를 위해 넣었어요'];
	const role = ['주성분', '보조', '기본', '밸런스'];
	return {
		storyTitle: '매일 챙기기 쉬운 것만 남겼어요',
		story: '제가 직접 매일 먹고 바르는 것 중에서 꼭 필요한 것만 골랐어요. 성분은 단순하게, 함량은 타협 없이. 팔로워분들이 "이건 뭐예요?" 물어보던 질문에 제품으로 답한 거예요.',
		points: [pt('1일 1회', '루틴', '복잡하지 않게'), pt(`${p.ingredients.length}가지`, '핵심 성분', '필요한 것만'), pt('100%', '함량 공개', '숨기지 않아요')],
		ingredientRows: p.ingredients.map((n, i) => ig(n, why[i % 4], role[i % 4])),
		howtoTitle: '이렇게 드세요',
		howtoSteps: [st('하루 한 번', p.howto), st('꾸준히', '최소 4주 이상 루틴으로 이어가 주세요.'), st('보관', '직사광선을 피해 서늘한 곳에 보관하세요.')],
		faq: [qa('언제 먹는 게 좋아요?', p.howto), qa('다른 영양제와 같이 먹어도 되나요?', '네, 일반적인 영양제와 함께 드셔도 괜찮아요. 복용 중인 약이 있다면 전문가와 상의하세요.'), qa('환불·교환이 되나요?', '미개봉 제품은 수령 후 7일 이내 교환·환불이 가능해요.')]
	};
}

export const MOCK_PRODUCTS: Product[] = BASE.map((p) => ({
	...p,
	creator: MOCK_CREATORS[p.creator],
	thumbUrl: null,
	soldOut: false,
	...(DETAIL[p.id] ?? genericDetail(p))
}));
