<script lang="ts">
	/* 인플루언서 상품 갤러리 카드 (js/20-seller.js prodCard) */
	import { S, D_, brand, bgname, gfull, fmt, sampleLine, sampleBtn, passActive, act, openModal, ACTIVE_BLOCKERS, GRADES, type Product } from '@sellery/core';
	import GradeBox from './GradeBox.svelte';
	let { p }: { p: Product } = $props();
	const b = $derived(brand(p.brandId));
	const exclLocked = $derived(!!p.exclusiveSellerId && p.exclusiveSellerId !== S.actingSeller);
	const btn = $derived(sampleBtn(p, S.actingSeller));
	const thumb = $derived(p.thumb ? (p.thumb.startsWith('assets/') ? '/' + p.thumb : p.thumb) : '');
	const detail = () => openModal('productDetail', { pid: p.id });
</script>

<div class="card prod">
	<div class="ph" role="button" tabindex="0" onclick={detail} onkeydown={(e) => e.key === 'Enter' && detail()} style="cursor:pointer;position:relative">
		<span class="p3d">{#if thumb}<img src={thumb} alt="" style="max-height:92%;max-width:78%;object-fit:contain;pointer-events:none" />{:else}{p.em}{/if}</span>
		{#if p.t}<span class="trendbadge">▲ {p.t.g}</span>{:else if passActive(p, 'boost', 7)}<span class="trendbadge" style="background:var(--yellow);color:var(--ink)">★ 부스트</span>{/if}
		{#if p.exclusive}<span class="exclbadge">독점권 오퍼</span>{/if}
	</div>
	<div><span class="chip brand">{b.name}</span> <GradeBox g={bgname(b)} /> <span class="sub" style="font-size:11px;color:var(--mute)">{p.cat}</span></div>
	<div class="nm" role="button" tabindex="0" onclick={detail} onkeydown={(e) => e.key === 'Enter' && detail()} style="cursor:pointer">{p.name}</div>
	<div class="meta">{p.desc} · 샘플 {p.sample}</div>
	<div class="meta" style="font-size:11px">🎁 {@html sampleLine(p)}</div>
	<div class="prices"><span class="gp">₩{fmt(p.gp)}</span><span class="cp">₩{fmt(p.cp)}</span>{#if p.cp > p.gp}<span class="disc">-{Math.round((1 - p.gp / p.cp) * 100)}%</span>{/if}<span class="rate">수수료 {(p.rate * 100).toFixed(0)}~{(p.rate * 100 + GRADES[0].bonus).toFixed(0)}%</span></div>
	<div class="meta">건당 예상 수수료 ₩{fmt(p.gp * p.rate)}{#if exclLocked} · <b style="color:var(--danger)">독점 인플루언서 확정 상품</b>{/if}</div>
	<div class="btnrow">
		<button class="sm ghost" onclick={detail}>실적·상세</button>
		{#if btn}
			{#if btn.kind === 'locked' || btn.kind === 'already'}<button class="sm" disabled style="opacity:.5">{btn.label}</button>
			{:else if btn.kind === 'free'}<button class="pri sm" onclick={() => act.reqSample(p.id)}>{btn.label}</button>
			{:else}<button class="pri sm" title={btn.title} onclick={() => openModal('sampleBuy', { pid: p.id })}>{btn.label}</button>{/if}
		{/if}
	</div>
</div>
