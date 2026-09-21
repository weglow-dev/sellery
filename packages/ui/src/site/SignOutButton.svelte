<script lang="ts">
	/** 로그아웃 버튼 — POST /auth/signout(S3) 이 httpOnly 세션 쿠키를 지우고 303 / 로 보낸다. 평범한 form — 클라이언트 JS 불필요 (web account/sign-out-button.tsx). */
	let { class: cls = '' }: { class?: string } = $props();
</script>

<form method="post" action="/auth/signout"><button type="submit" class={cls}>로그아웃</button></form>
