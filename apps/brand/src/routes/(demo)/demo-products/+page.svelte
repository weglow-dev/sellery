<script lang="ts">
	import { S, D_, seller, spOf, samplePrice, exGradeOf, gfull, fmt, md, P, PLAT_RATE, act, openModal, go } from '@sellery/core';
	import { PIcon, GradeBox } from '@sellery/ui';
	const mine = $derived(D_().products.filter((p) => p.brandId === S.actingBrand));
</script>

<h2 class="pg">상품 관리 <small>판매가·수수료율은 등록 시 책정, 판매 진행 중 변경 불가</small></h2>
<div style="margin-bottom:14px"><button class="pri" onclick={() => openModal('product', { pid: null })}>+ 새 상품 등록</button></div>
<div class="tblw compact"><table>
	<thead><tr><th>상품</th><th class="num">판매가</th><th class="num">수수료율</th><th>샘플 · 재고</th><th>독점권</th><th>상태</th><th>판매 일정</th></tr></thead>
	<tbody>
		{#each mine as p}
			{@const slots = D_().campaigns.filter((c) => c.productId === p.id && ['SCHEDULE_CONFIRMED', 'LIVE'].includes(c.status))}{@const sp = spOf(p)}
			<tr><td class="nm"><b><PIcon {p} sz={24} /> {p.name}</b>{#if p.boosted} <span class="st blue" style="animation:none">부스트</span>{/if}<div style="font-size:11.5px;color:var(--mute)">{p.desc}</div></td>
				<td class="num"><b>₩{fmt(p.gp)}</b><div style="font-size:11px;color:var(--mute);text-decoration:line-through">₩{fmt(p.cp)}</div></td>
				<td class="num">{(p.rate * 100).toFixed(0)}%<div style="color:var(--mute);font-size:11px">+플랫폼 {(PLAT_RATE * 100).toFixed(0)}</div></td>
				<td style="white-space:nowrap">{p.sample}<div style="font-size:11px;color:var(--mute)">{sp.freeGrade}↑ 무상 · 구매 ₩{fmt(samplePrice(p))}{sp.refund ? ' · 환급' : ''}</div><div style="font-size:11px;color:var(--mute)">재고 {fmt(p.stock)}</div></td>
				<td style="white-space:nowrap">{#if p.exclusive}<GradeBox g={exGradeOf(p)!} /> 이상{#if p.exclusiveSellerId}<div><span class="st green">확정</span></div>{/if}{:else}<span style="color:var(--mute);font-size:12px">—</span>{/if}</td>
				<td style="white-space:nowrap">
					{#if p.status === 'listed'}<span class="st green">노출 중</span>{:else if p.status === 'paused'}<span class="st gray">노출 중단</span>{:else if p.status === 'rejected'}<span class="st red" title={p.rejectReason || ''}>반려</span><div style="font-size:11px;color:var(--danger);margin-top:4px;max-width:180px;white-space:normal">{p.rejectReason || ''} — 수정 후 재검수</div>{:else}<span class="st amber">검수 대기</span>{/if}
					<div class="flex gap-1 flex-wrap" style="margin-top:6px"><button class="sm pri" onclick={() => openModal('product', { pid: p.id })}>{p.status === 'rejected' ? '수정 · 재검수' : '수정'}</button>{#if p.status !== 'pending' && p.status !== 'rejected'}<button class="sm ghost" onclick={() => act.toggleListing(p.id)}>{p.status === 'listed' ? '노출 중단' : '재개'}</button>{/if}<button class="sm ghost" onclick={() => go.store('p:' + p.id)}>상세페이지</button></div></td>
				<td>{#each slots as c}<div class="num" style="font-size:11.5px">{md(P(c.start!))}–{md(P(c.end!))} {seller(c.sellerId).handle}</div>{:else}<span style="color:var(--mute);font-size:12px">—</span>{/each}</td></tr>
		{/each}
	</tbody></table></div>
<p style="font-size:12px;color:var(--mute);margin-top:10px">판매가·수수료율은 진행 중인 판매가 있으면 변경할 수 없습니다(신뢰 보호). 노출 중단 시 새 샘플 요청만 막히고 진행 중 판매는 유지됩니다.</p>
