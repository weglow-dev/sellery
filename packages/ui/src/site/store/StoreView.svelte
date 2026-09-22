<script lang="ts">
	/**
	 * 판매 링크 페이지 본문 (프로토타입 vStore · ux-spec §3.1 · web s/[handle]/[code]/page.tsx + store-client.tsx). 8 블록 순서 동일:
	 *   1 상단 행 · 2 인증 띠 · 3 상품 카드(가격 행 · 옵션 · 수량 · 총 결제 금액 · CTA) · 4 상세 정보 · 5 배송·교환·환불 (+ 5-1 판매자에게 문의 링크 · 4단계) · 6 판매자 정보 · 7 다른 판매 · 8 .store-foot
	 * 데이터는 전부 props(서버 load 결과) — `card`(campaign_card) · `others`(같은 인플루언서의 다른 판매) · `signedIn`.
	 * 초기값 옵션 0 · 수량 1 (URL 로 복원하지 않는다). 합계 = options[oi].price × q, 배송비 없음. 결제는 S3(/checkout) — CTA 는 링크만 만든다.
	 */
	import { badgeTone, ddayLabel, discountPct, displayStoreUrl, imageSrc, won, type CampaignCard as Card, type HomeCard } from '@sellery/db/campaign';
	import { COMPANY } from '@sellery/db/company';
	import Cel from '../icons/Cel.svelte';
	import PlatIcon from '../icons/PlatIcon.svelte';
	import GradeBox from '../GradeBox.svelte';
	import TrustBand from '../TrustBand.svelte';
	import Tilt from '../Tilt.svelte';
	import SellerAvatar from '../SellerAvatar.svelte';
	import CampaignCard from '../CampaignCard.svelte';
	import ShippingPolicyCard from '../ShippingPolicyCard.svelte';
	import SellerInfoCard from '../SellerInfoCard.svelte';
	import OptionPicker from './OptionPicker.svelte';
	import QtyStepper from './QtyStepper.svelte';
	import BuyCta from './BuyCta.svelte';

	let { card, others = [], signedIn = false }: { card: Card; others?: HomeCard[]; signedIn?: boolean } = $props();

	const { campaign, product, seller, brand } = $derived(card);
	const today = $derived(campaign.today);
	const dd = $derived(ddayLabel(card));
	const tone = $derived(badgeTone(dd));
	const hero = $derived(imageSrc(product.thumb_url));

	// store-client.tsx — 옵션 · 수량 상태
	let oi = $state(0);
	let q = $state(1);
	const opts = $derived(product.options);
	const o = $derived(opts[Math.min(oi, opts.length - 1)]);
	const cp = $derived(product.consumer_price);
	const disc = $derived(discountPct(cp, product.sale_price));
</script>

<div class="store">
	<!-- 1. 상단 행 -->
	<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
		<a href="/" class="btn ghost sm">← 셀러리 홈</a>
		<span style="font-size:11.5px;color:var(--color-mute)">{displayStoreUrl(card, COMPANY.siteHost)}</span>
	</div>

	<!-- 2. 인증 띠 -->
	<TrustBand {card} />

	<!-- 3. 상품 카드 -->
	<div class="card flat" style="overflow:hidden">
		<div class="store-hero">
			<Tilt class="store-em">
				{#if hero}<img src={hero} alt={product.name} style="max-height:220px;max-width:80%;object-fit:contain" />{:else}{product.emoji}{/if}
			</Tilt>
			<span class={tone ? `trendbadge ${tone}` : 'trendbadge'}>{dd}</span>
		</div>
		<div class="store-body">
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
				<SellerAvatar avatarUrl={seller.avatar_url} size={40} />
				<div style="flex:1;min-width:160px">
					<div><b>{seller.name}</b> <span style="color:var(--color-mute);font-size:12px"><PlatIcon platform={seller.platform} /> {seller.handle}</span> <GradeBox grade={seller.grade} sm /></div>
					<div style="font-size:11.5px;color:var(--color-mute)">셀러리 인증 인플루언서 × {brand.name} 공식 공급</div>
				</div>
				{#if others.length && seller.code}
					<a href="/?seller={encodeURIComponent(seller.code)}" class="btn sm ghost">다른 판매 보기</a>
				{/if}
			</div>
			<h2 style="margin:6px 0 4px;font-size:22px">{product.name}</h2>
			<div class="meta" style="margin-bottom:12px">{product.description ? `${product.description} · ` : ''}{product.category}</div>

			<!-- store-client.tsx -->
			<div class="prices" style="margin-bottom:14px">
				<span class="gp">{won(o.price)}</span>
				{#if oi === 0}
					<span class="cp">{won(cp)}</span>
					{#if disc !== null}<span class="disc">-{disc}%</span>{/if}
				{:else}
					<span class="cp" style="text-decoration:none">{o.n}</span>
				{/if}
			</div>
			<div class="lbl-sm" style="margin-bottom:6px">옵션 선택</div>
			<OptionPicker options={opts} value={oi} onChange={(i) => (oi = i)} />
			<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0">
				<QtyStepper value={q} onChange={(n) => (q = n)} />
				<div style="text-align:right">
					<div style="font-size:11.5px;color:var(--color-mute)">총 결제 금액</div>
					<div class="total-v">{won(o.price * q)}</div>
				</div>
			</div>
			<BuyCta {card} optionIndex={oi} qty={q} {signedIn} />
		</div>
	</div>

	<!-- 4. 상세 정보 -->
	<div class="card">
		<h4>상세 정보</h4>
		{#if product.image_urls.length}
			<div class="store-detail" style="padding:0">
				{#each product.image_urls as u, i (`${i}:${u}`)}<img src={imageSrc(u) ?? u} alt="" />{/each}
			</div>
		{:else}
			<div class="store-detail">
				<div class="store-em" aria-hidden="true">{product.emoji}</div>
				{#if product.description}<p>{product.description}</p>{/if}
				<p style="color:var(--color-mute);font-size:12.5px">브랜드가 등록한 상세페이지 이미지가 여기에 노출됩니다 ({brand.name} 제공 · 표시광고 사전심의 완료)</p>
			</div>
		{/if}
	</div>

	<!-- 5. 배송 · 교환 · 환불 -->
	<ShippingPolicyCard {card} />

	<!-- 5-1. 판매자에게 문의 (4단계 · docs/brand-console-plan.md §8 "판매 페이지 하단 링크") — 접수는 shop `/cs/new` -->
	<div class="card static store-cs">
		<span class="meta">상품 · 배송 · 교환 문의는 공급 브랜드 <b>{brand.name}</b> 가 직접 답해요 — 인플루언서 DM 이 아닌 셀러리로.</span>
		<a href={`/cs/new?campaign=${encodeURIComponent(campaign.code)}`} class="btn ghost sm">💬 판매자에게 문의</a>
	</div>

	<!-- 6. 판매자 정보 (신규 §3.1.7) -->
	<SellerInfoCard {card} />

	<!-- 7. 다른 판매 -->
	{#if others.length}
		<div class="sec">{seller.name}님의 다른 판매</div>
		<div class="grid g3">
			{#each others as c (c.id)}<CampaignCard {c} {today} featureDays={card.settings.home_feature_days} />{/each}
		</div>
	{/if}

	<!-- 8. 페이지 전용 .store-foot (전역 푸터는 layout) -->
	<div class="store-foot">
		<Cel /> <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드({brand.name})에 있습니다 · #광고 · 인플루언서는 판매 수수료를 받습니다
	</div>
</div>
