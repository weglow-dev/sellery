<script lang="ts">
	/**
	 * 환불 신청 모달 (프로토타입 js/80-actions.js custRefund/custRefundGo · ux-spec §4.3 · app-plan §6.2 · §7.4 · web account/orders/[code]/refund-button.tsx 의 모달부).
	 *   · {product} · {option} × {qty} · ₩{amount} · .notice(§0-8 문구) · 사유 선택(단순 변심/상품 하자/오배송/기타) + 상세(합쳐 200자)
	 *   · POST /api/payments/cancel { code, reason } → 토스트 "환불 신청 완료 — 결제수단으로 3영업일 내 환급" → onRefreshed() (앱이 invalidateAll — 칩 '환불 완료')
	 *   · 실패: 서버 { ok:false, code, message } 의 message 를 토스트로 — SETTLED/SHIPPED/REFUNDED/CANCELED/NOT_FOUND 는 화면이 낡은 것이므로 닫고 onRefreshed()
	 *   · 401 → 세션 만료: 로그인 후 같은 경로로 복귀
	 * `invalidateAll` 은 `$app/navigation` 이라 패키지가 import 할 수 없다 — 앱 페이지가 `onRefreshed` 로 넘긴다.
	 */
	import { REFUND_NOTICE, REFUND_REASONS, REFUND_REASON_MAX, won, type RefundReason } from '@sellery/db/order-status';
	import Modal from '../Modal.svelte';
	import { showToast } from '../toast.svelte';

	/** ux-spec §5 원문 */
	const REFUND_DONE_TOAST = '환불 신청 완료 — 결제수단으로 3영업일 내 환급';

	type CancelResponse = { ok?: boolean; code?: string; message?: string; already?: boolean; afterShip?: boolean };

	let {
		open,
		onClose,
		code,
		productName,
		optionName,
		qty,
		amount,
		onRefreshed
	}: {
		open: boolean;
		onClose: () => void;
		code: string;
		productName: string;
		optionName: string | null;
		qty: number;
		amount: number;
		/** 성공·낡은 화면 코드 뒤 호출 — 앱이 `invalidateAll()` 을 넘긴다 */
		onRefreshed: () => void | Promise<void>;
	} = $props();

	let busy = $state(false);
	let reason = $state<RefundReason>(REFUND_REASONS[0]);
	let detail = $state('');
	const detailMax = $derived(Math.max(0, REFUND_REASON_MAX - reason.length - 3)); // ' — ' 3자

	/** 선택지 + 상세 → 토스 cancelReason (≤200자). 상세는 남는 길이만큼만. */
	function composeRefundReason(r: RefundReason, d: string): string {
		const t = d.replace(/\s+/g, ' ').trim();
		if (!t) return r;
		return `${r} — ${t}`.slice(0, REFUND_REASON_MAX);
	}

	function close() {
		if (!busy) onClose();
	}

	async function submit() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/payments/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, reason: composeRefundReason(reason, detail) })
			});
			const data = (await res.json().catch(() => null)) as CancelResponse | null;

			if (res.status === 401) {
				window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
				return;
			}
			if (res.ok && data?.ok) {
				if (data.already) showToast('이미 환불 처리된 주문이에요');
				else if (data.afterShip) showToast(`${REFUND_DONE_TOAST} · 이미 발송된 상품은 회수 후 처리돼요`);
				else showToast(REFUND_DONE_TOAST);
				onClose();
				await onRefreshed();
				return;
			}
			const codeOut = data?.code ?? '';
			showToast(data?.message || '환불 신청에 실패했어요 — 잠시 후 다시 시도해주세요');
			// 화면이 낡은 경우(정산 완료·발송·이미 환불) — 버튼 조건이 바뀌었으니 새로고침
			if (codeOut === 'SETTLED' || codeOut === 'SHIPPED' || codeOut === 'REFUNDED' || codeOut === 'CANCELED' || codeOut === 'NOT_FOUND') {
				onClose();
				await onRefreshed();
			}
		} catch {
			showToast('환불 신청에 실패했어요 — 네트워크를 확인하고 다시 시도해주세요');
		} finally {
			busy = false;
		}
	}
</script>

<Modal {open} onClose={close}>
	{#snippet title()}환불 신청{/snippet}
	<div style="font-size:13.5px;margin-bottom:10px"><b>{productName}</b> · {optionName || '기본'} × {qty} · <b>{won(amount)}</b></div>
	<div class="notice" style="margin:0 0 12px">결제 대금은 <b>셀러리</b>가 보관 중이라 브랜드 확인을 기다리지 않고 바로 환불됩니다. {REFUND_NOTICE}.</div>
	<div class="fld">
		<label for="refund-reason">환불 사유</label>
		<select id="refund-reason" bind:value={reason} disabled={busy}>
			{#each REFUND_REASONS as r (r)}
				<option value={r}>{r}</option>
			{/each}
		</select>
	</div>
	<div class="fld">
		<label for="refund-detail">상세 사유 <span style="font-weight:400;text-transform:none;letter-spacing:0">(선택)</span></label>
		<textarea
			id="refund-detail"
			rows="3"
			maxlength={detailMax}
			value={detail}
			oninput={(e) => (detail = e.currentTarget.value.slice(0, detailMax))}
			placeholder="하자·오배송이면 상태를 간단히 적어주세요"
			disabled={busy}
		></textarea>
		<div class="hint">{detail.length}/{detailMax}자 · 전액 환불만 가능 (부분 환불 없음)</div>
	</div>
	{#snippet footer()}
		<button type="button" onclick={close} disabled={busy}>취소</button>
		<button type="button" class="pri" onclick={submit} disabled={busy}>{busy ? '처리 중…' : '환불 신청'}</button>
	{/snippet}
</Modal>
