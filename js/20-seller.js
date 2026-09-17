/* ============ SELLER ============ */
function vSellerHome(){
  const me=S.actingSeller;
  const mine=D_().campaigns.filter(c=>c.sellerId===me);
  const live=mine.filter(c=>c.status==='LIVE');
  const soon=mine.filter(c=>c.status==='SCHEDULE_CONFIRMED');
  const clearing=mine.filter(c=>c.status==='CLEARING');
  const liveNet=live.reduce((a,c)=>a+calc(c).net,0);
  const pendPay=clearing.reduce((a,c)=>{const k=calc(c);return a+k.sfTotal*(1-sellerWht(seller(me)));},0);
  const monthPay=mine.filter(c=>c.status==='SETTLED'&&(c.settledAt||'').slice(0,7)===ymd(today()).slice(0,7)).reduce((a,c)=>a+calc(c).sfTotal*(1-sellerWht(seller(me))),0);
  const todo=mine.filter(c=>['INVITED','SAMPLE_SHIPPED','TESTING','SAMPLE_APPROVED','SAMPLE_PURCHASED'].includes(c.status));
  const sl=seller(me);
  const TODO_L={INVITED:'브랜드 직접 제안 — 수락/거절',SAMPLE_SHIPPED:'샘플 수령 확인',TESTING:'테스트 후 일정 제안',SAMPLE_APPROVED:'샘플 배송 대기 (브랜드 발송 중)',SAMPLE_PURCHASED:'샘플 구매 완료 · 브랜드 발송 대기'};
  const heroLine = todo.length ? `기다리는 할 일이 <em>${todo.length}건</em> 있어요.`
    : live.length ? `지금 판매 <em>${live.length}건</em>이 진행 중이에요.`
    : `오늘은 어떤 상품을 골라볼까요?`;
  const g=gradeOf(sl.m3Sales);
  const next=GRADES[GRADES.indexOf(g)-1];
  const pct=next?Math.min(100,Math.round(sl.m3Sales/next.min*100)):100;
  const todayStr=ymd(today());
  /* 1 할 일 */
  const todoHtml=todo.length?`<div class="sec">지금 할 일 <span class="badge">${todo.length}</span></div>
    <div class="listcard">${todo.map(c=>{const p=prod(c.productId),b=brand(p.brandId);
      return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}
        <div class="grow"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${esc(b.name)}</span></div><div class="sub">${TODO_L[c.status]||ST[c.status].l}${c.testDue?` · 기한 ${md(P(c.testDue))}`:''}</div></div>
        <button class="pri sm">${c.status==='INVITED'?'수락/거절':c.status==='SAMPLE_SHIPPED'?'수령 확인':c.status==='TESTING'?'일정 제안':'스레드 보기'}</button></div>`;}).join('')}</div>`
    :`<div class="sec">지금 할 일</div><div class="listcard"><div class="empty" style="padding:14px">지금 응답할 일이 없어요 — 진행 중 판매를 확인하세요 ✓</div></div>`;
  /* 2 진행 중·예정 판매 (실시간 미니 지표) */
  const liveCard=c=>{const p=prod(c.productId),k=calc(c);const os=campOrders(c.id).filter(o=>o.status==='PAID');const tod=os.filter(o=>o.at===todayStr);const left=(c.qty||0)-soldQty(c.id);const dd=Math.max(0,Math.ceil((addD(P(c.end),1)-new Date())/DAY));
    return `<div class="card" style="padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="display:flex;align-items:center;gap:9px;min-width:0">${pIcon(p,30)}<span style="min-width:0"><b style="font-size:15px">${esc(p.name)}</b> <span class="sub" style="color:var(--mute);font-size:12px">${brand(p.brandId).name} · 수수료 ${(p.rate*100).toFixed(0)}%</span></span></div>${stChip('LIVE')}</div>
      <div class="mini-stats" style="margin:12px 0 10px">
        <div><span class="ms-l">오늘 매출</span><span class="ms-v">₩${fmt(tod.reduce((a,o)=>a+o.unit*o.qty,0))}</span></div>
        <div><span class="ms-l">확정 매출</span><span class="ms-v">₩${fmt(k.net)}</span></div>
        <div><span class="ms-l">주문</span><span class="ms-v">${k.paidCnt}건</span></div>
        <div><span class="ms-l">마감 · 잔여</span><span class="ms-v">D-${dd} · ${fmt(Math.max(0,left))}개</span></div>
      </div>
      <div class="btnrow one"><button class="sm ghost" data-act="open" data-k="${c.id}">스레드</button><button class="sm ghost" data-act="preview" data-k="${c.id}">구매 페이지</button><button class="sm ghost" data-act="copyLink" data-k="sellery.life/s/${sl.handle.slice(1)}/${c.id}">링크 복사</button><button class="sm ghost" data-act="screen" data-k="sales">실시간 매출</button></div>
    </div>`;};
  const soonRow=c=>{const p=prod(c.productId);const dd=Math.ceil((P(c.start)-today())/DAY);return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}<div class="grow"><div class="nm">${esc(p.name)}</div><div class="sub">${brand(p.brandId).name} · ${md(P(c.start))}–${md(P(c.end))} · 재고 ${fmt(c.qty||0)}</div></div><span class="st blue" style="animation:none">오픈 D-${dd}</span></div>`;};
  const salesHtml=`<div class="sec">진행 중 · 예정 판매</div>
    ${live.length?`<div class="grid ${live.length>1?'g2':''}" style="margin-bottom:${soon.length||clearing.length?'10px':'0'}">${live.map(liveCard).join('')}</div>`:''}
    ${(soon.length||clearing.length)?`<div class="listcard">${soon.map(soonRow).join('')}${clearing.map(c=>campRow(c)).join('')}</div>`:''}
    ${(!live.length&&!soon.length&&!clearing.length)?'<div class="listcard"><div class="empty">진행 중인 판매가 없습니다 — 상품 갤러리에서 시작해보세요</div></div>':''}`;
  /* 3 내 장부 */
  const ledger=`<div class="sec">내 장부</div>
  <div class="card" style="padding:16px 18px">
    <div class="mini-stats ledger4">
      <div class="go" data-act="screen" data-k="sales" title="실시간 매출"><span class="ms-l">진행 중 판매 매출</span><span class="ms-v">₩${fmt(liveNet)}</span><span class="ms-s">확정 기준 · ${live.length}건 LIVE</span></div>
      <div class="go" data-act="screen" data-k="settle" title="정산"><span class="ms-l">정산 예정 수수료</span><span class="ms-v" style="color:var(--money)">₩${fmt(pendPay)}</span><span class="ms-s">환불기간 ${clearing.length}건 · ${sellerWht(sl)?'원천징수 후':'사업자 정산'}</span></div>
      <div class="go" data-act="screen" data-k="settle" title="정산"><span class="ms-l">이번 달 확정 수익</span><span class="ms-v">₩${fmt(monthPay)}</span><span class="ms-s">정산 완료 기준</span></div>
      <div class="go" data-act="screen" data-k="camps" title="내 캠페인"><span class="ms-l">누적 판매</span><span class="ms-v">${mine.filter(c=>['SETTLED','CLEARING','LIVE'].includes(c.status)).length}회</span><span class="ms-s">재판매율 ${(()=>{const d=mine.filter(c=>['SETTLED','CLEARING','LIVE'].includes(c.status));const pids=d.map(c=>c.productId);const rep=pids.filter((x,i)=>pids.indexOf(x)!==i).length;return d.length?Math.round(rep/d.length*100):0;})()}%</span></div>
    </div>
  </div>`;
  /* 4 성장: 피라미드(컴팩트) + 내 자산 */
  const pyr=`<div class="card kpi go" data-act="screen" data-k="rank" title="랭킹·등급 보기">
    <div class="lbl-sm lbl">내 등급 — 상위 ${g.pct}%</div>
    ${pyrHtml(GRADES,g.g)}
    ${next?`<div class="meter" style="margin-top:12px"><span style="width:${pct}%"></span></div>
    <div style="font-size:12px;color:var(--mute);margin-top:7px">3개월 <b>₩${fmt(sl.m3Sales)}</b> · <b>${next.g}</b>까지 <b style="color:var(--red)">₩${fmt(next.min-sl.m3Sales)}</b> · 달성 시 ${next.perk.split('·')[0].trim()}</div>`
    :`<div style="font-size:12px;color:var(--mute);margin-top:10px">최고 등급 · ${g.perk}</div>`}
  </div>`;
  const left=sampleLeft(sl);const toNext=CELERY_PER-(sl.m3Sales%CELERY_PER);
  const assets=`<div class="card kpi go" data-act="screen" data-k="shop" title="셀러리 샵">
    <div class="lbl-sm lbl">내 자산</div>
    <div class="mini-stats" style="margin-top:10px">
      <div><span class="ms-l">셀러리</span><span class="ms-v" style="display:flex;align-items:center;gap:4px">${CEL} ${celBal(me)}</span></div>
      <div><span class="ms-l">다음 1🥬까지</span><span class="ms-v">₩${fmt(toNext)}</span></div>
      <div><span class="ms-l">이달 샘플 요청</span><span class="ms-v">${left===Infinity?'무제한':left+'회 남음'}</span></div>
      <div><span class="ms-l">등급 보너스</span><span class="ms-v">+${g.bonus}%p</span></div>
    </div>
    <div class="btnrow" style="margin-top:12px"><button class="sm ghost" data-act="screen" data-k="shop">셀러리 샵</button><button class="sm ghost" data-act="screen" data-k="ref">친구 초대 · 2% 리워드</button></div>
  </div>`;
  /* 5 탐색 */
  const listed=D_().products.filter(p=>p.status==='listed'&&demoVisible(p));
  const hot=listed.filter(p=>p.t).sort((a,b)=>parseInt(b.t.g.replace(/\D/g,''))-parseInt(a.t.g.replace(/\D/g,'')))[0];
  const exclOpen=listed.filter(p=>p.exclusive&&!p.exclusiveSellerId).slice(0,1);
  const fresh=listed.slice(-2).reverse();
  const newsHtml=`<div class="card" style="padding:0;overflow:hidden">
    <div class="lbl-sm" style="padding:16px 18px 6px">📢 지금 셀러리에서</div>
    <div class="news">
      ${hot?`<div class="news-item" data-act="prodDetail" data-k="${hot.id}"><span class="nb hot">폭주</span><div><b>${esc(hot.name)}</b> 진행 문의 폭주 — 최근 24시간 샘플 요청 12건 · 분기 매출 <b style="color:var(--danger)">▲${hot.t.g.replace('+','')}</b></div></div>`:''}
      ${exclOpen.map(p=>`<div class="news-item" data-act="prodDetail" data-k="${p.id}"><span class="nb excl">독점</span><div><b>${esc(p.name)}</b> 독점권 오퍼 오픈 — ${gfull(exGradeOf(p))} 등급 이상 신청 가능</div></div>`).join('')}
      ${fresh.map(p=>`<div class="news-item" data-act="prodDetail" data-k="${p.id}"><span class="nb new">NEW</span><div><b>${esc(p.name)}</b> 신규 입점 — ${brand(p.brandId).name} · ${p.cat} · 수수료 ${(p.rate*100).toFixed(0)}%</div></div>`).join('')}
    </div>
  </div>`;
  const recs=listed.filter(p=>demoVisible(p)&&!mine.some(c=>c.productId===p.id&&!['REJECTED','PASSED','DECLINED','SETTLED'].includes(c.status))).sort((a,b)=>realFirst(a,b)||((b.cat===sl.cat)-(a.cat===sl.cat))).slice(0,3);
  return `<div class="hero-band">
    ${sl.img?`<img class="hero-av" src="${sl.img}" alt="프로필" data-act="gotoMy" style="cursor:pointer" title="마이페이지">`:''}
    <div class="ey">Seller Gallery</div>
    <h1>${sl.name}님, 반가워요.<br>${heroLine}</h1>
    <div class="sub">${platIcon(sl)} ${sl.handle} · 팔로워 <b>${fmt(sl.followers)}</b> · 등급 <b>${gfull(gname(sl))}</b> · ${new Date().getMonth()+1}월 ${new Date().getDate()}일</div>
  </div>
  <div class="overlap" style="height:0"></div>
  ${todoHtml}
  ${salesHtml}
  ${ledger}
  <div class="sec">성장 · 자산</div>
  <div class="grid g2">${pyr}${assets}</div>
  <div class="sec">지금 셀러리에서 · 추천 상품</div>
  <div class="homegrid">
    ${newsHtml}
    <div class="grid g3" style="gap:14px">${recs.map(prodCard).join('')}</div>
  </div>
  <div class="card" style="margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px">
    <div><b>친구 초대 · 추천 프로그램</b> <span class="sub" style="color:var(--mute);font-size:12px">— 초대한 인플루언서 첫 5회 판매 확정매출의 2% 리워드 · 친구는 5회간 수수료 +1%p</span></div>
    <div class="btnrow" style="margin:0"><span class="st gray" style="animation:none;font-family:'Archivo',sans-serif!important;font-weight:800!important">${sl.refCode}</span><button class="sm pri" data-act="copyRef" data-k="${sl.refCode}">코드 복사</button></div>
  </div>`;
}
function prodCard(p){
  const b=brand(p.brandId);
  const already=D_().campaigns.some(c=>c.sellerId===S.actingSeller&&c.productId===p.id&&!['REJECTED','PASSED','DECLINED','SETTLED'].includes(c.status));
  const margin=p.gp*p.rate;
  const exclLocked=p.exclusiveSellerId&&p.exclusiveSellerId!==S.actingSeller;
  return `<div class="card prod">
    <div class="ph" data-act="prodDetail" data-k="${p.id}" style="cursor:pointer;position:relative"><span class="p3d">${p.thumb?`<img src="${p.thumb}" alt="" style="max-height:92%;max-width:78%;object-fit:contain;pointer-events:none">`:p.em}</span>
      ${p.t?`<span class="trendbadge">▲ ${p.t.g}</span>`:passActive(p,'boost',7)?`<span class="trendbadge" style="background:var(--yellow);color:var(--ink)">★ 부스트</span>`:''}
      ${p.exclusive?`<span class="exclbadge">독점권 오퍼</span>`:''}</div>
    <div><span class="chip brand">${b.name}</span> <span class="gradebox sm">${gfull(bgname(b))}</span> <span class="sub" style="font-size:11px;color:var(--mute)">${p.cat}</span></div>
    <div class="nm" data-act="prodDetail" data-k="${p.id}" style="cursor:pointer">${esc(p.name)}</div>
    <div class="meta">${esc(p.desc)} · 샘플 ${p.sample}</div>
    <div class="meta" style="font-size:11px">🎁 ${sampleLine(p)}</div>
    <div class="prices"><span class="gp">₩${fmt(p.gp)}</span><span class="cp">₩${fmt(p.cp)}</span>${p.cp>p.gp?`<span class="disc">-${Math.round((1-p.gp/p.cp)*100)}%</span>`:''}<span class="rate">수수료 ${(p.rate*100).toFixed(0)}~${(p.rate*100+GRADES[0].bonus).toFixed(0)}%</span></div>
    <div class="meta">건당 예상 수수료 ₩${fmt(margin)}${exclLocked?' · <b style="color:var(--danger)">독점 인플루언서 확정 상품</b>':''}</div>
    <div class="btnrow">
      <button class="sm ghost" data-act="prodDetail" data-k="${p.id}">실적·상세</button>
      ${sampleBtnHtml(p,false)}
    </div>
  </div>`;
}
/* 셀러리 카테고리 — 건강·웰니스 전용 (색조·가전·잡화 취급 안 함). 이름은 직관적으로, 설명은 CAT_INFO에서 */
const CATS=['전체','다이어트·체형','이너뷰티·피부','비타민·영양','눈·뇌 건강','장·소화','활력·수면','웰니스 푸드'];
const CAT_INFO={
  '다이어트·체형':{en:'Body',desc:'체지방·탄수화물 컷·식욕 조절',ex:'가르시니아, 시서스, 프로틴 쉐이크'},
  '이너뷰티·피부':{en:'Inner Beauty',desc:'먹는 피부 관리와 더마 스킨케어',ex:'콜라겐, 글루타치온, 히알루론산, 세라마이드'},
  '비타민·영양':{en:'Nutrition',desc:'매일 채우는 기본 영양',ex:'멀티비타민, 오메가3, 마그네슘, 비타민D'},
  '눈·뇌 건강':{en:'Eye & Brain',desc:'눈 피로·집중력·기억력',ex:'루테인, 아스타잔틴, 포스파티딜세린'},
  '장·소화':{en:'Gut',desc:'장 건강과 소화 편안함',ex:'프로바이오틱스, 식이섬유, 소화효소'},
  '활력·수면':{en:'Energy & Sleep',desc:'피로 회복과 편안한 밤',ex:'홍삼, 테아닌, 마그네슘, 밀크씨슬'},
  '웰니스 푸드':{en:'Wellness Food',desc:'건강한 식습관을 위한 식품',ex:'저당 간식, 곤약, 단백질 식품, 건강차'}
};
const CAT_POLICY='셀러리는 건강·웰니스 상품만 다룹니다 — 건강기능식품·이너뷰티·더마 스킨케어·웰니스 푸드. 색조 화장품, 가전, 패션·잡화는 등록되지 않으며, 인플루언서도 건강·웰니스 판매 레퍼런스가 있는 채널만 활동합니다.';
function vExplore(){
  const cur=S.catFilter||'전체';
  const list=D_().products.filter(p=>p.status==='listed'&&demoVisible(p)&&(cur==='전체'||p.cat===cur)).sort((a,b)=>realFirst(a,b)||((passActive(b,'boost',7)?1:0)-(passActive(a,'boost',7)?1:0)));
  const trendPicks=D_().products.filter(p=>p.status==='listed'&&demoVisible(p)&&p.t).sort(realFirst);
  // peer bestsellers: sellers at my grade or above, recent confirmed revenue per product
  const myTier=gradeOf(seller(S.actingSeller).m3Sales);
  const peerIds=D_().sellers.filter(x=>x.m3Sales>=myTier.min).map(x=>x.id);
  const base={p1:48200000,p4:36400000,p7:22100000,p9:18900000,p5:15200000,p8:9800000};
  const sums={...base};
  D_().campaigns.filter(c=>peerIds.includes(c.sellerId)&&['LIVE','CLEARING','SETTLED'].includes(c.status))
    .forEach(c=>{sums[c.productId]=(sums[c.productId]||0)+calc(c).net;});
  const top=Object.entries(sums).map(([pid,v])=>({p:prod(pid),v})).filter(x=>x.p&&x.p.status==='listed'&&demoVisible(x.p))
    .sort((a,b)=>realFirst(a.p,b.p)||(b.v-a.v)).slice(0,5);
  const mx=top.length?top[0].v:1;
  const meS=seller(S.actingSeller), left=sampleLeft(meS);
  return `<h2 class="pg">상품 갤러리 <small>브랜드가 판매가·수수료율을 공개 책정 · 이번 달 샘플 요청 <b>${left===Infinity?'무제한':left+'회 남음'}</b>${left!==Infinity&&left===0?' — <span style="color:var(--danger)">한도 소진 시 샘플 구매로 진행</span>':''}</small></h2>
  <div class="grid g2" style="margin-bottom:18px">
    <div class="card">
      <div class="lbl-sm" style="margin-bottom:4px">${gfull(myTier.g)} 등급 이상 인플루언서 베스트셀링 TOP5</div>
      <div style="font-size:11px;color:var(--mute);margin-bottom:12px">최근 30일 확정 매출 · 데모 지표 포함</div>
      ${top.map((x,i)=>`<div class="hb-row" data-act="prodDetail" data-k="${x.p.id}">
        <span class="hb-nm">${i+1}. ${pIcon(x.p,20)} ${esc(x.p.name)}</span>
        <div class="hb-track"><div class="hb-bar ${i===0?'top':''}" style="width:${Math.max(6,x.v/mx*100)}%"></div></div>
        <span class="hb-val">₩${fmt(x.v)}</span>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="lbl-sm" style="margin-bottom:8px">🔥 지금 뜨는 카테고리 — 최근 분기 매출 성장 (데모 지표)</div>
      <div class="cats" style="margin-bottom:0;flex-direction:column;align-items:flex-start">${CAT_TRENDS.map(t=>`<button class="catchip" data-act="setCat" data-k="${t.cat}">${t.cat} <b style="color:var(--danger)">▲${t.g.replace('+','')}</b> <span style="color:var(--mute);font-weight:400">${t.note}</span></button>`).join('')}</div>
    </div>
  </div>
  ${cur==='전체'&&trendPicks.length?`<div class="sec">트렌드 픽 — 매출 급등 상품</div>
  <div class="grid g3" style="margin-bottom:26px">${trendPicks.map(prodCard).join('')}</div>
  <div class="sec">전체 상품</div>`:''}
  <div class="cats">${CATS.map(c=>`<button class="catchip ${c===cur?'on':''}" data-act="setCat" data-k="${c}" title="${CAT_INFO[c]?CAT_INFO[c].desc+' · '+CAT_INFO[c].ex:'건강·웰니스 전 카테고리'}">${c}</button>`).join('')}</div>
  <div class="catguide">${cur==='전체'?`<b>건강·웰니스 전용 갤러리</b> — ${CAT_POLICY}`:`<b>${cur}</b> <span class="en">${CAT_INFO[cur].en}</span> — ${CAT_INFO[cur].desc} · 예: ${CAT_INFO[cur].ex}`}</div>
  <div class="grid g3">${list.map(prodCard).join('')||'<div class="empty" style="grid-column:1/-1;background:var(--surface);border:2px solid var(--line);border-radius:6px">해당 카테고리에 노출 중인 상품이 없습니다</div>'}</div>`;
}
function vSellerCamps(){
  const mine=D_().campaigns.filter(c=>c.sellerId===S.actingSeller).sort((a,b)=>b.createdAt<a.createdAt?-1:1);
  return `<h2 class="pg">내 캠페인 <small>클릭하면 캠페인 스레드로 이동</small></h2>
  <div class="listcard">${mine.map(c=>campRow(c)).join('')||'<div class="empty">캠페인이 없습니다</div>'}</div>
  ${calHtml()}`;
}
/* ---- DM inbox (instagram-style): one conversation per campaign thread ---- */
function vDM(){
  const isBrand=S.view.role==='brand';
  let cs;
  if(isBrand){const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);cs=D_().campaigns.filter(c=>myP.includes(c.productId));}
  else cs=D_().campaigns.filter(c=>c.sellerId===S.actingSeller);
  const strip=t=>String(t).replace(/<[^>]+>/g,'');
  const rows=cs.map(c=>{
    const msgs=D_().messages[c.id]||[];
    const last=msgs[msgs.length-1]||{type:'sys',txt:'대화 시작',at:c.createdAt};
    const p=prod(c.productId),b=brand(p.brandId),s=seller(c.sellerId);
    const myRole=isBrand?'brand':'seller';
    const unread=last.type==='chat'&&last.role!==myRole;
    const who=last.type==='chat'?(last.role==='brand'?b.name:last.role==='admin'?'셀러리 운영팀':s.name)+': ':'';
    return {c,p,b,s,last,unread,who};
  }).sort((a,b)=>a.last.at<b.last.at?1:a.last.at>b.last.at?-1:(a.c.createdAt<b.c.createdAt?1:-1));
  const unreadN=rows.filter(r=>r.unread).length;
  const q=(S.dmQ||'').trim().toLowerCase();
  const shown=q?rows.filter(r=>[r.s.name,r.s.handle,r.b.name,r.p.name,strip(r.last.txt),r.c.id,ST[r.c.status].l].join(' ').toLowerCase().includes(q)):rows;
  return `<h2 class="pg">DM <small>${isBrand?'인플루언서와 나눈 대화 — 제안·샘플·일정·정산 이력이 모두 남아요':'브랜드와 나눈 대화 — 샘플 요청·승인·일정·정산 이력이 모두 남아요'}${unreadN?` · <b style="color:var(--danger)">안 읽음 ${unreadN}</b>`:''}</small></h2>
  ${isBrand?vRequests():sellerRequests()}
  <div class="dmsearch"><input id="dmQ" value="${esc(S.dmQ||'')}" placeholder="인플루언서·브랜드·상품·메시지 검색" data-enter="dmSearch" oninput="ACT.dmSearchLive(this.value)">${q?`<button class="sm ghost" data-act="dmClear">지우기</button>`:''}<span class="sub" style="color:var(--mute);font-size:12px;white-space:nowrap">${q?`${shown.length}/${rows.length}건`:`대화 ${rows.length}건`}${unreadN?` · <b style="color:var(--danger)">안 읽음 ${unreadN}</b>`:''}</span></div>
  <div class="listcard">${shown.map(r=>{
    const av=isBrand
      ?(r.s.img?`<div class="sc-av" style="width:44px;height:44px;background-image:url('${r.s.img}')"></div>`:`<div class="sc-av em" style="width:44px;height:44px;font-size:20px">${SEMOJI[r.s.id]||'⭐'}</div>`)
      :(r.b.logo?`<img src="${r.b.logo}" alt="" style="width:44px;height:44px;object-fit:cover;flex-shrink:0;border:2px solid var(--line)">`:`<div class="sc-av em" style="width:44px;height:44px;font-size:20px">🏷️</div>`);
    const title=isBrand?`${platIcon(r.s)} ${esc(r.s.name)} <span style="color:var(--mute);font-weight:400;font-size:12px">${r.s.handle}</span>`:`${esc(r.b.name)}`;
    return `<div class="rowitem" data-act="open" data-k="${r.c.id}">
      ${av}
      <div class="grow" style="min-width:0">
        <div class="nm">${title} <span style="color:var(--mute);font-weight:400;font-size:12px">· ${esc(r.p.name)}</span>${r.unread?'<span class="dmdot"></span>':''}</div>
        <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:640px;${r.unread?'color:var(--ink);font-weight:700':''}">${esc(r.who)}${esc(strip(r.last.txt))}</div>
      </div>
      <span class="sub" style="font-family:'IBM Plex Mono',monospace;white-space:nowrap">${md(P(r.last.at))}</span>
      ${stChip(r.c.status)}
    </div>`;}).join('')||`<div class="empty">${q?`"${esc(S.dmQ)}"에 맞는 대화가 없습니다`:isBrand?'아직 대화가 없습니다 — 인플루언서 갤러리에서 판매를 제안해보세요':'아직 대화가 없습니다 — 상품 갤러리에서 샘플을 요청해보세요'}</div>`}
  </div>
  <p style="font-size:12px;color:var(--mute);margin-top:10px">대화를 열면 채팅과 승인·일정·정산 이벤트가 한 타임라인에 보입니다. 연락처·외부 메신저 공유는 자동 감지되어 안내됩니다.</p>`;
}
/* ---- my gongu calendar ---- */
function calHtml(opt){
  opt=opt||{};
  const off=S.calOff||0;
  const base=new Date(today().getFullYear(),today().getMonth()+off,1);
  const y=base.getFullYear(),m=base.getMonth();
  const startDow=new Date(y,m,1).getDay();
  const dim=new Date(y,m+1,0).getDate();
  const mine=opt.list||D_().campaigns.filter(c=>c.sellerId===S.actingSeller);
  const label=c=>opt.brandView?`${prod(c.productId).name} · ${seller(c.sellerId).name}`:prod(c.productId).name;
  const evFor=date=>{
    const t=date.getTime(),ds=ymd(date);
    const out=[];
    mine.forEach(c=>{
      if(c.start&&['SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED'].includes(c.status)){
        const s=P(c.start).getTime(),e=P(c.end).getTime();
        if(t>=s&&t<=e)out.push({type:c.status==='LIVE'?'live':c.status==='SCHEDULE_CONFIRMED'?'plan':'done',name:label(c),first:t===s,cid:c.id});
        if(c.status==='CLEARING'&&ymd(settleDue(c))===ds)out.push({type:'pay',name:'₩ 정산 예정',first:true,cid:c.id,go:'settle'});
      }
      if(c.status==='TESTING'&&c.testDue===ds)out.push({type:'due',name:'테스트 마감',first:true,cid:c.id});
    });
    return out;
  };
  let cells='';
  for(let i=0;i<startDow;i++)cells+='<div class="cal-cell off"></div>';
  for(let d=1;d<=dim;d++){
    const date=new Date(y,m,d);
    const evs=evFor(date);
    cells+=`<div class="cal-cell ${ymd(date)===ymd(today())?'today':''}"><span class="dn">${d}</span>
      ${evs.map(ev=>`<div class="cal-ev ${ev.type}" data-act="${ev.go?'screen':'open'}" data-k="${ev.go||ev.cid}" title="${esc(ev.name)}${ev.go?' — 정산 탭으로':''}">${ev.first?esc(ev.name):'&nbsp;'}</div>`).join('')}</div>`;
  }
  return `<div class="sec">${opt.title||'판매 캘린더 — 내 스케줄 한눈에'}</div>
  <div class="card" style="padding:0;overflow:hidden">
    <div class="cal-head">
      <button class="sm ghost" data-act="calNav" data-k="-1">‹</button>
      <b style="font-family:'Archivo',sans-serif;font-size:16px;letter-spacing:.02em">${y}.${String(m+1).padStart(2,'0')}</b>
      <button class="sm ghost" data-act="calNav" data-k="1">›</button>
      ${off!==0?`<button class="sm ghost" data-act="calNav" data-k="0">오늘</button>`:''}
      <span class="cal-legend"><span><i class="lg plan"></i>확정</span><span><i class="lg live"></i>LIVE</span><span><i class="lg done"></i>종료·정산중</span><span data-act="screen" data-k="settle" style="cursor:pointer;text-decoration:underline"><i class="lg pay"></i>정산일</span><span><i class="lg due"></i>테스트 마감</span></span>
    </div>
    <div class="cal-dow">${['일','월','화','수','목','금','토'].map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  </div>`;
}
function vSellerSettle(){
  const mine=D_().campaigns.filter(c=>c.sellerId===S.actingSeller&&['LIVE','CLEARING','SETTLED'].includes(c.status));
  const si=seller(S.actingSeller).settleInfo||{};
  const noAcct=!(si.bank&&si.account);
  return `<h2 class="pg">정산 <small>수수료 = 확정 매출 × 수수료율, 개인 인플루언서 원천징수 3.3%</small></h2>
  ${noAcct?`<div class="card" style="border-color:var(--danger);margin-bottom:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><b style="color:var(--danger)">⚠ 정산 계좌 미등록</b><span style="font-size:13px;color:var(--mute)">계좌를 등록해야 D+21 지급이 실행됩니다.</span><button class="pri sm" data-act="screen" data-k="my">마이페이지에서 등록</button></div>`:''}
  <div style="margin-bottom:14px"><button class="sm ghost" data-act="settleCSV">⬇ 명세 CSV 다운로드</button></div>
  <div class="tblw"><table>
  <thead><tr><th>판매</th><th>기간</th><th class="num">확정 매출</th><th class="num">수수료율</th><th class="num">수수료(세전)</th><th class="num">실수령(예정)</th><th>상태</th><th>지급 예정일</th></tr></thead>
  <tbody>${mine.map(c=>{const k=calc(c),p=prod(c.productId);
    return `<tr class="clickable" data-act="open" data-k="${c.id}"><td><b>${pIcon(p,20)} ${esc(p.name)}</b></td>
    <td class="num">${md(P(c.start))}–${md(P(c.end))}</td>
    <td class="num">₩${fmt(k.net)}</td><td class="num">${(p.rate*100).toFixed(0)}%${k.rb?' <b style="color:var(--red)">+1%p</b>':''}</td>
    <td class="num">₩${fmt(k.sfTotal)}</td><td class="num" style="color:var(--money);font-weight:700">₩${fmt(k.sfTotal*(1-WHT))}</td>
    <td>${stChip(c.status)}</td><td class="num">${c.status==='SETTLED'?'지급완료':md(settleDue(c))}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">정산 내역이 없습니다</td></tr>'}
  </tbody></table></div>`;
}

/* ============ SELLER RANK ============ */
function vRank(){
  const me=seller(S.actingSeller);
  const g=gradeOf(me.m3Sales);
  const next=GRADES[GRADES.indexOf(g)-1];
  const pct=next?Math.min(100,Math.round(me.m3Sales/next.min*100)):100;
  const rows=D_().sellers.slice().sort((a,b)=>b.m3Sales-a.m3Sales);
  return `<h2 class="pg">인플루언서 랭킹 <small>최근 3개월 매출 기준 · 등급 보너스는 플랫폼 수수료에서 지급</small></h2>
  <div class="grid g2">
    <div class="card"><div class="lbl-sm">내 등급 — 상위 ${g.pct}%</div>
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0;flex-wrap:wrap"><span class="gradebox">${gfull(g.g)}</span>
      <span style="font-family:'Archivo',sans-serif;font-size:25px;font-weight:800">₩${fmt(me.m3Sales)}</span>
      <span style="font-size:12px;color:var(--mute)">최근 3개월</span></div>
      ${pyrHtml(GRADES,g.g)}
      ${next?`<div class="meter"><span style="width:${pct}%"></span></div>
      <div style="font-size:12px;color:var(--mute);margin-top:7px">다음 등급 <b>${next.g}</b>까지 <b>₩${fmt(next.min-me.m3Sales)}</b> 남음 — 달성 시 ${next.perk}</div>`
      :`<div style="font-size:12px;color:var(--mute)">최고 등급입니다 · ${g.perk}</div>`}
    </div>
    <div class="card"><div class="lbl-sm">등급별 혜택</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:7px">${GRADES.map(t=>`<div style="display:flex;gap:10px;align-items:baseline;font-size:12.5px;flex-wrap:wrap;${t.g===g.g?'font-weight:800':''}">
        <span class="gradebox sm" style="min-width:86px;text-align:center">${gfull(t.g)}</span><span style="color:var(--mute);white-space:nowrap">₩${fmt(t.min)}+</span><span style="flex:1;min-width:140px">${t.perk}</span></div>`).join('')}</div>
    </div>
  </div>
  <div class="sec">리더보드 — 매출 효율 랭킹</div>
  <div class="tblw"><table>
  <thead><tr><th>#</th><th>인플루언서</th><th>카테고리</th><th class="num">3개월 매출</th><th class="num">매출/팔로워</th><th class="num">매출/좋아요</th><th>등급</th></tr></thead>
  <tbody>${rows.map((s,i)=>{const mine=s.id===S.actingSeller;
    return `<tr${mine?' class="merow"':''}><td class="num">${i+1}</td>
    <td>${platIcon(s)} ${mine?`<b>${s.name} ${s.handle}</b> <span class="mebadge">MY</span>`:'○○○ 인플루언서'}</td>
    <td>${s.cat}</td><td class="num">₩${fmt(s.m3Sales)}</td>
    <td class="num">₩${fmt(s.m3Sales/s.followers)}</td><td class="num">₩${fmt(s.m3Sales/s.likesAvg)}</td>
    <td><span class="gradebox sm">${gfull(gname(s))}</span></td></tr>`;}).join('')}
  </tbody></table></div>
  <p style="font-size:12px;color:var(--mute);margin-top:10px">※ 타 인플루언서는 익명(○○○)으로만 노출됩니다 — 순위와 지표만 공개, 저격 불가.</p>`;
}

/* ============ MY PAGE ============ */
function vMy(){
  const me=seller(S.actingSeller);
  const si=me.settleInfo||{};
  const g=gradeOf(me.m3Sales);
  const ok=si.bank&&si.account&&si.holder&&(si.type!=='biz'||si.bizNo);
  return `<h2 class="pg">마이페이지 <small>프로필과 정산 정보를 관리합니다</small></h2>
  <div class="grid g2">
    <div class="card">
      <div class="lbl-sm">프로필</div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap">
        ${me.img?`<img src="${me.img}" alt="프로필" style="width:84px;height:84px;object-fit:cover;border:2px solid var(--line);box-shadow:3px 3px 0 var(--line-sh)">`
          :`<div style="width:84px;height:84px;display:flex;align-items:center;justify-content:center;font-size:32px;border:2px dashed var(--mute)">👤</div>`}
        <div>
          <div style="font-weight:800;font-size:16px">${me.name} <span style="font-weight:400;color:var(--mute);font-size:13px">${platIcon(me)} ${me.handle}</span></div>
          <div style="font-size:12.5px;color:var(--mute)">팔로워 ${fmt(me.followers)} · ${me.cat} · 등급 <span class="gradebox sm">${g.g}</span></div>
          <div class="btnrow" style="margin-top:10px"><button class="sm" data-act="avatarPick">${PEN}${me.img?'프로필 사진 변경':'프로필 사진 등록'}</button></div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="lbl-sm">내 추천 코드</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap">
        <span style="font-family:'Archivo',sans-serif;font-size:22px;font-weight:800;letter-spacing:.1em;background:var(--yellow);border:2px solid var(--line);box-shadow:2px 2px 0 var(--line-sh);padding:3px 14px">${me.refCode}</span>
        <button class="sm" data-act="copyRef" data-k="${me.refCode}">복사</button>
        <button class="sm ghost" data-act="screen" data-k="ref">추천 프로그램 →</button>
      </div>
    </div>
  </div>
  <div class="sec">내 채널 <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--mute)">— 인증된 채널만 브랜드에 노출됩니다</span></div>
  <div class="listcard">
    ${(me.channels||[]).map(ch=>`<div class="rowitem" style="cursor:default">
      <span style="font-size:18px;line-height:1">${platIcon(ch)}</span>
      <div class="grow"><div class="nm">${esc(ch.handle)} ${ch.primary?'<span class="st green">메인 SNS</span>':''}
        ${ch.verified?'<span class="st green">✓ 인증됨</span>':ch.vcode?'<span class="st amber">인증 대기</span>':'<span class="st red">미인증</span>'}</div>
      <div class="sub">${PLAT_NAMES[ch.platform]||ch.platform} · ${ch.url?esc(ch.url)+' · ':''}팔로워 ${fmt(ch.followers||0)}</div></div>
      ${!ch.verified?`<button class="pri sm" data-act="openVerify" data-k="${ch.id}">인증하기</button>`:''}
      ${ch.verified&&!ch.primary?`<button class="sm" data-act="setPrimaryCh" data-k="${ch.id}">메인 SNS로 설정</button>`:''}
      <button class="sm ghost" data-act="editCh" data-k="${ch.id}">수정</button>
      ${!ch.primary?`<button class="sm danger" data-act="delCh" data-k="${ch.id}">삭제</button>`:''}
    </div>`).join('')||'<div class="empty">등록된 채널이 없습니다</div>'}
    <div style="padding:12px 18px;border-top:1px solid var(--soft-line)"><button class="sm" data-act="addCh">+ 채널 추가</button></div>
  </div>
  <div class="sec" style="margin-top:30px">정산 정보 ${ok?'<span class="st green">등록 완료</span>':'<span class="st red">미등록 — 등록 전까지 정산 지급 보류</span>'}</div>
  <div class="card">
    <div class="grid g2">
      <div class="fld"><label>정산 유형</label>
        <select id="siType">
          <option value="personal" ${si.type!=='biz'?'selected':''}>개인 — 사업소득 원천징수 3.3% 공제</option>
          <option value="biz" ${si.type==='biz'?'selected':''}>사업자 — 세금계산서 발행</option>
        </select></div>
      <div class="fld"><label>은행</label>
        <select id="siBank">${['선택','국민','신한','우리','하나','농협','카카오뱅크','토스뱅크','기업','SC제일'].map(b=>`<option ${si.bank===b?'selected':''}>${b}</option>`).join('')}</select></div>
      <div class="fld"><label>계좌번호</label><input id="siAccount" inputmode="numeric" value="${esc(si.account||'')}" placeholder="'-' 없이 숫자만"></div>
      <div class="fld"><label>예금주</label><input id="siHolder" value="${esc(si.holder||me.name)}"></div>
      <div class="fld"><label>사업자등록번호 <span style="font-weight:400">(사업자만)</span></label><input id="siBizNo" value="${esc(si.bizNo||'')}" placeholder="000-00-00000"></div>
      <div class="fld"><label>사업자등록증 <span style="font-weight:400">(사업자만)</span></label>
        <div class="btnrow"><button class="sm ghost" data-act="bizDocPick">${si.bizDoc?'파일 변경':'파일 업로드'}</button>
        ${si.bizDoc?`<span style="font-size:12px;color:var(--mute);align-self:center">📎 ${esc(si.bizDoc)} <span class="st green">첨부됨</span></span>`:''}</div></div>
    </div>
    <p style="font-size:12px;color:var(--mute)">계좌 1원 인증과 사업자 진위 확인은 실서비스에서 자동 처리됩니다. 정산 정보가 없으면 D+21 지급이 보류됩니다.</p>
    <button class="pri" data-act="saveSettleInfo">정산 정보 저장</button>
  </div>`;
}

/* ============ CHANNELS ============ */
function channelModal(chId){
  const me=seller(S.actingSeller);
  const ch=chId?(me.channels||[]).find(c=>c.id===chId):null;
  openModal(`<h3>${ch?'채널 수정':'채널 추가'}</h3>
  <div class="fld"><label>플랫폼</label><select id="chPlat">${Object.entries(PLAT_NAMES).map(([k,v])=>`<option value="${k}" ${ch&&ch.platform===k?'selected':''}>${v}</option>`).join('')}</select></div>
  <div class="fld"><label>계정 핸들 / 채널명</label><input id="chHandle" value="${ch?esc(ch.handle):''}" placeholder="@my_account"></div>
  <div class="fld"><label>채널 URL</label><input id="chUrl" value="${ch?esc(ch.url||''):''}" placeholder="instagram.com/my_account"></div>
  <div class="fld"><label>팔로워 수</label><input id="chFol" type="number" value="${ch?ch.followers||0:''}" placeholder="실서비스에선 API로 자동 수집"></div>
  <p style="font-size:12px;color:var(--mute)">저장 후 <b>인증 절차</b>를 거쳐야 브랜드에 노출됩니다. 수정하면 인증이 초기화됩니다(사칭 방지).</p>
  <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="saveCh" data-k="${ch?ch.id:''}">저장</button></div>`);
}
function verifyModal(chId){
  const me=seller(S.actingSeller);
  const ch=(me.channels||[]).find(c=>c.id===chId);if(!ch)return;
  if(!ch.vcode){ch.vcode='SLRY-'+Math.random().toString(36).slice(2,6).toUpperCase();save();}
  openModal(`<h3>채널 인증 — ${esc(ch.handle)}</h3>
  <p style="font-size:13px;color:var(--mute);margin-top:-6px">본인 계정임을 확인해 사칭을 방지합니다. 아래 <b>1회용 코드</b>를 사용해 두 방법 중 하나로 인증하세요.</p>
  <div style="text-align:center;margin:16px 0">
    <span style="font-family:'Archivo',sans-serif;font-size:26px;font-weight:800;letter-spacing:.15em;background:var(--yellow);border:2px solid var(--line);box-shadow:3px 3px 0 var(--line-sh);padding:5px 20px">${ch.vcode}</span>
    <div style="margin-top:10px"><button class="sm ghost" data-act="copyVcode" data-k="${ch.vcode}">코드 복사</button></div>
  </div>
  <div class="grid g2">
    <div class="card" style="box-shadow:none">
      <div class="lbl-sm">방법 1 · 프로필 인증</div>
      <p style="font-size:12.5px;color:var(--mute);margin:8px 0 0">${PLAT_NAMES[ch.platform]} 프로필 소개글(bio)에 코드를 붙여넣은 뒤 아래 확인 버튼을 누르세요. 확인 후 소개글에서 지워도 됩니다.</p>
    </div>
    <div class="card" style="box-shadow:none">
      <div class="lbl-sm">방법 2 · DM 인증</div>
      <p style="font-size:12.5px;color:var(--mute);margin:8px 0 0">해당 계정에서 셀러리 공식 계정 <b>@sellery.official</b>로 코드를 DM으로 보낸 뒤 확인 버튼을 누르세요.</p>
    </div>
  </div>
  <p style="font-size:11.5px;color:var(--mute);margin-top:12px">실서비스: 프로필 크롤링/공식 API·DM 수신함 매칭으로 코드 존재를 자동 확인합니다. 프로토타입에서는 확인 버튼 클릭 시 즉시 성공 처리됩니다.</p>
  <div class="foot"><button data-act="closeModal">나중에</button><button class="pri" data-act="confirmVerify" data-k="${ch.id}">인증 확인</button></div>`);
}

/* ============ REFERRAL ============ */
function vRef(){
  const me=seller(S.actingSeller);
  const myRefs=D_().sellers.filter(s=>s.referredBy===S.actingSeller);
  const earns=(D_().refEarnings||[]).filter(e=>e.referrerId===S.actingSeller);
  const total=earns.reduce((a,e)=>a+e.amt,0);
  const usedOf=sid=>D_().campaigns.filter(x=>x.sellerId===sid&&['LIVE','CLEARING','SETTLED'].includes(x.status)).length;
  let boostBanner='';
  if(me.referredBy){
    const left=Math.max(0,REF_TIMES-usedOf(me.id));
    boostBanner=`<div class="card" style="border-color:var(--red);margin-bottom:18px"><b>🌱 추천 부스트 적용 중</b> — ${seller(me.referredBy).name}님 추천으로 가입했어요. 첫 ${REF_TIMES}회 판매 수수료 <b>+1%p</b> (남은 횟수 ${left}회). 기본 수수료율은 그대로 — 보상은 셀러리가 부담합니다.</div>`;
  }
  return `<h2 class="pg">추천 프로그램 <small>인플루언서가 인플루언서를 데려오면 둘 다 이득 — 전액 셀러리 부담</small></h2>
  ${boostBanner}
  <div class="grid g2">
    <div class="card"><div class="lbl-sm">내 추천 코드</div>
      <div style="display:flex;align-items:center;gap:14px;margin:12px 0;flex-wrap:wrap">
        <span style="font-family:'Archivo',sans-serif;font-size:30px;font-weight:800;letter-spacing:.12em;background:var(--yellow);border:2px solid var(--line);box-shadow:3px 3px 0 var(--line-sh);padding:4px 18px">${me.refCode}</span>
        <button class="sm" data-act="copyRef" data-k="${me.refCode}">코드 복사</button></div>
      <p style="font-size:12.5px;color:var(--mute);margin:0">동료 인플루언서가 가입할 때 이 코드를 입력하면 보상이 시작됩니다.</p></div>
    <div class="card"><div class="lbl-sm">보상 구조</div>
      <ul style="font-size:13px;margin:10px 0 0;padding-left:18px;line-height:2.1">
        <li><b>나 (추천인)</b> — 새 인플루언서의 첫 ${REF_TIMES}회 판매, <b>확정 매출의 2%</b> 지급</li>
        <li><b>새 인플루언서</b> — 첫 ${REF_TIMES}회 판매, 수수료 <b>+1%p</b></li>
        <li>새 인플루언서의 수수료율은 <b>절대 깎이지 않음</b> — 보상은 플랫폼 수수료에서 지급</li>
      </ul></div>
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card kpi"><div class="lbl">누적 추천 수익</div><div class="val" style="color:var(--money)">₩${fmt(total)}</div><div class="sub">정산 완료 기준 · 진행 중 판매는 정산 시 지급</div></div>
    <div class="card kpi"><div class="lbl">내가 추천한 인플루언서</div><div class="val">${myRefs.length}명</div><div class="sub">인플루언서당 최대 ${REF_TIMES}회 판매까지 보상</div></div>
  </div>
  <div class="sec">추천 현황</div>
  <div class="tblw"><table>
  <thead><tr><th>인플루언서</th><th class="num">보상 판매 진행</th><th class="num">발생 수익</th></tr></thead>
  <tbody>${myRefs.map(s=>{const u=usedOf(s.id);const e=earns.filter(x=>x.fromSellerId===s.id).reduce((a,x)=>a+x.amt,0);
    return `<tr><td><b>${s.name}</b> ${s.handle}</td><td class="num">${Math.min(u,REF_TIMES)} / ${REF_TIMES}회</td><td class="num">₩${fmt(e)}</td></tr>`;}).join('')||'<tr><td colspan="3" class="empty">아직 추천한 인플루언서가 없습니다 — 코드를 공유해보세요</td></tr>'}
  </tbody></table></div>`;
}

/* ============ PRODUCT DETAIL ============ */
function productDetailModal(pid){
  const p=prod(pid),b=brand(p.brandId);
  const hist=D_().campaigns.filter(c=>c.productId===pid&&['LIVE','CLEARING','SETTLED'].includes(c.status));
  const me=seller(S.actingSeller);
  const isSeller=S.view.role==='seller';
  const hasPass=!isSeller||!!(me&&me.celeryItems&&me.celeryItems.datapass);
  const rows=hist.map((c,i)=>{const s=seller(c.sellerId),k=calc(c);const lock=!hasPass&&i>0;
    return `<tr class="${lock?'blurrow':''}"><td class="num">${fmt(s.followers)}</td><td class="num">${fmt(s.likesAvg)}</td><td class="num">${(s.likesAvg/s.followers*100).toFixed(1)}%</td><td class="num">${c.start?md(P(c.start))+'–'+md(P(c.end)):'—'}</td><td class="num"><b>₩${fmt(k.net)}</b></td><td>${stChip(c.status)}</td></tr>`;}).join('')
    +((!hasPass&&hist.length>1)?`<tr><td colspan="6" style="text-align:center;padding:10px"><button class="pri sm" data-act="buyDataPass" data-k="${pid}">${CEL} 2 · 매출 데이터 확인권으로 전체 실적 보기</button></td></tr>`:'');
  let excl='';
  if(p.exclusive){
    const exg=exGradeOf(p);
    const q=me&&exEligible(p,me);
    const already=(D_().exclusiveReqs||[]).find(r=>r.productId===pid&&r.sellerId===S.actingSeller&&r.status!=='REJECTED');
    excl=`<div class="exclbox">
      <div class="lbl-sm">👑 브랜드 독점권 오퍼</div>
      <p style="margin:6px 0;font-size:13px"><b>${esc(p.exclusive.label)}</b> — <b>${gfull(exg)}</b> 등급 이상 인플루언서에게 드립니다.</p>
      ${p.exclusiveSellerId?`<p style="font-size:12.5px;margin:0"><b>독점 인플루언서 확정됨</b>${p.exclusiveSellerId===S.actingSeller?' — 나 🎉':' (○○○ 인플루언서)'}</p>`
       :isSeller?(already?`<button class="sm" disabled style="opacity:.6">신청 완료 — 브랜드 승인 대기</button>`
         :q?`<button class="pri sm" data-act="reqExclusive" data-k="${pid}" title="신청 시 브랜드에 프로필(이름·채널·지표)이 공개됩니다">독점권 신청 — 내 등급 ${gfull(gname(me))} 충족 ✓</button>`
         :`<button class="sm" disabled style="opacity:.6">등급 미달 — 내 등급 ${gfull(gname(me))} / 필요 ${gfull(exg)} 이상</button>`):''}
    </div>`;
  }
  openModal(`<h3>${pIcon(p,30)} ${esc(p.name)}</h3>
  <div style="font-size:12.5px;color:var(--mute);margin:-8px 0 12px">${b.logo?`<img src="${b.logo}" alt="" style="width:20px;height:20px;vertical-align:-6px;border:1.5px solid var(--line-soft);margin-right:2px">`:''}<span class="chip brand">${b.name}</span> <span class="gradebox sm">${gfull(bgname(b))}</span> ${p.cat} · 판매가 ₩${fmt(p.gp)} <s style="opacity:.6">₩${fmt(p.cp)}</s> ${p.cp>p.gp?`<span class="disc">-${Math.round((1-p.gp/p.cp)*100)}%</span>`:''} · 수수료 ${(p.rate*100).toFixed(0)}~${(p.rate*100+GRADES[0].bonus).toFixed(0)}% (등급 보너스 포함) · 샘플 ${p.sample}${p.t?` · <b style="color:var(--danger)">▲${p.t.g} ${p.t.note}</b>`:''}</div>
  <div class="notice" style="margin:0 0 10px;font-size:12.5px">🎁 <b>샘플 정책</b> — ${sampleLine(p)}${isSeller?` · 내 등급 <span class="gradebox sm">${gfull(gname(me))}</span> · 이달 무상 한도 ${sampleLeft(me)===Infinity?'무제한':sampleLeft(me)+'회 남음'}`:''}</div>
  ${excl}
  <div class="lbl-sm" style="margin:16px 0 8px">이 상품의 판매 실적 — 인플루언서 익명</div>
  <div class="tblw fit" style="box-shadow:none;overflow:visible"><table style="min-width:0">
  <thead><tr><th class="num">팔로워</th><th class="num">좋아요</th><th class="num">참여율</th><th class="num">기간</th><th class="num">확정 매출</th><th>상태</th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6" class="empty">아직 진행된 판매가 없습니다 — 첫 인플루언서가 되어보세요</td></tr>'}</tbody></table></div>
  ${(p.imgs&&p.imgs.length)?`<div class="lbl-sm" style="margin:16px 0 8px">상세페이지 이미지</div>${p.imgs.map(u=>`<img src="${u}" alt="" style="width:100%;border:1.5px solid var(--line-soft);margin-bottom:8px;display:block">`).join('')}`:''}
  <div class="foot">
    <button data-act="previewProduct" data-k="${pid}">🛍 상세페이지 보기</button>
    ${isSeller?sampleBtnHtml(p,true):''}
    <button data-act="closeModal">닫기</button>
  </div>`);
}
