<script lang="ts">
	import { modal } from '@sellery/core';
	import ScheduleModal from './ScheduleModal.svelte';
	import SampleBuyModal from './SampleBuyModal.svelte';
	import InviteModal from './InviteModal.svelte';
	import ProductModal from './ProductModal.svelte';
	import ProductDetailModal from './ProductDetailModal.svelte';
	import ChannelModal from './ChannelModal.svelte';
	import VerifyModal from './VerifyModal.svelte';
	import CSModal from './CSModal.svelte';
	import CSReplyModal from './CSReplyModal.svelte';
	import TrackOneModal from './TrackOneModal.svelte';
	import VerifyStoreModal from './VerifyStoreModal.svelte';
	import OrderDoneModal from './OrderDoneModal.svelte';
	import CustRefundModal from './CustRefundModal.svelte';
	import KakaoModal from './KakaoModal.svelte';
	import TopSellerModal from './TopSellerModal.svelte';
	import BrandGradeModal from './BrandGradeModal.svelte';
	import SellerProfileModal from './SellerProfileModal.svelte';
	const p = $derived(modal.props as any);
</script>

{#if modal.kind === 'schedule'}<ScheduleModal cid={p.cid} />
{:else if modal.kind === 'sampleBuy'}<SampleBuyModal pid={p.pid} />
{:else if modal.kind === 'invite'}<InviteModal sid={p.sid} />
{:else if modal.kind === 'product'}<ProductModal pid={p.pid ?? null} />
{:else if modal.kind === 'productDetail'}<ProductDetailModal pid={p.pid} />
{:else if modal.kind === 'channel'}<ChannelModal chId={p.chId ?? null} />
{:else if modal.kind === 'verify'}<VerifyModal chId={p.chId} />
{:else if modal.kind === 'cs'}<CSModal cid={p.cid} oid={p.oid ?? ''} />
{:else if modal.kind === 'csReply'}<CSReplyModal id={p.id} />
{:else if modal.kind === 'trackOne'}<TrackOneModal oid={p.oid} />
{:else if modal.kind === 'verifyStore'}<VerifyStoreModal cid={p.cid} />
{:else if modal.kind === 'orderDone'}<OrderDoneModal ids={p.ids} />
{:else if modal.kind === 'custRefund'}<CustRefundModal oid={p.oid} />
{:else if modal.kind === 'kakao'}<KakaoModal />
{:else if modal.kind === 'topSeller'}<TopSellerModal sid={p.sid} />
{:else if modal.kind === 'brandGrade'}<BrandGradeModal />
{:else if modal.kind === 'sellerProfile'}<SellerProfileModal sid={p.sid} />
{/if}
