import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { COMPANY } from '@sellery/db/company';
import { getSellerContext, sellerPath } from '$lib/server/partner';

/**
 * `/suspended` — 이용 정지 안내 (docs/inf-console-plan.md §4.4 · web influencer/suspended/page.tsx 1:1). 폼 없음: `partner-admin.mjs reactivate` 로만 복귀.
 * `requireSeller()` 가 suspended 를 여기로 보내므로 `getSellerContext()` 를 직접 본다(루프 방지). 정지 사유 컬럼은 없다(§4.7). 고객센터 이메일 = COMPANY.email.
 */
export const load: PageServerLoad = async (event) => {
	const ctx = await getSellerContext(event);
	if (ctx.state === 'anon') redirect(303, `${sellerPath('/login')}?next=${encodeURIComponent(sellerPath('/home'))}`);
	if (ctx.state === 'ok') redirect(303, sellerPath('/home'));
	if (ctx.state === 'guest') redirect(303, sellerPath('/apply'));
	if (ctx.state === 'foreign') redirect(303, `${sellerPath('/login')}?switch=1`);
	return { name: ctx.seller.name, email: ctx.user.email ?? '', company: { email: COMPANY.email, csUrl: COMPANY.csUrl } };
};
