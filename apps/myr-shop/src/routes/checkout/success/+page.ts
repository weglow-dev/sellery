/** /checkout/success — successUrl 랜딩은 전부 브라우저에서. confirm 호출은 +page.svelte 의 onMount 가 정확히 1회(서버 렌더가 "확인 중" 을 두 번 그리지 않게) */
export const ssr = false;
