<script lang="ts">
	/**
	 * 캠페인 스레드 답글 폼 — 두 콘솔(`/campaigns/[code]`)이 공유 (docs/brand-console-plan.md §5 `?/chat` · 프로토타입 CampaignDetail.svelte composer 의 **평범한 POST 폼** 판).
	 * name=`body` 하나 → 서버의 `parseChatInput(FormData)`(@sellery/db/partner/chat-rules) → `sendCampaignChat(role, …)`. JS 없이도 제출되고, JS 가 있으면 Enter 로 전송(Shift+Enter 줄바꿈).
	 * 종료된 캠페인(`ENDED_STATUSES`)은 `disabled` — 폼 대신 안내 한 줄. 실패한 제출값(`value`)과 문구(`error`)는 호출자가 `form`(fail 400) 에서 넘긴다.
	 * 연락처·카톡 감지 경고는 서버(0016 leak_warned 행)가 남기므로 여기서는 미리 안내만 한다.
	 */
	import { CHAT_MAX } from '@sellery/db/partner/chat-rules';

	let {
		action = '?/chat',
		disabled = false,
		max = CHAT_MAX,
		as = '인플루언서',
		value = '',
		error = null,
		placeholder = '메시지 입력… (승인·일정은 액션 카드의 버튼으로)'
	}: {
		/** form action — 기본 `?/chat` */
		action?: string;
		/** 종료된 캠페인 — 폼 대신 안내 */
		disabled?: boolean;
		max?: number;
		/** "인플루언서로 발신" 의 주어 */
		as?: string;
		/** 실패한 제출값 프리필 */
		value?: string;
		error?: string | null;
		placeholder?: string;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
		e.preventDefault();
		(e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}
</script>

{#if disabled}
	<div class="composer">종료된 캠페인이에요 — 메시지를 더 보낼 수 없어요. 대화 기록은 그대로 남아 있습니다.</div>
{:else}
	<form method="post" {action} class="composer console-composer">
		<label class="as" for="thread-body">{as}로 발신</label>
		<div class="row">
			<textarea id="thread-body" name="body" rows="2" maxlength={max} {placeholder} required aria-invalid={error ? true : undefined} onkeydown={onKeydown}>{value}</textarea>
			<button type="submit" class="pri sm">전송</button>
		</div>
		{#if error}<div class="console-err" role="alert">{error}</div>{/if}
		<div class="note">연락처 · 카톡 아이디 등 외부 연락처를 적으면 양쪽에 경고가 남아요 — 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.</div>
	</form>
{/if}
