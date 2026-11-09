<script lang="ts">
	import { tick } from 'svelte';
	import { BANKS } from '@sellery/myr-core/settle-info';
	import { authInput } from '$lib/auth-ui';

	/**
	 * 은행 고르기 — 가입 폼 · 내 정보 공용(SettleFields). 샵 문의 시트의 주문 목록(CsSheet)과 같은 모양:
	 * 입력 칸 모양의 버튼 + 아래로 펼치는 목록(어두운 카드 · 줄 구분선 · 최대 높이 안에서 스크롤 · 줄은 낮게).
	 * 키보드: ↑ ↓ 로 옮기고 Enter · Space 로 고른다 · Esc 로 닫는다. 바깥을 누르면 닫힌다. name 이 있으면 숨은 입력으로 form 에 실린다.
	 */
	let { id, value = $bindable(''), name, invalid = false, onchange }: { id: string; value: string; name?: string; invalid?: boolean; onchange?: () => void } = $props();

	let open = $state(false);
	let active = $state(-1);
	let root: HTMLDivElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	const options = $derived(value && !(BANKS as readonly string[]).includes(value) ? [...BANKS, value] : [...BANKS]);

	async function toggle(next = !open) {
		open = next;
		if (!open) return;
		active = Math.max(0, options.indexOf(value));
		await tick();
		list?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	}
	function pick(b: string) {
		value = b;
		open = false;
		onchange?.();
		document.getElementById(id)?.focus();
	}
	async function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
			return;
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open) return toggle(true);
			active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
			await tick();
			list?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
			return;
		}
		if ((e.key === 'Enter' || e.key === ' ') && open && active >= 0) {
			e.preventDefault();
			pick(options[active]);
		}
	}
</script>

<svelte:window onpointerdown={(e) => open && root && !root.contains(e.target as Node) && (open = false)} />

<div class="relative" bind:this={root}>
	{#if name}<input type="hidden" {name} {value} />{/if}
	<button
		{id}
		type="button"
		role="combobox"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-invalid={invalid}
		onclick={() => toggle()}
		onkeydown={onKey}
		class="{authInput({ size: 'md', invalid, filled: !!value })} flex items-center justify-between text-left {open ? 'border-accent' : ''}"
	>
		<span class={value ? 'text-fg' : 'text-white/34'}>{value || '은행을 골라 주세요'}</span>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 text-white/45 transition-transform {open ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg>
	</button>
	{#if open}
		<ul bind:this={list} id="{id}-list" role="listbox" aria-label="은행" class="no-bar absolute top-[calc(100%+6px)] right-0 left-0 z-20 max-h-[240px] overflow-y-auto overscroll-contain rounded-[14px] border border-white/10 bg-[#1b1c21] py-1 shadow-[0_12px_32px_rgba(0,0,0,.45)]">
			{#each options as b, i (b)}
				{@const on = b === value}
				<li role="option" aria-selected={on} data-i={i}>
					<button
						type="button"
						tabindex="-1"
						onclick={() => pick(b)}
						onpointermove={() => (active = i)}
						class="flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] {on ? 'font-bold text-accent' : 'text-fg'} {i === active ? 'bg-white/6' : ''}"
					>
						{b}
						{#if on}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
