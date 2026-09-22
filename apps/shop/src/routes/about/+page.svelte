<script lang="ts">
	/**
	 * /about — 셀러리 소개 (프로토타입 js/60-customer.js vCustAbout → S2 이전 apps/shop about/+page.svelte 의 에디토리얼 스프레드를 정적 문구로 이식).
	 *   1 히어로(태그라인 "좋은 브랜드를 만나는 공간, 셀러리") · 2 이름의 유래 스프레드 · 3 세 가지 검증 · 4 에스크로 타임라인 · 5 인증 마크
	 *   · 6 셀러리가 다른 이유(홈과 같은 6장 — $lib/why) · 7 회원 혜택 · 8 FAQ · 9 브랜드·인플루언서 입점 CTA(/brand/signup · /influencer/signup)
	 * 데모 수치 띠(누적 판매액·환불률)와 "일반 SNS 공구" 비교 차트는 실데이터가 아니므로 옮기지 않았다.
	 * 정책 숫자는 DEFAULT_SETTINGS.clear_days(=CLEAR_DAYS) · 플랫폼 수수료 10% 는 PLAT_RATE (숫자는 코드 상수가 정답 — CLAUDE.md).
	 */
	import { DEFAULT_SETTINGS } from '@sellery/db/campaign';
	import { PLAT_RATE } from '@sellery/core/constants';
	import { CEL } from '@sellery/ui/site';
	import { whyCards } from '$lib/why';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const CLEAR = DEFAULT_SETTINGS.clear_days;
	const PLAT_PCT = Math.round(PLAT_RATE * 100);
	const TITLE = '셀러리 소개 — 셀러리';
	const DESCRIPTION = '좋은 브랜드를 만나는 공간, 셀러리. 건강·웰니스 브랜드와 인증 인플루언서를 잇는 협업판매 중개 플랫폼 — 검증된 상품, 기간 한정 가격, 결제 대금 보관과 환불 보호.';

	const why = whyCards(CLEAR);
	const faq: [string, string][] = [
		['셀러리는 쇼핑몰인가요?', '아니요. 건강·웰니스 브랜드와 인증 인플루언서를 연결하고, 결제 보관·배송 알림·환불 보호를 대행하는 통신판매중개자입니다. 상품과 거래 정보의 책임은 공급 브랜드에 있습니다.'],
		['가격이 정말 기간 한정 최저가인가요?', '브랜드가 셀러리에 등록한 판매가로만 판매되고, 같은 기간 다른 채널에서 더 낮은 가격을 제시하지 않기로 약정합니다. 판매 기간이 끝나면 정가로 돌아갑니다.'],
		['환불은 어떻게 하나요?', `판매 종료 후 ${CLEAR}일 동안 교환·환불을 신청할 수 있습니다(단순 변심 7일, 하자 ${CLEAR}일). 대금은 정산 전까지 셀러리가 보관하므로 환불이 지연되지 않습니다.`],
		['인플루언서 링크가 진짜인지 어떻게 확인하나요?', '정식 판매 페이지 상단에는 셀러리 인증 띠가 있고, "인증 확인"을 누르면 링크 유효성·인증 채널·공급 브랜드·판매 기간이 표시됩니다. 사칭 링크는 이 정보를 표시할 수 없습니다.'],
		['왜 건강·웰니스만 하나요?', '한 분야만 깊게 검증하기 위해서입니다. 건강기능식품은 표시광고 기준이 엄격하고, 성분·용량·인증을 이해하는 판매자가 팔아야 신뢰가 생깁니다.']
	];
	let faqOpen = $state<number | null>(null);
	const toggle = (i: number) => (faqOpen = faqOpen === i ? null : i);
</script>

<svelte:head>
	<title>{TITLE}</title>
	<meta name="description" content={DESCRIPTION} />
	<link rel="canonical" href={data.canonical} />
	<meta property="og:title" content={TITLE} />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:url" content={data.canonical} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={TITLE} />
	<meta name="twitter:description" content={DESCRIPTION} />
</svelte:head>

<div class="about">
	<!-- 1. 히어로 -->
	<div class="hero-band">
		<div class="ey"><CEL /> ABOUT SELLERY</div>
		<h1>좋은 브랜드를 만나는 공간, <em>셀러리</em></h1>
		<div class="tagline">건강·웰니스 브랜드와 <b>인증 인플루언서</b>를 잇는 협업판매 중개 플랫폼</div>
		<div class="sub">셀러리는 물건을 진열하지 않습니다. 직접 써 보고 검증한 사람을 큐레이션하고, 그 사람이 고른 상품을 기간 한정 가격으로 엽니다. 결제 대금은 판매 종료 후 <b>{CLEAR}일</b>까지 <b>셀러리</b>가 보관합니다.</div>
	</div>

	<!-- 2. 이름의 유래 -->
	<div class="spread">
		<div class="sp-l">
			<div class="hand">a gallery of sellers, not shelves.</div>
			<div class="wordart">SELLER<span>Y</span><br />GALLER<span>Y</span></div>
			<div class="origin"><span>SELLER</span><i>+</i><span>GALLERY</span><i>=</i><span class="em">SELLERY</span></div>
			<div class="cap" style="text-align:left;margin-top:8px">판매자를 큐레이션하는 갤러리</div>
		</div>
		<div class="sp-r">
			<span class="tag">WHY SELLERY</span>
			<h2>물건을 진열하지 않습니다.<br />사람을 큐레이션합니다.</h2>
			<p>셀러리(SELLERY)는 <b>Seller</b>와 <b>Gallery</b>를 겹쳐 지은 이름입니다. 좋은 갤러리가 작품을 고르듯, 우리는 직접 써 보고 검증한 판매자만 걸어 둡니다. 판매 이력과 반응, 등급이 전시처럼 공개되고, 브랜드는 그 갤러리에서 함께할 사람을 고릅니다.</p>
			<p>그 이름이 채소 <b>celery</b>와 같은 소리를 내는 것은 의도한 겹침입니다. 가볍고, 정직하며, 몸에 이로운 것만 — 셀러리가 건강·웰니스만을 다루는 이유입니다.</p>
		</div>
	</div>

	<!-- 3. 세 가지 검증 -->
	<div class="spread">
		<div class="sp-l">
			<div class="hand">three checks. one mark.</div>
			<div class="stack">
				<div class="box b1"><b>BRAND</b><div><span>사업자 · 정산 계좌 · 통신판매업</span><em>브랜드 검증</em></div></div>
				<div class="box b2"><b>PRODUCT</b><div><span>표시광고 기준 · 기능성 인정 범위 · 성분</span><em>상품 검수</em></div></div>
				<div class="box b3"><b>SELLER</b><div><span>채널 소유 인증 · 판매 실적 · 7단계 등급</span><em>인플루언서 인증</em></div></div>
				<div class="arrow" aria-hidden="true">↓</div>
				<div class="box all"><b>ALL THREE</b><div><span>판매 페이지의 셀러리 인증 마크</span><em>sellery.life/s/…</em></div></div>
			</div>
			<div class="cap">the Sellery trust blueprint</div>
		</div>
		<div class="sp-r">
			<span class="tag">THE THREE CHECKS</span>
			<h2>신뢰는 세 번 확인한 뒤에 붙입니다.</h2>
			<p><b>브랜드</b>는 사업자와 정산 계좌를 확인한 뒤에만 상품을 등록할 수 있습니다. <b>상품</b>은 질병 치료·예방 표현을 걸러내고, 기능성은 식약처 인정 범위 안에서만 검수를 통과합니다. <b>인플루언서</b>는 채널 소유를 인증하고, 확정 매출에 따라 7단계 등급을 받습니다.</p>
			<p>세 검증을 모두 통과한 판매에만 인증 마크가 붙습니다. 마크가 없는 링크는 셀러리의 판매가 아닙니다.</p>
		</div>
	</div>

	<!-- 4. 에스크로 -->
	<div class="spread">
		<div class="sp-l">
			<div class="hand">held in escrow until it is right.</div>
			<div class="tl">
				<div class="tl-step"><i>1</i><b>결제</b><span>고객 결제 → 셀러리 보관(에스크로)</span></div>
				<div class="tl-step"><i>2</i><b>배송</b><span>브랜드 직배송 · 운송장 알림톡</span></div>
				<div class="tl-step"><i>3</i><b>판매 종료</b><span>기간 한정 가격 마감</span></div>
				<div class="tl-step hi"><i>4</i><b>{CLEAR}일 환불 보호</b><span>교환·환불 신청 기간 · 대금 계속 보관</span></div>
				<div class="tl-step"><i>5</i><b>정산</b><span>브랜드·인플루언서에게 지급 · 명세 발행</span></div>
			</div>
		</div>
		<div class="sp-r">
			<span class="tag">ESCROW</span>
			<h2>결제 대금은 판매자가 아닌<br />셀러리가 보관합니다.</h2>
			<p>결제 대금은 판매 종료 후 <b>{CLEAR}일</b>의 환불 보호 기간이 지난 뒤에야 브랜드와 인플루언서에게 정산됩니다. 그 전까지는 셀러리가 보관하므로 환불이 지연되거나 판매자와 다툴 일이 생기지 않습니다.</p>
			<p>수수료 구조도 공개합니다. 브랜드가 정한 판매가와 수수료율은 인플루언서에게 그대로 보이고, 플랫폼 수수료는 <b>{PLAT_PCT}%</b>로 고정되어 있습니다. 숨은 광고비가 가격에 얹히지 않습니다.</p>
		</div>
	</div>

	<!-- 5. 인증 마크 -->
	<div class="spread">
		<div class="sp-l">
			<div class="hand">look for the mark.</div>
			<div class="store-trust" style="margin:0"><CEL /> <b>셀러리 인증 판매</b> · 결제 보관 · {CLEAR}일 환불 보호 · 인플루언서 채널 인증 ✓ <span class="verify">인증 확인</span></div>
			<div class="cap" style="text-align:left;margin-top:10px">정식 판매 페이지 상단에 항상 표시 · 주소는 <b>sellery.life/s/…</b></div>
		</div>
		<div class="sp-r">
			<span class="tag">TRUST MARK</span>
			<h2>정식 판매에만<br />이 마크가 붙습니다.</h2>
			<p>"인증 확인"을 누르면 링크 ID, 인플루언서의 인증 채널, 공급 브랜드, 판매 기간이 그대로 표시됩니다. 마크가 없거나 정보가 비어 있다면 셀러리의 판매가 아닙니다.</p>
		</div>
	</div>

	<!-- 6. 셀러리가 다른 이유 (홈과 동일) -->
	<div class="sec" style="margin-top:28px">셀러리가 다른 이유</div>
	<div class="why">
		{#each why as w (w.title)}
			<div class="card">
				<div class="why-i" aria-hidden="true">{w.icon}</div>
				<b>{w.title}</b>
				<div class="meta">{w.text}</div>
			</div>
		{/each}
	</div>

	<!-- 7. 회원 혜택 -->
	<div class="sec" style="margin-top:28px">회원 혜택</div>
	<div class="grid g4">
		<div class="card"><b>🔔 오픈 알림</b><div class="meta">관심 상품과 인플루언서의 판매가 열리면 카카오 알림톡으로 먼저 알려드립니다.</div></div>
		<div class="card"><b>📦 주문 통합 관리</b><div class="meta">여러 인플루언서에게 구매한 상품의 주문·배송·환불을 한 화면에서 관리합니다.</div></div>
		<div class="card"><b>⭐ 팔로우</b><div class="meta">신뢰하는 인플루언서를 팔로우하면 다음 판매 일정이 홈에 먼저 표시됩니다.</div></div>
		<div class="card"><b>🛡️ 인증 이력</b><div class="meta">확인한 인증 링크와 구매 이력이 남아 사칭 링크와 중복 결제를 막아 줍니다.</div></div>
	</div>

	<!-- 8. FAQ -->
	<div class="sec" style="margin-top:26px">자주 묻는 질문</div>
	<div class="card static flat" style="overflow:hidden">
		{#each faq as [q, a], i (q)}
			<div class={faqOpen === i ? 'faq on' : 'faq'}>
				<button type="button" class="faq-q" aria-expanded={faqOpen === i} aria-controls="faq-a-{i}" onclick={() => toggle(i)}>
					<span>Q. {q}</span><span class="acc-arrow" aria-hidden="true">{faqOpen === i ? '▲' : '▼'}</span>
				</button>
				{#if faqOpen === i}<div class="faq-a" id="faq-a-{i}">{a}</div>{/if}
			</div>
		{/each}
	</div>

	<!-- 9. 입점 CTA -->
	<div class="grid g2" style="margin-top:26px">
		<div class="card cta">
			<div><b>브랜드이신가요?</b><div class="meta">건강·웰니스 브랜드라면 상품을 등록하고 인증 인플루언서의 제안을 받아 보세요. 입점비는 없고, 성과 수수료만 있습니다.</div></div>
			<a href="/brand/signup" class="btn sm pri" data-sveltekit-reload>브랜드 입점 신청</a>
		</div>
		<div class="card cta">
			<div><b>인플루언서이신가요?</b><div class="meta">건강·웰니스 판매 레퍼런스가 있다면 채널 인증 후 샘플 요청부터 시작하세요. 수수료율은 상품마다 공개되어 있습니다.</div></div>
			<a href="/influencer/signup" class="btn sm pri" data-sveltekit-reload>인플루언서 가입</a>
		</div>
	</div>
</div>
