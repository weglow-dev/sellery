<script lang="ts">
	/* 브랜드용 인플루언서 갤러리 카드 — 데이터 게이트 포함 (js/40-brand.js sellerCard) */
	import { S, D_, brand, prod, calc, gname, dataPrice, platIcon, PLAT_ICONS, passActive, estExternal, fmt, md, P, CEL, gfull, act, openModal, go, DONE_STATES, type Seller } from '@sellery/core';
	import Avatar from './Avatar.svelte';
	import GradeBox from './GradeBox.svelte';
	import PIcon from './PIcon.svelte';
	import StChip from './StChip.svelte';
	let { s, reason = '' }: { s: Seller; reason?: string } = $props();
	const done = $derived(D_().campaigns.filter((c) => c.sellerId === s.id && DONE_STATES.includes(c.status)));
	const hist = $derived(done.slice().sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1)).slice(0, 2));
	const eng = $derived((s.likesAvg / s.followers * 100).toFixed(1));
	const rl = $derived(s.recentLikes || []);
	const mxL = $derived(Math.max(...rl, 1));
	const trendUp = $derived(rl.length > 1 && rl[rl.length - 1] >= rl[0]);
	const bv = $derived(S.role === 'brand' ? brand(S.actingBrand) : null);
	const worked = $derived(!!bv && done.some((c) => prod(c.productId).brandId === bv!.id));
	const avgNet = $derived(done.length ? done.reduce((a, c) => a + calc(c).net, 0) / done.length : null);
	const unlocked = $derived(!bv || worked || passActive(bv, 'datapass', 30) || (((D_().brandDataUnlocks || {})[bv!.id]) || []).includes(s.id));
	const ext = $derived(((D_().external || {})[s.id] || []).slice(0, 2));
</script>

<div class="card scard">
	{#if reason}<div class="rec-tag">✦ 추천 — {@html reason}</div>{/if}
	<div class="flex gap-3.5 items-center">
		<Avatar {s} />
		<div class="flex-1 min-w-0">
			<div><GradeBox g={gname(s)} /> <b style="font-size:15.5px">{s.name}</b> <span style="color:var(--mute);font-size:12px">{@html platIcon(s)} {s.handle}</span>{#if worked} <span class="st green" style="animation:none">함께 판매 · 데이터 무료</span>{/if}</div>
			<div style="font-size:12px;color:var(--mute)">{s.cat} · 팔로워 {fmt(s.followers)} · {s.intro}</div>
		</div>
	</div>
	<div class="gate {unlocked ? '' : 'locked'}">
		<div class="mini-stats">
			<div><span class="ms-l">3개월 매출</span><span class="ms-v">₩{fmt(s.m3Sales)}</span></div>
			<div><span class="ms-l">판매당 평균 매출</span><span class="ms-v">{avgNet != null ? '₩' + fmt(avgNet) : '—'}</span></div>
			<div><span class="ms-l">좋아요 평균</span><span class="ms-v">{fmt(s.likesAvg)}</span></div>
			<div><span class="ms-l">참여율</span><span class="ms-v">{eng}%</span></div>
		</div>
		<div class="sc-cols">
			<div>
				<div class="lbl-sm" style="margin-bottom:6px">최근 진행 이력</div>
				{#each hist as c}
					{@const p = prod(c.productId)}{@const k = calc(c)}
					<div class="sc-hist" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><span class="truncate"><PIcon {p} sz={18} /> {p.name} <span style="color:var(--mute)">{c.start ? md(P(c.start)) + '–' + md(P(c.end!)) : ''}</span></span><span class="num">₩{fmt(k.net)}</span><StChip st={c.status} /></div>
				{:else}
					<div style="font-size:12px;color:var(--mute)">셀러리 첫 판매 대기 — 지금 제안해 선점하세요</div>
				{/each}
				<div class="lbl-sm" style="margin:12px 0 6px">📡 외부 판매 감지 · 예상 매출 <span class="font-normal tracking-normal normal-case" title="크롤링 기반 가계산 — 실데이터 확보 후 계산식 확정 예정">(가계산)</span></div>
				{#each ext as x}
					{@const e = estExternal(s, x)}
					<div class="sc-hist" style="cursor:default"><span class="truncate">{@html PLAT_ICONS[x.src] || ''} {x.name} <span style="color:var(--mute)">· {x.brand} · {md(P(x.at))}</span></span><span class="num" style="color:var(--red)">예상 ₩{fmt(e.lo / 1e4)}만–{fmt(e.hi / 1e4)}만</span></div>
				{:else}
					<div style="font-size:12px;color:var(--mute)">최근 30일 외부 판매 감지 없음</div>
				{/each}
			</div>
			<div>
				<div class="lbl-sm" style="margin-bottom:6px">최근 게시물 반응 {#if trendUp}<b style="color:var(--red)">▲ 상승</b>{/if}</div>
				<div class="spark">{#each rl as v}<span style="height:{Math.max(12, v / mxL * 100)}%"></span>{/each}</div>
				<div style="font-size:10.5px;color:var(--mute);margin-top:4px">최근 {rl.length}개 게시물 좋아요</div>
			</div>
		</div>
		{#if !unlocked}<div class="gate-cta"><button class="pri sm" onclick={() => act.unlockSellerData(s.id)}>{@html CEL} {dataPrice(s)} · 데이터 확인하기</button><span>{@html gfull(gname(s))} 등급 · 3개월 매출 · 판매당 평균 · 참여율 · 이력 · 외부 판매 예상</span></div>{/if}
	</div>
	<button class="pri" style="margin-top:12px;width:100%" onclick={() => openModal('invite', { sid: s.id })}>판매 직접 제안</button>
</div>
