<script lang="ts">
	/**
	 * 3.1.6 배송 · 교환 · 환불 카드 [원문]. 문의 버튼은 슬라이스 1 에서 고객센터 채널 링크로 안내 (web s/[handle]/[code]/page.tsx ShippingPolicyCard)
	 *
	 * 운송장 안내 채널은 **이메일**이다(운영 결정 2026-09-22 · docs/launch-checklist.md §5 결정 3) —
	 * 브랜드가 송장을 등록하면 `notifyOrderShipped`(Resend) 가 한 통 보낸다. 다만 비회원·카카오 회원은
	 * 이메일이 없을 수 있어(`resolveCustomerEmail` null → 미발송) **주문 조회 화면이 정본**이고 메일은 보조다.
	 * 카카오 알림톡은 발신 프로필·템플릿 심사·대행사 계약이 필요해 보류 상태이며 추후 도입 가능성이 있다 —
	 * 도입하면 이 문구와 `/about` 회원 혜택 카드를 함께 고친다.
	 */
	import type { CampaignCard } from '@sellery/db/campaign';
	import { COMPANY } from '@sellery/db/company';
	let { card }: { card: CampaignCard } = $props();
	const external = /^https?:\/\//.test(COMPANY.csUrl);
	const days = $derived(card.settings.clear_days);
</script>

<div class="card">
	<h4>배송 · 교환 · 환불</h4>
	<div class="btnrow" style="margin:0 0 11px">
		<a href={COMPANY.csUrl} class="btn sm" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>💬 판매자에게 문의하기</a>
	</div>
	<ul class="store-ul">
		<li>결제 후 2–3일 내 <b>{card.brand.name}</b>에서 직배송, 운송장은 <b>내 주문</b>에서 확인 (이메일을 남기면 메일로도 안내)</li>
		<li>판매 종료 후 <b>{days}일</b> 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 {days}일)</li>
		<li>대금은 정산 전까지 <b>셀러리</b>가 보관하므로 환불이 지연되지 않습니다</li>
		<li>문의: 셀러리 고객센터(이메일) — 인플루언서 DM이 아닌 셀러리로 접수</li>
	</ul>
</div>
