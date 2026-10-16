<script lang="ts">
	import { bodyCls, footCls, scrollCls } from './shared';

	/** 접수 완료 — 체크 · "내가 그린 브랜드" 요약 · 진행 3단계 타임라인 · [홈으로](답을 비우고 랜딩 처음으로) */
	let {
		name,
		summary,
		onrestart
	}: { name: string; summary: { k: string; v: string; muted: boolean }[]; onrestart: () => void } = $props();

	const TIMELINE = [
		{ t: '접수 완료', d: '방금 보내주신 내용이 전달됐어요' },
		{ t: '전담 매니저 검토', d: '제형·패키지·수량 기준으로 가능한 방향을 살펴봐요' },
		{ t: '미팅 일정 확정', d: '카카오톡 또는 문자로 2~3개 시간을 보내드려요' }
	];
</script>

<div class="{scrollCls} pt-16 pb-5 lg:pt-6">
	<div class="grid size-16 place-items-center rounded-full bg-accent motion-safe:animate-pop">
		<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
	</div>
	<h1 class="mt-[22px] text-[30px] leading-[1.3] font-extrabold tracking-[-0.03em] text-fg lg:text-4xl lg:leading-[1.25]">접수됐어요</h1>
	<p class="mt-2.5 text-[15px] leading-relaxed text-fg-soft">
		{name.trim() ? `${name.trim()}님, ` : ''}전담 매니저가 내용을 확인하고 <br class="lg:hidden" />영업일 기준 3일 안에 미팅 일정을 제안드려요.
	</p>

	<div class="{bodyCls} lg:mt-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
		<div class="mt-6 rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-[18px] pt-1.5 pb-2 lg:mt-0 lg:px-5">
			<p class="mt-3 mb-1 text-[13px] font-bold text-fg/55">내가 그린 브랜드</p>
			{#each summary as row (row.k)}
				<div class="flex items-baseline justify-between gap-4 border-t border-white/[0.06] py-[11px] text-[15px]">
					<span class="shrink-0 text-fg/60">{row.k}</span>
					<span class="text-right font-semibold {row.muted ? 'text-fg/45' : 'text-fg'}">{row.v}</span>
				</div>
			{/each}
		</div>

		<div class="lg:rounded-[18px] lg:border lg:border-white/[0.07] lg:bg-white/[0.03] lg:px-5 lg:pt-[18px] lg:pb-2">
			<p class="mt-7 mb-3.5 text-[13px] font-bold text-fg/55 lg:mt-0">앞으로 이렇게 진행돼요</p>
			<ol class="flex flex-col">
				{#each TIMELINE as s, i (s.t)}
					<li class="flex gap-3.5">
						<div class="flex shrink-0 flex-col items-center">
							<span class="grid size-6 place-items-center rounded-full text-xs font-extrabold {i === 0 ? 'bg-accent text-bg' : 'border-[1.5px] border-white/30 text-fg/80'}">{i + 1}</span>
							{#if i < 2}<span class="min-h-[22px] w-0.5 flex-1 bg-white/10"></span>{/if}
						</div>
						<div class={i < 2 ? 'pb-4' : ''}>
							<p class="mt-0.5 text-[15px] font-bold text-fg">{s.t}</p>
							<p class="mt-1 text-[13px] text-fg/60">{s.d}</p>
						</div>
					</li>
				{/each}
			</ol>
		</div>
	</div>
</div>
<div class={footCls}>
	<button type="button" onclick={onrestart} class="flex h-14 w-full items-center justify-center rounded-2xl border-[1.5px] border-white/[0.14] text-[16px] font-bold text-fg transition hover:bg-white/5 active:scale-[0.98] lg:h-[52px] lg:w-[200px]">홈으로</button>
</div>
