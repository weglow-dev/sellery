/** 제조의뢰 폼(/apply)의 선택지 — 폼 UI(+page.svelte)와 서버 검증(+page.server.ts)이 같이 참조하는 단일 출처. */

/** 모든 카테고리 공통 최소 제작 수량 — 폼에는 수정 불가 정보로만 표시한다. */
export const MIN_QTY = 1000;

export const CATEGORIES = ['다이어트', '피부', '건강', '기타'] as const;

export const DOSAGE_FORMS = ['알약', '젤리', '분말', '액상', '필름', '캔디'] as const;
export type DosageForm = (typeof DOSAGE_FORMS)[number];

export const PILL_TYPES = ['타정(딱딱한 정제)', '분말 캡슐', '연질캡슐'] as const;

/** 제형별 패키지 선택지 — 빈 배열이면 이 제형은 패키지 선택 단계를 건너뛴다(필름). */
export const PACKAGING_BY_FORM: Record<DosageForm, readonly string[]> = {
	알약: ['멀티팩', 'PTP', '병'],
	젤리: ['스틱'],
	분말: ['스틱', '병', '파우치'],
	액상: ['스틱', '병', '파우치'],
	필름: [],
	캔디: ['구미', 'PTP', '병', '카라멜']
};

export const FLAVORS = ['포도', '딸기', '복숭아', '레몬', '플레인(무맛)', '기타'] as const;
