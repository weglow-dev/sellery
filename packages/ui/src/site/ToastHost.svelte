<script lang="ts">
	/**
	 * 토스트 호스트 — 레이아웃에 1개 (web toast.tsx ToastHost).
	 * 1회성 URL 플래그(app-plan §4.1): `?welcome=1` → GET /api/me 이름으로 "{name}님, 카카오로 로그인했어요"(S3 의 /api/me 가 없으면 이름 없이) · `?bye=1` → "로그아웃했어요".
	 * 표시 후 history.replaceState 로 파라미터를 지운다 (새로고침 시 재표시 방지).
	 */
	import { onMount } from 'svelte';
	import { showToast, toasts } from './toast.svelte';

	function stripParams(names: string[]) {
		const url = new URL(window.location.href);
		let changed = false;
		for (const n of names) {
			if (url.searchParams.has(n)) {
				url.searchParams.delete(n);
				changed = true;
			}
		}
		if (changed) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
	}

	onMount(() => {
		const sp = new URLSearchParams(window.location.search);
		if (sp.get('welcome') === '1') {
			stripParams(['welcome']);
			fetch('/api/me', { cache: 'no-store' })
				.then((r) => (r.ok ? r.json() : null))
				.then((d: { user?: { name?: string } | null } | null) => {
					const name = d?.user?.name;
					showToast(name ? `${name}님, 카카오로 로그인했어요` : '카카오로 로그인했어요');
				})
				.catch(() => showToast('카카오로 로그인했어요'));
		}
		if (sp.get('bye') === '1') {
			stripParams(['bye']);
			showToast('로그아웃했어요');
		}
	});
</script>

<div id="toasts" role="status" aria-live="polite" aria-atomic="false">
	{#each toasts.list as t (t.id)}
		<div class="toast">{t.msg}</div>
	{/each}
</div>
