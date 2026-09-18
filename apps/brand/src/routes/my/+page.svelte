<script lang="ts">
	/* 브랜드 마이페이지 (js/40-brand.js vBrandMy + brandRefHtml) */
	import { S, D_, brand, bgname, fmt, BANKS, BREF_TIMES, DONE_STATES, PEN, act } from '@sellery/core';
	import { Sec, GradeBox, BrandGrade } from '@sellery/ui';
	const b = $derived(brand(S.actingBrand));
	const si = $derived(b.settleInfo || {});
	const ok = $derived(!!(si.bank && si.account && si.holder && si.bizNo));
	const myP = $derived(D_().products.filter((p) => p.brandId === b.id));
	let f = $state({ manager: '', email: '', bank: '선택', account: '', holder: '', bizNo: '', mailOrder: '' });
	$effect(() => { f = { manager: b.manager, email: b.email || '', bank: si.bank || '선택', account: si.account || '', holder: si.holder || b.name, bizNo: si.bizNo || '', mailOrder: si.mailOrder || '' }; });
	function pickLogo(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (file) act.fileToSquareDataURL(file, 192, act.setBrandLogo); }
	function pickDoc(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (file) act.setBizDoc(file.name, 'brand'); }
	/* 추천 프로그램 */
	const refs = $derived(D_().brands.filter((x) => x.referredBy === b.id));
	const earns = $derived((D_().brandRefEarnings || []).filter((e) => e.referrerId === b.id));
	const total = $derived(earns.reduce((a, e) => a + e.amt, 0));
	const usedOf = (bid: string) => { const ps = D_().products.filter((p) => p.brandId === bid).map((p) => p.id); return D_().campaigns.filter((c) => ps.includes(c.productId) && DONE_STATES.includes(c.status)).length; };
</script>

<h2 class="pg">브랜드 마이페이지 <small>회사 정보와 정산 정보 · 등급 · 추천 프로그램</small></h2>
<div class="grid g2">
	<div class="card">
		<div class="lbl-sm">브랜드 정보</div>
		<div class="flex gap-4 items-center flex-wrap" style="margin-top:12px">
			{#if b.logo}<img src={b.logo} alt="로고" style="width:76px;height:76px;object-fit:cover;border:2px solid var(--line);box-shadow:3px 3px 0 var(--ink)" />{:else}<div class="flex items-center justify-center" style="width:76px;height:76px;font-size:28px;border:2px dashed var(--mute)">🏷️</div>{/if}
			<div>
				<div style="font-weight:800;font-size:17px">{b.name} <span class="chip brand">{b.cat}</span> <GradeBox g={bgname(b)} /></div>
				<div style="font-size:12.5px;color:var(--mute);margin-top:4px">담당자 {b.manager} · {b.email || ''}</div>
				<div style="font-size:12.5px;color:var(--mute)">등록 상품 {myP.length}개 · 노출 중 {myP.filter((p) => p.status === 'listed').length}개</div>
				<div class="btnrow" style="margin-top:8px"><label class="sm" style="cursor:pointer"><input type="file" accept="image/*" hidden onchange={pickLogo} /><span>{@html PEN}{b.logo ? '로고 변경' : '로고 등록'}</span></label></div>
			</div>
		</div>
		<div class="grid g2" style="margin-top:14px">
			<div class="fld"><label for="bm-manager">담당자</label><input id="bm-manager" bind:value={f.manager} /></div>
			<div class="fld"><label for="bm-email">연락 이메일</label><input id="bm-email" bind:value={f.email} /></div>
		</div>
	</div>
	<div class="card">
		<BrandGrade {b} compact />
	</div>
</div>
<Sec style="margin-top:30px">정산 정보 {#if ok}<span class="st green">등록 완료</span>{:else}<span class="st red">미등록 — 등록 전까지 정산 지급 보류</span>{/if}</Sec>
<div class="card">
	<div class="grid g2">
		<div class="fld"><label for="bm-bank">은행</label><select id="bm-bank" bind:value={f.bank}>{#each BANKS as x}<option>{x}</option>{/each}</select></div>
		<div class="fld"><label for="bm-account">계좌번호</label><input id="bm-account" bind:value={f.account} inputmode="numeric" placeholder="'-' 없이 숫자만" /></div>
		<div class="fld"><label for="bm-holder">예금주 (법인/상호명)</label><input id="bm-holder" bind:value={f.holder} /></div>
		<div class="fld"><label for="bm-bizno">사업자등록번호</label><input id="bm-bizno" bind:value={f.bizNo} placeholder="000-00-00000" /></div>
		<div class="fld"><label for="bm-doc">사업자등록증</label><div class="btnrow items-center" id="bm-doc"><label class="sm ghost" style="cursor:pointer"><input type="file" accept="image/*,.pdf" hidden onchange={pickDoc} /><span>{si.bizDoc ? '파일 변경' : '파일 업로드'}</span></label>{#if si.bizDoc}<span style="font-size:12px;color:var(--mute)">📎 {si.bizDoc} <span class="st green">첨부됨</span></span>{/if}</div></div>
		<div class="fld"><label for="bm-mail">통신판매업 신고번호 <span class="font-normal">(선택)</span></label><input id="bm-mail" bind:value={f.mailOrder} placeholder="제0000-서울강남-00000호" /></div>
	</div>
	<p style="font-size:12px;color:var(--mute)">사업자 진위 확인·계좌 인증은 실서비스에서 자동 처리됩니다. 브랜드 정산액은 이 계좌로 D+21에 지급됩니다.</p>
	<button class="pri" onclick={() => act.saveBrandInfo($state.snapshot(f))}>저장</button>
</div>
<BrandGrade {b} />
<Sec>브랜드 추천 프로그램</Sec>
{#if b.referredBy}<div class="card" style="border-color:var(--red);margin-bottom:14px"><b>🌱 추천 혜택 적용 중</b> — {brand(b.referredBy).name} 추천으로 입점. 첫 {BREF_TIMES}회 판매 플랫폼 수수료 <b>−1%p</b> (남은 횟수 {Math.max(0, BREF_TIMES - usedOf(b.id))}회).</div>{/if}
<div class="grid g2">
	<div class="card"><div class="lbl-sm">내 브랜드 추천 코드</div>
		<div class="flex items-center gap-3.5 flex-wrap" style="margin:12px 0"><span class="font-display" style="font-size:26px;font-weight:800;letter-spacing:.1em;background:var(--yellow);box-shadow:var(--pxb2);padding:4px 16px">{b.refCode || '—'}</span><button class="sm" onclick={() => act.copyBrandRef(b.refCode || '')}>코드 복사</button></div>
		<ul style="font-size:13px;margin:0;padding-left:18px;line-height:2"><li><b>나 (추천 브랜드)</b> — 새 브랜드의 첫 {BREF_TIMES}회 판매, <b>확정 매출의 1%</b> 리워드</li><li><b>새 브랜드</b> — 코드 입력 시 첫 {BREF_TIMES}회 판매 <b>플랫폼 수수료 −1%p</b></li><li>둘 다 <b>플랫폼 수수료에서 부담</b> — 인플루언서 수수료엔 영향 없음</li></ul></div>
	<div class="card"><div class="lbl-sm">추천 현황</div>
		<div class="grid g2" style="margin:10px 0 12px"><div class="card kpi" style="margin:0"><div class="lbl">누적 추천 리워드</div><div class="val" style="color:var(--money)">₩{fmt(total)}</div></div><div class="card kpi" style="margin:0"><div class="lbl">추천한 브랜드</div><div class="val">{refs.length}개</div></div></div>
		{#each refs as x}<div class="sc-hist" style="cursor:default"><span>{#if x.logo}<img src={x.logo} alt="" style="width:18px;height:18px;vertical-align:-4px;border:1.5px solid var(--soft-line);margin-right:6px" />{/if}<b>{x.name}</b> · {x.cat}</span><span class="num">{Math.min(usedOf(x.id), BREF_TIMES)}/{BREF_TIMES}회 · ₩{fmt(earns.filter((e) => e.fromBrandId === x.id).reduce((a, e) => a + e.amt, 0))}</span></div>{:else}<div style="font-size:12.5px;color:var(--mute)">아직 추천한 브랜드가 없습니다 — 코드를 공유해보세요</div>{/each}
	</div>
</div>
