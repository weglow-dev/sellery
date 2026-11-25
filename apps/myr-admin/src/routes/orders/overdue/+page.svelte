<script lang="ts">
	import { page } from '$app/state';
	import { orders } from '$lib/mock/orders.svelte';
	import { app } from '$lib/state.svelte';
	import { closeDrawer, setParams } from '$lib/url';
	import Band from '$lib/components/Band.svelte';
	import Btn from '$lib/components/Btn.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import OrderDrawer from '$lib/components/OrderDrawer.svelte';
	import OrderModals, { orderModal } from '$lib/components/OrderModals.svelte';
	import OrdersHead from '$lib/components/OrdersHead.svelte';

	/** 배송 완료 예외 — docs/myr-admin-screens.md §6-4. 배송 중으로 5일 넘은 출고 줄 · 배송 완료가 찍혀야 정산에 들어가므로 운영이 택배 조회로 확인하고 [배송 완료]로 직접 찍는다.
	 *  띠 · 요약 · 줄(발송 N일째 · 발송일 · 택배사 송장) · 빈 상태 문구는 서버(목) 값. 줄을 누르면 같은 주문 서랍(?id=) */
	const rows = $derived(orders.overdue());
	const openId = $derived(page.url.searchParams.get('id'));
	const openRow = (id: string) => setParams(page.url, { id }, true);
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<OrdersHead value="overdue" sum={orders.overdueSum} />

	<div class="mt-5"><Band tone="orange" text={orders.overdueBand} /></div>

	<ListBox n={rows.length} empty={orders.overdueEmpty}>
		{#each rows as r (r.id)}
			<ListRow thumb={r.thumb} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} onopen={() => openRow(r.id)} selected={openId === r.id}>
				{#snippet buttons(full)}
					<Btn sm {full} onclick={() => app.showToast(r.trackToast)}>택배 조회</Btn>
					<Btn sm {full} kind="primary" onclick={() => orderModal.show('delivered', r.id)}>배송 완료</Btn>
				{/snippet}
			</ListRow>
		{/each}
	</ListBox>
</div>

{#if openId}
	<OrderDrawer id={openId} onclose={() => closeDrawer(page.url)} />
{/if}
<OrderModals />
