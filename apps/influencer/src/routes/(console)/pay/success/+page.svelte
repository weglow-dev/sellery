<script lang="ts">
	/**
	 * 샘플 결제 완료 / 확인 중 / 실패 뷰 — 프로토타입 confirmSampleBuy 토스트("샘플 구매 완료 — 브랜드 발송 대기") + 시스템 메시지의 금액부(🥬 n + ₩m).
	 * 확정은 +page.server.ts 의 load 가 했다(1회 · 멱등). "확인 중" 은 같은 URL 새로고침이 재시도(already:true 또는 CONFIRMING 유지).
	 */
	import { page } from '$app/state';
	import { COMPANY } from '@sellery/db/company';
	import { partnerPayFailMessage } from '@sellery/db/partner/sample-rules';
	import { ProductIcon } from '@sellery/ui/site';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const external = /^https?:\/\//.test(COMPANY.csUrl);
	const here = $derived(page.url.pathname + page.url.search);
</script>

<svelte:head>
	<title>{data.view === 'ok' ? '샘플 구매 완료' : data.pending ? '결제 확인 중' : '결제 확인'} — 셀러리 파트너</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if data.view === 'ok'}
	<section class="card static">
		<h3 style="margin:0 0 8px">샘플 구매 완료 ✓</h3>
		<div class="notice ok" role="status" style="margin:0 0 12px">샘플 구매 완료 — 브랜드 발송 대기. 브랜드가 발송하면 캠페인 스레드에 운송장이 표시됩니다.{#if data.already}{' '}(이미 처리된 결제예요){/if}</div>
		<div class="rowitem" style="padding:6px 0 2px;border-bottom:0">
			{#if data.product}<ProductIcon thumbUrl={data.product.thumb_url} emoji={data.product.emoji} size={48} />{/if}
			<div class="grow">
				<div class="nm">{data.product?.name ?? '샘플'}{#if data.product?.brand}{' '}<span class="sub">· {data.product.brand}</span>{/if}</div>
				<div class="sub">결제 <b>{data.amountText}</b>{#if data.orderCode}{' '}· 주문 <span style="font-family:var(--font-mono)">{data.orderCode.toUpperCase()}</span>{/if}</div>
			</div>
		</div>
		<p class="meta" style="margin-top:10px">
			{#if data.amountCel > 0}🥬 {data.amountCel}개는 잔액에서 바로 차감됐어요. {/if}브랜드는 일반 판매 1건과 동일하게 정산받고, 이달 무상 샘플 한도는 쓰지 않았습니다.{#if data.product?.refund}{' '}<b>판매 확정 시 샘플 구매액을 환급합니다.</b>{/if}
			브랜드가 발송하기 전에는 고객센터로 취소를 요청할 수 있어요.
		</p>
		<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
			<a href={COMPANY.csUrl} class="btn" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>문의하기</a>
			{#if data.paths.campaign}<a href={data.paths.campaign} class="btn pri">캠페인 보기 →</a>{:else}<a href={data.paths.campaigns} class="btn pri">내 캠페인</a>{/if}
		</div>
	</section>
{:else if data.pending}
	<section class="card static">
		<h3 style="margin:0 0 8px">결제 확인 중 ⏳</h3>
		<div class="notice" role="status" aria-live="polite" style="margin:0 0 10px">{partnerPayFailMessage('CONFIRMING')} — 잠시 후 <b>새로고침</b>해 주세요. 승인되지 않은 결제는 자동으로 정리됩니다.</div>
		<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
			<a href={data.paths.campaigns} class="btn">내 캠페인</a>
			<a href={here} class="btn pri" data-sveltekit-reload>새로고침</a>
		</div>
	</section>
{:else}
	<section class="card static">
		<h3 style="margin:0 0 8px">샘플 구매를 완료하지 못했어요</h3>
		<div class="notice danger" role="alert" style="margin:0 0 10px">{partnerPayFailMessage(data.code, data.message)}</div>
		{#if data.canceled}<div class="meta" style="margin-bottom:6px">결제 상태: 현금 결제는 전액 취소됐어요 (카드사 기준 3~7일 내 환급)</div>{/if}
		<div class="meta" style="font-family:var(--font-mono);font-size:11px">코드 {data.code}</div>
		<div class="btnrow" style="justify-content:flex-end;margin-top:18px">
			<a href={COMPANY.csUrl} class="btn" target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>문의하기</a>
			{#if data.paths.campaign}<a href={data.paths.campaign} class="btn">캠페인 보기</a>{/if}
			{#if data.paths.pay}<a href={data.paths.pay} class="btn pri">결제 화면으로</a>{:else}<a href={data.paths.products} class="btn pri">상품 갤러리</a>{/if}
		</div>
	</section>
{/if}
