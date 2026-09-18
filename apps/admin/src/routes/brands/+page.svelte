<script lang="ts">
	import { S, D_, brand, bGmv, bgname, celBal, fmt, CEL, act, go } from '@sellery/core';
	import { GradeBox } from '@sellery/ui';
	const all = $derived(D_().brands);
</script>

<h2 class="pg">브랜드 <small>입점 {all.length}개 · 등급·정산정보·자동 제안·셀러리</small></h2>
<div class="tblw compact"><table>
	<thead><tr><th>브랜드</th><th>등급 · 누적 GMV</th><th class="num">상품</th><th class="num">판매</th><th>정산 정보</th><th class="num">셀러리</th><th>자동 제안</th><th>관리</th></tr></thead>
	<tbody>
		{#each all as b}{@const ps = D_().products.filter((p) => p.brandId === b.id)}{@const pid = ps.map((p) => p.id)}{@const cs = D_().campaigns.filter((c) => pid.includes(c.productId))}{@const live = cs.filter((c) => c.status === 'LIVE').length}{@const si = b.settleInfo || {}}
			<tr><td class="nm">{#if b.logo}<img src={b.logo} alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:6px;border:1.5px solid var(--soft-line)" />{/if}<b>{b.name}</b><div style="font-size:11.5px;color:var(--mute)">{b.cat} · {b.manager || ''} · {b.email || ''}{b.referredBy ? ` · 추천: ${brand(b.referredBy).name}` : ''}</div></td>
				<td style="white-space:nowrap"><GradeBox g={bgname(b)} /><div style="font-size:11.5px;color:var(--mute)">₩{fmt(bGmv(b))}</div></td>
				<td class="num">{ps.length}<div style="font-size:11px;color:var(--mute)">노출 {ps.filter((p) => p.status === 'listed').length} · 대기 {ps.filter((p) => p.status === 'pending').length}</div></td>
				<td class="num">{cs.length}{#if live} <span class="st live" style="animation:none">LIVE {live}</span>{/if}</td>
				<td>{#if si.account}<span class="st green" style="animation:none">등록</span><div style="font-size:11px;color:var(--mute)">{si.bank} · 사업자 {si.bizNo || '—'}</div>{:else}<span class="st amber" style="animation:none">미등록</span>{/if}</td>
				<td class="num">{@html CEL} {celBal(b.id)}</td>
				<td><button class="sm {b.autoPropose ? 'pri' : 'ghost'}" onclick={() => act.toggleAutoPropose(b.id)}>{b.autoPropose ? 'ON' : 'OFF'}</button></td>
				<td><div class="flex gap-1 flex-wrap"><button class="sm ghost" onclick={() => act.admGrant(b.id)}>{@html CEL} +3 지급</button><button class="sm ghost" onclick={() => { S.ui.admPB = b.id; S.ui.admPS = 'all'; go.screen('products'); }}>상품 보기</button></div></td></tr>
		{/each}
	</tbody></table></div>
