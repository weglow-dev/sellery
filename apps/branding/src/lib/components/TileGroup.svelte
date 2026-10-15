<script lang="ts">
	import TileIcon from './TileIcon.svelte';

	/** 타일형 단일 선택 — 퍼널에서는 탭하면 바로 다음 단계로 넘어가므로 라디오 대신 버튼이다(답은 연락처 화면의 hidden input 으로 보낸다).
	 *  layout 별 모양(모바일 → lg 데스크톱): grid = 아이콘 위·글자 아래 카드 2열 → 4열(카테고리), grid-lg = 60px 아이콘 칸 2열 → 3열(제형),
	 *  row = 아이콘 왼쪽 가로 카드 → 3열 세로 카드(세부 종류 · 패키지), swatch = 아이콘 위·이름 아래 3열 → 6열(맛). 선택되면 체크 배지가 톡 튀어나온다. */
	let {
		options,
		value,
		label,
		layout = 'grid',
		desc = {},
		swatch = {},
		onpick
	}: {
		options: readonly string[];
		value: string;
		label: string;
		layout?: 'grid' | 'grid-lg' | 'row' | 'swatch';
		/** 옵션 이름 → 한 줄 설명 */
		desc?: Record<string, string>;
		/** swatch 레이아웃용: 옵션 이름 → static 아이콘 경로('/…svg') | 'plus' */
		swatch?: Record<string, string>;
		onpick: (value: string) => void;
	} = $props();

	const wrap = $derived(
		layout === 'row'
			? 'flex flex-col gap-2.5 lg:grid lg:grid-cols-3 lg:gap-3'
			: layout === 'swatch'
				? 'grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-3'
				: layout === 'grid-lg'
					? 'grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3'
					: 'grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3'
	);
	const tile = $derived(
		layout === 'row'
			? 'flex min-h-[92px] w-full items-center gap-4 px-4 py-3.5 lg:min-h-[170px] lg:flex-col lg:items-start lg:gap-3.5 lg:p-[18px]'
			: layout === 'swatch'
				? 'flex min-h-[116px] flex-col items-center justify-center gap-3 px-2 py-4 text-center'
				: layout === 'grid-lg'
					? 'flex min-h-[150px] flex-col items-start gap-3 p-4'
					: 'flex min-h-[148px] flex-col items-start justify-between gap-3.5 px-4 py-[18px]'
	);
	const iconBox = $derived(layout === 'row' ? 'size-16 rounded-2xl' : layout === 'grid-lg' ? 'size-[60px] rounded-2xl' : 'size-[52px] rounded-[15px]');
	const iconSize = $derived(layout === 'row' ? 44 : layout === 'grid-lg' ? 42 : 36);

	/** '플레인(무맛)' 처럼 괄호 보조 설명이 붙은 이름은 본문과 작은 글씨로 나눠 보여준다 */
	function split(opt: string): [string, string] {
		const m = opt.match(/^(.*?)(\(.*\))$/);
		return m ? [m[1], ` ${m[2]}`] : [opt, ''];
	}
</script>

<div role="group" aria-label={label} class={wrap}>
	{#each options as opt (opt)}
		{@const on = value === opt}
		{@const sw = swatch[opt]}
		{@const [main, sub] = split(opt)}
		<button
			type="button"
			aria-pressed={on}
			onclick={() => onpick(opt)}
			class="relative rounded-[20px] border-[1.5px] text-left text-fg transition-[border-color,background-color,transform] duration-200 active:scale-[0.97] {tile} {on
				? 'border-accent bg-accent/10'
				: 'border-white/[0.08] bg-white/[0.03] hover:border-accent/60'}"
		>
			{#if layout === 'swatch'}
				{#if sw?.startsWith('/')}
					<img src={sw} alt="" width="48" height="48" class="size-12" />
				{:else}
					<span class="grid size-12 place-items-center rounded-full border-2 border-dashed border-white/45 text-fg/80">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					</span>
				{/if}
				<span class="text-[15px] font-bold">{main}{#if sub}<span class="text-xs font-medium text-fg/60">{sub}</span>{/if}</span>
			{:else}
				<span class="grid shrink-0 place-items-center bg-white/5 text-fg/90 {iconBox}">
					<TileIcon name={opt} size={iconSize} />
				</span>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-none">
					<span class="text-[17px] font-bold">{opt}</span>
					{#if desc[opt]}<span class="text-[13px] leading-snug text-fg/60">{desc[opt]}</span>{/if}
				</span>
			{/if}

			{#if on}
				<span
					class="grid place-items-center rounded-full bg-accent motion-safe:animate-pop {layout === 'row'
						? 'size-6 shrink-0 lg:absolute lg:top-3 lg:right-3'
						: layout === 'swatch'
							? 'absolute top-2 right-2 size-[22px]'
							: 'absolute top-3 right-3 size-6'}"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
				</span>
			{/if}
		</button>
	{/each}
</div>
