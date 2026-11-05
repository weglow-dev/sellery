// Supabase Auth 메일 템플릿 — docs/emails/*.html(대시보드에 붙여넣는 정본)이 코드(@sellery/myr-core/mail/auth-templates)와 같은지 ·
// MYR 문구 · token_hash 링크. 파일이 어긋나면: node_modules/.bin/jiti packages/myr-core/scripts/render-auth-emails.ts
import { describe, expect, it } from 'vitest';
import { authEmailTemplates } from '@sellery/myr-core/mail/auth-templates';

const files = import.meta.glob<string>('../../../../docs/emails/*.html', { query: '?raw', import: 'default', eager: true });
const fileOf = (name: string) => Object.entries(files).find(([p]) => p.endsWith(`/${name}`))?.[1];

describe('Supabase Auth 메일 템플릿', () => {
	const ts = authEmailTemplates();
	it('세 템플릿 · 링크 type', () => {
		expect(ts.map((t) => [t.name, t.type])).toEqual([
			['Confirm signup', 'signup'],
			['Reset password', 'recovery'],
			['Invite user', 'invite']
		]);
	});
	for (const t of ts) {
		it(`${t.file} — 파일 = 코드 출력 · token_hash 링크 · MYR 문구(셀러리 없음)`, () => {
			expect(fileOf(t.file), `docs/emails/${t.file} 을 다시 만들어야 한다`).toBe(t.html);
			expect(t.html).toContain(`{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=${t.type}`);
			expect(t.subject.startsWith('[MYR]')).toBe(true);
			expect(t.html).not.toMatch(/셀러리|SELLERY|celery\.png/);
		});
	}
});
