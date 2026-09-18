<script lang="ts">
	/* 마이페이지 (js/20-seller.js vMy) */
	import { S, seller, gradeOf, platIcon, fmt, PLAT_NAMES, BANKS, PEN, act, openModal, go } from '@sellery/core';
	import { Sec, GradeBox } from '@sellery/ui';
	const me = $derived(seller(S.actingSeller));
	const si = $derived(me.settleInfo || {});
	const g = $derived(gradeOf(me.m3Sales));
	const ok = $derived(!!(si.bank && si.account && si.holder && (si.type !== 'biz' || si.bizNo)));
	let f = $state({ type: 'personal' as 'personal' | 'biz', bank: '선택', account: '', holder: '', bizNo: '' });
	$effect(() => { f = { type: si.type === 'biz' ? 'biz' : 'personal', bank: si.bank || '선택', account: si.account || '', holder: si.holder || me.name, bizNo: si.bizNo || '' }; });
	function pickAvatar(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (file) act.fileToSquareDataURL(file, 256, act.setAvatar); }
	function pickDoc(e: Event) { const file = (e.target as HTMLInputElement).files?.[0]; if (file) act.setBizDoc(file.name, 'seller'); }
	const img = $derived(me.img ? (me.img.startsWith('assets/') ? '/' + me.img : me.img) : '');
</script>

<h2 class="pg">마이페이지 <small>프로필과 정산 정보를 관리합니다</small></h2>
<div class="grid g2">
	<div class="card">
		<div class="lbl-sm">프로필</div>
		<div class="flex gap-4 items-center flex-wrap" style="margin-top:12px">
			{#if img}<img src={img} alt="프로필" style="width:84px;height:84px;object-fit:cover;border:2px solid var(--line);box-shadow:3px 3px 0 var(--ink)" />{:else}<div class="flex items-center justify-center" style="width:84px;height:84px;font-size:32px;border:2px dashed var(--mute)">👤</div>{/if}
			<div>
				<div style="font-weight:800;font-size:16px">{me.name} <span style="font-weight:400;color:var(--mute);font-size:13px">{@html platIcon(me)} {me.handle}</span></div>
				<div style="font-size:12.5px;color:var(--mute)">팔로워 {fmt(me.followers)} · {me.cat} · 등급 <GradeBox g={g.g} /></div>
				<div class="btnrow" style="margin-top:10px"><label class="sm" style="cursor:pointer"><input type="file" accept="image/*" hidden onchange={pickAvatar} /><span>{@html PEN}{me.img ? '프로필 사진 변경' : '프로필 사진 등록'}</span></label></div>
			</div>
		</div>
	</div>
	<div class="card">
		<div class="lbl-sm">내 추천 코드</div>
		<div class="flex items-center gap-3 flex-wrap" style="margin-top:12px">
			<span class="font-display" style="font-size:22px;font-weight:800;letter-spacing:.1em;background:var(--yellow);box-shadow:var(--pxb2);padding:3px 14px">{me.refCode}</span>
			<button class="sm" onclick={() => act.copyRef(me.refCode)}>복사</button><button class="sm ghost" onclick={() => go.screen('ref')}>추천 프로그램 →</button>
		</div>
	</div>
</div>
<Sec note="— 인증된 채널만 브랜드에 노출됩니다">내 채널</Sec>
<div class="listcard">
	{#each me.channels || [] as ch}
		<div class="rowitem" style="cursor:default">
			<span style="font-size:18px;line-height:1">{@html platIcon(ch)}</span>
			<div class="grow"><div class="nm">{ch.handle} {#if ch.primary}<span class="st green">메인 SNS</span>{/if} {#if ch.verified}<span class="st green">✓ 인증됨</span>{:else if ch.vcode}<span class="st amber">인증 대기</span>{:else}<span class="st red">미인증</span>{/if}</div>
				<div class="sub">{PLAT_NAMES[ch.platform] || ch.platform} · {ch.url ? ch.url + ' · ' : ''}팔로워 {fmt(ch.followers || 0)}</div></div>
			{#if !ch.verified}<button class="pri sm" onclick={() => act.openVerify(ch.id)}>인증하기</button>{/if}
			{#if ch.verified && !ch.primary}<button class="sm" onclick={() => act.setPrimaryCh(ch.id)}>메인 SNS로 설정</button>{/if}
			<button class="sm ghost" onclick={() => openModal('channel', { chId: ch.id })}>수정</button>
			{#if !ch.primary}<button class="sm danger" onclick={() => act.delCh(ch.id)}>삭제</button>{/if}
		</div>
	{:else}
		<div class="empty">등록된 채널이 없습니다</div>
	{/each}
	<div style="padding:12px 18px;border-top:1px solid var(--soft-line)"><button class="sm" onclick={() => openModal('channel', { chId: null })}>+ 채널 추가</button></div>
</div>
<Sec style="margin-top:30px">정산 정보 {#if ok}<span class="st green">등록 완료</span>{:else}<span class="st red">미등록 — 등록 전까지 정산 지급 보류</span>{/if}</Sec>
<div class="card">
	<div class="grid g2">
		<div class="fld"><label>정산 유형</label><select bind:value={f.type}><option value="personal">개인 — 사업소득 원천징수 3.3% 공제</option><option value="biz">사업자 — 세금계산서 발행</option></select></div>
		<div class="fld"><label>은행</label><select bind:value={f.bank}>{#each BANKS as b}<option>{b}</option>{/each}</select></div>
		<div class="fld"><label>계좌번호</label><input bind:value={f.account} inputmode="numeric" placeholder="'-' 없이 숫자만" /></div>
		<div class="fld"><label>예금주</label><input bind:value={f.holder} /></div>
		<div class="fld"><label>사업자등록번호 <span class="font-normal">(사업자만)</span></label><input bind:value={f.bizNo} placeholder="000-00-00000" /></div>
		<div class="fld"><label>사업자등록증 <span class="font-normal">(사업자만)</span></label><div class="btnrow items-center"><label class="sm ghost" style="cursor:pointer"><input type="file" accept="image/*,.pdf" hidden onchange={pickDoc} /><span>{si.bizDoc ? '파일 변경' : '파일 업로드'}</span></label>{#if si.bizDoc}<span style="font-size:12px;color:var(--mute)">📎 {si.bizDoc} <span class="st green">첨부됨</span></span>{/if}</div></div>
	</div>
	<p style="font-size:12px;color:var(--mute)">계좌 1원 인증과 사업자 진위 확인은 실서비스에서 자동 처리됩니다. 정산 정보가 없으면 D+21 지급이 보류됩니다.</p>
	<button class="pri" onclick={() => act.saveSettleInfo($state.snapshot(f))}>정산 정보 저장</button>
</div>
