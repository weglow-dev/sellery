<script lang="ts">
	/* 고객 구매 페이지 (js/60-customer.js vStore) — 고객 앱 본편 + 다른 앱의 '미리보기' 공용 */
	import { base } from '$app/paths';
	import { S, D_, prod, seller, brand, storeCamp, optsOf, soldQty, gname, gfull, platIcon, custVisible, fmt, md, P, daysLeft, daysUntil, CEL, CLEAR_DAYS, act, openModal, go } from '@sellery/core';
	import Avatar from '../components/Avatar.svelte';
	import GradeBox from '../components/GradeBox.svelte';
	import CustCard from '../components/CustCard.svelte';
	let { cid, back = '/' }: { cid: string; back?: string } = $props();
	const c = $derived(storeCamp(cid, S.role, S.actingSeller));
	const p = $derived(c ? prod(c.productId) : null);
	const s = $derived(c ? seller(c.sellerId) : null);
	const b = $derived(p ? brand(p.brandId) : null);
	const opts = $derived(p ? optsOf(p) : []);
	const oi = $derived(Math.min(S.ui.storeOpt || 0, opts.length - 1));
	const o = $derived(opts[oi]);
	const q = $derived(S.ui.storeQty || 1);
	const live = $derived(!!c && !c.preview && c.status === 'LIVE'), soon = $derived(!!c && c.status === 'SCHEDULE_CONFIRMED');
	const left = $derived(c ? (c.qty || 0) - soldQty(cid) : 0);
	const mine = $derived(s ? D_().campaigns.filter((x) => x.sellerId === s.id && x.id !== cid && ['LIVE', 'SCHEDULE_CONFIRMED'].includes(x.status) && custVisible(x)) : []);
	const thumb = $derived(p?.thumb ? (p.thumb.startsWith('assets/') ? '/' + p.thumb : p.thumb) : '');
	const isCust = $derived(S.role === 'customer');
	$effect(() => { cid; S.ui.storeOpt = 0; S.ui.storeQty = 1; window.scrollTo(0, 0); });
</script>

{#if !c || !p || !s || !b}
	<a href={base + back} class="inline-block" style="text-decoration:none"><button class="ghost sm" tabindex="-1">← 돌아가기</button></a><div class="empty">판매 페이지를 찾을 수 없습니다</div>
{:else}
	<div class="store">
		<div class="flex justify-between items-center gap-2.5 flex-wrap" style="margin-bottom:10px">
			<a href={base + back} class="inline-block" style="text-decoration:none"><button class="ghost sm" tabindex="-1">{isCust ? '← 셀러리 홈' : '← 돌아가기'}</button></a>
			<span style="font-size:11.5px;color:var(--mute)">{isCust ? '' : '구매자에게 보이는 화면 · '}{c.preview ? 'sellery.co.kr/p/' + p.id + ' (상세페이지 미리보기)' : 'sellery.co.kr/s/' + s.handle.slice(1) + '/' + cid}</span>
		</div>
		<div class="store-trust" role="button" tabindex="0" onclick={() => !c.preview && openModal('verifyStore', { cid })} onkeydown={(e) => e.key === 'Enter' && !c.preview && openModal('verifyStore', { cid })}>{@html CEL} <b>셀러리 인증 판매</b> · 결제 보관 · {CLEAR_DAYS}일 환불 보호 · 인플루언서 채널 인증 ✓ <span style="text-decoration:underline;margin-left:auto">{c.preview ? '미리보기' : '인증 확인'}</span></div>
		<div class="card" style="padding:0;overflow:hidden">
			<div class="store-hero"><div class="store-em p3d">{#if thumb}<img src={thumb} alt="" style="max-height:220px;max-width:80%;object-fit:contain" />{:else}{p.em}{/if}</div>
				{#if live}<span class="trendbadge" style="position:absolute;top:30px;left:14px">{daysLeft(c.end!) <= 1 ? '오늘 마감' : 'D-' + daysLeft(c.end!) + ' 마감'}</span>
				{:else if soon}<span class="trendbadge" style="position:absolute;top:30px;left:14px;background:var(--ink);color:var(--yellow)">오픈 D-{daysUntil(c.start!)}</span>
				{:else if c.preview}<span class="trendbadge" style="position:absolute;top:30px;left:14px;background:var(--mute)">미리보기</span>
				{:else}<span class="trendbadge" style="position:absolute;top:30px;left:14px;background:var(--mute)">판매 종료</span>{/if}</div>
			<div style="padding:18px 20px 20px">
				<div class="flex items-center gap-2.5 flex-wrap" style="margin-bottom:10px"><Avatar {s} sz={40} />
					<div style="flex:1;min-width:160px"><div><b>{s.name}</b> <span style="color:var(--mute);font-size:12px">{@html platIcon(s)} {s.handle}</span> <GradeBox g={gname(s)} /></div><div style="font-size:11.5px;color:var(--mute)">셀러리 인증 인플루언서 × {b.name} 공식 공급</div></div>
					{#if mine.length && isCust}<button class="sm ghost" onclick={() => { S.ui.custSel = s.id; go.screen('home'); }}>다른 판매 보기</button>{/if}</div>
				<h2 style="margin:6px 0 4px;font-size:22px">{p.name}</h2>
				<div class="meta" style="margin-bottom:12px">{p.desc} · {p.cat}</div>
				<div class="prices" style="margin-bottom:14px"><span class="gp" style="font-size:26px">₩{fmt(o.price)}</span>{#if oi === 0}<span class="cp">₩{fmt(p.cp)}</span>{#if p.cp > p.gp}<span class="disc">-{Math.round((1 - p.gp / p.cp) * 100)}%</span>{/if}{:else}<span class="cp" style="text-decoration:none">{o.n}</span>{/if}</div>
				<div class="lbl-sm" style="margin-bottom:6px">옵션 선택</div>
				<div class="opts">{#each opts as x, i}<button class="opt {i === oi ? 'on' : ''}" onclick={() => (S.ui.storeOpt = i)}><span>{x.n}</span><b>₩{fmt(x.price)}</b></button>{/each}</div>
				<div class="flex items-center justify-between gap-3 flex-wrap" style="margin:14px 0">
					<div class="qty"><button onclick={() => (S.ui.storeQty = Math.max(1, q - 1))}>−</button><span>{q}</span><button onclick={() => (S.ui.storeQty = Math.min(10, q + 1))}>+</button></div>
					<div style="text-align:right"><div style="font-size:11.5px;color:var(--mute)">총 결제 금액</div><div class="font-display" style="font-size:24px;font-weight:800">₩{fmt(o.price * q)}</div></div>
				</div>
				{#if live}
					<div class="buyrow"><button class="ghost buy" disabled={left <= 0} onclick={() => act.addCart(cid)}>🛒 장바구니</button><button class="pri buy" disabled={left <= 0} onclick={() => act.buyNow(cid)}>{left <= 0 ? '품절' : '구매하기'}</button></div>
					<div class="meta" style="text-align:center;margin-top:8px">{md(P(c.start!))}–{md(P(c.end!))} 한정 · 잔여 {fmt(Math.max(0, left))}개 · {fmt(soldQty(cid))}개 판매됨 · 결제 시 셀러리 안전결제로 이동</div>
				{:else if c.preview}
					<button class="buy" disabled style="opacity:.7">상세페이지 미리보기 — 판매 링크 발급 전</button><div class="meta" style="text-align:center;margin-top:8px">인플루언서 일정이 확정되면 이 레이아웃으로 판매 링크가 생성됩니다 · 재고 {fmt(p.stock)}개</div>
				{:else if soon}
					<button class="pri buy" onclick={() => act.notifyMe()}>🔔 {md(P(c.start!))} 오픈 알림 받기</button>
				{:else}
					<button class="buy" disabled style="opacity:.6">판매가 종료되었습니다</button><div class="meta" style="text-align:center;margin-top:8px">교환·환불은 종료 후 {CLEAR_DAYS}일까지 셀러리 고객센터에서 처리됩니다</div>
				{/if}
			</div>
		</div>
		<div class="card"><h4>상세 정보</h4>
			{#if p.imgs && p.imgs.length}{#each p.imgs as u}<img src={u} alt="" style="width:100%;display:block;margin-bottom:8px" />{/each}
			{:else}<div class="store-detail"><div class="store-em">{p.em}</div><p>{p.desc}</p><p style="color:var(--mute);font-size:12.5px">브랜드가 등록한 상세페이지 이미지가 여기에 노출됩니다 ({b.name} 제공 · 표시광고 사전심의 완료)</p></div>{/if}
		</div>
		<div class="card"><h4>배송 · 교환 · 환불</h4>
			{#if !c.preview}<div class="btnrow" style="margin:0 0 11px"><button class="sm" onclick={() => openModal('cs', { cid })}>💬 판매자에게 문의하기</button></div>{/if}
			<ul class="store-ul"><li>결제 후 2–3일 내 <b>{b.name}</b>에서 직배송, 운송장은 셀러리 알림톡으로 안내</li><li>판매 종료 후 <b>{CLEAR_DAYS}일</b> 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {CLEAR_DAYS}일)</li><li>대금은 정산 전까지 <b>셀러리</b>가 보관하므로 환불이 지연되지 않습니다</li><li>문의: 셀러리 고객센터(채널톡) — 인플루언서 DM이 아닌 셀러리로 접수</li></ul></div>
		{#if mine.length}<div class="sec">{s.name}님의 다른 판매</div><div class="grid g3">{#each mine as x}<CustCard c={x} />{/each}</div>{/if}
		<div class="store-foot">{@html CEL} <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드({b.name})에 있습니다 · #광고 · 인플루언서는 판매 수수료를 받습니다</div>
	</div>
{/if}
