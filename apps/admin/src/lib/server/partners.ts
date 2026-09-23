/**
 * 관리자 콘솔 "파트너 관리" 배럴 — `@sellery/db/server/admin/{sellers,brands}`
 * (인플루언서: 목록·상세·정지/복귀·비공개·채널 인증 승인·🥬 지급 / 브랜드: 목록·상세·정지/복귀·자동 제안·🥬 지급 / 상품: 검수 승인·반려·노출 제어).
 * `./money`(정산 · 돈 — 다른 작업자) 와 나란히 두는 **별도 배럴**이다: 파트너를 바꾸는 함수는 이 파일을 거쳐서만 import 한다
 * (docs/monorepo-migration.md §3.3 "server-only 대체 세 겹" 2번 · apps/brand `$lib/server/brand.ts` 와 같은 패턴).
 * `$lib/server/` 라 브라우저 도달 코드가 import 하면 빌드가 실패한다.
 *
 * 비밀 주입은 `./env` 가 이미 끝냈다(`configureDb`) — 파트너 관리에는 토스 시크릿 · RRN 키가 필요 없다.
 * 게이트는 각 page · form action 의 `requireAdmin()`(`./admin`) 이 한다 — 이 배럴은 게이트를 대신하지 않는다.
 *
 *   listSellers · getSeller · listPendingChannels · countPendingChannels
 *   setSellerActive · setSellerHidden · setChannelVerified · grantCelery
 *   listBrands · getBrand · setBrandActive · setBrandAutoPropose · grantBrandCelery
 *   listAdminProducts · getAdminProduct · getProductPreviewCard · reviewProduct (0015 app_admin_review_product)
 *   getAdminDashboard · listRecentActivity — 관리자 홈(대시보드) 카운트 · KPI · 오늘 할 일 · 캠페인 · 최근 활동
 * 순수 규칙(필터·칩·검색·문구)은 `.svelte` 에서 `@sellery/db/admin/{seller-rules,brand-rules,product-rules}` 를 직접 import 한다.
 */
import './env';

export * from '@sellery/db/server/admin/sellers';
export * from '@sellery/db/server/admin/brands';
export * from '@sellery/db/server/admin/products';
export * from '@sellery/db/server/admin/dashboard';
// 폼 액션 레이트리밋 — 인플루언서·브랜드 콘솔과 같은 유틸(프로세스 메모리 · 30분 20건). 게이트 뒤에서만.
export { rateLimit, RATE_LIMIT_MESSAGE } from '@sellery/db/server/partner/seller';
