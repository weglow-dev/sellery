import type { PageServerLoad } from './$types';
import { mySettleInfo } from '$lib/server/settle-info';
import { tossCardOf, tossCardPreviewOf } from '$lib/server/toss-auth';
import { hasTossPayouts } from '$lib/server/toss-sellers';

/**
 * 내 정보(9번 · 0085) — 프로필(가입 때 받은 칸 · 읽기) · 사업자 · 정산 정보(가린 값 · 운영 확인 상태). 게이트와 정보 조회를 동시에 보낸다.
 * toss: "토스 본인인증" 카드 — 상태는 서버(0121 myr_toss_card_state · 응답 tossState). 지급대행 키가 있으면 보인다(0124 · 시범운영은 테스트 키):
 *   ?toss=<상태> 이면 그 상태의 미리보기(목 · 개발 서버 · Vercel Preview 만) · 없으면 이 계정의 실제 상태(토스 등록 · 조회 · 웹훅이 적은 값).
 */
export const load: PageServerLoad = async (event) => {
	const { seller, info, profile } = await mySettleInfo(event);
	const preview = tossCardPreviewOf(event.url);
	return {
		seller: { name: seller.name, handle: seller.handle, email: seller.email, ...profile },
		info,
		toss: preview ? tossCardOf(preview, info) : hasTossPayouts() ? tossCardOf(info?.tossState ?? 'none', info) : null
	};
};
