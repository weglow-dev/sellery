<script lang="ts">
	import { page } from '$app/state';
	import { orders } from '$lib/mock/orders.svelte';
	import { app } from '$lib/state.svelte';
	import { TEXTAREA } from '$lib/ui';
	import { closeDrawer, setParams } from '$lib/url';
	import Btn from '$lib/components/Btn.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import OrderDrawer from '$lib/components/OrderDrawer.svelte';
	import OrderModals from '$lib/components/OrderModals.svelte';
	import OrdersHead from '$lib/components/OrdersHead.svelte';

	/** 송장 일괄 입력 — docs/myr-admin-screens.md §6-3. CSV(주문번호,택배사,운송장)를 붙여 넣으면 줄마다 미리보기(저장할 수 있어요 · 저장 안 됨 + 이유) → [N건 저장] → 결과 토스트 → [새로 입력].
	 *  PC 우선 화면이지만 모바일에서도 깨지지 않게(카드 · 세로 쌓기). 판정 · 칩 · 이유 · 결과 문구는 서버(목) 값 */
	let csv = $state('');
	const pv = $derived(orders.bulkPreview(csv));
	const openId = $derived(page.url.searchParams.get('id'));
	const openRow = (id: string) => setParams(page.url, { id }, true);

	function save() {
		const r = orders.bulkSave(csv);
		app.showToast(r.msg, r.ok ? 'ok' : 'error');
	}
	function reset() {
		csv = '';
		orders.bulkReset();
	}
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<OrdersHead value="bulk" sum={orders.bulkSum}>
		{#snippet actions()}
			{#if pv.saved}
				<Btn kind="ghost" onclick={reset}>새로 입력</Btn>
			{:else}
				<Btn kind="primary" onclick={save}>{pv.okN}건 저장</Btn>
			{/if}
		{/snippet}
	</OrdersHead>

	<div class="mt-5 rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:px-6 lg:py-[22px]">
		<div class="flex items-baseline justify-between gap-3">
			<label for="orders-csv" class="text-[17px] font-extrabold">CSV 붙여 넣기</label>
			<span class="text-[13px] text-white/55">주문번호,택배사,운송장</span>
		</div>
		<textarea id="orders-csv" bind:value={csv} readonly={pv.saved} rows="5" placeholder="MYR1534,CJ대한통운,5612-3401-7720" class="{TEXTAREA} mt-3.5 font-mono text-[13px] leading-[1.6] lg:text-[13.5px]"></textarea>
		{#if pv.saved}<p class="mt-2 text-[12.5px] text-white/55">저장이 끝났어요 · 다른 CSV 를 넣으려면 [새로 입력]을 눌러 주세요</p>{/if}
	</div>

	<ListBox n={pv.rows.length} empty={orders.bulkEmpty}>
		{#each pv.rows as r (r.key)}
			{#if r.id && r.thumb}
				<ListRow thumb={r.thumb} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} onopen={() => openRow(r.id!)} selected={openId === r.id} />
			{:else}
				<ListRow avatar={{ initial: '?', bg: '#2a2c33', light: true }} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} />
			{/if}
		{/each}
	</ListBox>
</div>

{#if openId}
	<OrderDrawer id={openId} onclose={() => closeDrawer(page.url)} />
{/if}
<OrderModals />
