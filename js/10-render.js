/* ============ render root ============ */
const ROLES=[['seller','인플루언서 센터'],['brand','브랜드 센터'],['admin','관리자'],['customer','고객 화면']];
const SCREENS={
  seller:[['home','홈'],['camps','내 캠페인'],['dm','DM'],['explore','상품 갤러리'],['sales','실시간 매출'],['settle','정산'],['rank','랭킹·등급'],['shop','셀러리 샵'],['ref','추천 프로그램']],
  brand:[['home','홈'],['dm','DM'],['camps','내 캠페인'],['orders','주문·발주'],['cs','고객 문의'],['sales','실시간 매출'],['settle','정산'],['products','상품 관리'],['gallery','인플루언서 갤러리'],['shop','셀러리 샵']],
  admin:[['home','대시보드'],['products','상품'],['influencers','인플루언서'],['brands','브랜드'],['orders','주문·CS'],['match','매칭·자동 제안'],['revenue','매출·순수익'],['settle','정산 실행']],
  customer:[['home','진행 중인 판매'],['influencers','인플루언서'],['about','셀러리 소개']]
};
function render(){
  autoTick();
  document.body.setAttribute('data-stage','studio');   // 사용자 확정(2026-09-03): 스튜디오 비네트 무대
  const cnt=counts();
  $('#roletabs').innerHTML=S.lockedRole?'':ROLES.map(([k,l])=>
    `<button data-act="role" data-k="${k}" class="${S.view.role===k?'on':''}">${l}${cnt[k]?`<span class="badge">${cnt[k]}</span>`:''}</button>`).join('');
  const scr=SCREENS[S.view.role];
  const cb=$('#celbal'); if(cb){const who=S.view.role==='brand'?S.actingBrand:S.view.role==='seller'?S.actingSeller:null; cb.innerHTML=who?`${CEL} ${celBal(who)}`:''; cb.style.display=who?'inline-flex':'none';}
  let personaHtml='';
  if(S.lockedRole){ /* 실서비스: 로그인 계정 고정 — 전환 셀렉트 없음 */
    const ss=S.session;
    if(ss&&ss.role===S.view.role&&S.view.role!=='customer'){
      const who=S.view.role==='seller'?(seller(S.actingSeller)||{}):S.view.role==='brand'?(brand(S.actingBrand)||{}):{name:'운영팀'};
      personaHtml=`<div class="persona"><span title="${esc(ss.email||'')}">${esc(who.name||ss.name||'')}${who.handle?' <span style="opacity:.75">'+esc(who.handle)+'</span>':''}</span><button class="sm ghost" data-act="logout">로그아웃</button></div>`;
    } else if(S.view.role==='seller'||S.view.role==='brand'){
      personaHtml=`<div class="persona"><a class="sm ghost" href="login.html?role=${S.view.role}" style="text-decoration:none;display:inline-block;padding:5px 9px;border:2px solid var(--line-soft);font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--ink)">이메일 로그인</a></div>`;
    }
  }
  else if(S.view.role==='seller'){
    personaHtml=`<div class="persona">접속 인플루언서 <select data-act="setSeller">${D_().sellers.map(s=>`<option value="${s.id}" ${s.id===S.actingSeller?'selected':''}>${s.name} ${s.handle}</option>`).join('')}</select></div>`;
  } else if(S.view.role==='brand'){
    personaHtml=`<div class="persona">접속 브랜드 <select data-act="setBrand">${D_().brands.map(b=>`<option value="${b.id}" ${b.id===S.actingBrand?'selected':''}>${b.name}</option>`).join('')}</select></div>`;
  }
  const dmN=(S.view.role==='brand'||S.view.role==='seller')?dmUnreadN()+(S.view.role==='brand'?brandPending().n:sellerPending().n):0;
  $('#subnav').innerHTML=scr.map(([k,l])=>
    `<button data-act="screen" data-k="${k}" class="${(S.view.screen===k||(k==='dm'&&S.view.screen==='requests'))&&!S.view.cid?'on':''}" style="position:relative">${l}${k==='dm'&&dmN?`<span class="badge">${dmN}</span>`:''}</button>`).join('')+personaHtml;
  const m=$('#main');
  if(S.view.store){ const y=window.scrollY; m.innerHTML=vStore(S.view.store); decorate(); window.scrollTo(0,S.storeTop?0:y); S.storeTop=false; return; }
  if(S.view.cid){ m.innerHTML=vCampDetail(S.view.cid); decorate(); const box=m.querySelector('.msgs'); if(box) box.scrollTop=box.scrollHeight; return; }
  const fn={
    'seller.home':vSellerHome,'seller.explore':vExplore,'seller.camps':vSellerCamps,'seller.dm':vDM,'brand.dm':vDM,'seller.shop':vShop,'brand.shop':vShop,'seller.sales':vSales,'seller.rank':vRank,'seller.ref':vRef,'seller.settle':vSellerSettle,'seller.my':vMy,
    'brand.home':vBrandHome,'brand.camps':vBrandCamps,'brand.products':vBrandProducts,'brand.gallery':vGallery,'brand.requests':vDM,'brand.sales':vSales,'brand.orders':vBrandOrders,'brand.cs':vBrandCS,'brand.settle':vBrandSettle,'brand.my':vBrandMy,
    'admin.home':vAdminHome,'admin.products':vAdminProducts,'admin.review':vAdminProducts,'admin.influencers':vAdminInfluencers,'admin.brands':vAdminBrands,'admin.orders':vAdminOrders,'admin.match':vAdminMatch,'admin.revenue':vAdminRevenue,'admin.settle':vAdminSettle,
    'customer.home':vCustHome,'customer.influencers':vCustInfluencers,'customer.about':vCustAbout
  }[S.view.role+'.'+S.view.screen]||(S.view.role==='customer'?vCustHome:vSellerHome);
  m.innerHTML=fn();
  decorate();
}
/* ---- 레트로 OS 데코: 윈도우 파일명 + 이모지 픽셀화 (스킨 전용, 데이터/기능 무관) ---- */
const PIXEL_EMOJI=false; // 2026-09-03 사용자: 픽셀화 이모지가 깨져 보임 → 원본 이모지 사용 (true로 되돌리면 픽셀아트)
function pixelizeEmoji(el){
  if(!PIXEL_EMOJI)return;
  if(!el||el.querySelector('.pxemoji')||el.querySelector('img'))return;
  const tn=[...el.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
  if(!tn)return;
  const ch=tn.textContent.trim();
  const small=document.createElement('canvas');small.width=16;small.height=16;
  const sc=small.getContext('2d');sc.font='13px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';sc.textAlign='center';sc.textBaseline='middle';sc.fillText(ch,8,9);
  const big=document.createElement('canvas');big.width=96;big.height=96;
  const bc=big.getContext('2d');bc.imageSmoothingEnabled=false;bc.drawImage(small,0,0,96,96);
  big.className='pxemoji';big.setAttribute('aria-label',ch);
  tn.replaceWith(big);
}
function decorate(){
  document.querySelectorAll('main .sec').forEach(s=>{
    const words=s.textContent.replace(/[▶■·—]/g,' ').replace(/\d+명|\d+건/g,'').split(/\s+/)
      .map(w=>w.replace(/[^가-힣A-Za-z0-9]/g,'')).filter(w=>w&&!/^LIVE$|^진행중$/i.test(w)&&!/^@/.test(w));
    let t=words.slice(0,3).join('_'); if(t.length>12)t=words.slice(0,2).join('_'); if(t.length>12)t=words[0].slice(0,12);
    const n=s.nextElementSibling;if(!n)return;
    const targets=n.matches('.card,.listcard,.tblw,.thread')?[n]:[...n.querySelectorAll(':scope > .card, :scope > .listcard, :scope > .tblw')];
    targets.forEach(x=>{if(!x.hasAttribute('data-win'))x.setAttribute('data-win',t.toUpperCase()+'.EXE');});
  });
  document.querySelectorAll('.prod .ph, .sc-av.em, .store-em, .cust-em, .rowitem > div:first-child[style*="font-size:24px"], .det-head > div:first-child[style*="font-size:32px"]').forEach(pixelizeEmoji);
  // 반응형 표: 헤더 텍스트를 각 셀의 data-l 라벨로 (모바일에서 카드형으로 펼침)
  document.querySelectorAll('.tblw table').forEach(tb=>{
    const ths=[...tb.querySelectorAll('thead th')].map(t=>t.textContent.trim());
    if(!ths.length)return;
    tb.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{
      if(td.classList.contains('empty'))return;
      if(!td.dataset.l)td.dataset.l=ths[i]||'';
    }));
  });
}

/* ============ shared components ============ */
function stChip(st){const m=ST[st];return `<span class="st ${m.c}">${st==='LIVE'?'<span class="pulse"></span>':''}${m.l}</span>`;}
function stepper(status){
  const idx=FLOW.indexOf(status==='SAMPLE_PURCHASED'?'SAMPLE_APPROVED':status==='INVITED'?'SAMPLE_REQUESTED':status);
  return `<div class="stepper">${FLOW_L.map((l,i)=>`<span class="stp ${i<idx?'done':i===idx?'now':''}">${l}</span>`).join('')}</div>`;
}
function campRow(c,{who='seller'}={}){
  const p=prod(c.productId),b=brand(p.brandId),s=seller(c.sellerId);
  const sub = who==='seller' ? `${b.name} · 수수료 ${(p.rate*100).toFixed(0)}%` : `${platIcon(s)} ${s.name} ${s.handle} · 팔로워 ${fmt(s.followers)}`;
  const when=c.start?`<span class="sub" style="font-family:'IBM Plex Mono',monospace">${md(P(c.start))}–${md(P(c.end))}</span>`:'';
  return `<div class="rowitem" data-act="open" data-k="${c.id}">
    ${pIcon(p,38)}
    <div class="grow"><div class="nm">${esc(p.name)}</div><div class="sub">${sub}</div></div>
    ${when} ${stChip(c.status)}</div>`;
}
