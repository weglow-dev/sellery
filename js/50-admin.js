/* ============ ADMIN ============ */
function vAdminHome(){
  const cs=D_().campaigns;
  const done=cs.filter(c=>['LIVE','CLEARING','SETTLED'].includes(c.status));
  const gmv=done.reduce((a,c)=>a+calc(c).net,0);
  const net=done.reduce((a,c)=>a+calc(c).pfNet,0);
  const os=D_().orders;
  const refRate=os.length?os.filter(o=>o.status==='REFUNDED').length/os.length*100:0;
  const pendP=D_().products.filter(p=>p.status==='pending').length;
  const due=cs.filter(c=>c.status==='CLEARING'&&settleDue(c)<=today()).length;
  const exq=(D_().exclusiveReqs||[]).filter(r=>r.status==='PENDING').length;
  const unver=D_().sellers.reduce((a,x)=>a+(x.channels||[]).filter(c=>!c.verified).length,0);
  const noSettle=D_().brands.filter(b=>!(b.settleInfo&&b.settleInfo.account)).length+D_().sellers.filter(x=>!(x.settleInfo&&x.settleInfo.account)).length;
  const cands=autoMatches().length;
  const unshipped=os.filter(o=>o.status==='PAID'&&!o.tracking).length;
  const todo=[
    [pendP,'상품 검수 대기','products','pending'],[due,'정산 실행 가능','settle',null],[exq,'독점권 신청 대기','home',null],
    [unshipped,'미발송 주문','orders','PAID'],[unver,'미인증 채널','influencers',null],[noSettle,'정산정보 미등록 계정','brands',null],[cands,'자동 제안 후보','match',null]
  ];
  const feed=[];Object.entries(D_().messages||{}).forEach(([cid,ms])=>ms.forEach(m=>{if(m.type==='sys')feed.push({cid,at:m.at,txt:m.txt});}));
  feed.sort((a,b)=>b.at<a.at?-1:b.at>a.at?1:0);
  const f=S.admCF||'all';
  const flist=cs.filter(c=>f==='all'||c.status===f).sort((a,b)=>b.createdAt<a.createdAt?-1:1);
  const stCounts=Object.keys(ST).map(k=>[k,ST[k].l,cs.filter(c=>c.status===k).length]).filter(x=>x[2]);
  return `<div class="hero-band">
    <div class="ey">Sellery Operations</div>
    <h1>셀러리 전체 <em>거래 현황</em>을 한눈에.</h1>
    <div class="sub">캠페인 <b>${cs.length}건</b> · 주문 <b>${fmt(os.length)}건</b> · 상품 <b>${D_().products.length}개</b> · 인플루언서 <b>${D_().sellers.length}명</b> · 브랜드 <b>${D_().brands.length}개</b> <button class="sm ghost" data-act="reset" style="margin-left:12px">데이터 초기화</button></div>
  </div>
  <div class="grid g4 overlap">
    <div class="card kpi go" data-act="screen" data-k="revenue" title="매출·순수익 보기"><div class="lbl">누적 GMV (확정)</div><div class="val">₩${fmt(gmv)}</div></div>
    <div class="card kpi go" data-act="screen" data-k="revenue" title="매출·순수익 보기"><div class="lbl">플랫폼 순수익 (VAT 제외)</div><div class="val" style="color:var(--accent-ink)">₩${fmt(net)}</div><div class="sub">순 테이크레이트 ${gmv?(net/gmv*100).toFixed(2):'0.00'}%</div></div>
    <div class="card kpi go" data-act="admCF" data-k="LIVE" title="진행 중 판매만 보기"><div class="lbl">진행 중 판매</div><div class="val">${cs.filter(c=>c.status==='LIVE').length}건</div><div class="sub">오늘 주문 ${os.filter(o=>o.at===ymd(today())).length}건</div></div>
    <div class="card kpi go" data-act="screen" data-k="orders" title="주문·CS 보기"><div class="lbl">환불률</div><div class="val">${refRate.toFixed(1)}%</div><div class="sub">주문 ${fmt(os.length)}건 기준</div></div>
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><div class="lbl-sm" style="margin-bottom:10px">✅ 오늘 할 일</div>
      ${todo.map(([n,l,scr,k])=>`<div class="rowitem" data-act="admGo" data-k="${scr}|${k||''}" style="padding:8px 4px"><div class="grow"><div class="nm" style="font-size:13px">${l}</div></div><span class="st ${n?'amber':'gray'}" style="animation:none">${n}건</span></div>`).join('')}
    </div>
    <div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">🕒 최근 활동</div>
      <div class="news">${feed.slice(0,8).map(x=>{const c=camp(x.cid);const p=c&&prod(c.productId);return `<div class="news-item" data-act="open" data-k="${x.cid}"><span class="nb new" style="min-width:52px;text-align:center">${md(P(x.at))}</span><div><b>${p?esc(p.name):x.cid}</b> · ${x.txt}</div></div>`;}).join('')||'<div class="empty">활동 없음</div>'}</div></div>
  </div>
  <div class="sec">전체 캠페인 <span class="badge">${flist.length}</span></div>
  ${admChips([['all','전체',cs.length],...stCounts],f,'admCF')}
  <div class="tblw compact"><table>
  <thead><tr><th>캠페인</th><th>인플루언서</th><th>브랜드</th><th class="num">기간</th><th class="num">주문</th><th class="num">확정 매출</th><th class="num">플랫폼 순수익</th><th>상태</th></tr></thead>
  <tbody>${flist.map(c=>{const p=prod(c.productId);const k=calc(c);
    return `<tr class="clickable" data-act="open" data-k="${c.id}"><td class="nm"><b>${pIcon(p,22)} ${esc(p.name)}</b> <span style="color:var(--mute);font-size:11px">${c.id.toUpperCase()}${c.auto?' · 🤖 자동':''}${c.invited&&!c.auto?' · 브랜드 제안':''}</span></td><td class="who-cell">${platIcon(seller(c.sellerId))}<span class="hd">${seller(c.sellerId).handle}</span></td><td class="brd-cell">${esc(brand(p.brandId).name)}</td>
    <td class="num">${c.start?md(P(c.start))+'–'+md(P(c.end)):'—'}</td><td class="num">${k.paidCnt}${k.refCnt?` <span style="color:var(--danger)">−${k.refCnt}</span>`:''}</td><td class="num">₩${fmt(k.net)}</td><td class="num">₩${fmt(k.pfNet)}</td><td>${stChip(c.status)}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">해당 상태의 캠페인이 없습니다</td></tr>'}
  </tbody></table></div>`;
}
function PSTATS(){return {pending:['검수 대기','amber'],listed:['노출 중','green'],paused:['노출 중단','gray'],rejected:['반려','red']};}
/* 리스트용 상품 아이콘: 누끼가 있으면 썸네일, 없으면 이모지 */
function pIcon(pd,sz){sz=sz||38;return pd&&pd.thumb?`<span class="picon" style="width:${sz}px;height:${sz}px"><img src="${pd.thumb}" alt=""></span>`:`<div class="picon em" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.62)}px">${pd?pd.em:'📦'}</div>`;}
function pstChip(st){const m=PSTATS()[st]||[st,'gray'];return `<span class="st ${m[1]}" style="animation:none">${m[0]}</span>`;}
function admSearch(id,val,ph,shown,total){return `<div class="dmsearch"><input id="${id}" value="${esc(val||'')}" placeholder="${ph}" oninput="ACT.${id}Live(this.value)"><span class="sub" style="color:var(--mute);font-size:12px;white-space:nowrap">${val?`${shown}/${total}건`:`전체 ${total}건`}</span>${val?`<button class="sm ghost" data-act="${id}Clear">지우기</button>`:''}</div>`;}
function admChips(list,cur,act){return `<div class="cats" style="margin:0 0 12px">${list.map(([k,l,n])=>`<button class="catchip ${cur===k?'on':''}" data-act="${act}" data-k="${k}">${l}${n!=null?` <span style="color:var(--mute);font-weight:400">${n}</span>`:''}</button>`).join('')}</div>`;}
function vAdminProducts(){
  const all=D_().products;
  const sf=S.admPS||'all', bf=S.admPB||'all', cf=S.admPC||'all';
  const q=(S.admPQ||'').trim().toLowerCase();
  const base=all.filter(p=>(sf==='all'||p.status===sf)&&(bf==='all'||p.brandId===bf)&&(cf==='all'||p.cat===cf));
  const list=q?base.filter(p=>[p.name,p.desc,p.id,p.cat,brand(p.brandId).name,p.sample,(p.exclusive&&p.exclusive.label)||''].join(' ').toLowerCase().includes(q)):base;
  const cnt=k=>all.filter(p=>p.status===k).length;
  const totalRate=p=>((p.rate+PLAT_RATE)*100).toFixed(0);
  const campsOf=p=>D_().campaigns.filter(c=>c.productId===p.id);
  const gmvOf=p=>campsOf(p).reduce((a,c)=>a+calc(c).net,0);
  return `<h2 class="pg">상품 <small>전 브랜드 등록 상품 ${all.length}개 · 검수 승인/반려, 노출 제어, 상세페이지 확인</small></h2>
  <div class="notice" style="margin-bottom:14px"><b>카테고리 정책</b> — ${CAT_POLICY} 건강기능식품은 표시광고 사전 심의 대상: 질병 치료·예방 표현 금지, 기능성 문구는 식약처 인정 범위 내.</div>
  ${admChips([['all','전체',all.length],['pending','검수 대기',cnt('pending')],['listed','노출 중',cnt('listed')],['paused','노출 중단',cnt('paused')],['rejected','반려',cnt('rejected')]],sf,'admPS')}
  <div style="display:flex;gap:18px;flex-wrap:wrap">
    ${admChips([['all','모든 브랜드'],...D_().brands.map(b=>[b.id,b.name,all.filter(p=>p.brandId===b.id).length])],bf,'admPB')}
    ${admChips([['all','모든 카테고리'],...CATS.filter(c=>c!=='전체').map(c=>[c,c,all.filter(p=>p.cat===c).length])],cf,'admPC')}
  </div>
  ${admSearch('admPQ',S.admPQ,'상품명 · 설명 · 상품ID · 브랜드 · 카테고리 검색',list.length,base.length)}
  <div class="tblw compact"><table>
  <thead><tr><th>상품</th><th>브랜드</th><th>카테고리</th><th class="num">판매가</th><th class="num">총 수수료</th><th class="num">재고</th><th class="num">판매·매출</th><th>독점</th><th>상태</th><th>관리</th></tr></thead>
  <tbody>${list.map(p=>{const b=brand(p.brandId);const cs=campsOf(p);const live=cs.filter(c=>c.status==='LIVE').length;
    return `<tr><td class="nm"><b>${pIcon(p,24)} ${esc(p.name)}</b><div style="font-size:11.5px;color:var(--mute)">${esc(p.desc)} · ${p.id.toUpperCase()}</div></td>
    <td style="white-space:nowrap">${esc(b.name)} <span class="gradebox sm">${gfull(bgname(b))}</span></td>
    <td style="white-space:nowrap">${p.cat}</td>
    <td class="num"><b>₩${fmt(p.gp)}</b><div style="font-size:11px;color:var(--mute);text-decoration:line-through">₩${fmt(p.cp)}</div></td>
    <td class="num">${totalRate(p)}%<div style="font-size:11px;color:var(--mute)">인플 ${(p.rate*100).toFixed(0)} + 플랫폼 ${(PLAT_RATE*100).toFixed(0)}</div></td>
    <td class="num">${fmt(p.stock)}</td>
    <td class="num">${cs.length}건${live?` <span class="st live" style="animation:none">LIVE ${live}</span>`:''}<div style="font-size:11px;color:var(--mute)">₩${fmt(gmvOf(p))}</div></td>
    <td style="white-space:nowrap">${p.exclusive?`<span class="gradebox sm">${gfull(exGradeOf(p))}</span>${p.exclusiveSellerId?' <span class="st green" style="animation:none">확정</span>':''}`:'<span style="color:var(--mute)">—</span>'}</td>
    <td>${pstChip(p.status)}</td>
    <td><div style="display:flex;gap:4px;flex-wrap:wrap">${p.status==='rejected'?`<span class="sub" style="font-size:11px;color:var(--mute)">${esc(p.rejectReason||'')}</span><button class="sm ghost" data-act="approveProduct" data-k="${p.id}">승인으로 변경</button>`:p.status==='pending'?`<button class="sm pri" data-act="approveProduct" data-k="${p.id}">승인</button><button class="sm danger" data-act="rejectProduct" data-k="${p.id}">반려</button>`
      :`<button class="sm ghost" data-act="toggleListing" data-k="${p.id}">${p.status==='listed'?'노출 중단':'재개'}</button>`}
      <button class="sm ghost" data-act="prodDetail" data-k="${p.id}">실적</button><button class="sm ghost" data-act="previewProduct" data-k="${p.id}">상세페이지</button></div></td></tr>`;}).join('')||`<tr><td colspan="10" class="empty">${S.admPQ?`"${esc(S.admPQ)}"에 맞는 상품이 없습니다`:'조건에 맞는 상품이 없습니다'}</td></tr>`}
  </tbody></table></div>`;
}
function vAdminInfluencers(){
  const all=D_().sellers;
  const gf=S.admIG||'all';
  const q=(S.admIQ||'').trim().toLowerCase();
  const base=all.filter(x=>gf==='all'||gname(x)===gf);
  const list=(q?base.filter(x=>[x.name,x.handle,x.cat,x.intro,x.id,PLAT_NAMES[x.platform]||'',(x.channels||[]).map(c=>c.handle).join(' ')].join(' ').toLowerCase().includes(q)):base).sort((a,b)=>b.m3Sales-a.m3Sales);
  const unverified=all.reduce((a,x)=>a+(x.channels||[]).filter(c=>!c.verified).length,0);
  return `<h2 class="pg">인플루언서 <small>가입 ${all.length}명 · 비공개 ${all.filter(x=>x.hidden).length} · 미인증 채널 ${unverified}개</small></h2>
  ${admChips([['all','전체',all.length],...GRADES.map(t=>[t.g,t.g,all.filter(x=>gname(x)===t.g).length]).filter(x=>x[2])],gf,'admIG')}
  ${admSearch('admIQ',S.admIQ,'이름 · 핸들 · 카테고리 · 채널 · 소개 검색',list.length,base.length)}
  <div class="tblw compact"><table>
  <thead><tr><th>인플루언서</th><th>등급</th><th class="num">팔로워</th><th class="num">3개월 매출</th><th class="num">판매</th><th>채널 인증</th><th class="num">셀러리</th><th>상태</th><th>관리</th></tr></thead>
  <tbody>${list.map(x=>{const cs=D_().campaigns.filter(c=>c.sellerId===x.id);const done=cs.filter(c=>['LIVE','CLEARING','SETTLED'].includes(c.status)).length;const ch=x.channels||[];const ver=ch.filter(c=>c.verified).length;
    return `<tr><td class="nm"><span class="sc-av ${x.img?'':'em'}" style="width:26px;height:26px;font-size:13px;display:inline-flex;vertical-align:middle;margin-right:6px;${x.img?`background-image:url(${x.img})`:''}">${x.img?'':(SEMOJI[x.id]||'👤')}</span><b>${esc(x.name)}</b> <span style="color:var(--mute);font-size:12px">${platIcon(x)} ${x.handle}</span><div style="font-size:11.5px;color:var(--mute)">${x.cat} · ${esc(x.intro)}</div></td>
    <td><span class="gradebox sm">${gfull(gname(x))}</span></td>
    <td class="num">${fmt(x.followers)}</td><td class="num"><b>₩${fmt(x.m3Sales)}</b></td>
    <td class="num">${done}<span style="color:var(--mute)">/${cs.length}</span></td>
    <td style="white-space:nowrap">${ch.length?`<span class="st ${ver===ch.length?'green':'amber'}" style="animation:none">${ver}/${ch.length} 인증</span>`:'<span style="color:var(--mute)">—</span>'}${x.referredBy?`<div style="font-size:11px;color:var(--mute)">추천: ${seller(x.referredBy).name}</div>`:''}</td>
    <td class="num">${CEL} ${celBal(x.id)}</td>
    <td>${x.hidden?'<span class="st gray" style="animation:none">비공개</span>':'<span class="st green" style="animation:none">공개</span>'}</td>
    <td><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="sm ghost" data-act="admToggleHidden" data-k="${x.id}">${x.hidden?'공개 전환':'비공개 전환'}</button><button class="sm ghost" data-act="admGrant" data-k="${x.id}">${CEL} +3 지급</button></div></td></tr>`;}).join('')||`<tr><td colspan="9" class="empty">"${esc(S.admIQ||'')}"에 맞는 인플루언서가 없습니다</td></tr>`}
  </tbody></table></div>`;
}
function vAdminBrands(){
  const all=D_().brands;
  return `<h2 class="pg">브랜드 <small>입점 ${all.length}개 · 등급·정산정보·자동 제안·셀러리</small></h2>
  <div class="tblw compact"><table>
  <thead><tr><th>브랜드</th><th>등급 · 누적 GMV</th><th class="num">상품</th><th class="num">판매</th><th>정산 정보</th><th class="num">셀러리</th><th>자동 제안</th><th>관리</th></tr></thead>
  <tbody>${all.map(b=>{const ps=D_().products.filter(p=>p.brandId===b.id);const pid=ps.map(p=>p.id);const cs=D_().campaigns.filter(c=>pid.includes(c.productId));const live=cs.filter(c=>c.status==='LIVE').length;const si=b.settleInfo||{};
    return `<tr><td class="nm">${b.logo?`<img src="${b.logo}" alt="" style="width:26px;height:26px;vertical-align:middle;margin-right:6px;border:1.5px solid var(--line-soft)">`:''}<b>${esc(b.name)}</b><div style="font-size:11.5px;color:var(--mute)">${b.cat} · ${esc(b.manager||'')} · ${esc(b.email||'')}${b.referredBy?` · 추천: ${brand(b.referredBy).name}`:''}</div></td>
    <td style="white-space:nowrap"><span class="gradebox sm">${gfull(bgname(b))}</span><div style="font-size:11.5px;color:var(--mute)">₩${fmt(bGmv(b))}</div></td>
    <td class="num">${ps.length}<div style="font-size:11px;color:var(--mute)">노출 ${ps.filter(p=>p.status==='listed').length} · 대기 ${ps.filter(p=>p.status==='pending').length}</div></td>
    <td class="num">${cs.length}${live?` <span class="st live" style="animation:none">LIVE ${live}</span>`:''}</td>
    <td>${si.account?`<span class="st green" style="animation:none">등록</span><div style="font-size:11px;color:var(--mute)">${esc(si.bank)} · 사업자 ${esc(si.bizNo||'—')}</div>`:'<span class="st amber" style="animation:none">미등록</span>'}</td>
    <td class="num">${CEL} ${celBal(b.id)}</td>
    <td><button class="sm ${b.autoPropose?'pri':'ghost'}" data-act="toggleAutoPropose" data-k="${b.id}">${b.autoPropose?'ON':'OFF'}</button></td>
    <td><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="sm ghost" data-act="admGrant" data-k="${b.id}">${CEL} +3 지급</button><button class="sm ghost" data-act="admBrandProducts" data-k="${b.id}">상품 보기</button></div></td></tr>`;}).join('')}
  </tbody></table></div>`;
}
function vAdminOrders(){
  const os=D_().orders.slice().sort((a,b)=>b.at<a.at?-1:b.at>a.at?1:(+b.id.slice(1))-(+a.id.slice(1)));
  const f=S.admOF||'all';
  const list=os.filter(o=>f==='all'||(f==='PAID'&&o.status==='PAID'&&!o.tracking)||(f==='SHIP'&&o.status==='PAID'&&o.tracking)||(f==='REFUNDED'&&o.status==='REFUNDED')).slice(0,60);
  const c=k=>os.filter(o=>k==='PAID'?(o.status==='PAID'&&!o.tracking):k==='SHIP'?(o.status==='PAID'&&o.tracking):o.status==='REFUNDED').length;
  return `<h2 class="pg">주문·CS <small>전체 주문 ${fmt(os.length)}건 · 환불 처리·배송 상태 확인 (최근 60건 표시)</small></h2>
  ${admChips([['all','전체',os.length],['PAID','결제완료·미발송',c('PAID')],['SHIP','배송중',c('SHIP')],['REFUNDED','환불',c('REFUNDED')]],f,'admOF')}
  <div class="tblw compact"><table>
  <thead><tr><th>주문</th><th>상품 · 옵션</th><th>판매</th><th class="num">금액</th><th>배송</th><th>상태</th><th>관리</th></tr></thead>
  <tbody>${list.map(o=>{const cp=camp(o.campaignId),p=prod(cp.productId),sl=seller(cp.sellerId),b=brand(p.brandId);
    return `<tr><td class="nm"><b>${o.id.toUpperCase()}</b><div style="font-size:11.5px;color:var(--mute)">${md(P(o.at))} · ${esc(o.buyer)}</div></td>
    <td>${pIcon(p,22)} ${esc(p.name)}<div style="font-size:11.5px;color:var(--mute)">${o.opt?esc(o.opt)+' · ':''}${o.qty}개</div></td>
    <td style="white-space:nowrap">${platIcon(sl)} ${esc(sl.name)}<div style="font-size:11.5px;color:var(--mute)">${esc(b.name)} · ${cp.id.toUpperCase()}</div></td>
    <td class="num"><b>₩${fmt(o.unit*o.qty)}</b></td>
    <td>${o.tracking?`<span class="st blue" style="animation:none">배송중</span><div style="font-size:11px;color:var(--mute)">${esc(o.courier||'')} ${esc(o.tracking)}</div>`:o.status==='PAID'?'<span class="st amber" style="animation:none">미발송</span>':'—'}</td>
    <td>${o.status==='PAID'?'<span class="st green" style="animation:none">결제완료</span>':'<span class="st red" style="animation:none">환불</span>'}</td>
    <td><div style="display:flex;gap:4px;flex-wrap:wrap"><button class="sm ghost" data-act="open" data-k="${cp.id}">스레드</button>${o.status==='PAID'&&cp.status!=='SETTLED'?`<button class="sm danger" data-act="refund" data-k="${o.id}">환불 처리</button>`:o.status==='PAID'?'<span class="sub" style="color:var(--mute);font-size:11px">정산 완료 · 환불 불가</span>':''}</div></td></tr>`;}).join('')||'<tr><td colspan="7" class="empty">주문이 없습니다</td></tr>'}
  </tbody></table></div>
  ${(()=>{const all=csList().slice().sort((a,b)=>(a.status==='OPEN'?-1:1)-(b.status==='OPEN'?-1:1)||(a.at<b.at?1:-1));
    const open=all.filter(x=>x.status==='OPEN').length;
    return `<div class="sec">고객 문의 <span class="badge">${open}</span> <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--mute)">— 문의는 브랜드에 바로 배정되며, 관리자는 처리 현황을 확인합니다</span></div>
    <div class="tblw"><table>
    <thead><tr><th>접수</th><th>상품 · 판매</th><th>브랜드</th><th>유형</th><th>내용</th><th>상태</th></tr></thead>
    <tbody>${all.map(x=>{const c=camp(x.cid),p=c&&prod(c.productId),b=p&&brand(p.brandId);
      return `<tr class="clickable" data-act="open" data-k="${x.cid}">
      <td class="num">${md(P(x.at))}<div style="font-size:11px;color:var(--mute)">${x.orderId?esc(x.orderId.toUpperCase()):'—'}</div></td>
      <td>${p?pIcon(p,22):''} ${p?esc(p.name):'—'}<div style="font-size:11px;color:var(--mute)">${c?esc(seller(c.sellerId).handle):''}</div></td>
      <td class="brd-cell">${b?esc(b.name):'—'}</td><td>${esc(x.type)}</td>
      <td style="max-width:280px">${esc(x.msg.slice(0,42))}${x.msg.length>42?'…':''}</td>
      <td>${csStatusChip(x.status)}</td></tr>`;}).join('')||'<tr><td colspan="6" class="empty">접수된 고객 문의가 없습니다</td></tr>'}
    </tbody></table></div>`;})()}`;
}
function vAdminReview(){
  const pend=D_().products.filter(p=>p.status==='pending');
  return `<h2 class="pg">상품 검수 <small>금지 표현·필수 표시사항 체크 후 노출 승인</small></h2>
  <div class="notice"><b>카테고리 정책</b> — ${CAT_POLICY}<br>건강기능식품은 표시광고 사전 심의 대상입니다. 검수 체크리스트: 질병 치료·예방 표현 금지, 기능성 문구는 식약처 인정 범위 내, 이벤트 문구의 소비자 오인 여부.</div>
  <div class="listcard">${pend.map(p=>`<div class="rowitem">
    ${pIcon(p,38)}
    <div class="grow"><div class="nm">${esc(p.name)}</div><div class="sub">${brand(p.brandId).name} · 판매가 ₩${fmt(p.gp)} · 수수료 ${(p.rate*100).toFixed(0)}%</div></div>
    <button class="sm pri" data-act="approveProduct" data-k="${p.id}">승인 · 노출</button>
    <button class="sm danger" data-act="rejectProduct" data-k="${p.id}">반려</button>
  </div>`).join('')||'<div class="empty">검수 대기 상품이 없습니다</div>'}</div>`;
}
function vAdminSettle(){
  const ready=D_().campaigns.filter(c=>c.status==='CLEARING');
  const dueList=ready.filter(c=>settleDue(c)<=today());
  return `<h2 class="pg">정산 실행 <small>판매 종료 + ${CLEAR_DAYS}일 경과 건 일괄 지급</small></h2>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><span class="st ${dueList.length?'amber':'gray'}" style="animation:none">실행 가능 ${dueList.length}건</span><span class="st gray" style="animation:none">대기 ${ready.length-dueList.length}건</span><button class="pri sm" data-act="runSettleAll" ${dueList.length?'':'disabled style="opacity:.5"'}>실행 가능 건 일괄 정산 (${dueList.length})</button></div>
  <div class="listcard">${ready.map(c=>{const k=calc(c),p=prod(c.productId);const due=settleDue(c);const isDue=due<=today();
    return `<div class="rowitem">
    ${pIcon(p,38)}
    <div class="grow"><div class="nm">${pIcon(p,20)} ${esc(p.name)} · ${seller(c.sellerId).handle}</div>
      <div class="sub">확정 ₩${fmt(k.net)} → 브랜드 ₩${fmt(k.brandPay)} + 인플루언서 ₩${fmt(k.sfTotal*(1-sellerWht(seller(c.sellerId))))} · 정산 기준일 ${md(due)}${(!seller(c.sellerId).settleInfo||!(prod(c.productId)&&brand(prod(c.productId).brandId).settleInfo))?' · <span class="st red" style="animation:none">정산 정보 미등록 → 지급 보류</span>':''}</div></div>
    ${isDue?`<button class="sm pri" data-act="runSettle" data-k="${c.id}">정산 실행</button>`
      :`<span class="st amber">D-${Math.ceil((due-today())/DAY)}</span> <button class="sm ghost" data-act="ffwd" data-k="${c.id}">⏩ 3주 경과(시뮬)</button>`}
  </div>`;}).join('')||'<div class="empty">정산 대기 건이 없습니다</div>'}</div>
  <div class="sec">정산 완료</div>
  <div class="tblw"><table><thead><tr><th>일자</th><th>판매</th><th class="num">확정 매출</th><th class="num">브랜드 지급</th><th class="num">인플루언서 지급</th><th class="num">플랫폼 수익</th></tr></thead>
  <tbody>${D_().settlements.map(s=>`<tr><td class="num">${md(P(s.at))}</td><td>${esc(s.title)}${(s.holdS||s.holdB)?` <span class="st red" style="animation:none">지급 보류 · ${[s.holdS?'인플':'',s.holdB?'브랜드':''].filter(Boolean).join('·')} 계좌 미등록</span>`:''}</td><td class="num">₩${fmt(s.net)}</td><td class="num">₩${fmt(s.brandPay)}</td><td class="num">₩${fmt(s.sellerPay)}</td><td class="num" style="color:var(--accent-ink)">₩${fmt(s.platFee)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">아직 없음</td></tr>'}
  </tbody></table></div>
`;
}

/* ============ ADMIN: 매칭·자동 제안 / 매출·순수익 ============ */
function vAdminMatch(){
  const rising=D_().sellers.map(s=>({s,g:growthOf(s)})).sort((a,b)=>b.g-a.g).slice(0,6);
  const cands=autoMatches();
  const autoCs=D_().campaigns.filter(c=>c.auto);
  return `<h2 class="pg">매칭·자동 제안 <small>요즘 뜨는 인플루언서를 브랜드 상품과 자동 매칭 · 브랜드별 자동 제안 ON/OFF</small></h2>
  <div class="grid g2">
    <div class="card">
      <div class="lbl-sm" style="margin-bottom:4px">📈 요즘 뜨는 인플루언서</div>
      <div style="font-size:11px;color:var(--mute);margin-bottom:12px">최근 게시물 반응 성장률 (후반 평균 vs 전반 평균) · 관리자는 비공개 인플루언서도 실명 표시</div>
      ${rising.map(({s,g},i)=>`<div class="hb-row" style="cursor:default">
        <span class="hb-nm">${i+1}. ${platIcon(s)} ${esc(s.name)} ${s.handle}${s.hidden?' <span class="st gray" style="animation:none">비공개</span>':''} <span class="gradebox sm">${gfull(gname(s))}</span></span>
        <div class="hb-track"><div class="hb-bar ${i===0?'top':''}" style="width:${Math.max(6,Math.min(100,g/Math.max(1,rising[0].g)*100))}%"></div></div>
        <span class="hb-val" style="color:var(--red)">▲${g.toFixed(1)}%</span></div>`).join('')}
    </div>
    <div class="card">
      <div class="lbl-sm" style="margin-bottom:10px">🤖 브랜드 자동 제안 설정</div>
      ${D_().brands.map(b=>`<div class="rowitem" style="cursor:default"><div class="grow"><div class="nm">${esc(b.name)} <span class="gradebox sm">${gfull(bgname(b))}</span></div><div class="sub">${b.cat} · 노출 상품 ${D_().products.filter(p=>p.brandId===b.id&&p.status==='listed').length}개 · 보유 ${CEL} ${celBal(b.id)}</div></div>
        <button class="sm ${b.autoPropose?'pri':'ghost'}" data-act="toggleAutoPropose" data-k="${b.id}">${b.autoPropose?'자동 제안 ON':'자동 제안 OFF'}</button></div>`).join('')}
      <p style="font-size:12px;color:var(--mute);margin:10px 0 0">ON이면 매일 카테고리 적합도 × 성장세 × 매출/팔로워 점수로 상위 인플루언서에게 브랜드 명의로 자동 제안합니다. 다이아·블랙 대상은 브랜드 셀러리 ${CEL} 10이 자동 차감되고, 부족하면 보류됩니다.</p>
    </div>
  </div>
  <div class="sec">자동 제안 후보 <span class="badge">${cands.length}</span></div>
  <div class="card" style="padding:0;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px 6px">
      <div style="font-size:12.5px;color:var(--mute)">상품별 상위 2명 · 진행 중 캠페인·독점 확정 상품 제외 · 실행 시 상위 5건 발송</div>
      <button class="pri sm" data-act="runAutoPropose" ${cands.length?'':'disabled style="opacity:.5"'}>오늘 자동 제안 실행 (${Math.min(5,cands.length)}건)</button>
    </div>
    <div class="tblw" style="margin:0;box-shadow:none;padding-top:0"><table>
    <thead><tr><th>브랜드 · 상품</th><th>인플루언서</th><th class="num">성장세</th><th class="num">3개월 매출</th><th class="num">매칭 점수</th></tr></thead>
    <tbody>${cands.map(({b,p,s,growth,score})=>`<tr><td><b>${esc(p.name)}</b> <span class="sub" style="color:var(--mute)">${esc(b.name)} · ${p.cat}</span></td>
      <td>${platIcon(s)} ${esc(s.name)} ${s.handle}${s.hidden?' <span class="st gray" style="animation:none">비공개</span>':''} <span class="gradebox sm">${gfull(gname(s))}</span></td>
      <td class="num" style="color:var(--red)">▲${growth.toFixed(1)}%</td><td class="num">₩${fmt(s.m3Sales)}</td><td class="num"><b>${score}</b></td></tr>`).join('')||'<tr><td colspan="5" class="empty">자동 제안 ON 브랜드의 후보가 없습니다</td></tr>'}
    </tbody></table></div>
  </div>
  <div class="sec">자동 제안 이력 <span class="badge">${autoCs.length}</span></div>
  <div class="listcard">${autoCs.map(c=>campRow(c,{who:'brand'})).join('')||'<div class="empty">아직 자동 제안이 없습니다 — 위에서 실행해보세요</div>'}</div>`;
}
function vAdminRevenue(){
  const cs=D_().campaigns.filter(c=>['LIVE','CLEARING','SETTLED'].includes(c.status)||c.samplePaid);
  const T={gross:0,refund:0,net:0,sampleNet:0,pg:0,sf:0,brandPay:0,pfGross:0,gBonus:0,ref:0,bref:0,bDisc:0,costs:0,pf:0,vat:0,pfNet:0};
  cs.forEach(c=>{const k=calc(c);T.gross+=k.gross;T.refund+=k.refund;T.net+=k.net;T.sampleNet+=k.sampleNet||0;T.pg+=k.pg;T.sf+=k.sfTotal;T.brandPay+=k.brandPay;T.pfGross+=k.pfGross;T.gBonus+=k.gBonus;T.ref+=k.boost+k.refReward;T.bref+=k.bBoost+k.bReward;T.bDisc+=k.bDisc;T.costs+=k.costs;T.pf+=k.pf;T.vat+=k.vat;T.pfNet+=k.pfNet;});
  const led=D_().celeryLedger||[];
  const topups=led.filter(e=>e.won);const celWon=topups.reduce((a,e)=>a+e.won,0);const celNet=Math.round(celWon/1.1);
  const spent=led.filter(e=>e.delta<0).reduce((a,e)=>a-e.delta,0);
  const all=D_().sellers.concat(D_().brands);
  const earned=all.reduce((a,x)=>a+celEarned(x.id),0), granted=led.filter(e=>e.delta>0&&!e.won).reduce((a,e)=>a+e.delta,0), bal=all.reduce((a,x)=>a+celBal(x.id),0);
  const row=(l,v,cls='',note='')=>`<tr class="${cls}"><td>${l}${note?` <span style="color:var(--mute);font-size:11px">${note}</span>`:''}</td><td class="num">${v}</td></tr>`;
  /* 운영 비용(월): 고정비 + 건당 변동비 — 관리자가 수정 가능(D_().opex) */
  const ox={...OPEX_DEF,...(D_().opex||{})};
  const orders=D_().orders.length, sellersN=D_().sellers.length, crawlN=(Object.values(D_().external||{}).flat().length);
  const celCover=D_().campaigns.reduce((a,c)=>a+(((c.samplePaid||{}).cel)||0)*SAMPLE_CEL_WON,0);   // 샘플 셀러리 결제분 — 브랜드엔 원화 정산, 플랫폼 부담
  const varCost={
    celCover,
    kakao:ox.kakaoPer*orders*3,                       // 결제·배송·정산 알림톡 3건/주문
    claude:ox.claudePerCrawl*sellersN*30+ox.claudePerMatch*(D_().campaigns.filter(c=>c.auto).length+crawlN), // 인플루언서 일일 크롤링 분석 + 자동매칭/예상매출 추론
    pgFixed:ox.pgFixed
  };
  const fixedTotal=ox.server+ox.db+ox.cs+ox.domain+ox.misc;
  const varTotal=varCost.kakao+varCost.claude+varCost.pgFixed+varCost.celCover;
  const opexTotal=fixedTotal+varTotal;
  const finalNet=T.pfNet-opexTotal;
  const takeNet=T.net?T.pfNet/T.net:0;
  const bep=takeNet>0?opexTotal/takeNet:0;
  const inp=(id,v)=>`<input id="ox_${id}" type="number" value="${v}" step="1000" style="width:110px;text-align:right;padding:4px 8px;font-family:'IBM Plex Mono',monospace;font-size:12px">`;
  const orow=(l,id,v,note='')=>`<tr><td>${l}${note?` <span style="color:var(--mute);font-size:11px">${note}</span>`:''}</td><td class="num">${inp(id,v)}</td></tr>`;
  return `<h2 class="pg">매출·순수익 <small>확정 매출 기준 · PG수수료·보상비용·부가세를 제외한 플랫폼 순수익</small></h2>
  <div class="grid g4">
    <div class="card kpi"><div class="lbl">확정 거래액 (GMV)</div><div class="val">₩${fmt(T.net)}</div><div class="sub">결제 ₩${fmt(T.gross)} − 환불 ₩${fmt(T.refund)}</div></div>
    <div class="card kpi"><div class="lbl">플랫폼 수수료 매출</div><div class="val">₩${fmt(T.pf)}</div><div class="sub">${(PLAT_RATE*100).toFixed(0)}% ₩${fmt(T.pfGross)} − 보상·할인 ₩${fmt(T.costs)}</div></div>
    <div class="card kpi"><div class="lbl">플랫폼 순수익 (VAT 제외)</div><div class="val" style="color:var(--accent-ink)">₩${fmt(T.pfNet)}</div><div class="sub">부가세 ₩${fmt(T.vat)} 제외 · 순 테이크레이트 ${T.net?(T.pfNet/T.net*100).toFixed(2):'0.00'}%</div></div>
    <div class="card kpi"><div class="lbl">셀러리 충전 매출</div><div class="val">₩${fmt(celWon)}</div><div class="sub">공급가 ₩${fmt(celNet)} · 충전 ${topups.length}건 · 소진 ${spent}🥬</div></div>
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><h4>손익 요약 — 판매 ${cs.length}건</h4>
      <table class="stmt" style="min-width:0;font-size:12.5px">
        ${row('총 결제액','₩'+fmt(T.gross))}
        ${row('환불','−₩'+fmt(T.refund))}
        ${row('<b>확정 매출 (GMV)</b>','<b>₩'+fmt(T.net)+'</b>')}
        ${row('　└ 인플루언서 샘플 구매분','₩'+fmt(T.sampleNet),'','인플 수수료 0 · 플랫폼 10% 동일')}
        ${row('PG 수수료 '+(PG_RATE*100).toFixed(1)+'%','−₩'+fmt(T.pg),'','브랜드 정산에서 차감 · 플랫폼 수익 아님')}
        ${row('인플루언서 지급','−₩'+fmt(T.sf),'','기본 + 등급 보너스 + 추천 부스트')}
        ${row('브랜드 정산액','−₩'+fmt(T.brandPay))}
        ${row('<b>플랫폼 수수료 총액 '+(PLAT_RATE*100).toFixed(0)+'%</b>','<b>₩'+fmt(T.pfGross)+'</b>')}
        ${row('　− 인플루언서 등급 보너스','−₩'+fmt(T.gBonus))}
        ${row('　− 인플루언서 추천 보상·부스트','−₩'+fmt(T.ref))}
        ${row('　− 브랜드 추천 보상·할인','−₩'+fmt(T.bref))}
        ${row('　− 브랜드 등급 수수료 할인','−₩'+fmt(T.bDisc))}
        ${row('수수료 매출 (VAT 포함)','₩'+fmt(T.pf))}
        ${row('　− 부가세 10%','−₩'+fmt(T.vat))}
        ${row('<b>플랫폼 순수익</b>','<b style="color:var(--accent-ink)">₩'+fmt(T.pfNet)+'</b>','tot')}
      </table></div>
    <div class="card"><h4>셀러리 포인트 손익</h4>
      <table class="stmt" style="min-width:0;font-size:12.5px">
        ${row('충전 결제액 (VAT 포함)','₩'+fmt(celWon))}
        ${row('　− 부가세','−₩'+fmt(celWon-celNet))}
        ${row('<b>충전 순매출</b>','<b>₩'+fmt(celNet)+'</b>','tot')}
        ${row('무상 발행 (가입·이벤트)',granted+' 🥬')}
        ${row('매출 달성 획득 (₩500만당 1)',earned+' 🥬')}
        ${row('소진',spent+' 🥬')}
        ${row('미사용 잔액 (부채)',bal+' 🥬','','충전가 환산 ₩'+fmt(bal*20000))}
      </table>
      <p style="font-size:11.5px;color:var(--mute);margin-top:10px">셀러리 1개 = 충전가 ₩20,000 기준. 무상 발행·획득분은 매출이 아닌 마케팅 비용(잔액은 부채)으로 잡습니다.</p></div>
  </div>
  <div class="sec">운영 비용 · 최종 순이익 <span style="font-weight:400;font-size:12px;color:var(--mute);margin-left:8px">서버·DB·Claude API·알림톡 등 (월 기준 추정 · 수정 가능)</span></div>
  <div class="grid g2">
    <div class="card"><h4>운영 비용 입력 (월)</h4>
      <table class="stmt" style="min-width:0;font-size:12.5px">
        ${orow('서버·호스팅 (Vercel Pro)','server',ox.server)}
        ${orow('DB·스토리지·인증 (Supabase Pro)','db',ox.db)}
        ${orow('CS 툴 (채널톡)','cs',ox.cs)}
        ${orow('도메인·이메일·모니터링','domain',ox.domain)}
        ${orow('기타 SaaS·회계','misc',ox.misc)}
        ${orow('PG 월 고정비 (토스 지급대행)','pgFixed',ox.pgFixed)}
        ${orow('알림톡 단가 (₩/건)','kakaoPer',ox.kakaoPer,'주문당 결제·배송·정산 3건')}
        ${orow('Claude API · 인플루언서 크롤링 분석 (₩/명·일)','claudePerCrawl',ox.claudePerCrawl,'외부 판매 감지·반응 지표')}
        ${orow('Claude API · 자동 매칭/예상 매출 추론 (₩/건)','claudePerMatch',ox.claudePerMatch)}
      </table>
      <div class="btnrow" style="margin-top:12px"><button class="pri sm" data-act="saveOpex">비용 저장 · 재계산</button><button class="sm ghost" data-act="resetOpex">기본값</button></div>
    </div>
    <div class="card"><h4>비용 집계 → 최종 순이익</h4>
      <table class="stmt" style="min-width:0;font-size:12.5px">
        ${row('고정비 합계 (월)','−₩'+fmt(fixedTotal))}
        ${row('　알림톡','−₩'+fmt(varCost.kakao),'',fmt(orders)+'건 × 3 × ₩'+fmt(ox.kakaoPer))}
        ${row('　Claude API','−₩'+fmt(varCost.claude),'',sellersN+'명 × 30일 크롤링 + 추론 '+(D_().campaigns.filter(c=>c.auto).length+crawlN)+'건')}
        ${row('　PG 고정비','−₩'+fmt(varCost.pgFixed))}
        ${row('　샘플 셀러리 결제 보전','−₩'+fmt(varCost.celCover),'','인플루언서가 🥬로 낸 샘플값을 브랜드에 원화 지급')}
        ${row('<b>운영 비용 합계</b>','<b>−₩'+fmt(opexTotal)+'</b>')}
        ${row('플랫폼 순수익 (VAT 제외)','₩'+fmt(T.pfNet))}
        ${row('<b>운영비 차감 최종 순이익</b>','<b style="color:'+(finalNet>=0?'var(--accent-ink)':'var(--danger)')+'">'+(finalNet<0?'−':'')+'₩'+fmt(Math.abs(Math.round(finalNet)))+'</b>','tot')}
        ${row('손익분기 월 GMV','₩'+fmt(Math.round(bep)),'','운영비 ÷ 순 테이크레이트 '+(takeNet*100).toFixed(2)+'%')}
        ${row('운영비율 (운영비 ÷ GMV)',T.net?(opexTotal/T.net*100).toFixed(2)+'%':'—')}
      </table>
      <p style="font-size:11.5px;color:var(--mute);margin-top:10px">PG 1.9%는 브랜드 정산에서 차감되는 통과 비용이라 위 순수익에 이미 반영(플랫폼 부담 아님). 운영비는 월 단위 추정치이며, 확정 매출은 누적 기준이라 실서비스에서는 월별로 끊어 봅니다.</p></div>
  </div>
  <div class="sec">판매별 손익</div>
  <div class="tblw"><table>
  <thead><tr><th>판매</th><th class="num">확정 매출</th><th class="num">PG</th><th class="num">인플루언서</th><th class="num">브랜드</th><th class="num">수수료 ${(PLAT_RATE*100).toFixed(0)}%</th><th class="num">보상·할인</th><th class="num">VAT</th><th class="num">순수익</th><th>상태</th></tr></thead>
  <tbody>${cs.map(c=>{const k=calc(c),p=prod(c.productId);
    return `<tr class="clickable" data-act="open" data-k="${c.id}"><td><b>${esc(p.name)}</b> <span class="sub" style="color:var(--mute)">${seller(c.sellerId).handle}</span></td><td class="num">₩${fmt(k.net)}</td><td class="num">₩${fmt(k.pg)}</td><td class="num">₩${fmt(k.sfTotal)}</td><td class="num">₩${fmt(k.brandPay)}</td><td class="num">₩${fmt(k.pfGross)}</td><td class="num">−₩${fmt(k.costs)}</td><td class="num">−₩${fmt(k.vat)}</td><td class="num"><b>₩${fmt(k.pfNet)}</b></td><td>${stChip(c.status)}</td></tr>`;}).join('')||'<tr><td colspan="10" class="empty">확정 매출이 있는 판매가 없습니다</td></tr>'}
  </tbody></table></div>`;
}
