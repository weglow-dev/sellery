/**
 * /checkout/success — successUrl 랜딩은 전부 브라우저에서 (web success/page.tsx 의 클라이언트 트리 · docs/monorepo-migration.md §4.1).
 * confirm 호출은 +page.svelte 의 onMount 가 정확히 1회 — SSR 을 끄면 서버 렌더가 "확인 중" 을 두 번 그리지 않고, 쿼리(paymentKey·orderId·amount)는 브라우저에서만 읽는다.
 */
export const ssr = false;
