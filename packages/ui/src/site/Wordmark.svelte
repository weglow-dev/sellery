<script lang="ts">
	/**
	 * 워드마크 — 사이트 안에서 SELLERY 로고는 이 컴포넌트로만 렌더한다 (web wordmark.tsx · app-plan §9.3).
	 * 스타일 = css/skin.css 252–258 최종: Archivo 800 18px .06em uppercase · 흰 박스 · 로고 24×28 rotate(−14°).
	 */
	import LogoIcon from './icons/LogoIcon.svelte';
	let { href = '/', class: cls = '' }: { href?: string; class?: string } = $props();
</script>

<a {href} class={cls ? `wordmark ${cls}` : 'wordmark'} aria-label="Sellery 홈"><LogoIcon class="celogo" />SELLERY<span class="dot">.</span></a>
