<script lang="ts">
	/**
	 * 판매 카드 `custCard` (프로토타입 js/60-customer.js L9-23 · ux-spec §3.2.3 · web campaign-card.tsx) — 홈 · 링크 페이지 "다른 판매".
	 *   .ph(클릭 → 링크 페이지) [p3d 누끼 | emoji] + trendbadge(★ 추천 | D-day | 오픈 D-n | 판매 종료)
	 *   인플루언서 행 · .nm · .meta({description} · {brand}) · .prices · .meta(기간·잔여·판매됨·보는 중) · .btnrow
	 * 링크는 정식 URL(/s/{handle}/{code}) 로 바로 간다 — 내부 이동은 hooks 가 쿠키를 덮어쓰지 않는다 (app-plan §8).
	 * 기준일 `today` 는 서버가 넘긴다 (KST). "보는 중" 은 <Viewers/> 가 20초마다 갱신.
	 */
	import { badgeTone, ddayLabelFor, discountPct, fmtNum, imageSrc, isHomeFeat, storeUrl, won, type HomeCard } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import Cel from './icons/Cel.svelte';
	import PlatIcon from './icons/PlatIcon.svelte';
	import GradeBox from './GradeBox.svelte';
	import Tilt from './Tilt.svelte';
	import SellerAvatar from './SellerAvatar.svelte';
	import Viewers from './Viewers.svelte';
	import VerifyLauncher from './VerifyLauncher.svelte';
	import { showToast } from './toast.svelte';
	import { NOTIFY_TOAST } from './constants';

	let { c, today, featureDays = 7, allowFeat = true }: { c: HomeCard; today: string; featureDays?: number; allowFeat?: boolean } = $props();

	const href = $derived(storeUrl(c.seller.handle, c.code));
	const live = $derived(c.status === 'LIVE');
	const soon = $derived(c.status === 'SCHEDULE_CONFIRMED');
	const left = $derived(c.qty - c.sold_qty);
	const feat = $derived(allowFeat && isHomeFeat(c, today, featureDays));
	const dd = $derived(ddayLabelFor(c, today));
	const tone = $derived(badgeTone(dd));
	const disc = $derived(discountPct(c.product.consumer_price, c.product.sale_price));
	const thumb = $derived(imageSrc(c.product.thumb_url));
</script>

<div class="card prod">
	<a {href} class="ph" aria-label="{c.product.name} 판매 페이지">
		<Tilt>
			{#if thumb}<img src={thumb} alt="" style="max-height:92%;max-width:78%;object-fit:contain;pointer-events:none" />{:else}{c.product.emoji}{/if}
		</Tilt>
		{#if feat}<span class="trendbadge feat">★ 추천</span>{:else}<span class={tone ? `trendbadge ${tone}` : 'trendbadge'}>{dd}</span>{/if}
	</a>
	<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
		<SellerAvatar avatarUrl={c.seller.avatar_url} size={28} />
		<span style="font-size:12.5px"><b>{c.seller.name}</b> <span style="color:var(--color-mute)"><PlatIcon platform={c.seller.platform} /> {c.seller.handle}</span></span>
		<GradeBox grade={c.seller.grade} sm />
	</div>
	<a {href} class="nm">{c.product.name}</a>
	<div class="meta">{c.product.description ? `${c.product.description} · ` : ''}{c.brand.name}</div>
	<div class="prices">
		<span class="gp">{won(c.product.sale_price)}</span>
		<span class="cp">{won(c.product.consumer_price)}</span>
		{#if disc !== null}<span class="disc">-{disc}%</span>{/if}
	</div>
	<div class="meta">
		{#if live}
			{c.start_date ? md(c.start_date) : '—'}–{c.end_date ? md(c.end_date) : '—'} · 잔여 {fmtNum(Math.max(0, left))}개 · <b>{fmtNum(c.sold_qty)}개 판매됨</b> · <span style="color:var(--color-danger)">👀 <Viewers code={c.code} />명 보는 중</span>
		{:else if soon}
			{c.start_date ? md(c.start_date) : '—'} 오픈 예정 · 한정 {fmtNum(c.qty)}개 · 🔔 알림 <Viewers code={c.code} offset={12} />명
		{:else}
			{c.start_date ? md(c.start_date) : '—'}–{c.end_date ? md(c.end_date) : '—'} · <b>{fmtNum(c.sold_qty)}개 판매됨</b> · 판매 종료
		{/if}
	</div>
	<div class="btnrow">
		{#if live}
			<a {href} class="btn pri sm">구매하기</a>
		{:else if soon}
			<button type="button" class="sm ghost" onclick={() => showToast(NOTIFY_TOAST)}>🔔 오픈 알림</button>
		{:else}
			<a {href} class="btn sm ghost">판매 페이지</a>
		{/if}
		<VerifyLauncher code={c.code} class="sm ghost"><Cel /> 인증 확인</VerifyLauncher>
	</div>
</div>
