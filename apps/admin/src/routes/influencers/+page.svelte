<script lang="ts">
	import { S, D_, seller, gname, celBal, platIcon, fmt, CEL, GRADES, PLAT_NAMES, DONE_STATES, act } from '@sellery/core';
	import { Avatar, GradeBox, Chips } from '@sellery/ui';
	const all = $derived(D_().sellers);
	const gf = $derived(S.ui.admIG || 'all'), q = $derived((S.ui.admIQ || '').trim().toLowerCase());
	const base = $derived(all.filter((x) => gf === 'all' || gname(x) === gf));
	const list = $derived((q ? base.filter((x) => [x.name, x.handle, x.cat, x.intro, x.id, PLAT_NAMES[x.platform] || '', (x.channels || []).map((c) => c.handle).join(' ')].join(' ').toLowerCase().includes(q)) : base).slice().sort((a, b) => b.m3Sales - a.m3Sales));
	const unverified = $derived(all.reduce((a, x) => a + (x.channels || []).filter((c) => !c.verified).length, 0));
</script>

<h2 class="pg">인플루언서 <small>가입 {all.length}명 · 비공개 {all.filter((x) => x.hidden).length} · 미인증 채널 {unverified}개</small></h2>
<Chips list={[['all', '전체', all.length], ...GRADES.map((t) => [t.g, t.g, all.filter((x) => gname(x) === t.g).length] as [string, string, number]).filter((x) => x[2])]} cur={gf} onpick={(k) => (S.ui.admIG = k)} />
<div class="dmsearch"><input bind:value={S.ui.admIQ} placeholder="이름 · 핸들 · 카테고리 · 채널 · 소개 검색" /><span class="sub" style="color:var(--mute);font-size:12px;white-space:nowrap">{q ? `${list.length}/${base.length}건` : `전체 ${base.length}건`}</span>{#if q}<button class="sm ghost" onclick={() => (S.ui.admIQ = '')}>지우기</button>{/if}</div>
<div class="tblw compact"><table>
	<thead><tr><th>인플루언서</th><th>등급</th><th class="num">팔로워</th><th class="num">3개월 매출</th><th class="num">판매</th><th>채널 인증</th><th class="num">셀러리</th><th>상태</th><th>관리</th></tr></thead>
	<tbody>
		{#each list as x}{@const cs = D_().campaigns.filter((c) => c.sellerId === x.id)}{@const done = cs.filter((c) => DONE_STATES.includes(c.status)).length}{@const ch = x.channels || []}{@const ver = ch.filter((c) => c.verified).length}
			<tr><td class="nm"><span class="inline-flex align-middle" style="margin-right:6px"><Avatar s={x} sz={26} /></span><b>{x.name}</b> <span style="color:var(--mute);font-size:12px">{@html platIcon(x)} {x.handle}</span><div style="font-size:11.5px;color:var(--mute)">{x.cat} · {x.intro}</div></td>
				<td><GradeBox g={gname(x)} /></td><td class="num">{fmt(x.followers)}</td><td class="num"><b>₩{fmt(x.m3Sales)}</b></td><td class="num">{done}<span style="color:var(--mute)">/{cs.length}</span></td>
				<td style="white-space:nowrap">{#if ch.length}<span class="st {ver === ch.length ? 'green' : 'amber'}" style="animation:none">{ver}/{ch.length} 인증</span>{:else}<span style="color:var(--mute)">—</span>{/if}{#if x.referredBy}<div style="font-size:11px;color:var(--mute)">추천: {seller(x.referredBy).name}</div>{/if}</td>
				<td class="num">{@html CEL} {celBal(x.id)}</td><td>{#if x.hidden}<span class="st gray" style="animation:none">비공개</span>{:else}<span class="st green" style="animation:none">공개</span>{/if}</td>
				<td><div class="flex gap-1 flex-wrap"><button class="sm ghost" onclick={() => act.admToggleHidden(x.id)}>{x.hidden ? '공개 전환' : '비공개 전환'}</button><button class="sm ghost" onclick={() => act.admGrant(x.id)}>{@html CEL} +3 지급</button></div></td></tr>
		{:else}<tr><td colspan="9" class="empty">"{S.ui.admIQ || ''}"에 맞는 인플루언서가 없습니다</td></tr>{/each}
	</tbody></table></div>
