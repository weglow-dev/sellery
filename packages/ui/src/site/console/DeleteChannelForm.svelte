<script lang="ts">
	/**
	 * [삭제] — confirm 뒤 form action 제출 (web my-client.tsx DeleteChannelForm). 메인 채널은 서버가 거절한다.
	 * `action` 은 앱이 넘긴 SvelteKit 이름 있는 액션(`?/deleteChannel`) — 컴포넌트는 서버를 모른다.
	 */
	let { id, handle, action = '?/deleteChannel' }: { id: string; handle: string; action?: string } = $props();

	function onsubmit(e: SubmitEvent) {
		if (!window.confirm(`${handle} 채널을 삭제할까요?`)) e.preventDefault();
	}
</script>

<form method="post" {action} {onsubmit}>
	<input type="hidden" name="id" value={id} />
	<button type="submit" class="danger sm">삭제</button>
</form>
