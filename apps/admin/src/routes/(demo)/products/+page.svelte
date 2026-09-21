<script lang="ts">
	import { S, D_, brand, calc, bgname, exGradeOf, fmt, CATS, CAT_POLICY, PLAT_RATE, act, openModal, go, type Product } from '@sellery/core';
	import { PIcon, GradeBox, Chips } from '@sellery/ui';
	const all = $derived(D_().products);
	const sf = $derived(S.ui.admPS || 'all'), bf = $derived(S.ui.admPB || 'all'), cf = $derived(S.ui.admPC || 'all');
	const q = $derived((S.ui.admPQ || '').trim().toLowerCase());
	const base = $derived(all.filter((p) => (sf === 'all' || p.status === sf) && (bf === 'all' || p.brandId === bf) && (cf === 'all' || p.cat === cf)));
	const list = $derived(q ? base.filter((p) => [p.name, p.desc, p.id, p.cat, brand(p.brandId).name, p.sample, (p.exclusive && p.exclusive.label) || ''].join(' ').toLowerCase().includes(q)) : base);
	const cnt = (k: string) => all.filter((p) => p.status === k).length;
	const campsOf = (p: Product) => D_().campaigns.filter((c) => c.productId === p.id);
	const gmvOf = (p: Product) => campsOf(p).reduce((a, c) => a + calc(c).net, 0);
	const PST: Record<string, [string, string]> = { pending: ['검수 대기', 'amber'], listed: ['노출 중', 'green'], paused: ['노출 중단', 'gray'], rejected: ['반려', 'red'] };
</script>

<h2 class="pg">상품 <small>전 브랜드 등록 상품 {all.length}개 · 검수 승인/반려, 노출 제어, 상세페이지 확인</small></h2>
<div class="notice" style="margin-bottom:14px"><b>카테고리 정책</b> — {CAT_POLICY} 건강기능식품은 표시광고 사전 심의 대상: 질병 치료·예방 표현 금지, 기능성 문구는 식약처 인정 범위 내.</div>
<Chips list={[['all', '전체', all.length], ['pending', '검수 대기', cnt('pending')], ['listed', '노출 중', cnt('listed')], ['paused', '노출 중단', cnt('paused')], ['rejected', '반려', cnt('rejected')]]} cur={sf} onpick={(k) => (S.ui.admPS = k)} />
<div class="flex gap-4 flex-wrap">
	<Chips list={[['all', '모든 브랜드'], ...D_().brands.map((b) => [b.id, b.name, all.filter((p) => p.brandId === b.id).length] as [string, string, number])]} cur={bf} onpick={(k) => (S.ui.admPB = k)} />
	<Chips list={[['all', '모든 카테고리'], ...CATS.filter((c) => c !== '전체').map((c) => [c, c, all.filter((p) => p.cat === c).length] as [string, string, number])]} cur={cf} onpick={(k) => (S.ui.admPC = k)} />
</div>
<div class="dmsearch"><input bind:value={S.ui.admPQ} placeholder="상품명 · 설명 · 상품ID · 브랜드 · 카테고리 검색" /><span class="sub" style="color:var(--mute);font-size:12px;white-space:nowrap">{q ? `${list.length}/${base.length}건` : `전체 ${base.length}건`}</span>{#if q}<button class="sm ghost" onclick={() => (S.ui.admPQ = '')}>지우기</button>{/if}</div>
<div class="tblw compact"><table>
	<thead><tr><th>상품</th><th>브랜드</th><th>카테고리</th><th class="num">판매가</th><th class="num">총 수수료</th><th class="num">재고</th><th class="num">판매·매출</th><th>독점</th><th>상태</th><th>관리</th></tr></thead>
	<tbody>
		{#each list as p}{@const b = brand(p.brandId)}{@const cs = campsOf(p)}{@const live = cs.filter((c) => c.status === 'LIVE').length}{@const st = PST[p.status] || [p.status, 'gray']}
			<tr><td class="nm"><b><PIcon {p} sz={24} /> {p.name}</b><div style="font-size:11.5px;color:var(--mute)">{p.desc} · {p.id.toUpperCase()}</div></td>
				<td style="white-space:nowrap">{b.name} <GradeBox g={bgname(b)} /></td><td style="white-space:nowrap">{p.cat}</td>
				<td class="num"><b>₩{fmt(p.gp)}</b><div style="font-size:11px;color:var(--mute);text-decoration:line-through">₩{fmt(p.cp)}</div></td>
				<td class="num">{((p.rate + PLAT_RATE) * 100).toFixed(0)}%<div style="font-size:11px;color:var(--mute)">인플 {(p.rate * 100).toFixed(0)} + 플랫폼 {(PLAT_RATE * 100).toFixed(0)}</div></td>
				<td class="num">{fmt(p.stock)}</td>
				<td class="num">{cs.length}건{#if live} <span class="st live" style="animation:none">LIVE {live}</span>{/if}<div style="font-size:11px;color:var(--mute)">₩{fmt(gmvOf(p))}</div></td>
				<td style="white-space:nowrap">{#if p.exclusive}<GradeBox g={exGradeOf(p)!} />{#if p.exclusiveSellerId} <span class="st green" style="animation:none">확정</span>{/if}{:else}<span style="color:var(--mute)">—</span>{/if}</td>
				<td><span class="st {st[1]}" style="animation:none">{st[0]}</span></td>
				<td><div class="flex gap-1 flex-wrap">
					{#if p.status === 'rejected'}<span class="sub" style="font-size:11px;color:var(--mute)">{p.rejectReason || ''}</span><button class="sm ghost" onclick={() => act.approveProduct(p.id)}>승인으로 변경</button>
					{:else if p.status === 'pending'}<button class="sm pri" onclick={() => act.approveProduct(p.id)}>승인</button><button class="sm danger" onclick={() => act.rejectProduct(p.id)}>반려</button>
					{:else}<button class="sm ghost" onclick={() => act.toggleListing(p.id)}>{p.status === 'listed' ? '노출 중단' : '재개'}</button>{/if}
					<button class="sm ghost" onclick={() => openModal('productDetail', { pid: p.id })}>실적</button><button class="sm ghost" onclick={() => go.store('p:' + p.id)}>상세페이지</button></div></td></tr>
		{:else}<tr><td colspan="10" class="empty">{q ? `"${S.ui.admPQ}"에 맞는 상품이 없습니다` : '조건에 맞는 상품이 없습니다'}</td></tr>{/each}
	</tbody></table></div>
