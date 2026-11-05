/**
 * 내 제품 조회 — `@sellery/myr-core/server/seller-products` 재수출(키는 ./env 가 먼저 주입) + 콘솔 페이지용 묶음.
 * myProducts(event): 크리에이터 게이트(requireSeller — 로그인 · 연결 · 정지)와 계정 기준 상품 조회(0072)를 **동시에** 보내고,
 * 게이트가 통과할 때만 상품을 돌려준다(통과 못 하면 requireSeller 가 redirect 를 던져 상품 결과는 버려진다). 2026-11-05 탭 이동 속도.
 */
import type { RequestEvent } from '@sveltejs/kit';
import './env';
import { listSellerProductsOfUser, type SellerProductRow } from '@sellery/myr-core/server/seller-products';
import { requireSeller, type SellerSummary } from './seller';

export * from '@sellery/myr-core/server/seller-products';

export async function myProducts(event: RequestEvent): Promise<{ seller: SellerSummary; rows: SellerProductRow[] }> {
	const { user } = await event.locals.safeGetSession();
	// 먼저 출발시키고(동시) 게이트부터 기다린다 — 게이트의 redirect(로그인 · 정지 · 연결 없음)가 상품 조회 오류보다 앞서야 한다
	const rowsP = user ? listSellerProductsOfUser(user.id) : Promise.resolve<SellerProductRow[]>([]);
	rowsP.catch(() => {}); // 게이트가 redirect 를 던지면 이 결과는 안 기다린다 — 처리 안 된 거부로 남지 않게
	const seller = await requireSeller(event);
	return { seller, rows: await rowsP };
}
