<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';

	/** 연결된 크리에이터가 정지(active=false)일 때 — 콘솔 화면 · 동작 전부 막힌다(게이트가 모든 콘솔 load 에서 본다) */
	let { data } = $props();
</script>

<svelte:head><title>이용 정지 — MYR Creator</title></svelte:head>

<AuthShell title="크리에이터 콘솔 이용이 정지됐어요" sub="자세한 내용은 MYR 운영팀에 문의해주세요. 정지가 풀리면 다시 로그인해서 쓸 수 있어요.">
	{#if data.email}<p class="mb-5 text-[14px] text-white/70">로그인한 계정 · <b class="text-fg">{data.email}</b></p>{/if}
	<form method="POST" action="/auth/signout">
		<button type="submit" class="h-14 w-full rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg">로그아웃</button>
	</form>
</AuthShell>
