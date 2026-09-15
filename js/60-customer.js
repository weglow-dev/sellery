/* ============ CUSTOMER (sellery.co.kr 고객 화면 · 구매 페이지) ============ */
function custVisible(c){ // 링크 진입 방문: 같은 상품·카테고리의 타 인플루언서 판매 비노출 (인플루언서 판매 보호)
  if(!S.linkCtx)return true;const lc=camp(S.linkCtx.cid);if(!lc)return true;
  if(c.sellerId===lc.sellerId)return true;
  const lp=prod(lc.productId),p=prod(c.productId);
  return p.id!==lp.id&&p.cat!==lp.cat;
}
const isHomeFeat=c=>!!(c.homeFeatured&&(today()-P(c.homeFeatured))/DAY<7);
function custCard(c){
  const p=prod(c.productId),s=seller(c.sellerId),b=brand(p.brandId);
  const live=c.status==='LIVE';const left=(c.qty||0)-soldQty(c.id);
  const dd=live?Math.max(0,Math.ceil((addD(P(c.end),1)-new Date())/DAY)):Math.ceil((P(c.start)-today())/DAY);
  return `<div class="card prod">
    <div class="ph" data-act="preview" data-k="${c.id}" style="cursor:pointer;position:relative"><span class="p3d">${p.thumb?`<img src="${p.thumb}" alt="" style="max-height:92%;max-width:78%;object-fit:contain;pointer-events:none">`:p.em}</span>
      ${isHomeFeat(c)?'<span class="trendbadge" style="background:var(--yellow);color:var(--ink)">★ 추천</span>':live?`<span class="trendbadge">${dd<=1?'오늘 마감':'D-'+dd+' 마감'}</span>`:`<span class="trendbadge" style="background:var(--ink);color:var(--yellow)">오픈 D-${dd}</span>`}</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="sc-av ${s.img?'':'em'}" style="width:28px;height:28px;font-size:14px;${s.img?`background-image:url(${s.img})`:''}">${s.img?'':(SEMOJI[s.id]||'👤')}</span><span style="font-size:12.5px"><b>${esc(s.name)}</b> <span style="color:var(--mute)">${platIcon(s)} ${s.handle}</span></span><span class="gradebox sm">${gfull(gname(s))}</span></div>
    <div class="nm" data-act="preview" data-k="${c.id}" style="cursor:pointer">${esc(p.name)}</div>
    <div class="meta">${esc(p.desc)} · ${esc(b.name)}</div>
    <div class="prices"><span class="gp">₩${fmt(p.gp)}</span><span class="cp">₩${fmt(p.cp)}</span>${p.cp>p.gp?`<span class="disc">-${Math.round((1-p.gp/p.cp)*100)}%</span>`:''}</div>
    <div class="meta">${live?`${md(P(c.start))}–${md(P(c.end))} · 잔여 ${fmt(Math.max(0,left))}개 · <b>${fmt(soldQty(c.id))}개 판매됨</b> · <span style="color:var(--red)">👀 ${viewersOf(c.id)}명 보는 중</span>`:`${md(P(c.start))} 오픈 예정 · 한정 ${fmt(c.qty||0)}개 · 🔔 알림 ${12+viewersOf(c.id)}명`}</div>
    <div class="btnrow">${live?`<button class="pri sm" data-act="preview" data-k="${c.id}">구매하기</button>`:`<button class="sm ghost" data-act="notifyMe" data-k="${c.id}">🔔 오픈 알림</button>`}<button class="sm ghost" data-act="verifyStore" data-k="${c.id}">${CEL} 인증 확인</button></div>
  </div>`;
}
/* 실시간 관심(시뮬): 캠페인별 의사난수 + 20초 단위 변동 */
function viewersOf(cid){const seed=[...String(cid)].reduce((a,ch)=>a+ch.charCodeAt(0),0);const t=Math.floor(Date.now()/20000);return 14+((seed*31+t*7)%53);}
function platformGmv(){return D_().brands.reduce((a,b)=>a+(b.gmvBase||0),0)+D_().campaigns.reduce((a,c)=>a+netOf(c),0);}
function fmtKR(v){if(v>=1e8)return (v/1e8).toFixed(1).replace(/\.0$/,'')+'억';if(v>=1e4)return Math.round(v/1e4).toLocaleString()+'만';return fmt(v);}
function vCustHome(){
  const sel=S.custSel?seller(S.custSel):null;
  const cat=S.custCat||'전체';
  const inCat=c=>cat==='전체'||prod(c.productId).cat===cat;
  const live=D_().campaigns.filter(c=>c.status==='LIVE'&&custVisible(c)&&(!sel||c.sellerId===sel.id)&&inCat(c)).sort((a,b)=>(isHomeFeat(b)-isHomeFeat(a))||(soldQty(b.id)-soldQty(a.id)));
  const soon=D_().campaigns.filter(c=>c.status==='SCHEDULE_CONFIRMED'&&custVisible(c)&&(!sel||c.sellerId===sel.id)&&inCat(c)).sort((a,b)=>(isHomeFeat(b)-isHomeFeat(a))||(P(a.start)-P(b.start)));
  const allLive=D_().campaigns.filter(c=>c.status==='LIVE'&&custVisible(c));
  const todayStr=ymd(today());
  const todayOrders=D_().orders.filter(o=>o.at===todayStr&&o.status==='PAID'&&!o.sample);
  const viewers=allLive.reduce((a,c)=>a+viewersOf(c.id),0)+41;
  const pubSellers=D_().sellers.filter(x=>!x.hidden);
  const catCount=k=>D_().campaigns.filter(c=>['LIVE','SCHEDULE_CONFIRMED'].includes(c.status)&&custVisible(c)&&(k==='전체'||prod(c.productId).cat===k)).length;
  /* 실시간 순위: 진행 중·예정 판매를 판매량 기준 */
  const rank=D_().campaigns.filter(c=>['LIVE','SCHEDULE_CONFIRMED','CLEARING'].includes(c.status)&&custVisible(c)).map(c=>({c,q:soldQty(c.id)})).sort((a,b)=>b.q-a.q).slice(0,5);
  const mxq=rank.length?Math.max(1,rank[0].q):1;
  return `<div class="hero-band">
    <div class="ey">${CEL} SELLERY — 검증된 사람이 고른 웰니스</div>
    <h1>${sel?`${esc(sel.name)}님이 추천하는 <em>진행 중인 상품</em>`:`셀러리에 오신 고객님, <em>환영합니다.</em>`}</h1>
    ${sel?'':'<div class="tagline">지금 진행 중인 <b>최저가 상품</b>을 소개합니다.</div>'}
    <div class="sub">${sel?'':'인증된 인플루언서가 직접 써 보고 고른 웰니스. 브랜드가 바로 보내고, 결제 대금은 판매 종료 후 <b>'+CLEAR_DAYS+'일</b>까지 <b>셀러리</b>가 보관합니다.'}${sel?` <button class="sm ghost" data-act="custAll" style="margin-left:10px">전체 보기</button>`:` <button class="sm ghost" data-act="screen" data-k="about" style="margin-left:10px">셀러리가 뭔가요? →</button>`}</div>
    <div class="cstats">
      <div><span class="cs-l">👀 지금 보는 중</span><span class="cs-v"><span class="pulse" style="color:var(--red)"></span>${fmt(viewers)}명</span></div>
      <div><span class="cs-l">오늘 판매</span><span class="cs-v">${fmt(todayOrders.reduce((a,o)=>a+o.qty,0))}개</span></div>
      <div><span class="cs-l">누적 판매액</span><span class="cs-v">₩${fmtKR(platformGmv())}</span></div>
      <div><span class="cs-l">인증 인플루언서 · 브랜드</span><span class="cs-v">${pubSellers.length}명 · ${D_().brands.length}개</span></div>
    </div>
  </div>
  ${S.linkCtx&&camp(S.linkCtx.cid)?`<div class="notice" style="margin-bottom:14px">🔗 <b>${esc(seller(camp(S.linkCtx.cid).sellerId).name)}</b>님의 판매 링크로 들어오셨어요 — 이 판매와 같은 상품·카테고리의 다른 판매는 표시되지 않습니다. (판매 종료까지 유지)</div>`:''}
  <div class="cats" style="margin:0 0 6px">${CATS.map(k=>`<button class="catchip ${cat===k?'on':''}" data-act="custCat" data-k="${k}">${k} <span style="color:var(--mute);font-weight:400">${catCount(k)}</span></button>`).join('')}</div>
  <div class="catguide">${cat==='전체'?`<b>건강·웰니스만 다룹니다</b> — 건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 그 밖의 품목은 취급하지 않습니다.`:`<b>${cat}</b> <span class="en">${CAT_INFO[cat].en}</span> — ${CAT_INFO[cat].desc} · 예: ${CAT_INFO[cat].ex}`}</div>
  <div class="custgrid">
    <div>
      <div class="sec" style="margin-top:8px">진행 중 <span class="badge">${live.length}</span></div>
      <div class="grid g2">${live.map(custCard).join('')||'<div class="empty" style="grid-column:1/-1">이 카테고리에 진행 중인 판매가 없습니다</div>'}</div>
      <div class="sec" style="margin-top:22px">오픈 예정 <span class="badge">${soon.length}</span></div>
      <div class="grid g2">${soon.map(custCard).join('')||'<div class="empty" style="grid-column:1/-1">예정된 판매가 없습니다</div>'}</div>
    </div>
    <div>
      <div class="sec" style="margin-top:8px">실시간 판매 순위</div>
      <div class="card">
        <div style="font-size:11px;color:var(--mute);margin-bottom:10px">판매 수량 기준 · 실시간 집계</div>
        ${rank.map(({c,q},i)=>{const p=prod(c.productId),sl=seller(c.sellerId);return `<div class="hb-row" data-act="preview" data-k="${c.id}"><span class="hb-nm">${i+1}. ${pIcon(p,20)} ${esc(p.name)} <span style="color:var(--mute);font-weight:400">· ${esc(sl.name)}</span></span><div class="hb-track"><div class="hb-bar ${i===0?'top':''}" style="width:${Math.max(6,q/mxq*100)}%"></div></div><span class="hb-val">${fmt(q)}개</span></div>`;}).join('')||'<div class="empty">순위 집계 중</div>'}
      </div>
      <div class="sec" style="margin-top:22px">인플루언서</div>
      <div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap">${pubSellers.map(x=>`<button class="catchip" data-act="custSeller" data-k="${x.id}">${platIcon(x)} ${esc(x.name)} <span class="gradebox sm">${gfull(gname(x))}</span></button>`).join('')}</div>
        <div style="margin-top:10px"><button class="sm ghost" data-act="screen" data-k="influencers">인플루언서 전체 보기 →</button></div></div>
    </div>
  </div>
  <div class="sec" style="margin-top:26px">셀러리가 다른 이유</div>
  <div class="why">
    <div class="card"><div class="why-i">🥬</div><b>건강·웰니스만</b><div class="meta">건강기능식품, 이너뷰티, 더마 스킨케어, 웰니스 푸드. 한 분야를 깊게 검증합니다.</div></div>
    <div class="card"><div class="why-i">✅</div><b>검증된 상품</b><div class="meta">브랜드 사업자 확인과 상품 검수(표시광고 기준)를 거친 상품만 노출됩니다. 판매가는 브랜드가 셀러리에 등록한 가격 그대로입니다.</div></div>
    <div class="card"><div class="why-i">🛡️</div><b>인증 인플루언서</b><div class="meta">채널 소유 인증과 실제 판매 실적에 따른 7단계 등급. 모든 판매 페이지에 인증 마크가 표시됩니다.</div></div>
    <div class="card"><div class="why-i">🔒</div><b>안전 결제 · ${CLEAR_DAYS}일 환불 보호</b><div class="meta">결제 대금은 셀러리가 보관하고, 판매 종료 후 ${CLEAR_DAYS}일의 환불 보호 기간이 지난 뒤 정산됩니다.</div></div>
    <div class="card"><div class="why-i">🚚</div><b>브랜드 직배송</b><div class="meta">중간 유통 없이 브랜드가 직접 발송합니다. 운송장은 알림톡으로, 문의는 셀러리 고객센터로 받습니다.</div></div>
    <div class="card"><div class="why-i">⏱️</div><b>기간 한정 가격</b><div class="meta">인플루언서 판매 기간에만 열리는 가격입니다. 같은 기간, 다른 곳에서 더 낮은 가격은 없습니다.</div></div>
  </div>
  <div class="card" style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px">
    ${S.cust?`<div><b>${esc(S.cust.name)}님</b> <span class="meta">주문·배송·환불은 <b>내 주문</b>에서 한곳에 관리돼요${cartN()?` · 장바구니에 ${cartN()}개`:''}</span></div>
    <div class="btnrow" style="margin:0"><button class="pri sm" data-act="screen" data-k="orders">내 주문 보기</button>${cartN()?`<button class="sm ghost" data-act="screen" data-k="cart">장바구니 ${cartN()}</button>`:''}</div>`
    :`<div><b>셀러리 회원이 되면</b> <span class="meta">오픈 알림 · 주문·배송·환불 통합 관리 · 인플루언서 팔로우 · 인증 이력</span></div>
    <div class="btnrow" style="margin:0"><button class="sm kakao" data-act="custJoin">${KAKAO_ICON} 카카오로 시작하기</button><button class="sm ghost" data-act="screen" data-k="about">셀러리 소개</button></div>`}
  </div>`;
}
/* ============ CUSTOMER: 셀러리 소개 ============ */
function vCustAbout(){
  const gmv=platformGmv();const pub=D_().sellers.filter(x=>!x.hidden);
  const os=D_().orders.filter(o=>!o.sample);const paid=os.filter(o=>o.status==='PAID');
  const qty=paid.reduce((a,o)=>a+o.qty,0)+12840;               // 데모: 과거 누적 포함
  const refundRate=os.length?os.filter(o=>o.status==='REFUNDED').length/os.length*100:0;
  const done=D_().campaigns.filter(c=>['LIVE','CLEARING','SETTLED'].includes(c.status));
  const pairs=done.map(c=>c.sellerId+'|'+c.productId);const resell=done.length?Math.round(pairs.filter((x,i)=>pairs.indexOf(x)!==i).length/done.length*100)+62:0; // 데모 보정
  const tested=100; // 셀러리 규칙: 샘플 테스트 없이는 일정 제안 불가
  const bar=(l,v,max,hi,val)=>`<div class="bar-row"><span class="bar-l">${l}</span><div class="bar-t"><div class="bar ${hi?'hi':''}" style="width:${Math.max(4,v/max*100)}%"></div></div><span class="bar-v ${hi?'hi':''}">${val}</span></div>`;
  const faq=[
    ['셀러리는 쇼핑몰인가요?','아니요. 건강·웰니스 브랜드와 인증 인플루언서를 연결하고, 결제 보관·배송 알림·환불 보호를 대행하는 통신판매중개자입니다. 상품과 거래 정보의 책임은 공급 브랜드에 있습니다.'],
    ['가격이 정말 기간 한정 최저가인가요?','브랜드가 셀러리에 등록한 판매가로만 판매되고, 같은 기간 다른 채널에서 더 낮은 가격을 제시하지 않기로 약정합니다. 판매 기간이 끝나면 정가로 돌아갑니다.'],
    ['환불은 어떻게 하나요?','판매 종료 후 '+CLEAR_DAYS+'일 동안 교환·환불을 신청할 수 있습니다(단순 변심 7일, 하자 '+CLEAR_DAYS+'일). 대금은 정산 전까지 셀러리가 보관하므로 환불이 지연되지 않습니다.'],
    ['인플루언서 링크가 진짜인지 어떻게 확인하나요?','정식 판매 페이지 상단에는 셀러리 인증 띠가 있고, "인증 확인"을 누르면 링크 유효성·인증 채널·공급 브랜드·판매 기간이 표시됩니다. 사칭 링크는 이 정보를 표시할 수 없습니다.'],
    ['왜 건강·웰니스만 하나요?','한 분야만 깊게 검증하기 위해서입니다. 건강기능식품은 표시광고 기준이 엄격하고, 성분·용량·인증을 이해하는 판매자가 팔아야 신뢰가 생깁니다.']
  ];
  return `<div class="about">
  <div class="spread">
    <div class="sp-l">
      <div class="hand">a gallery of sellers, not shelves.</div>
      <div class="wordart">SELLER<span>Y</span><br>GALLER<span>Y</span></div>
      <div class="origin"><span>SELLER</span><i>+</i><span>GALLERY</span><i>=</i><span class="em">SELLERY</span></div><div class="cap" style="text-align:left;margin-top:8px">판매자를 큐레이션하는 갤러리</div>
    </div>
    <div class="sp-r">
      <span class="tag">ABOUT SELLERY</span>
      <h2>물건을 진열하지 않습니다.<br>사람을 큐레이션합니다.</h2>
      <p>셀러리(SELLERY)는 <b>Seller</b>와 <b>Gallery</b>를 겹쳐 지은 이름입니다. 좋은 갤러리가 작품을 고르듯, 우리는 직접 써 보고 검증한 판매자만 걸어 둡니다. 판매 이력과 반응, 등급이 전시처럼 공개되고, 브랜드는 그 갤러리에서 함께할 사람을 고릅니다.</p>
      <p>그 이름이 채소 <b>celery</b>와 같은 소리를 내는 것은 의도한 겹침입니다. 가볍고, 정직하며, 몸에 이로운 것만 — 셀러리가 건강·웰니스만을 다루는 이유입니다.</p>
    </div>
  </div>

  <div class="bignums">
    <div><div class="bn-v">₩${fmtKR(gmv)}</div><div class="bn-l">누적 판매액</div></div>
    <div><div class="bn-v">${fmt(qty)}</div><div class="bn-l">누적 판매 수량</div></div>
    <div><div class="bn-v">${pub.length}<span>명</span></div><div class="bn-l">인증 인플루언서</div></div>
    <div><div class="bn-v">${D_().brands.length}<span>개</span></div><div class="bn-l">입점 브랜드</div></div>
    <div><div class="bn-v">${refundRate.toFixed(1)}<span>%</span></div><div class="bn-l">환불률</div></div>
  </div>

  <div class="spread">
    <div class="sp-l">
      <div class="hand">three checks. one mark.</div>
      <div class="stack">
        <div class="box b1"><b>BRAND</b><div><span>사업자 · 정산 계좌 · 통신판매업</span><em>브랜드 검증</em></div></div>
        <div class="box b2"><b>PRODUCT</b><div><span>표시광고 기준 · 기능성 인정 범위 · 성분</span><em>상품 검수</em></div></div>
        <div class="box b3"><b>SELLER</b><div><span>채널 소유 인증 · 판매 실적 · 7단계 등급</span><em>인플루언서 인증</em></div></div>
        <div class="arrow">↓</div>
        <div class="box all"><b>ALL THREE</b><div><span>판매 페이지의 셀러리 인증 마크</span><em>sellery.co.kr/s/…</em></div></div>
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

  <div class="spread">
    <div class="sp-r" style="order:1">
      <span class="tag">WHY IT WORKS</span>
      <h2>직접 써 본 뒤에 팝니다.<br>숫자가 증명합니다.</h2>
      <p>셀러리의 인플루언서는 샘플을 받아 직접 테스트한 뒤에만 판매 일정을 제안할 수 있습니다. 써 보지 않은 상품을 링크만으로 파는 일은 구조적으로 불가능합니다. 그 결과 환불은 낮고, 같은 인플루언서가 같은 상품을 다시 여는 <b>재판매</b>는 높습니다.</p>
      <p class="fn">* 셀러리 수치는 현재 데모 데이터 기준입니다. "일반 SNS 공구"는 업계 참고 추정치로, 서비스 오픈 후 실제 데이터로 대체됩니다.</p>
    </div>
    <div class="sp-l chart" style="order:2">
      <div class="hand">tested, then sold.</div>
      <div class="chart-h">샘플 테스트 후 판매</div>
      ${bar('일반 SNS 공구*',35,100,false,'~35%')}
      ${bar('셀러리',tested,100,true,tested+'%')}
      <div class="chart-h">환불률</div>
      ${bar('일반 SNS 공구*',8.5,10,false,'~8.5%')}
      ${bar('셀러리',refundRate,10,true,refundRate.toFixed(1)+'%')}
      <div class="chart-h">재판매(리오더)율</div>
      ${bar('일반 SNS 공구*',28,100,false,'~28%')}
      ${bar('셀러리',resell,100,true,resell+'%')}
    </div>
  </div>

  <div class="spread">
    <div class="sp-l">
      <div class="hand">held in escrow until it is right.</div>
      <div class="tl">
        <div class="tl-step"><i>1</i><b>결제</b><span>고객 결제 → 셀러리 보관(에스크로)</span></div>
        <div class="tl-step"><i>2</i><b>배송</b><span>브랜드 직배송 · 운송장 알림톡</span></div>
        <div class="tl-step"><i>3</i><b>판매 종료</b><span>기간 한정 가격 마감</span></div>
        <div class="tl-step hi"><i>4</i><b>${CLEAR_DAYS}일 환불 보호</b><span>교환·환불 신청 기간 · 대금 계속 보관</span></div>
        <div class="tl-step"><i>5</i><b>정산</b><span>브랜드·인플루언서에게 지급 · 명세 발행</span></div>
      </div>
    </div>
    <div class="sp-r">
      <span class="tag">ESCROW</span>
      <h2>결제 대금은 판매자가 아닌<br>셀러리가 보관합니다.</h2>
      <p>결제 대금은 판매 종료 후 <b>${CLEAR_DAYS}일</b>의 환불 보호 기간이 지난 뒤에야 브랜드와 인플루언서에게 정산됩니다. 그 전까지는 셀러리가 보관하므로 환불이 지연되거나 판매자와 다툴 일이 생기지 않습니다.</p>
      <p>수수료 구조도 공개합니다. 브랜드가 정한 판매가와 수수료율은 인플루언서에게 그대로 보이고, 플랫폼 수수료는 <b>10%</b>로 고정되어 있습니다. 숨은 광고비가 가격에 얹히지 않습니다.</p>
    </div>
  </div>

  <div class="spread">
    <div class="sp-l">
      <div class="hand">look for the mark.</div>
      <div class="store-trust" style="margin:0">${CEL} <b>셀러리 인증 판매</b> · 결제 보관 · ${CLEAR_DAYS}일 환불 보호 · 인플루언서 채널 인증 ✓ <span style="text-decoration:underline;margin-left:auto">인증 확인</span></div>
      <div class="cap" style="text-align:left;margin-top:10px">정식 판매 페이지 상단에 항상 표시 · 주소는 <b>sellery.co.kr/s/…</b></div>
    </div>
    <div class="sp-r">
      <span class="tag">TRUST MARK</span>
      <h2>정식 판매에만<br>이 마크가 붙습니다.</h2>
      <p>"인증 확인"을 누르면 링크 ID, 인플루언서의 인증 채널, 공급 브랜드, 판매 기간이 그대로 표시됩니다. 마크가 없거나 정보가 비어 있다면 셀러리의 판매가 아닙니다.</p>
    </div>
  </div>

  <div class="sec" style="margin-top:28px">회원 혜택</div>
  <div class="grid g4">
    <div class="card kpi"><div class="lbl">🔔 오픈 알림</div><div class="meta">관심 상품과 인플루언서의 판매가 열리면 카카오 알림톡으로 먼저 알려드립니다.</div></div>
    <div class="card kpi"><div class="lbl">📦 주문 통합 관리</div><div class="meta">여러 인플루언서에게 구매한 상품의 주문·배송·환불을 한 화면에서 관리합니다.</div></div>
    <div class="card kpi"><div class="lbl">⭐ 팔로우</div><div class="meta">신뢰하는 인플루언서를 팔로우하면 다음 판매 일정이 홈에 먼저 표시됩니다.</div></div>
    <div class="card kpi"><div class="lbl">🛡️ 인증 이력</div><div class="meta">확인한 인증 링크와 구매 이력이 남아 사칭 링크와 중복 결제를 막아 줍니다.</div></div>
  </div>
  <div class="sec" style="margin-top:26px">자주 묻는 질문</div>
  <div class="card" style="padding:0;overflow:hidden">${faq.map(([q,a],i)=>`<div class="faq ${S.faqOpen===i?'on':''}" data-act="faqToggle" data-k="${i}"><div class="faq-q"><span>Q. ${q}</span><span class="acc-arrow">${S.faqOpen===i?'▲':'▼'}</span></div>${S.faqOpen===i?`<div class="faq-a">${a}</div>`:''}</div>`).join('')}</div>
  <div class="grid g2" style="margin-top:26px">
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>브랜드이신가요?</b><div class="meta">건강·웰니스 브랜드라면 상품을 등록하고 인증 인플루언서의 제안을 받아 보세요. 입점비는 없고, 성과 수수료만 있습니다.</div></div><button class="sm pri" data-act="goCenter" data-k="brand">브랜드 센터</button></div>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>인플루언서이신가요?</b><div class="meta">건강·웰니스 판매 레퍼런스가 있다면 채널 인증 후 샘플 요청부터 시작하세요. 수수료율은 상품마다 공개되어 있습니다.</div></div><button class="sm pri" data-act="goCenter" data-k="seller">인플루언서 센터</button></div>
  </div>
  <div class="store-foot">${CEL} <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드에 있습니다 · 고객센터 채널톡 · sellery.co.kr</div>
  </div>`;
}

function vCustInfluencers(){
  const list=D_().sellers.filter(s=>!s.hidden);
  return `<h2 class="pg">인플루언서 <small>셀러리 인증 인플루언서 — 진행 중·예정 판매를 확인하세요</small></h2>
  <div class="grid g3">${list.map(s=>{const cs=D_().campaigns.filter(c=>c.sellerId===s.id&&custVisible(c));const live=cs.filter(c=>c.status==='LIVE').length,soon=cs.filter(c=>c.status==='SCHEDULE_CONFIRMED').length,done=cs.filter(c=>['SETTLED','CLEARING'].includes(c.status)).length;
    return `<div class="card" style="cursor:pointer" data-act="custSeller" data-k="${s.id}">
      <div style="display:flex;gap:12px;align-items:center"><span class="sc-av ${s.img?'':'em'}" style="width:52px;height:52px;${s.img?`background-image:url(${s.img})`:''}">${s.img?'':(SEMOJI[s.id]||'👤')}</span>
        <div><div><b style="font-size:15px">${esc(s.name)}</b> <span class="gradebox sm">${gfull(gname(s))}</span></div><div style="font-size:12px;color:var(--mute)">${platIcon(s)} ${s.handle} · 팔로워 ${fmt(s.followers)} · 채널 인증 ✓</div></div></div>
      <div class="meta" style="margin-top:8px">${esc(s.intro)}</div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><span class="st ${live?'green':'gray'}" style="animation:none">진행 중 ${live}</span><span class="st blue" style="animation:none">오픈 예정 ${soon}</span><span class="st gray" style="animation:none">완료 ${done}</span></div>
    </div>`;}).join('')}</div>`;
}
/* 상품 상세페이지 미리보기: 판매 링크 발급 전 상품을 고객 화면 레이아웃으로 보기 (id 'p:p1') */
function storeCamp(cid){
  if(typeof cid==='string'&&cid.startsWith('p:')){const pid=cid.slice(2),p=prod(pid);if(!p)return null;
    const sid=S.view.role==='seller'?S.actingSeller:(D_().campaigns.find(c=>c.productId===pid)||{}).sellerId||D_().sellers.find(x=>!x.hidden).id;
    return {id:cid,productId:pid,sellerId:sid,status:'PREVIEW',qty:p.stock||0,preview:true};}
  return camp(cid);
}
function vStore(cid){
  const c=storeCamp(cid);if(!c)return '<button class="ghost sm" data-act="storeBack">← 돌아가기</button><div class="empty">판매 페이지를 찾을 수 없습니다</div>';
  const p=prod(c.productId),s=seller(c.sellerId),b=brand(p.brandId);
  const opts=optsOf(p);const oi=Math.min(S.storeOpt||0,opts.length-1);const o=opts[oi];const q=S.storeQty||1;
  const live=c.status==='LIVE',soon=c.status==='SCHEDULE_CONFIRMED';
  const left=(c.qty||0)-soldQty(cid);
  const dd=live?Math.max(0,Math.ceil((addD(P(c.end),1)-new Date())/DAY)):soon?Math.ceil((P(c.start)-today())/DAY):0;
  const mine=D_().campaigns.filter(x=>x.sellerId===s.id&&x.id!==cid&&['LIVE','SCHEDULE_CONFIRMED'].includes(x.status));
  return `<div class="store">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
      <button class="ghost sm" data-act="storeBack">${S.view.role==='customer'?'← 셀러리 홈':'← 돌아가기'}</button>
      <span style="font-size:11.5px;color:var(--mute)">${S.view.role!=='customer'?'구매자에게 보이는 화면 · ':''}${c.preview?'sellery.co.kr/p/'+p.id+' (상세페이지 미리보기)':'sellery.co.kr/s/'+s.handle.slice(1)+'/'+cid}</span>
    </div>
    <div class="store-trust" ${c.preview?'':`data-act="verifyStore" data-k="${cid}"`}>${CEL} <b>셀러리 인증 판매</b> · 결제 보관 · ${CLEAR_DAYS}일 환불 보호 · 인플루언서 채널 인증 ✓ <span style="text-decoration:underline;margin-left:auto">${c.preview?'미리보기':'인증 확인'}</span></div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="store-hero"><div class="store-em p3d">${p.thumb?`<img src="${p.thumb}" alt="" style="max-height:220px;max-width:80%;object-fit:contain">`:p.em}</div>
        ${live?`<span class="trendbadge" style="position:absolute;top:30px;left:14px">${dd<=1?'오늘 마감':'D-'+dd+' 마감'}</span>`:soon?`<span class="trendbadge" style="position:absolute;top:30px;left:14px;background:var(--ink);color:var(--yellow)">오픈 D-${dd}</span>`:c.preview?`<span class="trendbadge" style="position:absolute;top:30px;left:14px;background:var(--mute)">미리보기</span>`:`<span class="trendbadge" style="position:absolute;top:30px;left:14px;background:var(--mute)">판매 종료</span>`}</div>
      <div style="padding:18px 20px 20px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><span class="sc-av ${s.img?'':'em'}" style="width:40px;height:40px;${s.img?`background-image:url(${s.img})`:''}">${s.img?'':(SEMOJI[s.id]||'👤')}</span>
          <div style="flex:1;min-width:160px"><div><b>${esc(s.name)}</b> <span style="color:var(--mute);font-size:12px">${platIcon(s)} ${s.handle}</span> <span class="gradebox sm">${gfull(gname(s))}</span></div><div style="font-size:11.5px;color:var(--mute)">셀러리 인증 인플루언서 × ${esc(b.name)} 공식 공급</div></div>
          ${mine.length?`<button class="sm ghost" data-act="custSeller" data-k="${s.id}">다른 판매 보기</button>`:''}</div>
        <h2 style="margin:6px 0 4px;font-size:22px">${esc(p.name)}</h2>
        <div class="meta" style="margin-bottom:12px">${esc(p.desc)} · ${p.cat}</div>
        <div class="prices" style="margin-bottom:14px"><span class="gp" style="font-size:26px">₩${fmt(o.price)}</span>${oi===0?`<span class="cp">₩${fmt(p.cp)}</span>${p.cp>p.gp?`<span class="disc">-${Math.round((1-p.gp/p.cp)*100)}%</span>`:''}`:`<span class="cp" style="text-decoration:none">${esc(o.n)}</span>`}</div>
        <div class="lbl-sm" style="margin-bottom:6px">옵션 선택</div>
        <div class="opts">${opts.map((x,i)=>`<button class="opt ${i===oi?'on':''}" data-act="pickOpt" data-k="${i}"><span>${esc(x.n)}</span><b>₩${fmt(x.price)}</b></button>`).join('')}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:14px 0">
          <div class="qty"><button data-act="qtyDelta" data-k="-1">−</button><span>${q}</span><button data-act="qtyDelta" data-k="1">+</button></div>
          <div style="text-align:right"><div style="font-size:11.5px;color:var(--mute)">총 결제 금액</div><div style="font-family:'Archivo',sans-serif;font-size:24px;font-weight:800">₩${fmt(o.price*q)}</div></div>
        </div>
        ${live?`<div class="buyrow"><button class="ghost buy" data-act="addCart" data-k="${cid}" ${left<=0?'disabled style="opacity:.5"':''}>🛒 장바구니</button><button class="pri buy" data-act="buyNow" data-k="${cid}" ${left<=0?'disabled style="opacity:.5"':''}>${left<=0?'품절':'구매하기'}</button></div>
          <div class="meta" style="text-align:center;margin-top:8px">${md(P(c.start))}–${md(P(c.end))} 한정 · 잔여 ${fmt(Math.max(0,left))}개 · ${fmt(soldQty(cid))}개 판매됨 · 결제 시 셀러리 안전결제로 이동</div>`
        :c.preview?`<button class="buy" disabled style="opacity:.7">상세페이지 미리보기 — 판매 링크 발급 전</button><div class="meta" style="text-align:center;margin-top:8px">인플루언서 일정이 확정되면 이 레이아웃으로 판매 링크가 생성됩니다 · 재고 ${fmt(p.stock)}개</div>`
        :soon?`<button class="pri buy" data-act="notifyMe" data-k="${cid}">🔔 ${md(P(c.start))} 오픈 알림 받기</button>`
        :`<button class="buy" disabled style="opacity:.6">판매가 종료되었습니다</button><div class="meta" style="text-align:center;margin-top:8px">교환·환불은 종료 후 ${CLEAR_DAYS}일까지 셀러리 고객센터에서 처리됩니다</div>`}
      </div>
    </div>
    <div class="card"><h4>상세 정보</h4>
      ${(p.imgs&&p.imgs.length)?p.imgs.map(u=>`<img src="${u}" alt="" style="width:100%;display:block;margin-bottom:8px">`).join(''):`<div class="store-detail"><div class="store-em">${p.em}</div><p>${esc(p.desc)}</p><p style="color:var(--mute);font-size:12.5px">브랜드가 등록한 상세페이지 이미지가 여기에 노출됩니다 (${esc(b.name)} 제공 · 표시광고 사전심의 완료)</p></div>`}
    </div>
    <div class="card"><h4>배송 · 교환 · 환불</h4>
      <div class="btnrow" style="margin:0 0 11px"><button class="sm" data-act="openCS" data-k="${cid}">💬 판매자에게 문의하기</button></div>
      <ul class="store-ul"><li>결제 후 2–3일 내 <b>${esc(b.name)}</b>에서 직배송, 운송장은 셀러리 알림톡으로 안내</li><li>판매 종료 후 <b>${CLEAR_DAYS}일</b> 동안 교환·환불 신청 가능 (단순 변심 7일 · 하자 ${CLEAR_DAYS}일)</li><li>대금은 정산 전까지 <b>셀러리</b>가 보관하므로 환불이 지연되지 않습니다</li><li>문의: 셀러리 고객센터(채널톡) — 인플루언서 DM이 아닌 셀러리로 접수</li></ul></div>
    ${mine.length?`<div class="sec">${esc(s.name)}님의 다른 판매</div><div class="grid g3">${mine.map(custCard).join('')}</div>`:''}
    <div class="store-foot">${CEL} <b>SELLERY</b> · 셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드(${esc(b.name)})에 있습니다 · #광고 · 인플루언서는 판매 수수료를 받습니다</div>
  </div>`;
}
/* ============ CUSTOMER: 장바구니 ============ */
function vCustCart(){
  const L=cartLines();const okL=L.filter(x=>x.ok);const total=okL.reduce((a,x)=>a+x.sum,0);
  if(!L.length)return `<h2 class="pg">장바구니 <small>담아둔 상품이 없어요</small></h2>
    <div class="card" style="padding:34px;text-align:center"><div style="font-size:34px;margin-bottom:8px">🛒</div>진행 중인 판매 페이지에서 <b>장바구니</b>를 눌러 담아보세요<div class="btnrow" style="justify-content:center;margin-top:14px"><button class="pri sm" data-act="screen" data-k="home">진행 중인 판매 보기</button></div></div>`;
  return `<h2 class="pg">장바구니 <small>${fmt(cartN())}개 · 기간 한정 가격 — 판매가 끝난 상품은 결제에서 자동으로 빠집니다</small></h2>
  <div class="cartgrid">
    <div class="listcard">${L.map(x=>`<div class="rowitem cart-row ${x.ok?'':'off'}">${pIcon(x.p,48)}
      <div class="grow" style="min-width:160px"><div class="nm" data-act="preview" data-k="${x.c.id}" style="cursor:pointer">${esc(x.p.name)} <span class="sub" style="font-weight:400">· ${esc(x.b.name)}</span></div>
        <div class="sub">${esc(x.o.n)} · ${platIcon(x.s)} ${esc(x.s.name)} ${x.s.handle}${x.ok?` · ${md(P(x.c.end))} 마감`:x.c.status==='LIVE'?` · <b style="color:var(--danger)">잔여 ${Math.max(0,x.left)}개 — 수량을 줄여주세요</b>`:' · <b style="color:var(--danger)">판매 종료</b>'}</div></div>
      <div class="qty sm"><button data-act="cartQty" data-k="${x.i}|-1">−</button><span>${x.it.qty}</span><button data-act="cartQty" data-k="${x.i}|1">+</button></div>
      <div class="cart-sum">₩${fmt(x.sum)}</div>
      <button class="sm ghost" data-act="cartRemove" data-k="${x.i}" aria-label="삭제" title="삭제">✕</button></div>`).join('')}</div>
    <div class="card cart-side"><h4 style="margin-top:0">결제 금액</h4>
      <table class="stmt" style="min-width:0;font-size:13px;width:100%">${okL.map(x=>`<tr><td>${esc(x.p.name)} × ${x.it.qty}</td><td class="num">₩${fmt(x.sum)}</td></tr>`).join('')||'<tr><td colspan="2" style="color:var(--mute)">결제 가능한 상품이 없어요</td></tr>'}<tr><td>배송비</td><td class="num">무료 · 브랜드 직배송</td></tr><tr class="tot"><td>총 결제</td><td class="num">₩${fmt(total)}</td></tr></table>
      ${L.length>okL.length?`<div class="meta" style="margin:8px 0 0">결제할 수 없는 ${L.length-okL.length}건은 제외됩니다</div>`:''}
      <button class="pri buy" data-act="cartCheckout" ${okL.length?'':'disabled style="opacity:.5"'} style="width:100%;margin-top:12px;padding:14px">${S.cust?`₩${fmt(total)} 결제하기`:'카카오 로그인 후 결제'}</button>
      <div class="meta" style="text-align:center;margin-top:8px">결제 대금은 <b>셀러리</b>가 보관 · 판매 종료 후 ${CLEAR_DAYS}일 환불 보호</div></div>
  </div>`;
}
/* ============ CUSTOMER: 내 주문 (카카오 로그인 후) ============ */
function vCustOrders(){
  if(!S.cust)return `<h2 class="pg">내 주문</h2><div class="card" style="text-align:center;padding:34px"><b>카카오 로그인</b>하면 주문·배송·환불을 한곳에서 볼 수 있어요<div class="btnrow" style="justify-content:center;margin-top:14px"><button class="sm kakao" data-act="custJoin">${KAKAO_ICON} 카카오 로그인</button></div></div>`;
  const os=custOrders();
  const ST_O={PAID:['결제 완료','green'],REFUNDED:['환불 완료','gray']};
  return `<h2 class="pg">내 주문 <small>${esc(S.cust.name)}님 · ${os.length}건</small></h2>
  ${os.length?`<div class="listcard">${os.map(o=>{const c=camp(o.campaignId),p=c&&prod(c.productId),b=p&&brand(p.brandId);if(!p)return '';const st=ST_O[o.status]||[o.status,'gray'];
    const ship=o.status!=='PAID'?'':c.status==='LIVE'?'브랜드 발송 준비 중':c.status==='CLEARING'?`교환·환불 ${md(settleDue(c))}까지`:'배송 완료';
    return `<div class="rowitem cart-row">${pIcon(p,44)}<div class="grow" style="min-width:160px"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${esc(o.opt||'')} × ${o.qty}</span></div><div class="sub">${o.id.toUpperCase()} · ${md(P(o.at))} 주문 · ${esc(b.name)} 직배송${ship?' · '+ship:''}</div></div>
      <span class="st ${st[1]}" style="animation:none">${st[0]}</span><div class="cart-sum">₩${fmt(o.unit*o.qty)}</div>
      <div class="btnrow" style="margin:0"><button class="sm" data-act="openCS" data-k="${c.id}|${o.id}">문의</button>${o.status==='PAID'&&c.status!=='SETTLED'?`<button class="sm ghost" data-act="custRefund" data-k="${o.id}">환불 신청</button>`:''}</div></div>`;}).join('')}</div>`
  :`<div class="card" style="padding:30px;text-align:center;color:var(--mute)">아직 주문이 없어요 — <button class="sm ghost" data-act="screen" data-k="home">진행 중인 판매 보기</button></div>`}
  <div class="card" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="display:flex;align-items:center;gap:10px"><span class="kv-av" style="width:34px;height:34px;font-size:14px">${esc(S.cust.name[0])}</span><div><b>${esc(S.cust.name)}</b><div class="meta">${esc(S.cust.email||'')}${S.cust.email?' · ':''}카카오 계정 · ${md(P(S.cust.at))} 가입</div></div></div><button class="sm ghost" data-act="custLogout">로그아웃</button></div>`;
}
