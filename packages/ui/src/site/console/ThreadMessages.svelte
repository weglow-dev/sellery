<script lang="ts">
	/**
	 * 캠페인 스레드 메시지 목록 — 두 콘솔(`/campaigns/[code]`)이 공유 (전에는 두 페이지가 같은 마크업을 각자 들고 있었다).
	 *   system 행은 .sysline(`leak_warned` 는 경고 행) · chat 행은 .msg.{sender}(leak_flag 면 .leak 강조 · admin 은 "✓ 셀러리 인증").
	 *   실시간 갱신(LiveRefresh) 과 짝: 처음엔 맨 아래(최신)로 스크롤하고, 새 행이 생겼을 때 **아래쪽을 보고 있었으면 따라 내려가고**, 위를 읽는 중이면 "새 메시지 ↓" 알림만 띄운다(누르면 아래로).
	 */
	import { tick } from 'svelte';
	import { md } from '@sellery/db/dates';
	import { LEAK_WARNING, isOfficialSender, senderLabel } from '@sellery/db/partner/chat-rules';

	type ThreadEvent = {
		id: string;
		kind: 'chat' | 'system';
		sender: 'seller' | 'brand' | 'admin' | 'system';
		body: string;
		event_type: string | null;
		leak_flag: boolean;
		created_at: string;
	};

	let {
		events,
		names,
		typing = false,
		typingAs = 'brand'
	}: {
		events: readonly ThreadEvent[];
		/** senderLabel 용 이름 — { seller: 인플루언서 활동명, brand: 상호 } */
		names: { seller: string; brand: string };
		/** 상대가 입력 중 — 맨 아래에 점 세 개 말풍선 (ThreadTyping 의 `active`) */
		typing?: boolean;
		/** 말풍선을 어느 쪽 스타일로 — 상대의 sender */
		typingAs?: 'seller' | 'brand';
	} = $props();

	const who = (sender: string) => senderLabel(sender, names);

	let box = $state<HTMLDivElement | null>(null);
	let fresh = $state(false);
	/** 마지막으로 본 행 id — 바뀌면 새 행이 왔다 */
	let lastId: string | null = null;
	/** 새 행이 DOM 에 붙기 **전**의 "아래를 보고 있었나" — `$effect.pre` 가 잰다(붙은 뒤 재면 새 행 높이만큼 항상 "위" 로 나온다) */
	let wasNear = true;
	const NEAR = 80;

	const nearBottom = () => !box || box.scrollHeight - box.scrollTop - box.clientHeight < NEAR;
	function toBottom() {
		if (box) box.scrollTop = box.scrollHeight;
		fresh = false;
	}
	function onScroll() {
		if (fresh && nearBottom()) fresh = false;
	}

	$effect.pre(() => {
		void events.length; // 행 수가 바뀔 때마다 — DOM 갱신 전에
		wasNear = nearBottom();
	});

	// "입력 중" 말풍선이 켜질 때도 아래를 보고 있었으면 따라 내려간다
	let typingWasNear = true;
	$effect.pre(() => {
		void typing;
		typingWasNear = nearBottom();
	});
	$effect(() => {
		if (typing && typingWasNear) void tick().then(toBottom);
	});

	$effect(() => {
		const last = events.length ? events[events.length - 1].id : null;
		const first = lastId === null;
		if (last === lastId) return;
		lastId = last;
		// 렌더 뒤 스크롤 — 첫 표시와 "아래를 보고 있던" 경우는 따라 내려가고, 위를 읽는 중이면 알림만
		const follow = first || wasNear;
		void tick().then(() => {
			if (follow) toBottom();
			else fresh = true;
		});
	});
</script>

<div class="msgs-wrap">
	<div class="msgs" bind:this={box} onscroll={onScroll}>
		{#each events as e (e.id)}
			{#if e.kind === 'system'}
				{#if e.event_type === 'leak_warned'}
					<div class="warnline">⚠ {e.body || LEAK_WARNING}</div>
				{:else}
					<div class="sysline">{e.body} · {md(e.created_at)}</div>
				{/if}
			{:else}
				<div class="msg {e.sender}" class:leak={e.leak_flag}>
					<div class="who">
						{who(e.sender)}
						{#if isOfficialSender(e.sender)}<span class="official" title="셀러리 관리자 공식 발신">✓ 셀러리 인증</span>{/if}
					</div>
					{e.body}
					<div class="tm">{md(e.created_at)}</div>
				</div>
			{/if}
		{:else}
			<div class="sysline">대화가 없습니다</div>
		{/each}
		{#if typing}
			<div class="msg typing {typingAs}" aria-live="polite">
				<div class="who">{who(typingAs)}</div>
				<span class="dots" role="img" aria-label="입력 중"><i></i><i></i><i></i></span>
			</div>
		{/if}
	</div>
	{#if fresh}
		<button type="button" class="console-newmsg" onclick={toBottom} aria-live="polite">새 메시지 ↓</button>
	{/if}
</div>
