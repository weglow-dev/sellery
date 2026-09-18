<script lang="ts">
	/* 캠페인 상세: 스레드 + 역할별 액션 + 정산 미리보기 (js/70-campaign.js) */
	import { base } from '$app/paths';
	import { S, D_, camp, prod, brand, seller, calc, gname, bgname, bDiscOf, gradeBonusOf, sellerWht, settleDue, platIcon, fmt, md, P, today, DAY, CEL, PG_RATE, PLAT_RATE, CLEAR_DAYS, act, openModal, go } from '@sellery/core';
	import PIcon from '../components/PIcon.svelte';
	import StChip from '../components/StChip.svelte';
	import Stepper from '../components/Stepper.svelte';
	import ActionCard from '../components/ActionCard.svelte';
	let { cid, back = '/' }: { cid: string; back?: string } = $props();
	const c = $derived(camp(cid));
	const p = $derived(c ? prod(c.productId) : null);
	const b = $derived(p ? brand(p.brandId) : null);
	const s = $derived(c ? seller(c.sellerId) : null);
	const k = $derived(c ? calc(c) : null);
	const msgs = $derived(c ? D_().messages[cid] || [] : []);
	const V = $derived(S.role);
	const linkUrl = $derived(s ? `sellery.co.kr/s/${s.handle.slice(1)}/${cid}` : '');
	let chat = $state(''), track = $state('');
	let box: HTMLDivElement | undefined = $state();
	$effect(() => { msgs.length; if (box) box.scrollTop = box.scrollHeight; });
	function send() { act.sendChat(cid, chat); chat = ''; }
</script>

{#if !c || !p || !b || !s || !k}
	<div class="empty">캠페인을 찾을 수 없습니다</div>
{:else}
	<a href={base + back} class="ghost sm inline-block" style="text-decoration:none"><button class="ghost sm" tabindex="-1">← 목록으로</button></a>
	<div class="det-head" style="margin-top:12px">
		<PIcon {p} sz={52} />
		<div style="flex:1;min-width:220px">
			<div class="t">{p.name} <span style="color:var(--mute);font-weight:400;font-size:13px">· {cid.toUpperCase()}</span></div>
			<div style="font-size:12.5px;color:var(--mute)"><span class="chip brand">{b.name}</span> × <span class="chip seller">{@html platIcon(s)} {s.name} {s.handle}</span> · 판매가 ₩{fmt(p.gp)} · 수수료 {(p.rate * 100).toFixed(0)}%{#if c.start} · 기간 {md(P(c.start))}–{md(P(c.end!))}{/if}</div>
			<Stepper status={c.status} />
		</div>
		<div><StChip st={c.status} /></div>
	</div>
	<div class="det-body">
		<div class="thread">
			<div class="msgs" bind:this={box}>
				{#each msgs as m}
					{#if m.type === 'sys'}<div class="sysline">{@html m.txt} · {md(P(m.at))}</div>
					{:else if m.type === 'warn'}<div class="warnline">{m.txt}</div>
					{:else}<div class="msg {m.role}"><div class="who" style="color:{m.role === 'admin' ? 'var(--ink)' : `var(--${m.role === 'brand' ? 'brand' : 'seller'}-c)`}">{m.role === 'brand' ? b.name : m.role === 'admin' ? '셀러리 운영팀' : s.name}</div>{m.txt}<div class="tm">{md(P(m.at))}</div></div>{/if}
				{:else}
					<div class="sysline">대화가 없습니다</div>
				{/each}
			</div>
			<div class="composer">
				<span class="as">{V === 'brand' ? '브랜드' : V === 'admin' ? '브랜드(관리자 대행)' : '인플루언서'}로 발신</span>
				<input bind:value={chat} placeholder="메시지 입력… (시스템 승인·일정은 우측 버튼으로)" onkeydown={(e) => e.key === 'Enter' && send()} />
				<button class="pri" onclick={send}>전송</button>
			</div>
		</div>
		<div class="actions">
			{#if c.status === 'SAMPLE_REQUESTED'}
				{#if V === 'seller'}<ActionCard wait h="브랜드 승인 대기 중" hint="샘플 요청이 접수됐어요. 브랜드가 프로필을 검토 중입니다 — 보통 24시간 내 응답해요." />
				{:else}<ActionCard h={'샘플 요청 검토 <span class="chip brand">브랜드 액션</span>'} hint={`${platIcon(s)} ${s.name} ${s.handle} · 팔로워 ${fmt(s.followers)} · 등급 ${gname(s)}. 승인 시 배송지가 브랜드에 전달됩니다.`}><button class="pri" onclick={() => act.approveSample(cid)}>승인</button><button class="danger" onclick={() => act.rejectSample(cid)}>거절</button></ActionCard>{/if}
			{:else if c.status === 'INVITED'}
				{#if V === 'seller'}<ActionCard h={'브랜드 직접 제안 <span class="chip seller">인플루언서 액션</span>'} hint={`<b>${b.name}</b>가 <b>${p.name}</b> 판매를 제안했어요 · 수수료 ${(p.rate * 100).toFixed(0)}%${gradeBonusOf(s) ? ` + 등급 보너스 ${(gradeBonusOf(s) * 100).toFixed(1)}%p` : ''} · 수락 시 샘플 발송 단계부터 시작됩니다 (무상 · 이달 한도 미차감).`}><button class="pri" onclick={() => act.acceptInvite(cid)}>수락 → 샘플 받기</button><button onclick={() => act.declineInvite(cid)}>거절</button></ActionCard>
				{:else}<ActionCard wait h="인플루언서 수락 대기 중" hint="제안을 보냈어요. 인플루언서가 수락하면 샘플 발송 단계로 넘어갑니다 — 보통 48시간 내 응답해요." />{/if}
			{:else if c.status === 'DECLINED'}<ActionCard h="제안 거절됨" hint={'인플루언서가 이번 제안을 수락하지 않았습니다.' + (c.celRefunded ? ` 제안권 ${CEL} ${c.celRefunded} 환급 완료.` : '')} />
			{:else if c.status === 'SAMPLE_PURCHASED' || c.status === 'SAMPLE_APPROVED'}
				{@const sp = c.samplePaid}
				{#if V === 'seller'}
					{#if c.status === 'SAMPLE_PURCHASED'}<ActionCard wait h="결제 완료 · 샘플 발송 준비 중" hint={`샘플 구매 ₩${fmt(sp?.price || 0)}${sp?.cel ? ` (${CEL} ${sp.cel} + ₩${fmt(sp.cash || 0)})` : ' (현금)'} — 브랜드가 발송하면 운송장이 표시됩니다.${p.samplePolicy?.refund ? ' 판매 확정 시 구매액이 환급됩니다.' : ''}`} />
					{:else}<ActionCard wait h="샘플 발송 준비 중" hint="브랜드가 요청을 승인했어요. 샘플이 발송되면 운송장이 여기 표시됩니다." />{/if}
				{:else}
					<ActionCard h={`샘플 발송 <span class="chip brand">브랜드 액션</span>${c.status === 'SAMPLE_PURCHASED' ? ` <span class="st green" style="animation:none">구매 완료 ₩${fmt(sp?.price || 0)}</span>` : ''}`} hint={c.status === 'SAMPLE_PURCHASED' ? '인플루언서가 샘플을 구매했습니다(승인 불필요). 운송장 번호를 입력하면 배송 추적이 시작됩니다.' : '운송장 번호를 입력하면 배송 추적이 시작됩니다.'}><input bind:value={track} placeholder="운송장 번호 (예: 6890-1234-5678)" style="margin-bottom:8px" /><button class="pri" onclick={() => act.shipSample(cid, track)}>발송 처리</button></ActionCard>
				{/if}
			{:else if c.status === 'SAMPLE_SHIPPED'}
				{#if V === 'brand'}<ActionCard wait h="인플루언서 수령 대기 중" hint={`운송장 ${c.tracking || '—'} · 인플루언서가 수령을 확인하면 테스트가 시작됩니다.`} />
				{:else}<ActionCard h={'샘플 수령 확인 <span class="chip seller">인플루언서 액션</span>'} hint={`운송장 ${c.tracking || '—'} · 수령 확인 시 테스트 기한 14일이 시작됩니다.`}><button class="pri" onclick={() => act.receiveSample(cid)}>수령 확인</button></ActionCard>{/if}
			{:else if c.status === 'TESTING'}
				{#if V === 'brand'}<ActionCard wait h="인플루언서 테스트 중" hint={`인플루언서가 샘플을 사용해보고 있어요. 기한 ${c.testDue ? md(P(c.testDue)) : '—'} 까지 진행 여부를 응답합니다.`} />
				{:else}<ActionCard h={'테스트 후 진행 결정 <span class="chip seller">인플루언서 액션</span>'} hint={`기한 ${c.testDue ? md(P(c.testDue)) : '—'} 까지. 진행 시 판매 일정을 제안합니다.`}><button class="pri" onclick={() => openModal('schedule', { cid })}>진행할게요 → 일정 제안</button><button onclick={() => act.passCamp(cid)}>이번엔 패스</button></ActionCard>{/if}
			{:else if c.status === 'SCHEDULE_PROPOSED'}
				{#if V === 'seller'}<ActionCard wait h="브랜드 일정 승인 대기" hint={`제안한 기간 <b>${md(P(c.propStart!))} – ${md(P(c.propEnd!))}</b> · 재고 ${fmt(c.propQty!)}개를 브랜드가 검토 중이에요.`} />
				{:else}<ActionCard h={'일정 승인 <span class="chip brand">브랜드 액션</span>'} hint={`제안 기간: <b>${md(P(c.propStart!))} – ${md(P(c.propEnd!))}</b> · 배정 재고 ${fmt(c.propQty!)}개. 승인하면 이 기간이 캘린더에 표시됩니다(플래티넘 이상이 잡은 기간은 상위 등급만 추가 진입).`}><button class="pri" onclick={() => act.confirmSchedule(cid)}>일정 승인</button><button class="danger" onclick={() => act.rejectSchedule(cid)}>반려 (재제안 요청)</button></ActionCard>{/if}
			{:else if c.status === 'SCHEDULE_CONFIRMED'}
				{@const dday = Math.ceil((P(c.start!).getTime() - today().getTime()) / DAY)}
				<ActionCard h="판매 대기 중" hint={`시작 ${md(P(c.start!))} (D-${Math.max(dday, 0)}) — 시작 시각에 링크가 자동 활성화됩니다.`} />
				{#if V === 'admin'}<div class="sim" style="margin-bottom:12px"><h4>⏱ 시뮬레이션</h4><p>실서비스에선 스케줄러가 자동 처리합니다.</p><div class="btnrow"><button class="sm" onclick={() => act.goLive(cid)}>판매 시작 처리</button></div></div>{/if}
			{:else if c.status === 'LIVE'}
				<ActionCard h={'판매 링크 <span class="st live"><span class="pulse"></span>LIVE</span>'} hint={`<code style="font-size:11.5px">${linkUrl}</code> · 종료 ${md(P(c.end!))}`}><button class="pri" onclick={() => go.store(cid)}>판매 페이지 미리보기</button><button onclick={() => act.copyLink(linkUrl)}>링크 복사</button></ActionCard>
				{#if V === 'admin'}<div class="sim" style="margin-bottom:12px"><h4>⏱ 판매 시뮬레이션</h4><p>구매자 주문을 흉내내 정산 숫자가 움직이는 걸 확인하세요.</p><div class="btnrow"><button class="sm" onclick={() => act.simSell(cid, 5)}>주문 +5건</button><button class="sm" onclick={() => act.simSell(cid, 20)}>주문 +20건</button><button class="sm" onclick={() => act.endCamp(cid)}>판매 종료 처리</button></div></div>{/if}
			{:else if c.status === 'CLEARING'}
				<ActionCard h="교환·환불 처리 기간" hint={`종료 ${md(P(c.end!))} → 정산 기준일 <b>${md(settleDue(c))}</b> (D+${CLEAR_DAYS}). 이 기간의 환불은 정산액에서 차감됩니다.`} />
				{#if V === 'admin'}<div class="sim" style="margin-bottom:12px"><h4>⏱ 시뮬레이션</h4><div class="btnrow"><button class="sm" onclick={() => act.ffwd(cid)}>⏩ 3주 경과 처리</button></div></div>{/if}
			{:else if c.status === 'SETTLED'}
				<ActionCard h="정산 완료 ✓" hint={`인플루언서 지급 ₩${fmt(k.sfTotal * (1 - sellerWht(s)))}${sellerWht(s) ? ' (원천징수 3.3% 후)' : ' (사업자 · 세금계산서)'} · 브랜드 지급 ₩${fmt(k.brandPay)}. 성과가 좋았다면 같은 조합으로 바로 재판매를 열 수 있습니다.`}>{#if V !== 'brand'}<button class="pri" onclick={() => act.regongu(cid)}>🔁 재판매 제안 (샘플 생략)</button>{/if}<button onclick={() => act.settleCSV()}>명세 CSV</button></ActionCard>
			{:else if c.status === 'REJECTED'}<ActionCard h="거절된 요청" hint="브랜드가 이번 요청을 승인하지 않았습니다." />
			{:else if c.status === 'PASSED'}<ActionCard h="인플루언서 패스" hint="인플루언서가 테스트 후 진행하지 않기로 했습니다." />
			{/if}
			<div class="card stmtcard">
				<h4>정산 미리보기</h4>
				<table class="stmt" style="min-width:0;font-size:12.5px"><tbody>
					<tr><td>결제 {k.paidCnt + k.refCnt}건</td><td class="num">₩{fmt(k.gross)}</td></tr>
					<tr><td>환불 {k.refCnt}건</td><td class="num">−₩{fmt(k.refund)}</td></tr>
					<tr><td><b>확정 매출</b></td><td class="num"><b>₩{fmt(k.net)}</b></td></tr>
					{#if k.sampleNet}<tr><td>　└ 샘플 구매분 (인플 수수료 0)</td><td class="num">₩{fmt(k.sampleNet)}</td></tr>{/if}
					<tr><td>PG {(PG_RATE * 100).toFixed(1)}%</td><td class="num">−₩{fmt(k.pg)}</td></tr>
					<tr><td>인플루언서 {(p.rate * 100).toFixed(0)}%{#if k.gBonus} <b style="color:var(--red)">+{(gradeBonusOf(s) * 100).toFixed(1)}%p {gname(s)}</b>{/if}{#if k.rb} <b style="color:var(--red)">+1%p 추천</b>{/if}</td><td class="num">−₩{fmt(k.sfTotal)}</td></tr>
					{#if k.rb}<tr><td>추천인 보상 2%</td><td class="num">−₩{fmt(k.refReward)}</td></tr>{/if}
					{#if k.bb}<tr><td>브랜드 추천인 보상 1%</td><td class="num">−₩{fmt(k.bReward)}</td></tr><tr><td>신규 브랜드 수수료 할인 −1%p</td><td class="num" style="color:var(--red)">+₩{fmt(k.bBoost)}</td></tr>{/if}
					{#if k.bDisc}<tr><td>브랜드 {bgname(b)} 등급 수수료 할인 −{(bDiscOf(b) * 100).toFixed(1)}%p</td><td class="num" style="color:var(--red)">+₩{fmt(k.bDisc)}</td></tr>{/if}
					<tr><td>플랫폼 {(PLAT_RATE * 100).toFixed(0)}%{k.costs ? ' (보너스·보상·할인 차감 후)' : ''}</td><td class="num">−₩{fmt(k.pf)}</td></tr>
					<tr class="tot"><td>브랜드 정산액</td><td class="num">₩{fmt(k.brandPay)}</td></tr>
				</tbody></table>
				{#if c.end}<div style="font-size:11.5px;color:var(--mute);margin-top:8px">정산 기준일(D+{CLEAR_DAYS}): <b>{md(settleDue(c))}</b></div>{/if}
			</div>
		</div>
	</div>
{/if}
