<script lang="ts">
	/* 고객 홈 상품 카드 (js/60-customer.js custCard) */
	import { prod, seller, brand, soldQty, gname, platIcon, isHomeFeat, fmt, md, P, daysLeft, daysUntil, go, type Campaign } from '@sellery/core';
	import Avatar from './Avatar.svelte';
	import GradeBox from './GradeBox.svelte';
	let { c }: { c: Campaign } = $props();
	const p = $derived(prod(c.productId)), s = $derived(seller(c.sellerId)), b = $derived(brand(p.brandId));
	const live = $derived(c.status === 'LIVE'), left = $derived((c.qty || 0) - soldQty(c.id));
	const thumb = $derived(p.thumb ? (p.thumb.startsWith('assets/') ? '/' + p.thumb : p.thumb) : '');
	const open = () => go.store(c.id);
</script>

<div class="card prod">
	<div class="ph" role="button" tabindex="0" onclick={open} onkeydown={(e) => e.key === 'Enter' && open()} style="cursor:pointer;position:relative"><span class="p3d">{#if thumb}<img src={thumb} alt="" style="max-height:92%;max-width:78%;object-fit:contain;pointer-events:none" />{:else}{p.em}{/if}</span>
		{#if isHomeFeat(c)}<span class="trendbadge" style="background:var(--yellow);color:var(--ink)">★ 추천</span>{:else if live}<span class="trendbadge">{daysLeft(c.end!) <= 1 ? '오늘 마감' : 'D-' + daysLeft(c.end!) + ' 마감'}</span>{:else}<span class="trendbadge" style="background:var(--ink);color:var(--yellow)">오픈 D-{daysUntil(c.start!)}</span>{/if}</div>
	<div class="flex items-center gap-2 flex-wrap"><Avatar {s} sz={28} /><span style="font-size:12.5px"><b>{s.name}</b> <span style="color:var(--mute)">{@html platIcon(s)} {s.handle}</span></span><GradeBox g={gname(s)} /></div>
	<div class="nm" role="button" tabindex="0" onclick={open} onkeydown={(e) => e.key === 'Enter' && open()} style="cursor:pointer">{p.name}</div>
	<div class="meta">{p.desc} · {b.name}</div>
	<div class="prices"><span class="gp">₩{fmt(p.gp)}</span><span class="cp">₩{fmt(p.cp)}</span>{#if p.cp > p.gp}<span class="disc">-{Math.round((1 - p.gp / p.cp) * 100)}%</span>{/if}</div>
	<div class="meta">{#if live}{md(P(c.start!))}–{md(P(c.end!))} · 잔여 {fmt(Math.max(0, left))}개 · {fmt(soldQty(c.id))}개 판매됨{:else}{md(P(c.start!))} 오픈 · 배정 {fmt(c.qty || 0)}개{/if}</div>
	<div class="btnrow">{#if live}<button class="pri sm" onclick={open}>구매하기</button>{:else}<button class="sm" onclick={open}>오픈 알림 받기</button>{/if}<button class="sm ghost" onclick={open}>상세</button></div>
</div>
