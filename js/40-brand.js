/* ============ BRAND ============ */
function vBrandHome(){
  const me=S.actingBrand, bd=brand(me);
  const myP=D_().products.filter(p=>p.brandId===me);
  const myPid=myP.map(p=>p.id);
  const cs=D_().campaigns.filter(c=>myPid.includes(c.productId));
  const {cs:pendCs,xr,n:pendN}=brandPending();
  const live=cs.filter(c=>c.status==='LIVE'), soon=cs.filter(c=>c.status==='SCHEDULE_CONFIRMED'), clearing=cs.filter(c=>c.status==='CLEARING');
  const liveNet=live.reduce((a,c)=>a+calc(c).net,0);
  const pendPay=clearing.reduce((a,c)=>a+calc(c).brandPay,0);
  const monthPay=cs.filter(c=>c.status==='SETTLED'&&(c.settledAt||'').slice(0,7)===ymd(today()).slice(0,7)).reduce((a,c)=>a+calc(c).brandPay,0);
  const cids=cs.map(c=>c.id);
  const unshipped=D_().orders.filter(o=>cids.includes(o.campaignId)&&o.status==='PAID'&&!o.tracking).length;
  const todayStr=ymd(today());
  const heroLine = pendN ? `승인 대기 <em>${pendN}건</em>부터 확인해볼까요?`
    : csOpen(S.actingBrand).length ? `답변을 기다리는 고객 문의가 <em>${csOpen(S.actingBrand).length}건</em> 있어요.`
    : unshipped ? `미발송 주문 <em>${unshipped}건</em>이 기다려요.`
    : live.length ? `지금 판매 <em>${live.length}건</em>이 진행 중이에요.`
    : `새 상품을 올리고 인플루언서를 만나보세요.`;
  /* 2 승인·처리 대기 */
  const LBL={SAMPLE_REQUESTED:['샘플 요청 검토','검토'],SAMPLE_APPROVED:['샘플 발송 처리','발송'],SAMPLE_PURCHASED:['샘플 발송 처리 (구매 완료)','발송'],SCHEDULE_PROPOSED:['일정 승인','승인']};
  const pendHtml=`<div class="sec">승인·처리 대기 ${pendN?`<span class="badge">${pendN}</span>`:''}</div>
    <div class="listcard">${pendCs.map(c=>{const p=prod(c.productId),sl=seller(c.sellerId);const [l,btn]=LBL[c.status];
      return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}
      <div class="grow"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${platIcon(sl)} ${esc(sl.name)} ${sl.handle} <span class="gradebox sm">${gfull(gname(sl))}</span></span></div>
      <div class="sub">${l}${c.status==='SCHEDULE_PROPOSED'&&c.propStart?` · ${md(P(c.propStart))}–${md(P(c.propEnd))} · 재고 ${fmt(c.propQty)}`:''} · 팔로워 ${fmt(sl.followers)}</div></div>
      <button class="pri sm">${btn}</button></div>`;}).join('')}
    ${xr.map(r=>{const sl=seller(r.sellerId),p=prod(r.productId);
      return `<div class="rowitem" style="cursor:default">
      <div class="grow"><div class="nm"><span class="gradebox sm">${gfull(gname(sl))}</span> ${platIcon(sl)} ${esc(sl.name)} <span class="sub" style="font-weight:400">${sl.handle}</span> → ${esc(p.name)} 독점권 신청</div><div class="sub">3개월 매출 ₩${fmt(sl.m3Sales)} · 팔로워 ${fmt(sl.followers)} · 조건 ${gfull(exGradeOf(p))} 이상 충족 ✓${sl.hidden?' · 비공개 프로필(신청으로 공개)':''}</div></div>
      <div class="rowacts"><button class="pri sm" data-act="approveExcl" data-k="${r.id}">승인</button><button class="sm danger" data-act="rejectExcl" data-k="${r.id}">거절</button></div></div>`;}).join('')}
    ${pendN?'':'<div class="empty" style="padding:14px">대기 중인 요청이 없습니다 ✓</div>'}</div>`;
  /* 3 진행 중·확정 판매 */
  const liveCard=c=>{const p=prod(c.productId),sl=seller(c.sellerId),k=calc(c);const os=campOrders(c.id).filter(o=>o.status==='PAID');const tod=os.filter(o=>o.at===todayStr);const un=os.filter(o=>!o.tracking).length;const left=(c.qty||0)-soldQty(c.id);const dd=Math.max(0,Math.ceil((addD(P(c.end),1)-new Date())/DAY));
    return `<div class="card" style="padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="display:flex;align-items:center;gap:9px;min-width:0">${pIcon(p,30)}<span style="min-width:0"><b style="font-size:15px">${esc(p.name)}</b> <span class="sub" style="color:var(--mute);font-size:12px">${platIcon(sl)} ${esc(sl.name)} ${sl.handle} · 수수료 ${(p.rate*100).toFixed(0)}%</span></span></div><div style="display:flex;gap:6px;align-items:center">${un?`<span class="st amber" style="animation:none">미발송 ${un}건</span>`:''}${stChip('LIVE')}</div></div>
      <div class="mini-stats" style="margin:12px 0 10px">
        <div><span class="ms-l">오늘 매출</span><span class="ms-v">₩${fmt(tod.reduce((a,o)=>a+o.unit*o.qty,0))}</span></div>
        <div><span class="ms-l">확정 매출</span><span class="ms-v">₩${fmt(k.net)}</span></div>
        <div><span class="ms-l">주문</span><span class="ms-v">${k.paidCnt}건</span></div>
        <div><span class="ms-l">마감 · 잔여</span><span class="ms-v">D-${dd} · ${fmt(Math.max(0,left))}개</span></div>
      </div>
      <div class="btnrow one"><button class="sm ghost" data-act="open" data-k="${c.id}">스레드</button><button class="sm ghost" data-act="preview" data-k="${c.id}">구매 페이지</button><button class="sm ghost" data-act="poCSV">발주서 CSV</button><button class="sm ghost" data-act="screen" data-k="sales">실시간 매출</button></div>
    </div>`;};
  const soonRow=c=>{const p=prod(c.productId),sl=seller(c.sellerId);const dd=Math.ceil((P(c.start)-today())/DAY);return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}<div class="grow"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${platIcon(sl)} ${esc(sl.name)}</span></div><div class="sub">${md(P(c.start))}–${md(P(c.end))} · 배정 재고 ${fmt(c.qty||0)}</div></div><span class="st blue" style="animation:none">오픈 D-${dd}</span></div>`;};
  const salesHtml=`<div class="sec">진행 중 · 확정 판매</div>
    ${live.length?`<div class="grid ${live.length>1?'g2':''}" style="margin-bottom:${soon.length||clearing.length?'10px':'0'}">${live.map(liveCard).join('')}</div>`:''}
    ${(soon.length||clearing.length)?`<div class="listcard">${soon.map(soonRow).join('')}${clearing.map(c=>campRow(c,{who:'brand'})).join('')}</div>`:''}
    ${(!live.length&&!soon.length&&!clearing.length)?'<div class="listcard"><div class="empty">진행 중 판매 없음 — 인플루언서 갤러리에서 제안해보세요</div></div>':''}`;
  /* 4 내 장부 */
  const ledger=`<div class="sec">내 장부</div>
  <div class="card" style="padding:16px 18px"><div class="mini-stats ledger4">
    <div class="go" data-act="screen" data-k="sales" title="실시간 매출"><span class="ms-l">진행 중 판매 매출</span><span class="ms-v">₩${fmt(liveNet)}</span><span class="ms-s">확정 기준 · ${live.length}건 LIVE</span></div>
    <div class="go" data-act="screen" data-k="settle" title="정산"><span class="ms-l">정산 예정액</span><span class="ms-v" style="color:var(--money)">₩${fmt(pendPay)}</span><span class="ms-s">환불기간 ${clearing.length}건 · 브랜드 정산 기준</span></div>
    <div class="go" data-act="screen" data-k="settle" title="정산"><span class="ms-l">이번 달 확정 정산</span><span class="ms-v">₩${fmt(monthPay)}</span><span class="ms-s">정산 완료 기준</span></div>
    <div class="go" data-act="screen" data-k="orders" title="주문·발주"><span class="ms-l">미발송 주문</span><span class="ms-v" ${unshipped?'style="color:var(--danger)"':''}>${unshipped}건</span><span class="ms-s">송장 업로드 → 배송중</span></div>
  </div></div>`;
  /* 5 인플루언서 찾기 */
  const bsrow=(sl,note)=>`<div class="rowitem" data-act="sellerProfile" data-k="${sl.id}" title="프로필 · 데이터 보기">
    ${sl.img?`<div class="sc-av" style="width:40px;height:40px;background-image:url('${sl.img}')"></div>`:`<div class="sc-av em" style="width:40px;height:40px;font-size:18px">${SEMOJI[sl.id]||'⭐'}</div>`}
    <div class="grow" style="min-width:0"><div class="nm"><span class="gradebox sm">${gfull(gname(sl))}</span> ${esc(sl.name)} <span style="color:var(--mute);font-weight:400;font-size:12px">${platIcon(sl)} ${sl.handle}</span></div>
    <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${note}</div></div>
    <button class="pri sm" data-act="invite" data-k="${sl.id}">제안</button></div>`;
  const rel=CATMAP[bd.cat]||[];
  const recs3=D_().sellers.filter(x=>!x.hidden&&!cs.some(c=>c.sellerId===x.id&&!['REJECTED','PASSED','DECLINED','SETTLED'].includes(c.status))).map(x=>({s:x,fit:rel.includes(x.cat),score:(rel.includes(x.cat)?2:0)+growthOf(x)/50+(x.m3Sales/x.followers)/300})).sort((a,b)=>b.score-a.score).slice(0,3);
  const views=(D_().productViews||[]).filter(v=>myPid.includes(v.productId)).slice(0,3);
  const findHtml=`<div class="sec">인플루언서 찾기</div>
  <div class="grid g2">
    <div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">✦ ${esc(bd.name)} 맞춤 추천</div>
      <div class="listcard" style="margin:0;box-shadow:none">${recs3.map(r=>bsrow(r.s,`${r.fit?'카테고리 적합':'매출 효율 상위'} · 성장세 ▲${growthOf(r.s).toFixed(1)}% · ${r.s.cat} · 3개월 ₩${fmt(r.s.m3Sales)}`)).join('')||'<div class="empty">추천할 인플루언서가 없습니다</div>'}</div>
      <div style="padding:10px 18px"><button class="sm ghost" data-act="screen" data-k="gallery">갤러리에서 더 보기 →</button></div></div>
    <div class="card" style="padding:0;overflow:hidden"><div class="lbl-sm" style="padding:16px 18px 6px">👀 내 상품을 조회한 인플루언서</div>
      <div class="listcard" style="margin:0;box-shadow:none">${views.map(v=>{const sl=seller(v.sellerId),p=prod(v.productId);return bsrow(sl,`${pIcon(p,18)} ${esc(p.name)} 조회 · ${v.ago} · 팔로워 ${fmt(sl.followers)} · 참여율 ${(sl.likesAvg/sl.followers*100).toFixed(1)}%`);}).join('')||'<div class="empty">최근 조회 기록이 없습니다</div>'}</div></div>
  </div>`;
  /* 6 소식 + 상품 현황 + TOP5(축소) */
  const scout1=D_().sellers.find(x=>x.hidden);
  const fresh1=D_().sellers.filter(x=>!x.hidden).slice(-1)[0];
  const newsHtml=`<div class="card" style="padding:0;overflow:hidden">
    <div class="lbl-sm" style="padding:16px 18px 6px">📢 인플루언서 소식</div>
    <div class="news">
      <div class="news-item" data-act="screen" data-k="gallery"><span class="nb hot">급증</span><div><b>${CAT_TRENDS[0].cat}</b> 인플루언서 활동 급증 — ${CAT_TRENDS[0].note}</div></div>
      ${scout1?`<div class="news-item" data-act="topSeller" data-k="${scout1.id}"><span class="nb excl">스카우트</span><div>${gfull(gname(scout1))} <b>○○○ 인플루언서</b> 프로필 공개 — 3개월 ₩${fmt(scout1.m3Sales)} · ${scout1.cat}</div></div>`:''}
      ${fresh1?`<div class="news-item" data-act="screen" data-k="gallery"><span class="nb new">NEW</span><div><b>${esc(fresh1.name)} ${fresh1.handle}</b> 신규 합류 — ${fresh1.cat} · 팔로워 ${fmt(fresh1.followers)}</div></div>`:''}
    </div></div>`;
  const pc=k=>myP.filter(p=>p.status===k).length;
  const prodHtml=`<div class="card kpi go" data-act="screen" data-k="products" title="상품 관리"><div class="lbl-sm lbl">상품 현황</div>
    <div class="mini-stats" style="margin-top:10px"><div><span class="ms-l">노출 중</span><span class="ms-v">${pc('listed')}</span></div><div><span class="ms-l">검수 대기</span><span class="ms-v">${pc('pending')}</span></div><div><span class="ms-l">노출 중단</span><span class="ms-v">${pc('paused')}</span></div><div><span class="ms-l">독점 오퍼</span><span class="ms-v">${myP.filter(p=>p.exclusive).length}</span></div></div>
    <div class="btnrow" style="margin-top:12px"><button class="sm pri" data-act="newProduct">+ 새 상품 등록</button><button class="sm ghost" data-act="screen" data-k="products">상품 관리</button></div></div>`;
  const tops=D_().sellers.slice().sort((a,b)=>b.m3Sales-a.m3Sales).slice(0,5);const mxS=tops.length?tops[0].m3Sales:1;
  const topChart=`<div class="card"><div class="lbl-sm" style="margin-bottom:4px">지금 잘 파는 인플루언서 TOP5</div>
    <div style="font-size:11px;color:var(--mute);margin-bottom:10px">3개월 확정 매출 · 클릭 시 제안 · 비공개는 ${CEL}로 열람</div>
    ${tops.map((x,i)=>`<div class="hb-row" data-act="topSeller" data-k="${x.id}"><span class="hb-nm">${i+1}. ${platIcon(x)} ${x.hidden?'○○○ 인플루언서':esc(x.name)+' '+x.handle}</span><div class="hb-track"><div class="hb-bar ${i===0?'top':''}" style="width:${Math.max(6,x.m3Sales/mxS*100)}%"></div></div><span class="hb-val">₩${fmt(x.m3Sales)}</span></div>`).join('')}</div>`;
  /* 7 등급·자산 */
  const gv=bGmv(bd),bg=bgradeOf(gv),bnext=BGRADES[BGRADES.indexOf(bg)-1];const bpct=bnext?Math.min(100,Math.round(gv/bnext.min*100)):100;
  const gradeHtml=`<div class="card kpi go" data-act="brandGradeModal" title="등급별 혜택 보기"><div class="lbl-sm lbl">브랜드 등급 — 상위 ${bg.pct}%</div>
    ${pyrHtml(BGRADES,bg.g)}
    ${bnext?`<div class="meter" style="margin-top:12px"><span style="width:${bpct}%"></span></div><div style="font-size:12px;color:var(--mute);margin-top:7px">누적 <b>₩${fmt(gv)}</b> · <b>${bnext.g}</b>까지 <b style="color:var(--red)">₩${fmt(bnext.min-gv)}</b> · 달성 시 ${bnext.perk.split('·')[0].trim()}</div>`:`<div style="font-size:12px;color:var(--mute);margin-top:8px">최고 등급 · ${bg.perk}</div>`}</div>`;
  const freeLeft=freeRefLeft(bd);const toNext=CELERY_PER-(gv%CELERY_PER);
  const assets=`<div class="card kpi go" data-act="screen" data-k="shop" title="셀러리 샵"><div class="lbl-sm lbl">내 자산</div>
    <div class="mini-stats" style="margin-top:10px">
      <div><span class="ms-l">셀러리</span><span class="ms-v" style="display:flex;align-items:center;gap:4px">${CEL} ${celBal(me)}</span></div>
      <div><span class="ms-l">다음 1🥬까지</span><span class="ms-v">₩${fmt(toNext)}</span></div>
      <div><span class="ms-l">무료 데이터 열람</span><span class="ms-v">${(bg.g==='다이아'||bg.g==='블랙')?freeLeft+'회 남음':'다이아↑ 혜택'}</span></div>
      <div><span class="ms-l">자동 제안</span><span class="ms-v">${bd.autoPropose?'ON':'OFF'}</span></div>
    </div>
    <div class="btnrow" style="margin-top:12px"><button class="sm ghost" data-act="screen" data-k="shop">셀러리 샵</button><button class="sm ghost" data-act="gotoMy">마이페이지</button></div></div>`;
  return `<div class="hero-band">
    ${bd.logo?`<img class="hero-av" src="${bd.logo}" alt="브랜드 로고" data-act="gotoMy" style="cursor:pointer" title="마이페이지">`:''}
    <div class="ey">Brand Center</div>
    <h1>${esc(bd.name)} 님, 반가워요.<br>${heroLine}</h1>
    <div class="sub">브랜드 등급 <b>${gfull(bgname(bd))}</b> · 승인 대기 <b>${pendN}건</b> · 진행 중 판매 <b>${live.length}건</b> · ${new Date().getMonth()+1}월 ${new Date().getDate()}일</div>
  </div>
  <div class="overlap" style="height:0"></div>
  ${pendHtml}
  ${salesHtml}
  ${ledger}
  ${findHtml}
  <div class="sec">소식 · 상품 현황</div>
  <div class="homegrid3">${newsHtml}${prodHtml}${topChart}</div>
  <div class="sec">등급 · 자산</div>
  <div class="grid g2">${gradeHtml}${assets}</div>
  <div class="card" style="margin-top:22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px">
    <div><b>브랜드 추천 프로그램</b> <span class="sub" style="color:var(--mute);font-size:12px">— 새 브랜드 첫 ${BREF_TIMES}회 판매 확정매출의 1% 리워드 · 새 브랜드는 ${BREF_TIMES}회간 플랫폼 수수료 −1%p${bd.referredBy?` · 🌱 ${brand(bd.referredBy).name} 추천으로 입점 중`:''}</span></div>
    <div class="btnrow" style="margin:0"><span class="st gray" style="animation:none;font-family:'Archivo',sans-serif!important;font-weight:800!important">${bd.refCode||'—'}</span><button class="sm pri" data-act="copyBrandRef" data-k="${bd.refCode||''}">코드 복사</button><button class="sm ghost" data-act="gotoMy">추천 현황</button></div>
  </div>`;
}
/* ---- brand grade (pyramid + perks) & brand referral program blocks ---- */
function brandGradeHtml(b){
  const gv=bGmv(b),bg=bgradeOf(gv),bnext=BGRADES[BGRADES.indexOf(bg)-1];
  const bpct=bnext?Math.min(100,Math.round(gv/bnext.min*100)):100;
  return `<div class="sec">브랜드 등급 — 상위 ${bg.pct}%</div>
  <div class="grid g2">
    <div class="card"><div class="lbl-sm">내 브랜드 등급</div>
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0;flex-wrap:wrap"><span class="gradebox">${gfull(bg.g)}</span>
        <span style="font-family:'Archivo',sans-serif;font-size:25px;font-weight:800">₩${fmt(gv)}</span><span style="font-size:12px;color:var(--mute)">누적 확정 매출</span></div>
      ${pyrHtml(BGRADES,bg.g)}
      ${bnext?`<div class="meter" style="margin-top:12px"><span style="width:${bpct}%"></span></div>
      <div style="font-size:12px;color:var(--mute);margin-top:7px">다음 등급 <b>${bnext.g}</b>까지 <b style="color:var(--red)">₩${fmt(bnext.min-gv)}</b> · 달성 시 ${bnext.perk.split('·')[0].trim()}</div>`
      :`<div style="font-size:12px;color:var(--mute);margin-top:8px">최고 등급 · ${bg.perk}</div>`}
    </div>
    <div class="card"><div class="lbl-sm">등급별 혜택 — 브랜드</div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:7px">${BGRADES.map(t=>`<div style="display:flex;gap:10px;align-items:baseline;font-size:12.5px;flex-wrap:wrap;${t.g===bg.g?'font-weight:800':''}">
        <span class="gradebox sm" style="min-width:86px;text-align:center">${gfull(t.g)}</span><span style="color:var(--mute);white-space:nowrap">₩${fmt(t.min)}+</span><span style="flex:1;min-width:140px">${t.perk}</span></div>`).join('')}</div>
      <p style="font-size:11.5px;color:var(--mute);margin:12px 0 0">수수료 할인은 플랫폼 중개 수수료(${(PLAT_RATE*100).toFixed(0)}%)에서 차감 · 누적 확정 매출(GMV) 기준</p>
    </div>
  </div>`;
}
function brandRefHtml(b){
  const refs=D_().brands.filter(x=>x.referredBy===b.id);
  const earns=(D_().brandRefEarnings||[]).filter(e=>e.referrerId===b.id);
  const total=earns.reduce((a,e)=>a+e.amt,0);
  const usedOf=bid=>{const ps=D_().products.filter(p=>p.brandId===bid).map(p=>p.id);return D_().campaigns.filter(c=>ps.includes(c.productId)&&['LIVE','CLEARING','SETTLED'].includes(c.status)).length;};
  const mine=b.referredBy?`<div class="card" style="border-color:var(--red);margin-bottom:14px"><b>🌱 추천 혜택 적용 중</b> — ${brand(b.referredBy).name} 추천으로 입점. 첫 ${BREF_TIMES}회 판매 플랫폼 수수료 <b>−1%p</b> (남은 횟수 ${Math.max(0,BREF_TIMES-usedOf(b.id))}회).</div>`:'';
  return `<div class="sec">브랜드 추천 프로그램</div>
  ${mine}
  <div class="grid g2">
    <div class="card"><div class="lbl-sm">내 브랜드 추천 코드</div>
      <div style="display:flex;align-items:center;gap:14px;margin:12px 0;flex-wrap:wrap">
        <span style="font-family:'Archivo',sans-serif;font-size:26px;font-weight:800;letter-spacing:.1em;background:var(--yellow);border:2px solid var(--line);box-shadow:3px 3px 0 var(--line-sh);padding:4px 16px">${b.refCode||'—'}</span>
        <button class="sm" data-act="copyBrandRef" data-k="${b.refCode||''}">코드 복사</button></div>
      <ul style="font-size:13px;margin:0;padding-left:18px;line-height:2">
        <li><b>나 (추천 브랜드)</b> — 새 브랜드의 첫 ${BREF_TIMES}회 판매, <b>확정 매출의 1%</b> 리워드</li>
        <li><b>새 브랜드</b> — 코드 입력 시 첫 ${BREF_TIMES}회 판매 <b>플랫폼 수수료 −1%p</b></li>
        <li>둘 다 <b>플랫폼 수수료에서 부담</b> — 인플루언서 수수료엔 영향 없음</li>
      </ul></div>
    <div class="card"><div class="lbl-sm">추천 현황</div>
      <div class="grid g2" style="margin:10px 0 12px">
        <div class="card kpi" style="margin:0"><div class="lbl">누적 추천 리워드</div><div class="val" style="color:var(--money)">₩${fmt(total)}</div></div>
        <div class="card kpi" style="margin:0"><div class="lbl">추천한 브랜드</div><div class="val">${refs.length}개</div></div>
      </div>
      ${refs.map(x=>`<div class="sc-hist" style="cursor:default"><span>${x.logo?`<img src="${x.logo}" alt="" style="width:18px;height:18px;vertical-align:-4px;border:1.5px solid var(--line-soft);margin-right:6px">`:''}<b>${esc(x.name)}</b> · ${esc(x.cat)}</span><span style="font-family:'IBM Plex Mono',monospace">${Math.min(usedOf(x.id),BREF_TIMES)}/${BREF_TIMES}회 · ₩${fmt(earns.filter(e=>e.fromBrandId===x.id).reduce((a,e)=>a+e.amt,0))}</span></div>`).join('')||'<div style="font-size:12.5px;color:var(--mute)">아직 추천한 브랜드가 없습니다 — 코드를 공유해보세요</div>'}
    </div>
  </div>`;
}
function vBrandCamps(){
  const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);
  const cs=D_().campaigns.filter(c=>myP.includes(c.productId));
  const f=S.bcF||'all';
  const G={live:cs.filter(c=>c.status==='LIVE'),soon:cs.filter(c=>c.status==='SCHEDULE_CONFIRMED'),
    prep:cs.filter(c=>['INVITED','SAMPLE_REQUESTED','SAMPLE_APPROVED','SAMPLE_PURCHASED','SAMPLE_SHIPPED','TESTING','SCHEDULE_PROPOSED'].includes(c.status)),
    done:cs.filter(c=>['CLEARING','SETTLED','REJECTED','PASSED','DECLINED'].includes(c.status))};
  const todayStr=ymd(today());
  const liveCard=c=>{const p=prod(c.productId),sl=seller(c.sellerId),k=calc(c);const os=campOrders(c.id).filter(o=>o.status==='PAID');const tod=os.filter(o=>o.at===todayStr);const un=os.filter(o=>!o.tracking).length;const left=(c.qty||0)-soldQty(c.id);const dd=Math.max(0,Math.ceil((addD(P(c.end),1)-new Date())/DAY));
    return `<div class="card" style="padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="display:flex;align-items:center;gap:9px;min-width:0">${pIcon(p,30)}<span style="min-width:0"><b style="font-size:15px">${esc(p.name)}</b> <span class="sub" style="color:var(--mute);font-size:12px">${platIcon(sl)} ${esc(sl.name)} ${sl.handle}</span></span></div><div style="display:flex;gap:6px;align-items:center">${un?`<span class="st amber" style="animation:none">미발송 ${un}건</span>`:''}${stChip('LIVE')}</div></div>
      <div class="mini-stats" style="margin:12px 0 10px">
        <div><span class="ms-l">오늘 매출</span><span class="ms-v">₩${fmt(tod.reduce((a,o)=>a+o.unit*o.qty,0))}</span></div>
        <div><span class="ms-l">확정 매출</span><span class="ms-v">₩${fmt(k.net)}</span></div>
        <div><span class="ms-l">주문</span><span class="ms-v">${k.paidCnt}건</span></div>
        <div><span class="ms-l">마감 · 잔여</span><span class="ms-v">D-${dd} · ${fmt(Math.max(0,left))}개</span></div>
      </div>
      <div class="btnrow one"><button class="sm ghost" data-act="open" data-k="${c.id}">스레드</button><button class="sm ghost" data-act="preview" data-k="${c.id}">구매 페이지</button><button class="sm ghost" data-act="poCSV">발주서 CSV</button><button class="sm ghost" data-act="screen" data-k="sales">실시간 매출</button></div>
    </div>`;};
  const row=c=>{const p=prod(c.productId),sl=seller(c.sellerId);const dd=c.start?Math.ceil((P(c.start)-today())/DAY):null;
    return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}
      <div class="grow"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${platIcon(sl)} ${esc(sl.name)} ${sl.handle}</span></div>
      <div class="sub">${c.start?`${md(P(c.start))}–${md(P(c.end))} · 배정 재고 ${fmt(c.qty||0)}`:`${ST[c.status].l}${c.testDue?` · 테스트 기한 ${md(P(c.testDue))}`:''} · 수수료 ${(prod(c.productId).rate*100).toFixed(0)}%`}</div></div>
      ${c.status==='SCHEDULE_CONFIRMED'&&dd!=null?`<span class="st blue" style="animation:none">오픈 D-${Math.max(0,dd)}</span>`:''}${stChip(c.status)}</div>`;};
  const sec=(t,list,empty)=>`<div class="sec">${t} <span class="badge">${list.length}</span></div>${list.length?`<div class="listcard">${list.map(row).join('')}</div>`:`<div class="listcard"><div class="empty">${empty}</div></div>`}`;
  const chips=[['all','전체',cs.length],['live','진행 중',G.live.length],['soon','진행 예정',G.soon.length],['prep','준비 중',G.prep.length],['done','종료·정산',G.done.length]];
  return `<h2 class="pg">내 캠페인 <small>브랜드가 진행 중인 판매 · 클릭하면 캠페인 스레드로 이동</small></h2>
  ${admChips(chips,f,'bcF')}
  ${(f==='all'||f==='live')?`<div class="sec">진행 중 <span class="badge">${G.live.length}</span></div>
    ${G.live.length?`<div class="grid ${G.live.length>1?'g2':''}">${G.live.map(liveCard).join('')}</div>`:'<div class="listcard"><div class="empty">진행 중인 판매가 없습니다</div></div>'}`:''}
  ${(f==='all'||f==='soon')?sec('진행 예정',G.soon,'예정된 판매가 없습니다 — 일정 승인을 기다리는 요청은 DM 요청함에서 확인하세요'):''}
  ${(f==='all'||f==='prep')?sec('준비 중 (샘플·테스트·일정)',G.prep,'준비 중인 캠페인이 없습니다'):''}
  ${(f==='all'||f==='done')?sec('종료 · 정산',G.done,'종료된 캠페인이 없습니다'):''}
  ${calHtml({list:cs,brandView:true,title:'판매 캘린더 — 브랜드 스케줄 한눈에'})}`;
}
function vBrandProducts(){
  const mine=D_().products.filter(p=>p.brandId===S.actingBrand);
  return `<h2 class="pg">상품 관리 <small>판매가·수수료율은 등록 시 책정, 판매 진행 중 변경 불가</small></h2>
  <div style="margin-bottom:14px"><button class="pri" data-act="newProduct">+ 새 상품 등록</button></div>
  <div class="tblw compact"><table>
  <thead><tr><th>상품</th><th class="num">판매가</th><th class="num">수수료율</th><th>샘플 · 재고</th><th>독점권</th><th>상태</th><th>판매 일정</th></tr></thead>
  <tbody>${mine.map(p=>{
    const slots=D_().campaigns.filter(c=>c.productId===p.id&&['SCHEDULE_CONFIRMED','LIVE'].includes(c.status));
    const stTag=p.status==='listed'?'<span class="st green">노출 중</span>':p.status==='paused'?'<span class="st gray">노출 중단</span>':p.status==='rejected'?`<span class="st red" title="${esc(p.rejectReason||'')}">반려</span><div style="font-size:11px;color:var(--danger);margin-top:4px;max-width:180px;white-space:normal">${esc(p.rejectReason||'')} — 수정 후 재검수</div>`:'<span class="st amber">검수 대기</span>';
    const dash='<span style="color:var(--mute);font-size:12px">—</span>';
    return `<tr><td class="nm"><b>${pIcon(p,24)} ${esc(p.name)}</b>${p.boosted?' <span class="st blue" style="animation:none">부스트</span>':''}<div style="font-size:11.5px;color:var(--mute)">${esc(p.desc)}</div></td>
    <td class="num"><b>₩${fmt(p.gp)}</b><div style="font-size:11px;color:var(--mute);text-decoration:line-through">₩${fmt(p.cp)}</div></td>
    <td class="num">${(p.rate*100).toFixed(0)}%<div style="color:var(--mute);font-size:11px">+플랫폼 ${(PLAT_RATE*100).toFixed(0)}</div></td>
    <td style="white-space:nowrap">${p.sample}<div style="font-size:11px;color:var(--mute)">${spOf(p).freeGrade}↑ 무상 · 구매 ₩${fmt(samplePrice(p))}${spOf(p).refund?' · 환급':''}</div><div style="font-size:11px;color:var(--mute)">재고 ${fmt(p.stock)}</div></td>
    <td style="white-space:nowrap">${p.exclusive?`<span class="gradebox sm">${gfull(exGradeOf(p))} 이상</span>${p.exclusiveSellerId?`<div><span class="st green">확정</span></div>`:''}`:dash}</td>
    <td style="white-space:nowrap">${stTag}<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap"><button class="sm pri" data-act="editProduct" data-k="${p.id}">${p.status==='rejected'?'수정 · 재검수':'수정'}</button>${p.status==='pending'||p.status==='rejected'?'':`<button class="sm ghost" data-act="toggleListing" data-k="${p.id}">${p.status==='listed'?'노출 중단':'재개'}</button>`}<button class="sm ghost" data-act="previewProduct" data-k="${p.id}">상세페이지</button></div></td>
    <td>${slots.map(c=>`<div style="font-size:11.5px;font-family:'IBM Plex Mono',monospace;white-space:nowrap">${md(P(c.start))}–${md(P(c.end))} ${seller(c.sellerId).handle}</div>`).join('')||dash}</td></tr>`;}).join('')}
  </tbody></table></div>
  <p style="font-size:12px;color:var(--mute);margin-top:10px">판매가·수수료율은 진행 중인 판매가 있으면 변경할 수 없습니다(신뢰 보호). 노출 중단 시 새 샘플 요청만 막히고 진행 중 판매는 유지됩니다.</p>`;
}
function sellerCard(s,reason){
  const hist=D_().campaigns.filter(c=>c.sellerId===s.id&&['LIVE','CLEARING','SETTLED'].includes(c.status))
    .sort((a,b)=>b.createdAt<a.createdAt?-1:1).slice(0,2);
  const eng=(s.likesAvg/s.followers*100).toFixed(1);
  const rl=s.recentLikes||[];
  const mxL=Math.max(...rl,1);
  const trendUp=rl.length>1&&rl[rl.length-1]>=rl[0];
  const bv=S.view.role==='brand'?brand(S.actingBrand):null;
  const done=D_().campaigns.filter(c=>c.sellerId===s.id&&['LIVE','CLEARING','SETTLED'].includes(c.status));
  const worked=!!bv&&done.some(c=>prod(c.productId).brandId===bv.id);
  const avgNet=done.length?done.reduce((a,c)=>a+calc(c).net,0)/done.length:null;
  const unlocked=!bv||worked||passActive(bv,'datapass',30)||(((D_().brandDataUnlocks||{})[bv.id])||[]).includes(s.id);
  return `<div class="card scard">
    ${reason?`<div class="rec-tag">✦ 추천 — ${reason}</div>`:''}
    <div style="display:flex;gap:14px;align-items:center">
      ${s.img?`<div class="sc-av" style="background-image:url('${s.img}')"></div>`:`<div class="sc-av em">${SEMOJI[s.id]||'⭐'}</div>`}
      <div style="flex:1;min-width:0">
        <div><span class="gradebox sm">${gfull(gname(s))}</span> <b style="font-size:15.5px">${esc(s.name)}</b> <span style="color:var(--mute);font-size:12px">${platIcon(s)} ${s.handle}</span>${worked?' <span class="st green" style="animation:none">함께 판매 · 데이터 무료</span>':''}</div>
        <div style="font-size:12px;color:var(--mute)">${s.cat} · 팔로워 ${fmt(s.followers)} · ${esc(s.intro)}</div>
      </div>
    </div>
    <div class="gate ${unlocked?'':'locked'}">
    <div class="mini-stats">
      <div><span class="ms-l">3개월 매출</span><span class="ms-v">₩${fmt(s.m3Sales)}</span></div>
      <div><span class="ms-l">판매당 평균 매출</span><span class="ms-v">${avgNet!=null?'₩'+fmt(avgNet):'—'}</span></div>
      <div><span class="ms-l">좋아요 평균</span><span class="ms-v">${fmt(s.likesAvg)}</span></div>
      <div><span class="ms-l">참여율</span><span class="ms-v">${eng}%</span></div>
    </div>
    <div class="sc-cols">
      <div>
        <div class="lbl-sm" style="margin-bottom:6px">최근 진행 이력</div>
        ${hist.length?hist.map(c=>{const p=prod(c.productId),k=calc(c);
          return `<div class="sc-hist" data-act="open" data-k="${c.id}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pIcon(p,18)} ${esc(p.name)} <span style="color:var(--mute)">${c.start?md(P(c.start))+'–'+md(P(c.end)):''}</span></span><span style="font-family:'IBM Plex Mono',monospace;white-space:nowrap">₩${fmt(k.net)}</span>${stChip(c.status)}</div>`;}).join('')
        :'<div style="font-size:12px;color:var(--mute)">셀러리 첫 판매 대기 — 지금 제안해 선점하세요</div>'}
        <div class="lbl-sm" style="margin:12px 0 6px">📡 외부 판매 감지 · 예상 매출 <span style="font-weight:400;letter-spacing:0;text-transform:none" title="크롤링 기반 가계산 — 실데이터 확보 후 계산식 확정 예정">(가계산)</span></div>
        ${((D_().external||{})[s.id]||[]).slice(0,2).map(x=>{const e=estExternal(s,x);
          return `<div class="sc-hist" style="cursor:default"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${platIcon({platform:x.src})} ${esc(x.name)} <span style="color:var(--mute)">· ${esc(x.brand)} · ${md(P(x.at))}</span></span><span style="font-family:'IBM Plex Mono',monospace;white-space:nowrap;color:var(--red)">예상 ₩${fmt(e.lo/1e4)}만–${fmt(e.hi/1e4)}만</span></div>`;}).join('')
          ||'<div style="font-size:12px;color:var(--mute)">최근 30일 외부 판매 감지 없음</div>'}
      </div>
      <div>
        <div class="lbl-sm" style="margin-bottom:6px">최근 게시물 반응 ${trendUp?'<b style="color:var(--red)">▲ 상승</b>':''}</div>
        <div class="spark">${rl.map(v=>`<span style="height:${Math.max(12,v/mxL*100)}%"></span>`).join('')}</div>
        <div style="font-size:10.5px;color:var(--mute);margin-top:4px">최근 ${rl.length}개 게시물 좋아요</div>
      </div>
    </div>
    ${unlocked?'':`<div class="gate-cta"><button class="pri sm" data-act="unlockSellerData" data-k="${s.id}">${CEL} ${dataPrice(s)} · 데이터 확인하기</button><span>${gfull(gname(s))} 등급 · 3개월 매출 · 판매당 평균 · 참여율 · 이력 · 외부 판매 예상</span></div>`}
    </div>
    <button class="pri" data-act="invite" data-k="${s.id}" style="margin-top:12px;width:100%">판매 직접 제안</button>
  </div>`;
}
function vGallery(){
  const unlocked=D_().unlockedRefs||[];
  const b=brand(S.actingBrand);
  const gf=S.galGrade||'전체', pfilt=S.galPlat||'all';
  const pass=s=>(pfilt==='all'||s.platform===pfilt)&&(gf==='전체'||(tierIdx(gname(s))>-1&&tierIdx(gname(s))<=tierIdx(gf)));
  const rel=CATMAP[b.cat]||[];
  const pub=D_().sellers.filter(s=>!s.hidden);
  const recs=pub.map(s=>({s,catFit:rel.includes(s.cat),score:(rel.includes(s.cat)?2:0)+(s.m3Sales/s.followers)/300+(passActive(s,'featured',7)?5:0)}))
    .sort((a,b)=>b.score-a.score).slice(0,2);
  const scout=D_().sellers.filter(s=>s.hidden&&pass(s)).map(s=>{
    const un=unlocked.includes(s.id);
    return `<div class="card">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="gradebox">${gfull(gname(s))}</span>${platIcon(s)}<b>○○○ 인플루언서</b><span style="color:var(--mute);font-size:12px">${s.cat} 주력</span></div>
    <div style="font-family:'Archivo',sans-serif;font-size:23px;font-weight:800;margin:8px 0 3px">₩${fmt(s.m3Sales)} <span style="font-size:11px;color:var(--mute);font-weight:500">최근 3개월 매출</span></div>
    ${un?`<div style="font-size:12.5px;color:var(--mute)">팔로워 ${fmt(s.followers)} · 좋아요 평균 ${fmt(s.likesAvg)} · 참여율 ${(s.likesAvg/s.followers*100).toFixed(1)}% · 매출/팔로워 ₩${fmt(s.m3Sales/s.followers)}</div>
     <div class="btnrow" style="margin-top:12px"><button class="pri sm" data-act="invite" data-k="${s.id}">판매 제안 보내기</button></div>`
    :`<div style="font-size:12.5px;color:var(--mute)">팔로워 ●●●,●●● · 좋아요 평균 ●,●●● — 상세 지표 잠김</div>
     <div class="btnrow" style="margin-top:12px"><button class="sm" data-act="unlockRef" data-k="${s.id}">🔓 레퍼런스 열람 · ${CEL} ${dataPrice(s)}</button></div>`}
    </div>`;}).join('');
  const filtered=pub.filter(pass);
  return `<h2 class="pg">인플루언서 갤러리 <small>건강·웰니스 판매 레퍼런스가 인증된 인플루언서 · 이력·반응 데이터를 보고 직접 제안하세요</small></h2>
  <div class="card" style="margin-bottom:20px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <span class="lbl-sm" style="min-width:64px">등급</span>
      <div class="cats" style="margin:0">${['전체','실버','골드','플래티넘','다이아'].map(g=>`<button class="catchip ${gf===g?'on':''}" data-act="setGalGrade" data-k="${g}">${g==='전체'?'전체':(GICON[g]||'')+' '+g+' 이상'}</button>`).join('')}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span class="lbl-sm" style="min-width:64px">메인 SNS</span>
      <div class="cats" style="margin:0">${[['all','전체'],['instagram','인스타그램'],['youtube','유튜브'],['tiktok','틱톡'],['naver','네이버 블로그']].map(([k,l])=>`<button class="catchip ${pfilt===k?'on':''}" data-act="setGalPlat" data-k="${k}">${k!=='all'?PLAT_ICONS[k]+' ':''}${l}</button>`).join('')}</div>
    </div>
  </div>
  <div class="sec" style="margin-top:0">${esc(b.name)} 맞춤 추천 인플루언서</div>
  <div class="grid g2">${recs.map(r=>sellerCard(r.s,`${r.catFit?`${esc(b.cat)}와 카테고리 적합`:'매출 효율 상위'} · 매출/팔로워 ₩${fmt(r.s.m3Sales/r.s.followers)}`)).join('')}</div>
  <div class="sec">전체 인플루언서 <span style="font-weight:400;letter-spacing:0;text-transform:none;color:var(--mute)">${filtered.length}명</span></div>
  <div class="grid g2">${filtered.map(s=>sellerCard(s)).join('')||'<div class="empty" style="grid-column:1/-1;background:var(--surface);border:2px solid var(--line);border-radius:6px">조건에 맞는 인플루언서가 없습니다 — 필터를 넓혀보세요</div>'}</div>
  <div class="sec">익명 인플루언서 스카우트 — 유료 레퍼런스</div>
  <p style="font-size:12.5px;color:var(--mute);margin:-2px 0 14px">프로필 비공개 인플루언서입니다. 레퍼런스 열람권(건당)을 구매하면 상세 지표를 확인하고 제안을 보낼 수 있습니다. <b>제안이 수락되는 순간 DM이 열리고 신원이 공개됩니다.</b></p>
  <div class="grid g2">${scout}</div>
  <p style="font-size:12px;color:var(--mute);margin-top:12px">※ 제안은 인플루언서가 수락해야 진행됩니다(수락 대기 → 샘플 발송). 거절 시 제안권은 브랜드에 환급됩니다.</p>`;
}
function brandPending(){
  const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);
  const cs=D_().campaigns.filter(c=>myP.includes(c.productId)&&['SAMPLE_REQUESTED','SAMPLE_APPROVED','SAMPLE_PURCHASED','SCHEDULE_PROPOSED'].includes(c.status));
  const xr=(D_().exclusiveReqs||[]).filter(r=>myP.includes(r.productId)&&r.status==='PENDING');
  return {cs,xr,n:cs.length+xr.length};
}
function sellerPending(){
  const cs=D_().campaigns.filter(c=>c.sellerId===S.actingSeller&&['INVITED','SAMPLE_SHIPPED','TESTING','SAMPLE_APPROVED','SAMPLE_PURCHASED'].includes(c.status));
  const info=c=>c.status==='SAMPLE_APPROVED'||c.status==='SAMPLE_PURCHASED';
  return {cs,n:cs.filter(c=>!info(c)).length,info:cs.filter(info).length};
}
function sellerRequests(){
  const {cs,n}=sellerPending();
  const isOpen=n?(S.reqOpen!==false):(S.reqOpen===true);
  const LBL={INVITED:['브랜드가 판매를 직접 제안했어요 — 수락 또는 거절','수락/거절'],SAMPLE_SHIPPED:['샘플 도착 — 수령 확인','수령 확인'],TESTING:['테스트 후 진행 여부 결정 — 일정 제안 또는 패스','일정 제안'],SAMPLE_APPROVED:['브랜드 승인 · 샘플 발송 준비 중','스레드'],SAMPLE_PURCHASED:['결제 완료 · 샘플 발송 준비 중','스레드']};
  return `<div class="card acc" style="padding:0;overflow:hidden;margin-bottom:14px">
    <div class="acc-head" data-act="toggleReq">
      <div><b>📥 요청함</b> <span class="sub" style="color:var(--mute);font-size:12px">브랜드가 보낸 요청 · 내 응답이 필요한 것</span></div>
      <div style="display:flex;gap:8px;align-items:center">${n?`<span class="st amber" style="animation:none">응답 필요 ${n}건</span>`:'<span class="st gray" style="animation:none">응답 필요 없음</span>'}<span class="acc-arrow">${isOpen?'▲':'▼'}</span></div>
    </div>
    ${isOpen?`<div class="listcard" style="margin:0;box-shadow:none;border-top:1.5px solid var(--line-soft)">
      ${cs.sort((a,b)=>(/APPROVED|PURCHASED/.test(a.status))-(/APPROVED|PURCHASED/.test(b.status))).map(c=>{const p=prod(c.productId),b=brand(p.brandId);const [l,btn]=LBL[c.status];
        return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}
        <div class="grow"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${esc(b.name)}${c.invited?' · 브랜드 직접 제안':''}</span></div>
        <div class="sub">${l}${c.testDue&&c.status==='TESTING'?` · 기한 ${md(P(c.testDue))}`:''}${c.tracking&&c.status==='SAMPLE_SHIPPED'?` · 운송장 ${esc(c.tracking)}`:''} · 수수료 ${(p.rate*100).toFixed(0)}%</div></div>
        <button class="${c.status==='SAMPLE_APPROVED'?'sm ghost':'pri sm'}">${btn}</button></div>`;}).join('')||'<div class="empty" style="padding:14px">브랜드 요청이 없습니다</div>'}
    </div>`:''}
  </div>`;
}
function dmUnreadN(){
  const isBrand=S.view.role==='brand';let cs;
  if(isBrand){const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);cs=D_().campaigns.filter(c=>myP.includes(c.productId));}
  else cs=D_().campaigns.filter(c=>c.sellerId===S.actingSeller);
  const myRole=isBrand?'brand':'seller';
  return cs.filter(c=>{const m=D_().messages[c.id]||[];const l=m[m.length-1];return l&&l.type==='chat'&&l.role!==myRole;}).length;
}
/* 요청함 — 브랜드 DM 탭 상단 아코디언 (샘플 요청·일정 제안·독점권 신청) */
function vRequests(){
  const {cs,xr,n}=brandPending();
  const open=S.reqOpen!==false; // 기본 펼침, 요청이 없으면 접힘
  const isOpen=n?open:(S.reqOpen===true);
  const LBL={SAMPLE_REQUESTED:'샘플 요청 검토',SAMPLE_APPROVED:'샘플 발송 처리',SAMPLE_PURCHASED:'샘플 발송 처리 (구매 완료)',SCHEDULE_PROPOSED:'일정 승인'};
  return `<div class="card acc" style="padding:0;overflow:hidden;margin-bottom:14px">
    <div class="acc-head" data-act="toggleReq">
      <div><b>📥 요청함</b> <span class="sub" style="color:var(--mute);font-size:12px">샘플 요청 · 일정 제안 · 독점권 신청</span></div>
      <div style="display:flex;gap:8px;align-items:center">${n?`<span class="st amber" style="animation:none">대기 ${n}건</span>`:'<span class="st gray" style="animation:none">대기 없음</span>'}<span class="acc-arrow">${isOpen?'▲':'▼'}</span></div>
    </div>
    ${isOpen?`<div class="listcard" style="margin:0;box-shadow:none;border-top:1.5px solid var(--line-soft)">
      ${cs.map(c=>{const p=prod(c.productId),sl=seller(c.sellerId);
        return `<div class="rowitem" data-act="open" data-k="${c.id}">${pIcon(p,38)}
        <div class="grow"><div class="nm">${esc(p.name)} <span class="sub" style="font-weight:400">· ${platIcon(sl)} ${esc(sl.name)} ${sl.handle}</span></div>
        <div class="sub">${LBL[c.status]||ST[c.status].l}${c.status==='SCHEDULE_PROPOSED'&&c.propStart?` · ${md(P(c.propStart))}–${md(P(c.propEnd))} · 재고 ${fmt(c.propQty)}`:''} · 팔로워 ${fmt(sl.followers)} · <span class="gradebox sm">${gfull(gname(sl))}</span></div></div>
        <button class="pri sm">${c.status==='SAMPLE_REQUESTED'?'검토':c.status==='SAMPLE_APPROVED'?'발송':'승인'}</button></div>`;}).join('')}
      ${xr.map(r=>{const sl=seller(r.sellerId),p=prod(r.productId);
        return `<div class="rowitem" style="cursor:default">
        <div class="grow"><div class="nm"><span class="gradebox sm">${gfull(gname(sl))}</span> ${platIcon(sl)} ${esc(sl.name)} <span class="sub" style="font-weight:400">${sl.handle}${sl.hidden?' · 비공개 프로필 (독점권 신청으로 공개)':''}</span> → ${esc(p.name)} 독점권 신청</div>
        <div class="sub">3개월 매출 ₩${fmt(sl.m3Sales)} · 팔로워 ${fmt(sl.followers)} · 참여율 ${(sl.likesAvg/sl.followers*100).toFixed(1)}% · 조건 ${gfull(exGradeOf(p))} 이상 충족 ✓</div></div>
        <div class="rowacts"><button class="pri sm" data-act="approveExcl" data-k="${r.id}">승인</button><button class="sm danger" data-act="rejectExcl" data-k="${r.id}">거절</button></div></div>`;}).join('')}
      ${n?'':'<div class="empty" style="padding:14px">대기 중인 요청이 없습니다</div>'}
    </div>`:''}
  </div>`;
}
function vBrandOrders(){
  const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);
  const cids=D_().campaigns.filter(c=>myP.includes(c.productId)).map(c=>c.id);
  const os=D_().orders.filter(o=>cids.includes(o.campaignId)).slice(-40).reverse();
  const po=D_().autoPO||{on:false,email:'orders@'+brand(S.actingBrand).name+'.co'};
  const unshipped=D_().orders.filter(o=>cids.includes(o.campaignId)&&o.status==='PAID'&&!o.tracking).length;
  return `<h2 class="pg">주문·발주 <small>발주서 다운로드 → 송장 채워서 일괄 업로드</small></h2>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card"><h4 style="margin:0 0 6px;font-size:13.5px">발주서 내보내기</h4>
      <p style="font-size:12.5px;color:var(--mute);margin:0 0 12px">현재 주문을 엑셀(CSV)로 다운로드하거나, 물류팀 이메일로 바로 발송합니다.</p>
      <div class="btnrow"><button class="pri sm" data-act="poCSV">⬇ 발주서 CSV</button>
      <button class="sm" data-act="poEmail">✉ 이메일 발송 (시뮬)</button></div></div>
    <div class="card"><h4 style="margin:0 0 6px;font-size:13.5px">송장 일괄 업로드 ${unshipped?`<span class="st amber">미발송 ${unshipped}건</span>`:'<span class="st green">모두 발송됨</span>'}</h4>
      <p style="font-size:12.5px;color:var(--mute);margin:0 0 12px">양식(주문번호,운송장번호)을 채워 업로드하면 자동 매칭되어 배송중 처리됩니다. 구매자 배송 알림은 실서비스에서 자동 발송.</p>
      <div class="btnrow"><button class="pri sm" data-act="trackCSVPick">⬆ 송장 CSV 업로드</button>
      <button class="sm ghost" data-act="trackCSVTemplate">양식 다운로드</button></div></div>
    <div class="card"><h4 style="margin:0 0 6px;font-size:13.5px">자동 발주 ${po.on?'<span class="st green">ON</span>':'<span class="st gray">OFF</span>'}</h4>
      <p style="font-size:12.5px;color:var(--mute);margin:0 0 12px">매일 09:00 신규 주문 발주서를 자동 발송하고, 판매 종료 시 최종 발주서를 보냅니다.</p>
      <div class="autopo"><input id="poEmailIn" value="${esc(po.email)}" style="max-width:240px" placeholder="물류팀 이메일">
      <button class="sm ${po.on?'danger':'pri'}" data-act="saveAutoPO">${po.on?'자동 발주 끄기':'자동 발주 켜기'}</button></div></div>
  </div>
  <div class="tblw"><table>
  <thead><tr><th>주문번호</th><th>구매자</th><th>판매</th><th class="num">수량</th><th class="num">금액</th><th>일자</th><th>운송장</th><th>상태</th><th></th></tr></thead>
  <tbody>${os.map(o=>{const c=camp(o.campaignId),p=prod(c.productId);
    return `<tr><td class="num">${o.id.toUpperCase()}</td><td>${o.buyer}</td><td>${pIcon(p,22)} ${esc(p.name)} <span style="color:var(--mute);font-size:11px">${seller(c.sellerId).handle}</span></td>
    <td class="num">${o.qty}</td><td class="num">₩${fmt(o.unit*o.qty)}</td><td class="num">${md(P(o.at))}</td>
    <td>${o.tracking?`<span style="font-family:'IBM Plex Mono',monospace;font-size:11px">${esc(o.tracking)}</span>`
      :o.status==='PAID'?`<button class="sm ghost" data-act="trackOne" data-k="${o.id}">송장 입력</button>`:'—'}</td>
    <td>${o.status!=='PAID'?'<span class="st red">환불</span>':o.tracking?'<span class="st blue">배송중</span>':'<span class="st green">결제완료</span>'}</td>
    <td>${o.status==='PAID'&&camp(o.campaignId).status!=='SETTLED'?`<button class="sm ghost" data-act="refund" data-k="${o.id}">환불 처리</button>`:''}</td></tr>`;}).join('')||'<tr><td colspan="9" class="empty">주문이 없습니다</td></tr>'}
  </tbody></table></div>`;
}
function vBrandSettle(){
  const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);
  const cs=D_().campaigns.filter(c=>myP.includes(c.productId)&&(['LIVE','CLEARING','SETTLED'].includes(c.status)||c.samplePaid));
  const bsi=brand(S.actingBrand).settleInfo||{};
  const bNoAcct=!(bsi.bank&&bsi.account&&bsi.bizNo);
  return `<h2 class="pg">정산 <small>확정 매출 − PG ${(PG_RATE*100).toFixed(1)}% − 인플루언서 수수료 − 플랫폼 ${(PLAT_RATE*100).toFixed(0)}%</small></h2>
  ${bNoAcct?`<div class="card" style="border-color:var(--danger);margin-bottom:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><b style="color:var(--danger)">⚠ 정산 정보 미등록</b><span style="font-size:13px;color:var(--mute)">사업자등록번호·정산 계좌를 등록해야 D+${CLEAR_DAYS} 지급과 세금계산서 발행이 실행됩니다.</span><button class="pri sm" data-act="gotoMy">마이페이지에서 등록</button></div>`:''}
  <div style="margin-bottom:14px"><button class="sm ghost" data-act="settleCSV">⬇ 명세 CSV 다운로드</button></div>
  <div class="tblw"><table>
  <thead><tr><th>판매</th><th>인플루언서</th><th class="num">확정 매출</th><th class="num">인플루언서 수수료</th><th class="num">플랫폼+PG</th><th class="num">브랜드 정산액</th><th>상태</th><th>정산일</th></tr></thead>
  <tbody>${cs.map(c=>{const k=calc(c),p=prod(c.productId);
    return `<tr class="clickable" data-act="open" data-k="${c.id}"><td><b>${pIcon(p,20)} ${esc(p.name)}</b></td><td>${seller(c.sellerId).handle}</td>
    <td class="num">₩${fmt(k.net)}</td><td class="num">−₩${fmt(k.sf)}</td><td class="num">−₩${fmt(k.pf+k.pg)}</td>
    <td class="num" style="font-weight:700">₩${fmt(k.brandPay)}</td>
    <td>${stChip(c.status)}</td><td class="num">${c.status==='SETTLED'?'완료':md(settleDue(c))}</td></tr>`;}).join('')||'<tr><td colspan="8" class="empty">내역 없음</td></tr>'}
  </tbody></table></div>`;
}

/* ============ BRAND MY PAGE ============ */
function vBrandMy(){
  const b=brand(S.actingBrand);
  const si=b.settleInfo||{};
  const ok=si.bank&&si.account&&si.holder&&si.bizNo;
  const myP=D_().products.filter(p=>p.brandId===b.id);
  return `<h2 class="pg">브랜드 마이페이지 <small>회사 정보와 정산 정보 · 등급 · 추천 프로그램</small></h2>
  <div class="grid g2">
    <div class="card">
      <div class="lbl-sm">브랜드 정보</div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap">
        ${b.logo?`<img src="${b.logo}" alt="로고" style="width:76px;height:76px;object-fit:cover;border:2px solid var(--line);box-shadow:3px 3px 0 var(--line-sh)">`
          :`<div style="width:76px;height:76px;display:flex;align-items:center;justify-content:center;font-size:28px;border:2px dashed var(--mute)">🏷️</div>`}
        <div>
          <div style="font-weight:800;font-size:17px">${esc(b.name)} <span class="chip brand">${esc(b.cat)}</span> <span class="gradebox sm">${gfull(bgname(b))}</span></div>
          <div style="font-size:12.5px;color:var(--mute);margin-top:4px">담당자 ${esc(b.manager)} · ${esc(b.email||'')}</div>
          <div style="font-size:12.5px;color:var(--mute)">등록 상품 ${myP.length}개 · 노출 중 ${myP.filter(p=>p.status==='listed').length}개</div>
          <div class="btnrow" style="margin-top:8px"><button class="sm" data-act="brandLogoPick">${PEN}${b.logo?'로고 변경':'로고 등록'}</button></div>
        </div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="fld"><label>담당자</label><input id="bmManager" value="${esc(b.manager)}"></div>
        <div class="fld"><label>연락 이메일</label><input id="bmEmail" value="${esc(b.email||'')}"></div>
      </div>
    </div>
    <div class="card">
      ${(()=>{const gv=bGmv(b),bg=bgradeOf(gv),bnext=BGRADES[BGRADES.indexOf(bg)-1];
        const bpct=bnext?Math.min(100,Math.round(gv/bnext.min*100)):100;
        return `<div class="lbl-sm">브랜드 등급 — 상위 ${bg.pct}%</div>
        ${pyrHtml(BGRADES,bg.g)}
        ${bnext?`<div class="meter" style="margin-top:12px"><span style="width:${bpct}%"></span></div>
        <div style="font-size:12px;color:var(--mute);margin-top:7px">누적 확정 매출 <b>₩${fmt(gv)}</b> — 다음 등급 <b>${bnext.g}</b>까지 <b style="color:var(--red)">₩${fmt(bnext.min-gv)}</b> · 달성 시 ${bnext.perk.split('·')[0].trim()}</div>`
        :`<div style="font-size:12px;color:var(--mute);margin-top:8px">최고 등급 · ${bg.perk}</div>`}
        <div style="font-size:12px;color:var(--mute);margin-top:8px">현재 혜택: <b>${bg.perk}</b></div>`;})()}
    </div>
  </div>
  <div class="sec" style="margin-top:30px">정산 정보 ${ok?'<span class="st green">등록 완료</span>':'<span class="st red">미등록 — 등록 전까지 정산 지급 보류</span>'}</div>
  <div class="card">
    <div class="grid g2">
      <div class="fld"><label>은행</label>
        <select id="bmBank">${['선택','국민','신한','우리','하나','농협','카카오뱅크','토스뱅크','기업','SC제일'].map(x=>`<option ${si.bank===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="fld"><label>계좌번호</label><input id="bmAccount" inputmode="numeric" value="${esc(si.account||'')}" placeholder="'-' 없이 숫자만"></div>
      <div class="fld"><label>예금주 (법인/상호명)</label><input id="bmHolder" value="${esc(si.holder||b.name)}"></div>
      <div class="fld"><label>사업자등록번호</label><input id="bmBizNo" value="${esc(si.bizNo||'')}" placeholder="000-00-00000"></div>
      <div class="fld"><label>사업자등록증</label>
        <div class="btnrow"><button class="sm ghost" data-act="brandDocPick">${si.bizDoc?'파일 변경':'파일 업로드'}</button>
        ${si.bizDoc?`<span style="font-size:12px;color:var(--mute);align-self:center">📎 ${esc(si.bizDoc)} <span class="st green">첨부됨</span></span>`:''}</div></div>
      <div class="fld"><label>통신판매업 신고번호 <span style="font-weight:400">(선택)</span></label><input id="bmMailOrder" value="${esc(si.mailOrder||'')}" placeholder="제0000-서울강남-00000호"></div>
    </div>
    <p style="font-size:12px;color:var(--mute)">사업자 진위 확인·계좌 인증은 실서비스에서 자동 처리됩니다. 브랜드 정산액은 이 계좌로 D+${CLEAR_DAYS}에 지급됩니다.</p>
    <button class="pri" data-act="saveBrandInfo">저장</button>
  </div>
  ${brandGradeHtml(b)}
  ${brandRefHtml(b)}`;
}

/* ============ 고객 문의 (CS) ============ */
function csStatusChip(st){
  const m={OPEN:['답변 대기','amber'],ANSWERED:['답변 완료','green'],CLOSED:['처리 종료','gray']}[st]||[st,'gray'];
  return `<span class="st ${m[1]}" style="animation:none">${m[0]}</span>`;
}
function vBrandCS(){
  const all=csOf(S.actingBrand).slice().sort((a,b)=>(a.status==='OPEN'?-1:1)-(b.status==='OPEN'?-1:1)||(a.at<b.at?1:-1));
  const open=all.filter(x=>x.status==='OPEN').length;
  return `<h2 class="pg">고객 문의 <small>구매 고객이 남긴 문의가 바로 여기로 옵니다 — 답변하면 고객에게 알림톡으로 전달됩니다</small></h2>
  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
    <span class="st ${open?'amber':'gray'}" style="animation:none">답변 대기 ${open}건</span>
    <span class="st gray" style="animation:none">전체 ${all.length}건</span>
    <span class="note" style="color:var(--mute);font-size:12px">배송·교환·반품은 브랜드가 직접, 결제·정산 문제는 셀러리 운영팀이 함께 처리합니다</span>
  </div>
  <div class="listcard">${all.map(x=>{
    const c=camp(x.cid),p=c&&prod(c.productId),sl=c&&seller(c.sellerId);
    return `<div class="rowitem" style="cursor:default;align-items:flex-start">
      ${p?pIcon(p,38):''}
      <div class="grow">
        <div class="nm">${p?esc(p.name):'—'} <span class="chip">${esc(x.type)}</span> ${csStatusChip(x.status)}</div>
        <div class="sub">주문 ${x.orderId?esc(x.orderId.toUpperCase()):'—'} · 구매자 ${esc(x.buyer||'고객')} · ${sl?esc(sl.handle):''} · ${md(P(x.at))}</div>
        <div style="margin-top:7px;font-size:13px;color:var(--ink);background:var(--surface-2);border:1.5px solid var(--soft-line);padding:9px 11px">${esc(x.msg)}</div>
        ${x.reply?`<div style="margin-top:6px;font-size:12.5px;color:var(--mute)"><b style="color:var(--ink)">답변</b> · ${md(P(x.repliedAt))}<br>${esc(x.reply)}</div>`:''}
      </div>
      <div class="rowacts">
        ${x.status==='OPEN'?`<button class="pri sm" data-act="csReply" data-k="${x.id}">답변하기</button>`
          :`<button class="sm ghost" data-act="csReply" data-k="${x.id}">답변 수정</button>`}
        ${x.status!=='CLOSED'?`<button class="sm ghost" data-act="csClose" data-k="${x.id}">처리 종료</button>`:''}
      </div>
    </div>`;}).join('')||'<div class="empty">접수된 고객 문의가 없습니다</div>'}</div>`;
}
function csModal(cid,oid){
  const c=camp(cid),p=prod(c.productId),b=brand(p.brandId);
  openModal(`<h3>문의하기 — ${pIcon(p,24)} ${esc(p.name)}</h3>
  <div class="notice" style="margin:-4px 0 13px">이 문의는 <b>${esc(b.name)}</b>(공급 브랜드)에 바로 전달됩니다. 배송·교환·반품은 브랜드가 직접 처리하고, 결제·정산 문제는 셀러리가 함께 확인합니다.</div>
  <div class="fld"><label>문의 유형</label><select id="csType">${CS_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
  <div class="fld"><label>주문번호 <span style="font-weight:400">(선택)</span></label><input id="csOrder" value="${oid?esc(oid.toUpperCase()):''}" placeholder="예: O1153"></div>
  <div class="fld"><label>문의 내용</label><textarea id="csMsg" rows="4" placeholder="배송 상태, 교환·반품 사유 등을 적어주세요"></textarea></div>
  <p style="font-size:12px;color:var(--mute)">실서비스에서는 로그인 계정의 주문 내역에서 바로 문의를 접수하고, 답변은 카카오 알림톡으로 안내됩니다.</p>
  <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="submitCS" data-k="${cid}">문의 접수</button></div>`);
}
