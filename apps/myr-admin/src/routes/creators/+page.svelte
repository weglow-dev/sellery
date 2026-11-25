<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { server } from '$lib/mock/server.svelte';
	import { setParams } from '$lib/url';
	import Avatar from '$lib/components/Avatar.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import InviteSend from '$lib/components/InviteSend.svelte';
	import PageHead from '$lib/components/PageHead.svelte';

	/** 크리에이터 목록 — docs/myr-admin-screens.md §5-2 (시안 "MYR Admin PC" · "MYR Admin" 크리에이터 · 2026-11-25).
	 *  탭 3개(전체 · 대기 · 정지) · 표(크리에이터 · 상태 · 채널 · 상품 · 가입일 — 모바일은 같은 칸을 좁게 두고 옆으로 밀어서 본다) · 줄을 누르면 상세(/creators/[id]).
	 *  머리 오른쪽 [초대 보내기](InviteSend). 칩 · 건수 · 빈 상태 문구는 서버(목) 값 */
	const tabs = $derived(server.crTabs());
	const t0 = $derived(page.url.searchParams.get('tab'));
	const tab = $derived<'all' | 'wait' | 'stopped'>(t0 === 'wait' || t0 === 'stopped' ? t0 : 'all');
	const res = $derived(server.crList(tab));
	let inviting = $state(false);

	// 예전 주소(/creators?id=) — 다른 화면의 크리에이터 링크는 상세 화면으로 넘긴다
	$effect(() => {
		const id = page.url.searchParams.get('id');
		if (id) goto(`/creators/${id}`, { replaceState: true });
	});

	const COLS = 'grid-cols-[minmax(0,1.1fr)_250px_120px_160px_110px_18px]';
	const COLS_M = 'grid-cols-[180px_190px_84px_150px_84px]';
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-16">
	<PageHead title="크리에이터">
		{#snippet actions()}
			<Btn kind="ghost" onclick={() => (inviting = true)}><Icon id="send" size={16} />초대 보내기</Btn>
		{/snippet}
	</PageHead>

	<div class="mt-4 lg:mt-5">
		<FilterTabs {tabs} value={tab} label="크리에이터 상태" onpick={(id) => setParams(page.url, { tab: id === 'all' ? null : id })} />
	</div>

	<!-- PC 표 -->
	<div class="mt-4 hidden overflow-hidden rounded-3xl border border-white/8 bg-white/3 lg:block">
		<div class="grid {COLS} h-[46px] items-center gap-x-5 bg-white/[0.025] pr-5 pl-6 text-[12.5px] font-semibold text-white/45">
			<span>크리에이터</span><span>상태</span><span>채널</span><span>상품</span><span>가입일</span><span></span>
		</div>
		{#each res.rows as r (r.id)}
			<a href={r.href} class="grid {COLS} min-h-[72px] items-center gap-x-5 border-t border-white/6 py-2.5 pr-5 pl-6 transition-colors hover:bg-white/4">
				<span class="flex min-w-0 items-center gap-3">
					<Avatar initial={r.initial} bg={r.avatarBg} size={40} />
					<span class="min-w-0">
						<span class="block truncate text-[15px] font-bold tracking-[-0.01em]">{r.name}</span>
						<span class="mt-[3px] block truncate text-[12.5px] text-white/50">{r.handle}</span>
					</span>
				</span>
				<span class="flex min-w-0 flex-wrap items-center gap-[5px]">
					{#each r.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{:else}<span class="text-[13px] text-white/45">정상</span>{/each}
				</span>
				<span class="truncate text-[13.5px] text-white/70">{r.channel}</span>
				<span class="text-[13.5px] whitespace-nowrap text-white/70 tabular-nums">{r.prod}</span>
				<span class="text-[13.5px] whitespace-nowrap text-white/70 tabular-nums">{r.joined}</span>
				<span class="text-white/35"><Icon id="chev" size={18} sw={2.2} /></span>
			</a>
		{:else}
			<p class="border-t border-white/6 px-5 py-[72px] text-center text-[15px] text-white/45">{res.empty}</p>
		{/each}
	</div>

	<!-- 모바일 표 — 같은 칸을 좁게 · 옆으로 밀어서 본다 -->
	<div class="mt-3.5 overflow-hidden rounded-[20px] border border-white/8 bg-white/3 lg:hidden">
		<div class="thin-bar overflow-x-auto pb-2">
			<div class="min-w-[776px]">
				<div class="grid {COLS_M} h-10 items-center gap-x-3.5 bg-white/[0.025] px-4 text-[12px] font-semibold whitespace-nowrap text-white/45">
					<span>크리에이터</span><span>상태</span><span>채널</span><span>상품</span><span>가입일</span>
				</div>
				{#each res.rows as r (r.id)}
					<a href={r.href} class="grid {COLS_M} min-h-16 items-center gap-x-3.5 border-t border-white/6 px-4 py-2.5 active:bg-white/4">
						<span class="flex min-w-0 items-center gap-2.5">
							<Avatar initial={r.initial} bg={r.avatarBg} size={36} />
							<span class="min-w-0">
								<span class="block truncate text-[14px] font-bold">{r.name}</span>
								<span class="mt-0.5 block truncate text-[12px] text-white/50">{r.handle}</span>
							</span>
						</span>
						<span class="flex min-w-0 flex-wrap items-center gap-1">
							{#each r.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{:else}<span class="text-[13px] text-white/45">정상</span>{/each}
						</span>
						<span class="truncate text-[13px] text-white/70">{r.channel}</span>
						<span class="truncate text-[13px] text-white/70 tabular-nums">{r.prod}</span>
						<span class="truncate text-[13px] text-white/70 tabular-nums">{r.joined}</span>
					</a>
				{/each}
			</div>
		</div>
		{#if !res.rows.length}<p class="border-t border-white/6 px-4 py-12 text-center text-[14px] text-white/45">{res.empty}</p>{/if}
	</div>
</div>

{#if inviting}<InviteSend onclose={() => (inviting = false)} />{/if}
