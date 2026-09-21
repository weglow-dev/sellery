import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { COMPANY } from '@sellery/db/company';
import { brandPath, getBrandContext } from '$lib/server/brand';

/**
 * `/brand/suspended` — 이용 정지 안내 (apps/influencer `(console)/suspended` 의 브랜드 판 · docs/brand-console-plan.md §3 "정지 · 복귀"). 폼 없음: `partner-admin.mjs reactivate-brand` 로만 복귀.
 * `requireBrand()` 가 suspended 를 여기로 보내므로 `getBrandContext()` 를 직접 본다(루프 방지). 정지 사유 컬럼은 없다. 고객센터 이메일 = COMPANY.email.
 */
export const load: PageServerLoad = async (event) => {
	const ctx = await getBrandContext(event);
	if (ctx.state === 'anon') redirect(303, `${brandPath('/login')}?next=${encodeURIComponent(brandPath('/home'))}`);
	if (ctx.state === 'ok') redirect(303, brandPath('/home'));
	if (ctx.state === 'guest') redirect(303, brandPath('/apply'));
	if (ctx.state === 'foreign') redirect(303, `${brandPath('/login')}?switch=1`);
	return { name: ctx.brand.name, email: ctx.user.email ?? '', company: { email: COMPANY.email, csUrl: COMPANY.csUrl } };
};
