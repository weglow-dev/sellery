<script lang="ts">
	/**
	 * 마이페이지 — web influencer/my/page.tsx 1:1 (프로토타입 js/20-seller.js vMy · channelModal · verifyModal). 정산 정보 폼·배송지는 3·5단계.
	 * 폼은 전부 SvelteKit 이름 있는 액션(`?/issueVerifyCode` …, +page.server.ts) — 평범한 POST 뒤 303 으로 `/my?msg=` 에 돌아온다(JS 불필요).
	 * 칩 규칙: verified → "✓ 인증됨" · vcode_confirmed_at → "인증 대기" · 그 외 → "미인증". 인증된 채널만 [메인 SNS로 설정]. 메인 채널은 삭제 불가.
	 */
	import { PLATFORM_LABELS, isPlatform } from '@sellery/db/partner/signup-rules';
	import { CopyButton, DeleteChannelForm, GradeBox, PlatIcon, PlatformHandle, StatusChip } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const seller = $derived(data.seller);
	const labelOf = (p: string) => PLATFORM_LABELS[isPlatform(p) ? p : 'instagram'];
	const fmt = (n: number) => n.toLocaleString('ko-KR');
</script>

<svelte:head>
	<title>내 정보 — 셀러리 파트너</title>
</svelte:head>

<div class="console-head">
	<h2>내 정보</h2>
	<span class="cel" title="셀러리 포인트 잔액">🥬 {data.balance}</span>
</div>

{#if data.msg}
	<p class={`notice ${data.msg.tone === 'ok' ? 'ok' : data.msg.tone === 'danger' ? 'danger' : ''}`} role="status">{data.msg.text}</p>
{/if}

<section class="card static">
	<div class="lbl-sm">프로필</div>
	<p style="margin:8px 0 0;font-size:16px;font-weight:700">
		{seller.name}
		<span style="font-weight:400"><PlatformHandle platform={seller.platform} handle={seller.handle} /></span>
	</p>
	<p class="meta">
		팔로워 {fmt(seller.followers)} · 등급 <GradeBox grade={seller.grade} sm />{#if seller.code}
			· 코드 {seller.code}{/if}
	</p>
	{#if seller.ref_code}
		<div class="lbl-sm" style="margin-top:16px">내 추천 코드</div>
		<div class="console-inline">
			<span class="console-code">{seller.ref_code}</span>
			<CopyButton text={seller.ref_code} />
		</div>
		<p class="meta" style="margin-top:8px">가입 폼에 이 코드를 넣은 인플루언서의 첫 5회 판매 확정 매출의 2% 를 받아요 (그 인플루언서는 같은 5회 수수료 +1%p).</p>
	{/if}
</section>

{#if data.verifying}
	{@const v = data.verifying}
	<section class="card static" id="verify">
		<div class="lbl-sm">채널 인증 — {v.handle}</div>
		<p class="meta" style="margin-top:6px">본인 계정임을 확인해 사칭을 방지합니다. 아래 <b>1회용 코드</b>를 사용해 두 방법 중 하나로 인증하세요.</p>
		<div style="text-align:center;margin:16px 0 4px">
			<span class="console-code lg">{v.vcode}</span>
			<div style="margin-top:10px"><CopyButton text={v.vcode ?? ''} label="코드 복사" /></div>
		</div>
		<div class="console-methods">
			<div class="card static">
				<div class="lbl-sm">방법 1 · 프로필 인증</div>
				<p>{labelOf(v.platform)} 프로필 소개글(bio)에 코드를 붙여넣은 뒤 아래 확인 버튼을 누르세요. 확인 후 소개글에서 지워도 됩니다.</p>
			</div>
			<div class="card static">
				<div class="lbl-sm">방법 2 · DM 인증</div>
				<p>해당 계정에서 셀러리 공식 계정 <b>@sellery.official</b> 로 코드를 DM 으로 보낸 뒤 확인 버튼을 누르세요.</p>
			</div>
		</div>
		<p class="meta" style="margin-top:12px">확인 버튼을 누르면 운영팀이 프로필 또는 DM 수신함에서 코드를 대조한 뒤 인증을 완료합니다("인증 대기" 표시). 채널 인증은 샘플 요청·구매의 전제 조건이 아니에요.</p>
		<div class="btnrow" style="margin-top:10px;justify-content:flex-end">
			<a href={data.myPath} class="btn ghost sm" data-sveltekit-preload-data="off">나중에</a>
			<form method="post" action="?/confirmVerify">
				<input type="hidden" name="id" value={v.id} />
				<button type="submit" class="pri sm">인증 확인</button>
			</form>
		</div>
	</section>
{/if}

{#if data.editing || data.adding}
	{@const editing = data.editing}
	<section class="card static" id="channel-form">
		<div class="lbl-sm">{editing ? '채널 수정' : '채널 추가'}</div>
		<form method="post" action="?/saveChannel" style="margin-top:10px">
			{#if editing}<input type="hidden" name="id" value={editing.id} />{/if}
			<div class="fld">
				<label for="ch-platform">플랫폼</label>
				<select id="ch-platform" name="platform" value={editing?.platform ?? 'instagram'}>
					{#each Object.entries(PLATFORM_LABELS) as [p, label] (p)}
						<option value={p}>{label}</option>
					{/each}
				</select>
			</div>
			<div class="fld">
				<label for="ch-handle">계정 핸들 / 채널명</label>
				<input id="ch-handle" name="handle" value={editing?.handle ?? ''} placeholder="@my_account" maxlength={60} required />
			</div>
			<div class="fld">
				<label for="ch-url">채널 URL</label>
				<input id="ch-url" name="url" value={editing?.url ?? ''} placeholder="instagram.com/my_account" maxlength={200} />
			</div>
			<div class="fld">
				<label for="ch-followers">팔로워 수</label>
				<input id="ch-followers" name="followers" inputmode="numeric" value={editing ? String(editing.followers) : ''} placeholder="0" />
			</div>
			<p class="meta">저장 후 <b>인증 절차</b>를 거쳐야 브랜드에 노출됩니다. 핸들·플랫폼을 수정하면 인증이 초기화됩니다(사칭 방지).</p>
			<div class="btnrow" style="margin-top:10px;justify-content:flex-end">
				<a href={data.myPath} class="btn ghost sm" data-sveltekit-preload-data="off">취소</a>
				<button type="submit" class="pri sm">저장</button>
			</div>
		</form>
	</section>
{/if}

<div class="sec" style="margin-top:22px">
	내 채널 <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--color-mute)">— 인증된 채널만 브랜드에 노출됩니다</span>
</div>
<div class="listcard console-rows">
	{#if data.channels.length === 0}<div class="empty">등록된 채널이 없습니다</div>{/if}
	{#each data.channels as ch (ch.id)}
		<div class="rowitem">
			<span class="plat"><PlatIcon platform={ch.platform} /></span>
			<div class="grow">
				<div class="nm">
					{ch.handle}
					{#if ch.is_primary}<StatusChip tone="green">메인 SNS</StatusChip>{/if}
					{#if ch.verified}
						<StatusChip tone="green">✓ 인증됨</StatusChip>
					{:else if ch.vcode_confirmed_at}
						<StatusChip tone="amber" title="운영팀이 코드를 확인하는 중이에요">인증 대기</StatusChip>
					{:else}
						<StatusChip tone="red">미인증</StatusChip>
					{/if}
				</div>
				<div class="sub">{labelOf(ch.platform)}{ch.url ? ` · ${ch.url}` : ''} · 팔로워 {fmt(ch.followers)}</div>
			</div>
			<div class="rowacts">
				{#if !ch.verified && !ch.vcode_confirmed_at}
					<form method="post" action="?/issueVerifyCode">
						<input type="hidden" name="id" value={ch.id} />
						<button type="submit" class="pri sm">인증하기</button>
					</form>
				{/if}
				{#if !ch.verified && ch.vcode_confirmed_at}
					<form method="post" action="?/issueVerifyCode">
						<input type="hidden" name="id" value={ch.id} />
						<button type="submit" class="ghost sm">코드 보기</button>
					</form>
				{/if}
				{#if ch.verified && !ch.is_primary}
					<form method="post" action="?/setPrimaryCh">
						<input type="hidden" name="id" value={ch.id} />
						<button type="submit" class="sm">메인 SNS로 설정</button>
					</form>
				{/if}
				<a href="{data.myPath}?edit={ch.id}#channel-form" class="btn ghost sm" data-sveltekit-preload-data="off">수정</a>
				{#if !ch.is_primary}<DeleteChannelForm id={ch.id} handle={ch.handle} action="?/deleteChannel" />{/if}
			</div>
		</div>
	{/each}
	<div class="console-addrow">
		<a href="{data.myPath}?add=1#channel-form" class="btn sm" data-sveltekit-preload-data="off">+ 채널 추가</a>
	</div>
</div>

<div class="sec" style="margin-top:22px">
	정산 정보 <StatusChip tone={seller.has_bank_info ? 'green' : 'red'}>{seller.has_bank_info ? '등록 완료' : '미등록 — 등록 전까지 정산 지급 보류'}</StatusChip>
</div>
<section class="card static">
	<p class="meta">계좌·원천징수 자료 입력은 <b>5단계</b>에서 열립니다. 그 전까지는 운영팀이 이메일로 안내드려요.</p>
</section>
