import type { PageServerLoad } from './$types';
import { EMAIL_RE } from '@sellery/db/partner/signup-rules';

/**
 * 인증 메일 안내 — web (public)/verify-sent/page.tsx 1:1 (프로토타입 login.html fVerify). 공개 경로(CONSOLE_PUBLIC_PATHS).
 * `?email=` 은 표시·재발송용 — 형식 밖이면 표시하지 않는다(재발송 버튼도 없음).
 */
export const load: PageServerLoad = ({ url }) => {
	const raw = (url.searchParams.get('email') ?? '').trim().toLowerCase();
	return { email: EMAIL_RE.test(raw) ? raw : null };
};
