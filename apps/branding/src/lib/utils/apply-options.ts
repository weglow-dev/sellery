/** 제조의뢰 퍼널의 선택지 — 폼 UI(components/Funnel.svelte · Landing.svelte)와 서버 검증(server/apply-action.ts)이 같이 참조하는 단일 출처. */

/** 모든 카테고리 공통 최소 제작 수량 — 슬랙 접수 한 줄에 고정값으로만 찍는다. */
export const MIN_QTY = 1000;

export const CATEGORIES = ['다이어트', '피부', '건강', '기타'] as const;
export type Category = (typeof CATEGORIES)[number];

export const DOSAGE_FORMS = ['알약', '젤리', '분말', '액상', '필름', '캔디'] as const;
export type DosageForm = (typeof DOSAGE_FORMS)[number];

/** 제형별 세부 종류 — 표에 없는 제형은 세부 종류 단계를 건너뛴다. */
export const SUB_TYPES_BY_FORM: Partial<Record<DosageForm, readonly string[]>> = {
	알약: ['타정', '분말 캡슐', '연질캡슐'],
	캔디: ['구미', '카라멜']
};

/** 세부 종류 단계의 문구 — 제형마다 질문이 다르다. */
export const SUB_STEP_COPY: Record<string, { eyebrow: string; title: [string, string]; help: string }> = {
	알약: { eyebrow: '알약 종류', title: ['알약은 어떤', '타입이 좋을까요?'], help: '성분에 따라 맞는 타입이 달라요' },
	캔디: { eyebrow: '캔디 종류', title: ['어떤 식감의', '캔디인가요?'], help: '탭하면 바로 다음으로 넘어가요' }
};

/** 제형별 패키지 선택지 — 빈 배열이면 패키지 단계를 건너뛰고(필름), 하나뿐이면 묻지 않고 자동으로 채운다(젤리 → 스틱). */
export const PACKAGING_BY_FORM: Record<DosageForm, readonly string[]> = {
	알약: ['멀티팩', 'PTP', '병'],
	젤리: ['스틱'],
	분말: ['스틱', '병', '파우치'],
	액상: ['스틱', '병', '파우치'],
	필름: [],
	캔디: ['PTP', '병']
};

export const FLAVORS = ['포도', '딸기', '복숭아', '레몬', '플레인(무맛)', '기타'] as const;

/** "아직 모르겠어요 · 미팅 때 정할게요" 선택의 저장값 — 제형·세부 종류·패키지·맛에서 고를 수 있고 슬랙에는 미정으로 찍힌다. */
export const UNSURE = '미정';
export const UNSURE_LABEL = '아직 모르겠어요 · 미팅 때 정할게요';

/** 제형을 미정으로 두면 모든 패키지를 보여준다. */
const PACKAGING_ANY = ['멀티팩', 'PTP', '병', '스틱', '파우치'] as const;

export function subTypesFor(dosageForm: string): readonly string[] {
	return SUB_TYPES_BY_FORM[dosageForm as DosageForm] ?? [];
}

export function packagingOptionsFor(dosageForm: string): readonly string[] {
	if (dosageForm === UNSURE) return PACKAGING_ANY;
	return (DOSAGE_FORMS as readonly string[]).includes(dosageForm) ? PACKAGING_BY_FORM[dosageForm as DosageForm] : [];
}

/** 맛을 묻는 제형인지 — 알약 중 분말 캡슐·연질캡슐은 맛이 없어서 단계를 건너뛴다. */
export function needsFlavor(dosageForm: string, subType: string): boolean {
	return !(dosageForm === '알약' && (subType === '분말 캡슐' || subType === '연질캡슐'));
}

/** 미팅 선호 시간대(선택) — 저장값은 value, 슬랙에는 "오전(10–12시)" 꼴로 찍는다. */
export const MEETING_SLOTS = [
	{ value: '오전', hint: '10–12시' },
	{ value: '오후', hint: '13–17시' },
	{ value: '저녁', hint: '18시 이후' }
] as const;

/** 타일 카드 아래 한 줄 설명 — 이름이 표에 없으면 설명 없이 이름만 보여준다. */
export const OPTION_DESC: Record<string, string> = {
	// 카테고리
	다이어트: '식단 · 대체식 · 체중 관리',
	피부: '이너뷰티 · 보습 · 톤',
	건강: '면역 · 장건강 · 활력',
	기타: '다른 아이디어가 있어요',
	// 제형
	알약: '하루 1~2알, 가장 익숙한 형태',
	젤리: '짜 먹는 스틱 젤리',
	분말: '물에 타 먹는 가루',
	액상: '마시는 앰플 · 드링크',
	필름: '혀에 녹는 얇은 한 장',
	캔디: '구미 · 카라멜, 간식처럼',
	// 세부 종류
	타정: '가루를 단단하게 눌러 만든 알약',
	'분말 캡슐': '가루를 캡슐 안에 담은 하드캡슐',
	연질캡슐: '말랑한 젤라틴 캡슐 · 오일 성분용',
	구미: '쫀득한 젤리 캔디',
	카라멜: '부드럽게 씹는 큐브형',
	// 패키지
	멀티팩: '1회분씩 낱개 포장 · 들고 다니기 좋아요',
	PTP: '하나씩 눌러 꺼내는 블리스터',
	병: '뚜껑 열어 꺼내는 통',
	스틱: '한 번에 뜯어먹는 긴 포',
	파우치: '여러 개 담긴 지퍼 봉투'
};

/** 맛 타일의 그림 — '/' 로 시작하면 static/ 의 아이콘 파일(48×48 라인 아이콘), 'plus' 는 점선 원에 + (기타). */
export const FLAVOR_SWATCH: Record<string, string> = {
	포도: '/grape.svg',
	딸기: '/strawberry.svg',
	복숭아: '/peach.svg',
	레몬: '/lemon.svg',
	'플레인(무맛)': '/plain.svg',
	기타: 'plus'
};

/** 카테고리를 고르면 메인 성분 칸 아래에 제안하는 성분 — 탭하면 쉼표로 이어 붙는다. */
export const SUGGESTED_INGREDIENTS: Partial<Record<Category, readonly string[]>> = {
	다이어트: ['가르시니아', '녹차추출물', '차전자피', 'L-카르니틴'],
	피부: ['저분자 콜라겐', '히알루론산', '글루타치온', '비오틴'],
	건강: ['유산균', '비타민C', '홍삼', '오메가3']
};

/** 랜딩 "지금 만들어지고 있는 브랜드 카테고리" 타일 4장(2×2) — 탭하면 category 로 매핑돼 퍼널이 그 카테고리로 시작한다.
 *  더마 · 헤어&바디는 2026-10-15 대표 결정으로 뺐다. */
export const LANDING_CATEGORIES: readonly { title: string; desc: string; icon: string; category: Category }[] = [
	{ title: '다이어트', desc: '식단 · 대체식 · 체중 관리', icon: '다이어트', category: '다이어트' },
	{ title: '이너뷰티', desc: '콜라겐 · 이너케어', icon: '이너뷰티', category: '피부' },
	{ title: '멘탈 웰니스', desc: '수면 · 스트레스 케어', icon: '멘탈', category: '건강' },
	{ title: '맨즈 웰니스', desc: '남성 전용 건강관리', icon: '맨즈', category: '건강' }
];

/** 폼 액션이 돌려주는 모양 — 서버(apply-action.ts)와 퍼널 UI 가 같이 쓴다. */
export type ApplyValues = {
	name: string;
	phone: string;
	category: string;
	ingredient: string;
	dosageForm: string;
	subType: string;
	packaging: string;
	flavor: string;
	note: string;
	slot: string;
};
export type ApplyErrors = Partial<Record<keyof ApplyValues | 'agree' | 'form', string>>;
export type ApplyResult = { success?: boolean; errors?: ApplyErrors; values?: ApplyValues } | null | undefined;
