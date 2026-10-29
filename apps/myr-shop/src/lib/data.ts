/** 목 데이터 — 디자인(Claude Design "MYR Shop")의 제품 8개 · 크리에이터 4명 · 카테고리 6개 그대로.
 *  M4 에서 `myr_home_products` · `myr_product_card` RPC 응답으로 바뀐다(docs/myr.md §3). 필드 이름은 그때 맞춘다. */

export type Cat = { id: string; name: string; ic: string };
export type Creator = {
	id: string;
	name: string;
	handle: string;
	bg: string;
	initial: string;
};
export type Spec = { ic: string; k: string; v: string };
export type Product = {
	id: string;
	/** 상품 페이지 경로 `/p/<code>` — 실서비스의 myr_products.code 자리 */
	code: string;
	cat: string;
	creator: string;
	name: string;
	sub: string;
	price: number;
	unit: string;
	/** 타일 배경(그라데이션) — 실제 제품 사진이 생기면 thumb_url 로 교체 */
	tile: string;
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
};

export const CATS: Cat[] = [
	{ id: 'all', name: '전체', ic: 'grid' },
	{ id: 'diet', name: '다이어트', ic: 'diet' },
	{ id: 'inner', name: '이너뷰티', ic: 'inner' },
	{ id: 'derma', name: '더마', ic: 'derma' },
	{ id: 'hair', name: '헤어 & 바디', ic: 'hair' },
	{ id: 'mental', name: '멘탈 웰니스', ic: 'mental' },
	{ id: 'mens', name: '맨즈 웰니스', ic: 'mens' }
];

export const CREATORS: Creator[] = [
	{
		id: 'c1',
		name: '민지 루틴',
		handle: '@minji.routine',
		bg: '#FFB088',
		initial: 'M'
	},
	{
		id: 'c2',
		name: '하루 웰',
		handle: '@haru.well',
		bg: '#C4B5FD',
		initial: 'H'
	},
	{
		id: 'c3',
		name: '준 피트',
		handle: '@jun.fit',
		bg: '#86EFAC',
		initial: 'J'
	},
	{
		id: 'c4',
		name: '소이 클린',
		handle: '@soy.clean',
		bg: '#FDE68A',
		initial: 'S'
	}
];

const T = {
	grape: 'linear-gradient(145deg,#5b3cc4,#2a1a5e)',
	straw: 'linear-gradient(145deg,#e0405a,#6a1a2a)',
	peach: 'linear-gradient(145deg,#ff9a62,#8a3d1a)',
	lemon: 'linear-gradient(145deg,#e6c33a,#6b5a12)',
	teal: 'linear-gradient(145deg,#3fb8aa,#145048)',
	navy: 'linear-gradient(145deg,#4f7fe8,#1c2f6b)',
	plum: 'linear-gradient(145deg,#a05ac8,#3f1f57)',
	slate: 'linear-gradient(145deg,#6b7280,#262a33)'
};

const spec = (ic: string, k: string, v: string): Spec => ({ ic, k, v });

export const PRODUCTS: Product[] = [
	{
		id: 'p1',
		code: 'minji-grape-jelly',
		cat: 'diet',
		creator: 'c1',
		name: '민지의 포도 다이어트 젤리',
		sub: '가르시니아 · 하루 한 포',
		price: 32000,
		unit: '14포 / 2주분',
		tile: T.grape,
		ic: 'grape',
		form: '젤리',
		pack: '스틱포',
		flavor: '포도',
		tag: 'BEST',
		chips: ['젤리', '스틱포', '포도맛'],
		ingredients: ['가르시니아 HCA', '녹차추출물', '차전자피', '비타민B군'],
		note: '먹는 게 스트레스가 되면 안 되잖아요. 식사 대신이 아니라, 식사 뒤에 입가심처럼 먹는 포도젤리로 만들었어요.',
		howto: '하루 1포, 점심 식사 후 30분 안에 드세요. 차갑게 먹으면 더 맛있어요.',
		specs: [spec('clock', '섭취', '하루 1포'), spec('jelly', '제형', '스틱 젤리'), spec('box', '구성', '14포')]
	},
	{
		id: 'p2',
		code: 'haru-collagen-film',
		cat: 'inner',
		creator: 'c2',
		name: '하루 콜라겐 필름',
		sub: '저분자 콜라겐 · 혀에 녹는',
		price: 28000,
		unit: '30매 / 1개월',
		tile: T.peach,
		ic: 'film',
		form: '필름',
		pack: '개별 포장',
		flavor: '복숭아',
		tag: 'NEW',
		chips: ['필름', '복숭아맛', '물 없이'],
		ingredients: ['저분자 피쉬콜라겐', '히알루론산', '비오틴', '비타민C'],
		note: '물 없이 어디서든. 지하철에서도, 촬영장에서도 혀에 올리면 끝나는 콜라겐을 원했어요.',
		howto: '하루 1매, 자기 전에 혀 위에 올려 녹여 드세요.',
		specs: [spec('clock', '섭취', '하루 1매'), spec('film', '제형', '구강용해 필름'), spec('box', '구성', '30매')]
	},
	{
		id: 'p3',
		code: 'jun-protein-vanilla',
		cat: 'diet',
		creator: 'c3',
		name: '준의 프로틴 스틱 — 바닐라',
		sub: '단백질 20g · 물에 타는',
		price: 39000,
		unit: '10포',
		tile: T.slate,
		ic: 'powder',
		form: '분말',
		pack: '스틱포',
		flavor: '바닐라',
		tag: '',
		chips: ['분말', '스틱포', '20g 단백질'],
		ingredients: ['분리유청단백', 'BCAA', '식이섬유', '마그네슘'],
		note: '운동 끝나고 쉐이커 흔들기도 귀찮은 날. 생수병에 바로 털어 넣어도 안 뭉치게 입자를 잡았어요.',
		howto: '물 300ml에 1포를 넣고 10초만 흔들어 드세요. 운동 후 30분 이내 권장.',
		specs: [spec('clock', '섭취', '운동 후 1포'), spec('powder', '제형', '분말 스틱'), spec('box', '구성', '10포')]
	},
	{
		id: 'p4',
		code: 'haru-goodnight-gummy',
		cat: 'mental',
		creator: 'c2',
		name: '하루 굿나잇 구미',
		sub: '테아닌 · 마그네슘',
		price: 26000,
		unit: '30구미 / 1개월',
		tile: T.plum,
		ic: 'gummy',
		form: '캔디',
		pack: '보틀',
		flavor: '포도',
		tag: '',
		chips: ['구미', '보틀', '포도맛'],
		ingredients: ['L-테아닌', '마그네슘', '감태추출물', '락티움'],
		note: '자기 전 핸드폰 대신 구미 하나. 달지 않게, 그렇지만 간식처럼 기다려지게 만들었어요.',
		howto: '취침 30분 전 1~2개를 씹어 드세요.',
		specs: [spec('clock', '섭취', '취침 전 1~2개'), spec('gummy', '제형', '구미'), spec('bottle', '구성', '30개 보틀')]
	},
	{
		id: 'p5',
		code: 'soy-ceramide-ampoule',
		cat: 'derma',
		creator: 'c4',
		name: '소이 세라마이드 앰플',
		sub: '장벽 케어 · 저자극',
		price: 34000,
		unit: '30ml',
		tile: T.teal,
		ic: 'liquid',
		form: '액상',
		pack: '보틀',
		flavor: '',
		tag: 'BEST',
		chips: ['앰플', '30ml', '민감성'],
		ingredients: ['세라마이드 NP', '판테놀', '병풀추출물', '나이아신아마이드'],
		note: '성분표에 모르는 이름이 없게. 제가 매일 바르는 것 중 꼭 필요한 다섯 가지만 남겼어요.',
		howto: '세안 후 토너 다음 단계에서 2~3방울을 얼굴 전체에 펴 바르세요.',
		specs: [spec('clock', '사용', '아침 · 저녁'), spec('liquid', '제형', '앰플'), spec('bottle', '구성', '30ml')]
	},
	{
		id: 'p6',
		code: 'soy-biotin-capsule',
		cat: 'hair',
		creator: 'c4',
		name: '소이 비오틴 캡슐',
		sub: '헤어 · 손톱 · 하루 1캡슐',
		price: 24000,
		unit: '60캡슐 / 2개월',
		tile: T.lemon,
		ic: 'pill',
		form: '알약',
		pack: 'PTP',
		flavor: '',
		tag: '',
		chips: ['캡슐', 'PTP', '2개월분'],
		ingredients: ['비오틴 5000㎍', '맥주효모', '케라틴', '아연'],
		note: '한 알로 끝내고 싶은 사람을 위한 가장 심플한 구성. 대신 함량은 타협 안 했어요.',
		howto: '하루 1캡슐을 물과 함께 드세요.',
		specs: [spec('clock', '섭취', '하루 1캡슐'), spec('pill', '제형', '하드캡슐'), spec('ptp', '구성', '60캡슐')]
	},
	{
		id: 'p7',
		code: 'minji-glutathione-lemon',
		cat: 'inner',
		creator: 'c1',
		name: '민지 글루타치온 스틱 — 레몬',
		sub: '이너 글로우 · 짜먹는',
		price: 36000,
		unit: '14포 / 2주분',
		tile: T.lemon,
		ic: 'lemon',
		form: '액상',
		pack: '스틱포',
		flavor: '레몬',
		tag: 'NEW',
		chips: ['짜먹는', '스틱포', '레몬맛'],
		ingredients: ['글루타치온', '비타민C', '엘더베리', '히알루론산'],
		note: '아침 공복에 상큼하게. 쓴맛 때문에 못 먹던 글루타치온을 레몬청 느낌으로 바꿨어요.',
		howto: '아침 공복에 1포를 그대로 짜서 드세요.',
		specs: [spec('clock', '섭취', '아침 1포'), spec('stick', '제형', '액상 스틱'), spec('box', '구성', '14포')]
	},
	{
		id: 'p8',
		code: 'jun-daily-multi-mens',
		cat: 'mens',
		creator: 'c3',
		name: '준 데일리 멀티 — 맨즈',
		sub: '아르기닌 · 아연 · 마카',
		price: 29000,
		unit: '30정 / 1개월',
		tile: T.navy,
		ic: 'pill',
		form: '알약',
		pack: '보틀',
		flavor: '',
		tag: '',
		chips: ['정제', '보틀', '1개월분'],
		ingredients: ['L-아르기닌', '아연', '마카', '비타민D'],
		note: '매일 챙겨야 할 걸 한 통으로. 출근길 가방에 넣고 다니기 좋게 작은 보틀로 만들었어요.',
		howto: '하루 1정을 아침 식사 후 드세요.',
		specs: [spec('clock', '섭취', '하루 1정'), spec('pill', '제형', '타정'), spec('bottle', '구성', '30정 보틀')]
	}
];

/** 정책 숫자 — 실서비스에서는 서버 규칙(docs/myr.md §6.2 · §9-11). 디자인 Tweaks 의 freeShipping 기본값 */
export const FREE_SHIPPING = 50000;
export const SHIPPING_FEE = 3000;
/** 한 줄 최대 수량 (디자인 9 · 실서비스 체크아웃 가드 1..10 과 맞춘다) */
export const MAX_QTY = 9;

export const creatorOf = (id: string): Creator => CREATORS.find((c) => c.id === id) ?? CREATORS[0];
export const productOf = (id: string): Product | undefined => PRODUCTS.find((p) => p.id === id);
export const productByCode = (code: string): Product | undefined => PRODUCTS.find((p) => p.code === code);
export const catName = (id: string): string => CATS.find((c) => c.id === id)?.name ?? '전체';
export const won = (n: number): string => '₩' + n.toLocaleString('ko-KR');
