<script lang="ts">
	/* DM 인박스 + 요청함 (js/20-seller.js vDM · js/40-brand.js vRequests/sellerRequests) */
	import { S, D_, prod, brand, seller, brandCamps, sellerCamps, brandPending, sellerPending, gname, exGradeOf, gfull, platIcon, strip, fmt, md, P, ST, SEMOJI, act, go } from '@sellery/core';
	import PIcon from '../components/PIcon.svelte';
	import StChip from '../components/StChip.svelte';
	import Avatar from '../components/Avatar.svelte';
	import GradeBox from '../components/GradeBox.svelte';
	const isBrand = $derived(S.role === 'brand');
	const cs = $derived(isBrand ? brandCamps(S.actingBrand) : sellerCamps(S.actingSeller));
	const rows = $derived(cs.map((c) => {
		const msgs = D_().messages[c.id] || []; const last = msgs[msgs.length - 1] || { type: 'sys' as const, txt: '대화 시작', at: c.createdAt };
		const p = prod(c.productId), b = brand(p.brandId), s = seller(c.sellerId); const myRole = isBrand ? 'brand' : 'seller';
		const unread = last.type === 'chat' && last.role !== myRole;
		const who = last.type === 'chat' ? (last.role === 'brand' ? b.name : last.role === 'admin' ? '셀러리 운영팀' : s.name) + ': ' : '';
		return { c, p, b, s, last, unread, who };
	}).sort((a, b) => (a.last.at < b.last.at ? 1 : a.last.at > b.last.at ? -1 : (a.c.createdAt < b.c.createdAt ? 1 : -1))));
	const unreadN = $derived(rows.filter((r) => r.unread).length);
	const q = $derived((S.ui.dmQ || '').trim().toLowerCase());
	const shown = $derived(q ? rows.filter((r) => [r.s.name, r.s.handle, r.b.name, r.p.name, strip(r.last.txt), r.c.id, ST[r.c.status].l].join(' ').toLowerCase().includes(q)) : rows);
	/* 요청함 */
	const bp = $derived(isBrand ? brandPending(S.actingBrand) : null);
	const spn = $derived(!isBrand ? sellerPending(S.actingSeller) : null);
	const n = $derived(isBrand ? bp!.n : spn!.n);
	const isOpen = $derived(n ? S.ui.reqOpen !== false : S.ui.reqOpen === true);
	const LBL_B: Record<string, string> = { SAMPLE_REQUESTED: '샘플 요청 검토', SAMPLE_APPROVED: '샘플 발송 처리', SAMPLE_PURCHASED: '샘플 발송 처리 (구매 완료)', SCHEDULE_PROPOSED: '일정 승인' };
	const LBL_S: Record<string, [string, string]> = { INVITED: ['브랜드가 판매를 직접 제안했어요 — 수락 또는 거절', '수락/거절'], SAMPLE_SHIPPED: ['샘플 도착 — 수령 확인', '수령 확인'], TESTING: ['테스트 후 진행 여부 결정 — 일정 제안 또는 패스', '일정 제안'], SAMPLE_APPROVED: ['브랜드 승인 · 샘플 발송 준비 중', '스레드'], SAMPLE_PURCHASED: ['결제 완료 · 샘플 발송 준비 중', '스레드'] };
	const sortedS = $derived(spn ? spn.cs.slice().sort((a, b) => +/APPROVED|PURCHASED/.test(a.status) - +/APPROVED|PURCHASED/.test(b.status)) : []);
</script>

<h2 class="pg">DM <small>{isBrand ? '인플루언서와 나눈 대화 — 제안·샘플·일정·정산 이력이 모두 남아요' : '브랜드와 나눈 대화 — 샘플 요청·승인·일정·정산 이력이 모두 남아요'}{#if unreadN} · <b style="color:var(--danger)">안 읽음 {unreadN}</b>{/if}</small></h2>

<div class="card acc" style="padding:0;overflow:hidden;margin-bottom:14px">
	<div class="acc-head" role="button" tabindex="0" onclick={() => (S.ui.reqOpen = !isOpen)} onkeydown={(e) => e.key === 'Enter' && (S.ui.reqOpen = !isOpen)}>
		<div><b>📥 요청함</b> <span class="sub" style="color:var(--mute);font-size:12px">{isBrand ? '샘플 요청 · 일정 제안 · 독점권 신청' : '브랜드가 보낸 요청 · 내 응답이 필요한 것'}</span></div>
		<div class="flex gap-2 items-center">{#if n}<span class="st amber" style="animation:none">{isBrand ? '대기' : '응답 필요'} {n}건</span>{:else}<span class="st gray" style="animation:none">{isBrand ? '대기 없음' : '응답 필요 없음'}</span>{/if}<span class="acc-arrow">{isOpen ? '▲' : '▼'}</span></div>
	</div>
	{#if isOpen}
		<div class="listcard" style="margin:0;box-shadow:none;border-top:1.5px solid var(--soft-line)">
			{#if isBrand && bp}
				{#each bp.cs as c}
					{@const p = prod(c.productId)}{@const sl = seller(c.sellerId)}
					<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} />
						<div class="grow"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {@html platIcon(sl)} {sl.name} {sl.handle}</span></div>
							<div class="sub">{LBL_B[c.status] || ST[c.status].l}{#if c.status === 'SCHEDULE_PROPOSED' && c.propStart} · {md(P(c.propStart))}–{md(P(c.propEnd!))} · 재고 {fmt(c.propQty!)}{/if} · 팔로워 {fmt(sl.followers)} · <GradeBox g={gname(sl)} /></div></div>
						<button class="pri sm">{c.status === 'SAMPLE_REQUESTED' ? '검토' : c.status === 'SAMPLE_APPROVED' ? '발송' : '승인'}</button></div>
				{/each}
				{#each bp.xr as r}
					{@const sl = seller(r.sellerId)}{@const p = prod(r.productId)}
					<div class="rowitem" style="cursor:default">
						<div class="grow"><div class="nm"><GradeBox g={gname(sl)} /> {@html platIcon(sl)} {sl.name} <span class="sub" style="font-weight:400">{sl.handle}{sl.hidden ? ' · 비공개 프로필 (독점권 신청으로 공개)' : ''}</span> → {p.name} 독점권 신청</div>
							<div class="sub">3개월 매출 ₩{fmt(sl.m3Sales)} · 팔로워 {fmt(sl.followers)} · 참여율 {(sl.likesAvg / sl.followers * 100).toFixed(1)}% · 조건 {@html gfull(exGradeOf(p)!)} 이상 충족 ✓</div></div>
						<div class="rowacts"><button class="pri sm" onclick={() => act.approveExcl(r.id)}>승인</button><button class="sm danger" onclick={() => act.rejectExcl(r.id)}>거절</button></div></div>
				{/each}
				{#if !n}<div class="empty" style="padding:14px">대기 중인 요청이 없습니다</div>{/if}
			{:else}
				{#each sortedS as c}
					{@const p = prod(c.productId)}{@const b = brand(p.brandId)}{@const l = LBL_S[c.status]}
					<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}><PIcon {p} sz={38} />
						<div class="grow"><div class="nm">{p.name} <span class="sub" style="font-weight:400">· {b.name}{c.invited ? ' · 브랜드 직접 제안' : ''}</span></div>
							<div class="sub">{l[0]}{c.testDue && c.status === 'TESTING' ? ` · 기한 ${md(P(c.testDue))}` : ''}{c.tracking && c.status === 'SAMPLE_SHIPPED' ? ` · 운송장 ${c.tracking}` : ''} · 수수료 {(p.rate * 100).toFixed(0)}%</div></div>
						<button class={c.status === 'SAMPLE_APPROVED' ? 'sm ghost' : 'pri sm'}>{l[1]}</button></div>
				{:else}
					<div class="empty" style="padding:14px">브랜드 요청이 없습니다</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<div class="dmsearch"><input bind:value={S.ui.dmQ} placeholder="인플루언서·브랜드·상품·메시지 검색" />{#if q}<button class="sm ghost" onclick={() => (S.ui.dmQ = '')}>지우기</button>{/if}<span class="sub" style="color:var(--mute);font-size:12px;white-space:nowrap">{q ? `${shown.length}/${rows.length}건` : `대화 ${rows.length}건`}{#if unreadN} · <b style="color:var(--danger)">안 읽음 {unreadN}</b>{/if}</span></div>
<div class="listcard">
	{#each shown as r}
		<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(r.c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(r.c.id)}>
			{#if isBrand}<Avatar s={r.s} sz={44} />{:else if r.b.logo}<img src={r.b.logo} alt="" style="width:44px;height:44px;object-fit:cover;flex-shrink:0;border:2px solid var(--line)" />{:else}<div class="sc-av em" style="width:44px;height:44px;font-size:20px">🏷️</div>{/if}
			<div class="grow" style="min-width:0">
				<div class="nm">{#if isBrand}{@html platIcon(r.s)} {r.s.name} <span style="color:var(--mute);font-weight:400;font-size:12px">{r.s.handle}</span>{:else}{r.b.name}{/if} <span style="color:var(--mute);font-weight:400;font-size:12px">· {r.p.name}</span>{#if r.unread}<span class="dmdot"></span>{/if}</div>
				<div class="sub truncate" style="max-width:640px;{r.unread ? 'color:var(--ink);font-weight:700' : ''}">{r.who}{strip(r.last.txt)}</div>
			</div>
			<span class="sub num">{md(P(r.last.at))}</span>
			<StChip st={r.c.status} />
		</div>
	{:else}
		<div class="empty">{q ? `"${S.ui.dmQ}"에 맞는 대화가 없습니다` : isBrand ? '아직 대화가 없습니다 — 인플루언서 갤러리에서 판매를 제안해보세요' : '아직 대화가 없습니다 — 상품 갤러리에서 샘플을 요청해보세요'}</div>
	{/each}
</div>
<p style="font-size:12px;color:var(--mute);margin-top:10px">대화를 열면 채팅과 승인·일정·정산 이벤트가 한 타임라인에 보입니다. 연락처·외부 메신저 공유는 자동 감지되어 안내됩니다.</p>
