<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';

	/** 로그인은 됐는데 이 계정에 연결된 크리에이터가 없을 때 — 가입 화면 전(10번)이라 운영팀이 연결한다 */
	let { data } = $props();
</script>

<svelte:head><title>계정 연결 대기 — MYR Creator</title></svelte:head>

<AuthShell title="아직 연결된 크리에이터가 없어요" sub="이 계정은 MYR 크리에이터와 연결되지 않았어요. 운영팀이 계정을 연결하면 바로 콘솔을 쓸 수 있어요.">
	{#if data.email}<p class="mb-5 text-[14px] text-white/70">로그인한 계정 · <b class="text-fg">{data.email}</b></p>{/if}
	<form method="POST" action="/auth/signout">
		<button type="submit" class="h-14 w-full rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg transition-colors hover:border-white/30">다른 계정으로 로그인</button>
	</form>
</AuthShell>
