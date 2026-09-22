<script lang="ts" module>
	/** `/checkout?c&o&q` (web store/buy-cta.tsx checkoutUrl) — 체크아웃 화면은 S3 */
	export function checkoutUrl(code: string, optionIndex: number, qty: number): string {
		return `/checkout?c=${encodeURIComponent(code)}&o=${optionIndex}&q=${qty}`;
	}
</script>

<script lang="ts">
	/**
	 * 상태별 CTA 블록 (ux-spec §3.1.3 원문 · web store/buy-cta.tsx).
	 *   LIVE:   [구매하기 (pri buy)] — left ≤ 0 → '품절' disabled · isBuyable 실패 → disabled
	 *           .meta: {md(start)}–{md(end)} 한정 · 잔여 {n}개 · {sold}개 판매됨 · 결제 시 셀러리 안전결제로 이동
	 *   예정:   [🔔 {md(start)} 오픈 알림 받기 (pri buy)] → 토스트 (저장 없음)
	 *   종료:   [판매가 종료되었습니다 (disabled)] · .meta: 교환·환불은 종료 후 {clear_days}일까지 셀러리 고객센터에서 처리됩니다
	 * 🛒 장바구니 버튼은 슬라이스 1 에서 숨김 (구매하기 full width).
	 * 클릭(buyNow): LIVE 아니면 토스트 · left < q 면 토스트 · /checkout?c&o&q 로 전체 이동 (S3 화면). 미로그인도 곧바로 /checkout — 거기서 [카카오로 로그인하고 구매]/[비회원으로 구매] 를 고른다(비회원 구매 2026-09-22 · 0021). `signedIn` 은 호환용 prop(사용 안 함).
	 */
	import { fmtNum, isBuyable, isEnded, stockLeft, type CampaignCard } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { showToast } from '../toast.svelte';
	import { NOTIFY_TOAST } from '../constants';

	let { card, optionIndex, qty, signedIn }: { card: CampaignCard; optionIndex: number; qty: number; signedIn: boolean } = $props();

	const c = $derived(card.campaign);
	const ended = $derived(isEnded(c, c.today));
	const left = $derived(stockLeft(card));
	const buyable = $derived(isBuyable(card, 1));
	const soldOut = $derived(left <= 0);

	function onBuy() {
		const chk = isBuyable(card, qty);
		if (!chk.ok) {
			showToast(chk.message);
			return;
		}
		const next = checkoutUrl(c.code, optionIndex, qty);
		// 미로그인도 /checkout 으로 — 로그인/비회원 선택은 체크아웃 화면이 한다 (0021)
		void signedIn;
		window.location.assign(next);
	}
</script>

{#if ended}
	<button type="button" class="buy" disabled style="opacity:0.6">판매가 종료되었습니다</button>
	<div class="meta" style="text-align:center;margin-top:8px">교환·환불은 종료 후 {card.settings.clear_days}일까지 셀러리 고객센터에서 처리됩니다</div>
{:else if c.status === 'SCHEDULE_CONFIRMED'}
	<button type="button" class="pri buy" onclick={() => showToast(NOTIFY_TOAST)}>🔔 {c.start_date ? md(c.start_date) : ''} 오픈 알림 받기</button>
{:else}
	<div class="buyrow">
		<button type="button" class="pri buy" onclick={onBuy} disabled={soldOut || !buyable.ok} style={soldOut ? 'opacity:0.5' : undefined}>{soldOut ? '품절' : '구매하기'}</button>
	</div>
	<div class="meta" style="text-align:center;margin-top:8px">
		{c.start_date ? md(c.start_date) : '—'}–{c.end_date ? md(c.end_date) : '—'} 한정 · 잔여 {fmtNum(Math.max(0, left))}개 · {fmtNum(c.sold_qty ?? 0)}개 판매됨 · 결제 시 셀러리 안전결제로 이동
	</div>
{/if}
