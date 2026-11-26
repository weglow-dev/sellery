/**
 * 관리자 콘솔 표시 언어 — 한국어(기본) · 영어. 순수 모듈(`$env`·`$app` 없음 — vitest 대상).
 *
 * 왜 있나: 메타 앱 검수(아웃리치 · `instagram_creator_marketplace_discovery`)의 검수자가 화면을 읽을 수 있어야 한다.
 * 영어로 옮긴 곳은 검수자가 지나가는 길뿐이다 — 로그인 · 콘솔 틀(상단 바 · 탭) · 아웃리치 목록 · 후보 상세. 나머지 화면은 한국어 그대로.
 *
 * 고르는 법: 주소에 `?lang=en`(또는 `?lang=ko`) → hooks 가 쿠키(`LANG_COOKIE`)에 적고 `locals.lang` 에 싣는다. 쿠키가 없으면 한국어.
 * 언어는 표시만 바꾼다 — 권한 · 판정 · 저장 값은 언어와 무관하다.
 */
export const LANGS = ['ko', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_COOKIE = 'slry_admin_lang';
/** 180일 */
export const LANG_MAX_AGE = 60 * 60 * 24 * 180;

export function parseLang(v: unknown): Lang | null {
	return typeof v === 'string' && (LANGS as readonly string[]).includes(v) ? (v as Lang) : null;
}

/** 주소의 `?lang=` 이 쿠키보다 먼저 — 둘 다 없거나 모르는 값이면 한국어 */
export function pickLang(query: unknown, cookie: unknown): Lang {
	return parseLang(query) ?? parseLang(cookie) ?? 'ko';
}

/** 지금 주소에서 언어만 바꾼 주소(쿼리 문자열) — 화면의 [English] / [한국어] 링크 */
export function langToggle(lang: Lang, search: URLSearchParams): { to: Lang; label: string; query: string } {
	const to: Lang = lang === 'en' ? 'ko' : 'en';
	const p = new URLSearchParams(search);
	// 안내 문구(msg · detail)는 한 번 보여 주는 값 — 언어를 바꾼 주소에 끌고 가지 않는다
	p.delete('msg');
	p.delete('detail');
	p.set('lang', to);
	return { to, label: to === 'en' ? 'English' : '한국어', query: `?${p.toString()}` };
}
