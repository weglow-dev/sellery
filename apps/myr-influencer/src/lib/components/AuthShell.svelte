<script lang="ts">
	import type { Snippet } from 'svelte';
	import AuthLogo from './auth/AuthLogo.svelte';

	/** 비밀번호 찾기 · 새 비밀번호 · 정지/연결 없음 안내 공용 틀 — 로그인 · 초대 가입 시안과 같은 톤(로고 머리 · 주황 빛 · PC 는 가운데 카드).
	 *  콘솔 셸(상단 내비 · 하단 탭) 없이 서버에서 그려서 JS 없이도 동작한다 */
	let { title, sub = null, children }: { title: string; sub?: string | null; children: Snippet } = $props();
</script>

<div class="relative min-h-dvh overflow-hidden bg-bg">
	<div class="pointer-events-none absolute -top-40 -left-[120px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.28),rgba(10,11,14,0))] lg:-top-[260px] lg:left-[18%] lg:h-[720px] lg:w-[720px] lg:bg-[radial-gradient(closest-side,rgba(255,122,61,.22),rgba(10,11,14,0))]"></div>
	<div class="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-8 lg:max-w-[1200px] lg:px-10">
		<header class="flex h-16 shrink-0 items-center lg:h-auto lg:pt-9"><AuthLogo large /></header>
		<div class="flex flex-1 flex-col lg:items-center lg:justify-center lg:py-12">
			<section class="w-full animate-up-in pt-10 lg:max-w-[480px] lg:rounded-[28px] lg:border lg:border-white/8 lg:bg-[#111216] lg:p-10 lg:shadow-[0_30px_80px_rgba(0,0,0,.35)]">
				<h1 class="text-[28px] leading-[1.28] font-extrabold tracking-[-0.03em] text-balance lg:text-[30px]">{title}</h1>
				{#if sub}<p class="mt-3 text-[15px] leading-[1.6] text-white/60">{sub}</p>{/if}
				<div class="mt-7">{@render children()}</div>
			</section>
		</div>
	</div>
</div>
