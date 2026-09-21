<script lang="ts">
	/**
	 * 앱바 (ux-spec §2.1 · web app-bar.tsx): 좌 워드마크(→ /) · 우 마이페이지 아이콘 버튼.
	 * 프로토타입 `gotoMy`: 로그인 상태면 /account/orders, 아니면 /login?next=/account/orders. 역할 탭은 고객 사이트에 없다.
	 */
	import Wordmark from './Wordmark.svelte';
	import UserIcon from './icons/UserIcon.svelte';
	let { signedIn }: { signedIn: boolean } = $props();
	const my = $derived(signedIn ? '/account/orders' : `/login?next=${encodeURIComponent('/account/orders')}`);
</script>

<header class="appbar">
	<Wordmark />
	<div class="master">
		<a href={my} class="iconbtn" aria-label="마이페이지" title="마이페이지"><UserIcon /></a>
	</div>
</header>
