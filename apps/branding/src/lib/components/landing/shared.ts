/** 랜딩 슬라이드 공통 — 7개 슬라이드 컴포넌트와 Landing.svelte 가 같이 쓰는 클래스 상수와 진입 연출 헬퍼. */

/** 슬라이드 한 장: 모바일은 내용 아래 정렬(mt-auto) + 화면이 낮으면 내부 세로 스크롤, lg 는 가운데 정렬 두 열 */
export const slideCls =
	'no-scrollbar relative flex h-full w-full shrink-0 snap-start flex-col overflow-x-hidden overflow-y-auto px-6 pt-[72px] pb-6 short:pt-16 short:pb-4 lg:justify-center lg:px-16 lg:pt-24 lg:pb-12';
/** 두 열 묶음 — 모바일은 한 열 아래 정렬, lg 는 1120px 안에서 왼쪽 글 · 오른쪽 카드 */
export const twoCol =
	'relative mt-auto lg:mx-auto lg:mt-0 lg:grid lg:w-full lg:max-w-[1120px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-20';
/** 오른쪽 열(카드) 기본 간격 */
export const rightCol = 'mt-[22px] min-w-0 lg:mt-0';
export const eyebrowCls = 'text-[13px] font-bold text-accent lg:text-sm';
export const h2Cls =
	'mt-3 text-[30px] leading-[1.25] font-extrabold tracking-[-0.03em] text-balance text-fg short:mt-2 short:text-[26px] lg:text-[46px] lg:leading-[1.18]';

/** 진입 연출 — app.css 의 .rise / .rise-in. 그 슬라이드가 보일 때(active)만 .rise-in 을 붙이고, d(k) 로 0.05초 간격 순서 지연을 준다. */
export const rise = (active: boolean) => `rise ${active ? 'rise-in' : ''}`;
export const d = (k: number) => `--d:${(k * 0.05).toFixed(2)}s`;
