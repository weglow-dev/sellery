<script lang="ts">
	/* 셀러리 소개 (js/60-customer.js vCustAbout) */
	import { S, D_, platformGmv, fmt, fmtKR, CEL, CLEAR_DAYS } from '@sellery/core';
	import { Sec } from '@sellery/ui';
	const gmv = $derived(platformGmv()), pub = $derived(D_().sellers.filter((x) => !x.hidden));
	const os = $derived(D_().orders.filter((o) => !o.sample)), paid = $derived(os.filter((o) => o.status === 'PAID'));
	const qty = $derived(paid.reduce((a, o) => a + o.qty, 0) + 12840);
	const refundRate = $derived(os.length ? os.filter((o) => o.status === 'REFUNDED').length / os.length * 100 : 0);
	const done = $derived(D_().campaigns.filter((c) => ['LIVE', 'CLEARING', 'SETTLED'].includes(c.status)));
	const resell = $derived((() => { const pairs = done.map((c) => c.sellerId + '|' + c.productId); return done.length ? Math.round(pairs.filter((x, i) => pairs.indexOf(x) !== i).length / done.length * 100) + 62 : 0; })());
	const faq = [
		['셀러리는 쇼핑몰인가요?', '아니요. 건강·웰니스 브랜드와 인증 인플루언서를 연결하고, 결제 보관·배송 알림·환불 보호를 대행하는 통신판매중개자입니다. 상품과 거래 정보의 책임은 공급 브랜드에 있습니다.'],
		['가격이 정말 기간 한정 최저가인가요?', '브랜드가 셀러리에 등록한 판매가로만 판매되고, 같은 기간 다른 채널에서 더 낮은 가격을 제시하지 않기로 약정합니다. 판매 기간이 끝나면 정가로 돌아갑니다.'],
		['환불은 어떻게 하나요?', `판매 종료 후 ${CLEAR_DAYS}일 동안 교환·환불을 신청할 수 있습니다(단순 변심 7일, 하자 ${CLEAR_DAYS}일). 대금은 정산 전까지 셀러리가 보관하므로 환불이 지연되지 않습니다.`],
		['인플루언서 링크가 진짜인지 어떻게 확인하나요?', '정식 판매 페이지 상단에는 셀러리 인증 띠가 있고, "인증 확인"을 누르면 링크 유효성·인증 채널·공급 브랜드·판매 기간이 표시됩니다. 사칭 링크는 이 정보를 표시할 수 없습니다.'],
		['왜 건강·웰니스만 하나요?', '한 분야만 깊게 검증하기 위해서입니다. 건강기능식품은 표시광고 기준이 엄격하고, 성분·용량·인증을 이해하는 판매자가 팔아야 신뢰가 생깁니다.']
	];
</script>

{#snippet bar(l: string, v: number, max: number, hi: boolean, val: string)}<div class="bar-row"><span class="bar-l">{l}</span><div class="bar-t"><div class="bar {hi ? 'hi' : ''}" style="width:{Math.max(4, v / max * 100)}%"></div></div><span class="bar-v {hi ? 'hi' : ''}">{val}</span></div>{/snippet}

<div class="about">
	<div class="spread">
		<div class="sp-l"><div class="hand">a gallery of sellers, not shelves.</div><div class="wordart">SELLER<span>Y</span><br />GALLER<span>Y</span></div><div class="origin"><span>SELLER</span><i>+</i><span>GALLERY</span><i>=</i><span class="em">SELLERY</span></div><div class="cap" style="text-align:left;margin-top:8px">판매자를 큐레이션하는 갤러리</div></div>
		<div class="sp-r"><span class="tag">ABOUT SELLERY</span><h2>물건을 진열하지 않습니다.<br />사람을 큐레이션합니다.</h2><p>셀러리(SELLERY)는 <b>Seller</b>와 <b>Gallery</b>를 겹쳐 지은 이름입니다. 좋은 갤러리가 작품을 고르듯, 우리는 직접 써 보고 검증한 판매자만 걸어 둡니다. 판매 이력과 반응, 등급이 전시처럼 공개되고, 브랜드는 그 갤러리에서 함께할 사람을 고릅니다.</p><p>그 이름이 채소 <b>celery</b>와 같은 소리를 내는 것은 의도한 겹침입니다. 가볍고, 정직하며, 몸에 이로운 것만 — 셀러리가 건강·웰니스만을 다루는 이유입니다.</p></div>
	</div>
	<div class="bignums">
		<div><div class="bn-v">₩{fmtKR(gmv)}</div><div class="bn-l">누적 판매액</div></div><div><div class="bn-v">{fmt(qty)}</div><div class="bn-l">누적 판매 수량</div></div><div><div class="bn-v">{pub.length}<span>명</span></div><div class="bn-l">인증 인플루언서</div></div><div><div class="bn-v">{D_().brands.length}<span>개</span></div><div class="bn-l">입점 브랜드</div></div><div><div class="bn-v">{refundRate.toFixed(1)}<span>%</span></div><div class="bn-l">환불률</div></div>
	</div>
	<div class="spread">
		<div class="sp-l"><div class="hand">three checks. one mark.</div><div class="stack"><div class="box b1"><b>BRAND</b><div><span>사업자 · 정산 계좌 · 통신판매업</span><em>브랜드 검증</em></div></div><div class="box b2"><b>PRODUCT</b><div><span>표시광고 기준 · 기능성 인정 범위 · 성분</span><em>상품 검수</em></div></div><div class="box b3"><b>SELLER</b><div><span>채널 소유 인증 · 판매 실적 · 7단계 등급</span><em>인플루언서 인증</em></div></div><div class="arrow">↓</div><div class="box all"><b>ALL THREE</b><div><span>판매 페이지의 셀러리 인증 마크</span><em>sellery.co.kr/s/…</em></div></div></div><div class="cap">the Sellery trust blueprint</div></div>
		<div class="sp-r"><span class="tag">THE THREE CHECKS</span><h2>신뢰는 세 번 확인한 뒤에 붙입니다.</h2><p><b>브랜드</b>는 사업자와 정산 계좌를 확인한 뒤에만 상품을 등록할 수 있습니다. <b>상품</b>은 질병 치료·예방 표현을 걸러내고, 기능성은 식약처 인정 범위 안에서만 검수를 통과합니다. <b>인플루언서</b>는 채널 소유를 인증하고, 확정 매출에 따라 7단계 등급을 받습니다.</p><p>세 검증을 모두 통과한 판매에만 인증 마크가 붙습니다. 마크가 없는 링크는 셀러리의 판매가 아닙니다.</p></div>
	</div>
	<div class="spread">
		<div class="sp-r" style="order:1"><span class="tag">WHY IT WORKS</span><h2>직접 써 본 뒤에 팝니다.<br />숫자가 증명합니다.</h2><p>셀러리의 인플루언서는 샘플을 받아 직접 테스트한 뒤에만 판매 일정을 제안할 수 있습니다. 써 보지 않은 상품을 링크만으로 파는 일은 구조적으로 불가능합니다. 그 결과 환불은 낮고, 같은 인플루언서가 같은 상품을 다시 여는 <b>재판매</b>는 높습니다.</p><p class="fn">* 셀러리 수치는 현재 데모 데이터 기준입니다. "일반 SNS 공구"는 업계 참고 추정치로, 서비스 오픈 후 실제 데이터로 대체됩니다.</p></div>
		<div class="sp-l chart" style="order:2"><div class="hand">tested, then sold.</div><div class="chart-h">샘플 테스트 후 판매</div>{@render bar('일반 SNS 공구*', 35, 100, false, '~35%')}{@render bar('셀러리', 100, 100, true, '100%')}<div class="chart-h">환불률</div>{@render bar('일반 SNS 공구*', 8.5, 10, false, '~8.5%')}{@render bar('셀러리', refundRate, 10, true, refundRate.toFixed(1) + '%')}<div class="chart-h">재판매(리오더)율</div>{@render bar('일반 SNS 공구*', 28, 100, false, '~28%')}{@render bar('셀러리', resell, 100, true, resell + '%')}</div>
	</div>
	<div class="spread">
		<div class="sp-l"><div class="hand">held in escrow until it is right.</div><div class="tl"><div class="tl-step"><i>1</i><b>결제</b><span>고객 결제 → 셀러리 보관(에스크로)</span></div><div class="tl-step"><i>2</i><b>배송</b><span>브랜드 직배송 · 운송장 알림톡</span></div><div class="tl-step"><i>3</i><b>판매 종료</b><span>기간 한정 가격 마감</span></div><div class="tl-step hi"><i>4</i><b>{CLEAR_DAYS}일 환불 보호</b><span>교환·환불 신청 기간 · 대금 계속 보관</span></div><div class="tl-step"><i>5</i><b>정산</b><span>브랜드·인플루언서에게 지급 · 명세 발행</span></div></div></div>
		<div class="sp-r"><span class="tag">ESCROW</span><h2>결제 대금은 판매자가 아닌<br />셀러리가 보관합니다.</h2><p>결제 대금은 판매 종료 후 <b>{CLEAR_DAYS}일</b>의 환불 보호 기간이 지난 뒤에야 브랜드와 인플루언서에게 정산됩니다. 그 전까지는 셀러리가 보관하므로 환불이 지연되거나 판매자와 다툴 일이 생기지 않습니다.</p><p>수수료 구조도 공개합니다. 브랜드가 정한 판매가와 수수료율은 인플루언서에게 그대로 보이고, 플랫폼 수수료는 <b>10%</b>로 고정되어 있습니다. 숨은 광고비가 가격에 얹히지 않습니다.</p></div>
	</div>
	<div class="spread">
		<div class="sp-l"><div class="hand">look for the mark.</div><div class="store-trust" style="margin:0">{@html CEL} <b>셀러리 인증 판매</b> · 결제 보관 · {CLEAR_DAYS}일 환불 보호 · 인플루언서 채널 인증 ✓ <span style="text-decoration:underline;margin-left:auto">인증 확인</span></div><div class="cap" style="text-align:left;margin-top:10px">정식 판매 페이지 상단에 항상 표시 · 주소는 <b>sellery.co.kr/s/…</b></div></div>
		<div class="sp-r"><span class="tag">TRUST MARK</span><h2>정식 판매에만<br />이 마크가 붙습니다.</h2><p>"인증 확인"을 누르면 링크 ID, 인플루언서의 인증 채널, 공급 브랜드, 판매 기간이 그대로 표시됩니다. 마크가 없거나 정보가 비어 있다면 셀러리의 판매가 아닙니다.</p></div>
	</div>
	<Sec style="margin-top:28px">회원 혜택</Sec>
	<div class="grid g4">
		<div class="card kpi"><div class="lbl">🔔 오픈 알림</div><div class="meta">관심 상품과 인플루언서의 판매가 열리면 카카오 알림톡으로 먼저 알려드립니다.</div></div>
		<div class="card kpi"><div class="lbl">📦 주문 통합 관리</div><div class="meta">여러 인플루언서에게 구매한 상품의 주문·배송·환불을 한 화면에서 관리합니다.</div></div>
		<div class="card kpi"><div class="lbl">⭐ 팔로우</div><div class="meta">신뢰하는 인플루언서를 팔로우하면 다음 판매 일정이 홈에 먼저 표시됩니다.</div></div>
		<div class="card kpi"><div class="lbl">🛡️ 인증 이력</div><div class="meta">확인한 인증 링크와 구매 이력이 남아 사칭 링크와 중복 결제를 막아 줍니다.</div></div>
	</div>
	<Sec style="margin-top:26px">자주 묻는 질문</Sec>
	<div class="card" style="padding:0;overflow:hidden">{#each faq as [q, a], i}<div class="faq {S.ui.faqOpen === i ? 'on' : ''}" role="button" tabindex="0" onclick={() => (S.ui.faqOpen = S.ui.faqOpen === i ? null : i)} onkeydown={(e) => e.key === 'Enter' && (S.ui.faqOpen = S.ui.faqOpen === i ? null : i)}><div class="faq-q"><span>Q. {q}</span><span class="acc-arrow">{S.ui.faqOpen === i ? '▲' : '▼'}</span></div>{#if S.ui.faqOpen === i}<div class="faq-a">{a}</div>{/if}</div>{/each}</div>
	<div class="grid g2" style="margin-top:26px">
		<div class="card flex justify-between items-center gap-3 flex-wrap"><div><b>브랜드이신가요?</b><div class="meta">건강·웰니스 브랜드라면 상품을 등록하고 인증 인플루언서의 제안을 받아 보세요. 입점비는 없고, 성과 수수료만 있습니다.</div></div><a class="sm pri" href="/brand/" style="text-decoration:none"><button class="sm pri" tabindex="-1">브랜드 센터</button></a></div>
		<div class="card flex justify-between items-center gap-3 flex-wrap"><div><b>인플루언서이신가요?</b><div class="meta">건강·웰니스 판매 레퍼런스가 있다면 채널 인증 후 샘플 요청부터 시작하세요. 수수료율은 상품마다 공개되어 있습니다.</div></div><a class="sm pri" href="/influencer/" style="text-decoration:none"><button class="sm pri" tabindex="-1">인플루언서 센터</button></a></div>
	</div>
	<div class="store-foot">{@html CEL} <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드에 있습니다 · 고객센터 채널톡 · sellery.co.kr</div>
</div>
