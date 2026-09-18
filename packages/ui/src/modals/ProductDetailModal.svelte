<script lang="ts">
	/* 상품 상세 · 익명 판매 실적 (js/20-seller.js productDetailModal) */
	import { S, D_, prod, brand, seller, calc, gname, bgname, gfull, exGradeOf, exEligible, sampleLine, sampleLeft, sampleBtn, fmt, md, P, CEL, GRADES, DONE_STATES, act, openModal, closeModal, go } from '@sellery/core';
	import Modal from '../components/Modal.svelte';
	import PIcon from '../components/PIcon.svelte';
	import GradeBox from '../components/GradeBox.svelte';
	import StChip from '../components/StChip.svelte';
	let { pid }: { pid: string } = $props();
	const p = $derived(prod(pid)), b = $derived(brand(p.brandId));
	const hist = $derived(D_().campaigns.filter((c) => c.productId === pid && DONE_STATES.includes(c.status)));
	const isSeller = $derived(S.role === 'seller');
	const me = $derived(isSeller ? seller(S.actingSeller) : null);
	const hasPass = $derived(!isSeller || !!(me && me.celeryItems && me.celeryItems.datapass));
	const exg = $derived(exGradeOf(p));
	const already = $derived((D_().exclusiveReqs || []).find((r) => r.productId === pid && r.sellerId === S.actingSeller && r.status !== 'REJECTED'));
	const btn = $derived(isSeller ? sampleBtn(p, S.actingSeller) : null);
	const logo = $derived(b.logo);
</script>

<Modal wide>
	<h3 class="flex items-center gap-2"><PIcon {p} sz={30} /> {p.name}</h3>
	<div style="font-size:12.5px;color:var(--mute);margin:-8px 0 12px">{#if logo}<img src={logo} alt="" style="width:20px;height:20px;vertical-align:-6px;border:1.5px solid var(--soft-line);margin-right:2px" />{/if}<span class="chip brand">{b.name}</span> <GradeBox g={bgname(b)} /> {p.cat} · 판매가 ₩{fmt(p.gp)} <s style="opacity:.6">₩{fmt(p.cp)}</s> {#if p.cp > p.gp}<span class="disc">-{Math.round((1 - p.gp / p.cp) * 100)}%</span>{/if} · 수수료 {(p.rate * 100).toFixed(0)}~{(p.rate * 100 + GRADES[0].bonus).toFixed(0)}% (등급 보너스 포함) · 샘플 {p.sample}{#if p.t} · <b style="color:var(--danger)">▲{p.t.g} {p.t.note}</b>{/if}</div>
	<div class="notice" style="margin:0 0 10px;font-size:12.5px">🎁 <b>샘플 정책</b> — {@html sampleLine(p)}{#if me} · 내 등급 <GradeBox g={gname(me)} /> · 이달 무상 한도 {sampleLeft(me)}회 남음{/if}</div>
	{#if p.exclusive}
		<div class="exclbox">
			<div class="lbl-sm">👑 브랜드 독점권 오퍼</div>
			<p style="margin:6px 0;font-size:13px"><b>{p.exclusive.label}</b> — <b>{@html gfull(exg!)}</b> 등급 이상 인플루언서에게 드립니다.</p>
			{#if p.exclusiveSellerId}<p style="font-size:12.5px;margin:0"><b>독점 인플루언서 확정됨</b>{p.exclusiveSellerId === S.actingSeller ? ' — 나 🎉' : ' (○○○ 인플루언서)'}</p>
			{:else if isSeller && me}
				{#if already}<button class="sm" disabled style="opacity:.6">신청 완료 — 브랜드 승인 대기</button>
				{:else if exEligible(p, me)}<button class="pri sm" title="신청 시 브랜드에 프로필(이름·채널·지표)이 공개됩니다" onclick={() => act.reqExclusive(pid)}>독점권 신청 — 내 등급 {@html gfull(gname(me))} 충족 ✓</button>
				{:else}<button class="sm" disabled style="opacity:.6">등급 미달 — 내 등급 {@html gfull(gname(me))} / 필요 {@html gfull(exg!)} 이상</button>{/if}
			{/if}
		</div>
	{/if}
	<div class="lbl-sm" style="margin:16px 0 8px">이 상품의 판매 실적 — 인플루언서 익명</div>
	<div class="tblw fit" style="box-shadow:none;overflow:visible"><table style="min-width:0">
		<thead><tr><th class="num">팔로워</th><th class="num">좋아요</th><th class="num">참여율</th><th class="num">기간</th><th class="num">확정 매출</th><th>상태</th></tr></thead>
		<tbody>
			{#each hist as c, i}
				{@const s = seller(c.sellerId)}{@const k = calc(c)}
				<tr class={!hasPass && i > 0 ? 'blurrow' : ''}><td class="num">{fmt(s.followers)}</td><td class="num">{fmt(s.likesAvg)}</td><td class="num">{(s.likesAvg / s.followers * 100).toFixed(1)}%</td><td class="num">{c.start ? md(P(c.start)) + '–' + md(P(c.end!)) : '—'}</td><td class="num"><b>₩{fmt(k.net)}</b></td><td><StChip st={c.status} /></td></tr>
			{:else}
				<tr><td colspan="6" class="empty">아직 진행된 판매가 없습니다 — 첫 인플루언서가 되어보세요</td></tr>
			{/each}
			{#if !hasPass && hist.length > 1}<tr><td colspan="6" style="text-align:center;padding:10px"><button class="pri sm" onclick={() => act.buyDataPass(pid)}>{@html CEL} 2 · 매출 데이터 확인권으로 전체 실적 보기</button></td></tr>{/if}
		</tbody></table></div>
	{#if p.imgs && p.imgs.length}<div class="lbl-sm" style="margin:16px 0 8px">상세페이지 이미지</div>{#each p.imgs as u}<img src={u} alt="" style="width:100%;border:1.5px solid var(--soft-line);margin-bottom:8px;display:block" />{/each}{/if}
	<div class="foot">
		<button onclick={() => { closeModal(); go.store('p:' + pid); }}>🛍 상세페이지 보기</button>
		{#if btn}
			{#if btn.kind === 'locked' || btn.kind === 'already'}<button disabled style="opacity:.5">{btn.label}</button>
			{:else if btn.kind === 'free'}<button class="pri" onclick={() => act.reqSample(pid)}>{btn.label}</button>
			{:else}<button class="pri" title={btn.title} onclick={() => openModal('sampleBuy', { pid })}>{btn.label}</button>{/if}
		{/if}
		<button onclick={closeModal}>닫기</button>
	</div>
</Modal>
