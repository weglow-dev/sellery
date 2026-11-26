/**
 * 관리자 콘솔 표시 언어 · 아웃리치/로그인 문구 사전 — 순수 모듈 테스트.
 * 타입(`OutreachText` · `LoginText`)이 못 잡는 어긋남을 고정한다: 안내 키 · 적합 조건 이름 · 영어 사전에 남은 한글.
 */
import { describe, expect, it } from 'vitest';
import { META_MOCK_CATEGORY } from '@sellery/db/admin/outreach-providers';
import { OUTREACH_EVENT_LABEL, OUTREACH_STATUSES, OUTREACH_TRENDS, outreachFit } from '@sellery/db/admin/outreach-rules';
import { LANGS, langToggle, parseLang, pickLang } from '../lib/lang';
import { loginText } from '../lib/login-text';
import { FIT_LABEL_EN, outreachNotice, outreachText } from '../lib/outreach-text';
import { META_FAIL_MSG } from '../routes/(console)/outreach/messages';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

/** 사전의 모든 문구(함수는 견본 인자로 불러서)를 한 줄씩 모은다 */
function strings(v: unknown, path = ''): { path: string; text: string }[] {
	if (typeof v === 'string') return [{ path, text: v }];
	if (typeof v === 'function') {
		const fn = v as (...a: unknown[]) => unknown;
		const samples: unknown[][] = [
			['x', 'y', 3],
			[{ inserted: 1, updated: 2, failed: 3, provider: 'meta', found: 4, kept: 5, last: true, mock: true }, 6],
			[{ inserted: 1, updated: 2, failed: 0, provider: 'modash', found: 4, kept: 5, last: false, mock: false }, 0],
			[['a', 'b']],
			[null, null],
			[1, 2, 3]
		];
		return samples.flatMap((args, i) => {
			try {
				return strings(fn(...args), `${path}(#${i})`);
			} catch {
				return []; // 인자 모양이 안 맞는 견본은 건너뛴다
			}
		});
	}
	if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
	return [];
}

describe('lang', () => {
	it('parseLang — 아는 값만', () => {
		expect(LANGS).toEqual(['ko', 'en']);
		expect(parseLang('en')).toBe('en');
		expect(parseLang('ko')).toBe('ko');
		for (const v of ['EN', 'ja', '', null, undefined, 1, {}]) expect(parseLang(v)).toBeNull();
	});
	it('pickLang — 주소가 쿠키보다 먼저 · 기본 한국어', () => {
		expect(pickLang(null, null)).toBe('ko');
		expect(pickLang(null, 'en')).toBe('en');
		expect(pickLang('ko', 'en')).toBe('ko');
		expect(pickLang('xx', 'en')).toBe('en');
		expect(pickLang('xx', 'yy')).toBe('ko');
	});
	it('langToggle — 반대 언어로 · 필터는 남기고 안내는 뺀다', () => {
		const ko = langToggle('ko', new URLSearchParams('status=queued&q=abc&msg=collected&detail=x'));
		expect(ko.to).toBe('en');
		expect(ko.label).toBe('English');
		expect(ko.query).toBe('?status=queued&q=abc&lang=en');
		const en = langToggle('en', new URLSearchParams('lang=en'));
		expect(en.to).toBe('ko');
		expect(en.label).toBe('한국어');
		expect(en.query).toBe('?lang=ko');
	});
});

describe('outreachText', () => {
	const ko = outreachText('ko');
	const en = outreachText('en');

	it('안내 키가 두 언어에 똑같이 있다', () => {
		expect(Object.keys(en.msg).sort()).toEqual(Object.keys(ko.msg).sort());
		expect(Object.keys(en.detail.msg).sort()).toEqual(Object.keys(ko.detail.msg).sort());
	});
	it('메타 연결 실패 코드의 안내 키가 사전에 있다', () => {
		for (const key of Object.values(META_FAIL_MSG)) {
			expect(ko.msg[key], key).toBeTruthy();
			expect(en.msg[key], key).toBeTruthy();
		}
		for (const key of ['meta_connected', 'meta_disconnected', 'meta_denied', 'meta_state']) expect(en.msg[key], key).toBeTruthy();
	});
	it('상태 · 추세 · 이력 이름이 전부 있다', () => {
		for (const s of OUTREACH_STATUSES) {
			expect(en.statusLabel[s], s).toBeTruthy();
			expect(en.statusHint[s], s).toBeTruthy();
			expect(ko.statusLabel[s], s).toBeTruthy();
		}
		for (const tr of OUTREACH_TRENDS) expect(en.trendLabel[tr], tr).toBeTruthy();
		expect(Object.keys(en.eventLabel).sort()).toEqual(Object.keys(OUTREACH_EVENT_LABEL).sort());
	});
	it('적합 조건 이름 — outreachFit 이 내는 이름이 전부 영어로 옮겨진다', () => {
		const unknown = outreachFit({}).unknown; // 지표가 하나도 없으면 다섯 조건이 전부 미확인
		const missing = outreachFit({ followers: 1, trend: 'down', audience: { female_pct: 0, age_20_40_pct: 0, kr_pct: 0 } }).missing;
		expect(unknown).toHaveLength(5);
		expect(missing).toHaveLength(5);
		for (const label of [...unknown, ...missing]) {
			expect(FIT_LABEL_EN[label], label).toBeTruthy();
			expect(en.fitLabel(label)).not.toMatch(HANGUL);
			expect(ko.fitLabel(label)).toBe(label);
		}
		expect(Object.keys(FIT_LABEL_EN).sort()).toEqual([...new Set(unknown)].sort());
	});
	it('카테고리 — 모의 데이터 표시만 옮긴다', () => {
		expect(ko.category(META_MOCK_CATEGORY)).toBe(META_MOCK_CATEGORY);
		expect(en.category(META_MOCK_CATEGORY)).not.toMatch(HANGUL);
		expect(en.category('Beauty')).toBe('Beauty');
		expect(en.category(null)).toBe('—');
		expect(ko.category(null)).toBe('—');
	});
	it('영어 사전에 한글이 남아 있지 않다', () => {
		const left = strings(en).filter((s) => HANGUL.test(s.text));
		expect(left).toEqual([]);
	});
	it('outreachNotice — 키 · 덧붙임', () => {
		expect(outreachNotice(ko, '', null)).toBeNull();
		expect(outreachNotice(ko, 'added', null)).toBe('후보를 추가했어요');
		expect(outreachNotice(en, 'meta_connected', '@makeyour.recipe')).toBe('Instagram account connected — @makeyour.recipe');
		expect(outreachNotice(en, 'nope', 'x')).toBe(' — x');
	});
	it('수집 요약 — 숫자가 문구에 들어간다', () => {
		const r = { inserted: 1, updated: 2, failed: 0, provider: 'meta' as const, found: 10, kept: 3, last: true, mock: true };
		expect(ko.result.collected(r)).toBe('메타 공식 · 받음 10 · 조건 통과 3 · 새 1 · 갱신 2 · 마지막 페이지 · 모의 데이터(앱 검수 전 · 연결 확인용)');
		expect(en.result.collected(r)).toBe('Meta Creator Marketplace · received 10 · matched 3 · new 1 · updated 2 · last page · mock data (before app review · connection check only)');
		expect(ko.result.added({ inserted: 2, updated: 1, failed: 0 }, 0)).toBe('새 2 · 기존 1');
		expect(ko.result.imported({ inserted: 2, updated: 1, failed: 1 }, 4)).toBe('새 2 · 갱신 1 · 실패 1 · 핸들 없는 줄 4');
	});
});

describe('loginText', () => {
	it('영어 사전에 한글이 남아 있지 않다', () => {
		expect(strings(loginText('en')).filter((s) => HANGUL.test(s.text))).toEqual([]);
	});
	it('다른 계정 안내 — 이메일 · 역할', () => {
		const ko = loginText('ko').foreign('a@b.co', '브랜드');
		expect(`${ko.before}${ko.who}${ko.after}`).toContain('지금 a@b.co 계정(브랜드)으로 로그인돼 있어요.');
		const en = loginText('en').foreign(null, null);
		expect(`${en.before}${en.who}${en.after}`).toContain('You are signed in as another account. The admin console');
	});
});
