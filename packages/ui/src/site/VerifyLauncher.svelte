<script lang="ts">
	/**
	 * 인증 확인 런처 — 버튼/띠 어디에나 (web verify-modal.tsx VerifyLauncher).
	 * `card` 가 있으면 즉시, 없으면(홈 카드) 브라우저 anon RPC `campaign_card(code)` 로 받아 연다 — Supabase 공개값은 `getSiteEnv()`(레이아웃 컨텍스트).
	 * `as="div"` 면 클릭 가능한 div 로 렌더 (인증 띠 `.store-trust`). 링크 보호 필터 대상이 아니다.
	 */
	import type { Snippet } from 'svelte';
	import { parseCampaignCard, type CampaignCard } from '@sellery/db/campaign';
	import { getSiteEnv } from './env';
	import { showToast } from './toast.svelte';
	import { VERIFY_LOAD_FAIL } from './constants';
	import VerifyModal from './VerifyModal.svelte';

	let {
		code,
		card = null,
		class: cls = '',
		as = 'button',
		children
	}: { code: string; card?: CampaignCard | null; class?: string; as?: 'button' | 'div'; children: Snippet } = $props();

	const env = getSiteEnv();
	let open = $state(false);
	// svelte-ignore state_referenced_locally — 서버가 넘긴 card 는 바뀌지 않는다; 없으면 클릭 시 RPC 로 채운다
	let loaded = $state<CampaignCard | null>(card);
	let busy = $state(false);

	async function launch() {
		if (loaded) {
			open = true;
			return;
		}
		if (busy) return;
		busy = true;
		try {
			if (!env.supabaseUrl || !env.supabaseAnonKey) {
				showToast(VERIFY_LOAD_FAIL);
				return;
			}
			const { createBrowserSupabase } = await import('@sellery/db/browser');
			const { data, error } = await createBrowserSupabase(env.supabaseUrl, env.supabaseAnonKey).rpc('campaign_card', { p_code: code });
			const parsed = error ? null : parseCampaignCard(data);
			if (!parsed) {
				showToast(VERIFY_LOAD_FAIL);
				return;
			}
			loaded = parsed;
			open = true;
		} catch {
			showToast(VERIFY_LOAD_FAIL);
		} finally {
			busy = false;
		}
	}
	const close = () => (open = false);
</script>

{#if as === 'div'}
	<div
		class={cls}
		role="button"
		tabindex="0"
		onclick={launch}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				void launch();
			}
		}}
	>
		{@render children()}
	</div>
{:else}
	<button type="button" class={cls} onclick={launch} disabled={busy}>{@render children()}</button>
{/if}
<VerifyModal card={loaded} {open} onClose={close} />
