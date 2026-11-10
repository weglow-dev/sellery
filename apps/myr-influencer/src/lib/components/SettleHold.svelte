<script lang="ts">
	import { holdBanner } from '@sellery/myr-core/seller-settlement';

	/** 정산 보류 배너(시안 "MYR Influencer Admin" 정산) — 사업자 · 정산 정보(0085) 확인 전이면. 등록 · 다시 입력은 내 정보로. 확인 완료면 그리지 않는다.
	 *  모바일: 아이콘 · 글 + 아래 꽉 찬 버튼 / PC(lg~): 한 줄(아이콘 · 글 · 오른쪽 버튼) */
	let { settleStatus, nextDate }: { settleStatus: string; nextDate: string } = $props();
	const b = $derived(holdBanner(settleStatus, nextDate));
</script>

{#if b}
	<div class="rounded-[18px] border border-[#ff6b6b]/26 bg-[#ff6b6b]/7 px-4 py-3.5 lg:flex lg:items-center lg:gap-3.5 lg:rounded-[20px] lg:py-4 lg:pr-4 lg:pl-5">
		<div class="flex items-start gap-2.5 lg:flex-1 lg:items-center lg:gap-3.5">
			<span class="mt-px shrink-0 text-[#ff8a8a] lg:mt-0 lg:flex lg:h-10 lg:w-10 lg:items-center lg:justify-center lg:rounded-xl lg:bg-[#ff6b6b]/16">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></svg>
			</span>
			<span class="min-w-0">
				<span class="block text-[14px] font-bold lg:text-[15px]">{b.title}</span>
				<span class="mt-0.5 block text-[12px] leading-[1.5] text-white/60 lg:mt-[3px] lg:text-[13px]">{b.body}</span>
			</span>
		</div>
		{#if b.cta}
			<a href="/my" class="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-accent text-[14px] font-extrabold text-bg lg:mt-0 lg:h-[46px] lg:w-auto lg:shrink-0 lg:rounded-[14px] lg:px-[18px] lg:hover:bg-[#ff8f5c]">{b.cta}</a>
		{/if}
	</div>
{/if}
