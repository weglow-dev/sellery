<script lang="ts">
	/**
	 * 등급 아이콘 (방패 → 셰브런 → 별 → 날개 → 왕관) — web icons.tsx GICON · GradeIcon.
	 * RPC `seller.grade` / `brand.grade` 문자열로 렌더 — 모르는 값이면 아무것도 렌더하지 않는다.
	 */
	import { isGradeName } from './icons';
	let { grade }: { grade: string | null | undefined } = $props();
	const SHIELD = 'M10 1.3 14.2 2.9v3.9c0 2.6-1.7 4.4-4.2 5.3-2.5-.9-4.2-2.7-4.2-5.3V2.9z';
	const STAR = 'M10 3.9 10.8 5.7 12.7 5.9 11.3 7.2 11.7 9.1 10 8.1 8.3 9.1 8.7 7.2 7.3 5.9 9.2 5.7z';
	const WING2 = 'M5.2 4.8H2.6M5.2 6.9H3.6M14.8 4.8h2.6M14.8 6.9h1.6';
	const WING3 = 'M5.2 4.2H1.6M5.2 6.2H2.6M5.2 8.2H3.6M14.8 4.2h3.6M14.8 6.2h2.6M14.8 8.2h1.6';
	const FILL: Record<string, string> = { 스타터: '#e6e3d2', 브론즈: '#cd8f5a', 실버: '#cdd2da', 골드: '#f2a91d', 플래티넘: '#9fd8d3', 다이아: '#a9c6ff', 블랙: '#17150f' };
</script>

{#if isGradeName(grade)}
	<svg class="gi" viewBox="0 -2 20 16" width="17" height="13.6" aria-hidden="true">
		{#if grade === '플래티넘'}<path d={WING2} stroke="#141414" stroke-width="1.3" stroke-linecap="round" />{/if}
		{#if grade === '다이아' || grade === '블랙'}<path d={WING3} stroke="#141414" stroke-width="1.3" stroke-linecap="round" />{/if}
		{#if grade === '블랙'}<path d="M7.6 1 8.7-.9 10 .7 11.3-.9 12.4 1z" fill="#f7df3e" stroke="#141414" stroke-width=".9" stroke-linejoin="round" />{/if}
		<path d={SHIELD} fill={FILL[grade]} stroke="#141414" stroke-width="1.3" stroke-linejoin="round" />
		{#if grade === '브론즈'}<path d="M8.2 5.6 10 7.1 11.8 5.6" fill="none" stroke="#141414" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
		{:else if grade === '실버'}<path d="M8.2 4.6 10 6.1 11.8 4.6M8.2 6.8 10 8.3 11.8 6.8" fill="none" stroke="#141414" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
		{:else if grade === '골드'}<path d={STAR} fill="#fff" />
		{:else if grade === '플래티넘'}<path d={STAR} fill="#141414" />
		{:else if grade === '다이아'}<path d="M10 3.7 12 6.2 10 8.7 8 6.2z" fill="#fff" stroke="#141414" stroke-width=".7" />
		{:else if grade === '블랙'}<path d={STAR} fill="#f7df3e" />{/if}
	</svg>
{/if}
