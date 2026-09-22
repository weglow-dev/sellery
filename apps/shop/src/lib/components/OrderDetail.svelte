<script lang="ts">
	/**
	 * 주문 상세 본문 — 회원 `/account/orders/[code]` 와 비회원 `/orders/g/[code]`(0021) 가 같은 것을 그린다 (web account/orders/[code]/page.tsx 1:1).
	 *   주문 상품(칩 · 판매 페이지 · 문의 · 환불) · 주문 정보 · 배송 정보(service 조인이라 shipping 원문 + ShipInfo) · 교환/환불.
	 * 환불 정책 원문(js/60-customer.js L282): "판매 종료 후 {n}일 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {n}일)".
	 * 환불 성공 → onRefreshed (앱이 `invalidateAll()`) → 칩 '환불 완료'. RefundModal 은 /api/payments/cancel — 비회원은 조회 토큰 쿠키로 통과한다.
	 * back: 상단 왼쪽 링크(회원 ← 내 주문 · 비회원 ← 주문 조회). 데이터는 전부 props — 서버 모듈을 import 하지 않는다.
	 */
	import { normalizeHandle } from '@sellery/db/campaign';
	import { md } from '@sellery/db/dates';
	import { isRefundable, orderStatusLabel, REFUND_BLOCK_MESSAGES, REFUND_NOTICE, shipLabel, won } from '@sellery/db/order-status';
	import { CsModalButton, ProductIcon, RefundButton, ShipInfo, StatusChip, type OrderSettings, type OrderView } from '@sellery/ui/site';

	let {
		order,
		settings,
		back,
		guest = false,
		onRefreshed
	}: {
		order: OrderView;
		settings: OrderSettings;
		back: { href: string; label: string };
		/** 비회원 주문 — 머리에 안내 한 줄 */
		guest?: boolean;
		onRefreshed: () => void | Promise<void>;
	} = $props();

	const CODE = $derived(order.code.toUpperCase());
	const st = $derived(orderStatusLabel(order, order.campaign));
	const ship = $derived(shipLabel(order, order.campaign, settings));
	const refund = $derived(isRefundable(order, order.campaign));
	const storeHref = $derived(`/s/${normalizeHandle(order.seller.handle)}/${encodeURIComponent(order.campaign.code)}`);
	const csHref = $derived(`/cs/new?campaign=${encodeURIComponent(order.campaign.code)}&order=${encodeURIComponent(order.code)}`);
	const sa = $derived(order.shipping);
	const refunded = $derived(order.status === 'REFUNDED' || order.status === 'CANCELED');

	/** ISO → 'YYYY. M. D. 오후 3:20' (Asia/Seoul) */
	function kstDateTime(iso: string | null): string {
		if (!iso) return '—';
		const t = Date.parse(iso);
		if (Number.isNaN(t)) return '—';
		return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(t));
	}

	/** '01012345678' → '010-1234-5678' (숫자만 8~15자리 저장값 — 그 외는 그대로) */
	function fmtPhone(p: string | null | undefined): string {
		if (!p) return '—';
		const d = p.replace(/\D/g, '');
		if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
		if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
		if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
		return p;
	}
</script>

<div class="store">
	<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">
		<a href={back.href} class="btn ghost sm">{back.label}</a>
		<span style="font-size:11.5px;color:var(--color-mute);font-family:var(--font-mono)">{CODE}</span>
	</div>

	<h2 class="pg">주문 상세 <small>{CODE} · {md(order.paid_at)} 주문{guest ? ' · 비회원' : ''}</small></h2>

	{#if guest}
		<div class="notice" style="margin:0 0 12px;font-size:12.5px">비회원 주문이에요 — 이 화면은 주문번호와 연락처로 조회한 기기에서 90일 동안 열려요. 다른 기기에서는 <a href="/orders/lookup" class="underline underline-offset-2">주문 조회</a>에서 다시 확인해주세요.</div>
	{/if}

	<!-- 1. 주문 상품 -->
	<div class="card static">
		<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
			<ProductIcon thumbUrl={order.product.thumb_url} emoji={order.product.emoji} size={52} />
			<div style="flex:1 1 200px;min-width:0">
				<div style="font-weight:700;font-size:15px">{order.product.name} <span style="font-weight:400;color:var(--color-mute);font-size:13px">· {order.option_name || '기본'} × {order.qty}</span></div>
				<div class="meta">{order.brand.name} 직배송{ship ? ` · ${ship}` : ''}</div>
			</div>
			<StatusChip tone={st.tone}>{st.label}</StatusChip>
			<div class="cart-sum" style="font-size:16px">{won(order.amount)}</div>
		</div>
		<div class="btnrow" style="margin-top:14px">
			<a href={storeHref} class="btn sm ghost">판매 페이지 보기</a>
			<CsModalButton class="sm" productName={order.product.name} thumbUrl={order.product.thumb_url} emoji={order.product.emoji} brandName={order.brand.name} orderCode={order.code} {csHref}>💬 문의하기</CsModalButton>
			{#if refund.ok}
				<RefundButton class="sm ghost" code={order.code} productName={order.product.name} optionName={order.option_name} qty={order.qty} amount={order.amount} {onRefreshed} />
			{/if}
		</div>
	</div>

	<!-- 2. 주문 정보 -->
	<div class="card static">
		<h4>주문 정보</h4>
		<table class="stmt" style="min-width:0;font-size:13px">
			<tbody>
				<tr><td style="white-space:nowrap">주문번호</td><td class="num" style="white-space:normal"><span style="font-family:var(--font-mono)">{CODE}</span></td></tr>
				<tr><td style="white-space:nowrap">주문 일시</td><td class="num" style="white-space:normal">{kstDateTime(order.paid_at)}</td></tr>
				<tr><td style="white-space:nowrap">결제 수단</td><td class="num" style="white-space:normal">{order.payment_method || '—'}</td></tr>
				<tr><td style="white-space:nowrap">상품 금액</td><td class="num" style="white-space:normal">{won(order.unit_price)} × {order.qty}</td></tr>
				<tr><td style="white-space:nowrap">배송비</td><td class="num" style="white-space:normal">무료 · 브랜드 직배송</td></tr>
				<tr class="tot"><td>총 결제</td><td class="num">{won(order.amount)}</td></tr>
				<tr><td style="white-space:nowrap">판매 인플루언서</td><td class="num" style="white-space:normal">{order.seller.name} <span class="meta">{order.seller.handle}</span></td></tr>
				<tr><td style="white-space:nowrap">공급 브랜드</td><td class="num" style="white-space:normal">{order.brand.name}</td></tr>
			</tbody>
		</table>
	</div>

	<!-- 3. 배송 정보 -->
	<div class="card static">
		<h4>배송 정보</h4>
		{#if sa}
			<table class="stmt" style="min-width:0;font-size:13px">
				<tbody>
					<tr><td style="white-space:nowrap">수령인</td><td class="num" style="white-space:normal">{sa.recipient || '—'}</td></tr>
					<tr><td style="white-space:nowrap">연락처</td><td class="num" style="white-space:normal">{fmtPhone(sa.phone)}</td></tr>
					<tr><td style="white-space:nowrap">주소</td><td class="num" style="white-space:normal">{[sa.postcode ? `(${sa.postcode})` : '', sa.address1, sa.address2].filter(Boolean).join(' ') || '—'}</td></tr>
					{#if sa.memo}<tr><td style="white-space:nowrap">배송 메모</td><td class="num" style="white-space:normal">{sa.memo}</td></tr>{/if}
				</tbody>
			</table>
		{:else}
			<div class="meta">배송지 정보가 없어요 — 고객센터로 문의해주세요</div>
		{/if}
		<ShipInfo {order} {settings} />
	</div>

	<!-- 4. 환불 -->
	<div class="card static">
		<h4>교환 · 환불</h4>
		{#if refunded}
			<div class="notice" style="margin:0 0 12px">
				환불 완료{order.refunded_at ? ` · ${md(order.refunded_at)}` : ''} · {won(order.refund_amount ?? order.amount)} — 결제수단으로 3영업일 내 환급{order.refund_reason ? ` · 사유: ${order.refund_reason}` : ''}
			</div>
		{:else if refund.ok}
			<div class="btnrow" style="align-items:center;margin-bottom:12px">
				<RefundButton class="sm" code={order.code} productName={order.product.name} optionName={order.option_name} qty={order.qty} amount={order.amount} {onRefreshed} />
				<span class="meta">{REFUND_NOTICE}</span>
			</div>
		{:else}
			<div class="notice" style="margin:0 0 12px">{REFUND_BLOCK_MESSAGES[refund.code]}</div>
		{/if}
		<ul class="store-ul">
			<li>판매 종료 후 <b>{settings.clear_days}일</b> 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {settings.clear_days}일)</li>
			<li>대금은 정산 전까지 <b>셀러리</b>가 보관하므로 환불이 지연되지 않습니다</li>
			<li>문의: 셀러리 고객센터(이메일) — 인플루언서 DM이 아닌 셀러리로 접수</li>
		</ul>
	</div>
</div>
