/* ============ CELERY SHOP (seller + brand) ============ */
function vShop(){
  const isBrand=S.view.role==='brand';
  const who=isBrand?S.actingBrand:S.actingSeller;
  const ent=isBrand?brand(who):seller(who);
  const bal=celBal(who), earned=celEarned(who);
  const gmv=isBrand?bGmv(ent):ent.m3Sales;
  const toNext=CELERY_PER-(gmv%CELERY_PER);
  const items=SHOP[isBrand?'brand':'seller'];
  const ledger=(D_().celeryLedger||[]).filter(e=>e.who===who).slice().reverse().slice(0,8);
  const owned=ent.celeryItems||{};
  return `<h2 class="pg">셀러리 샵 <small>판매로 모은 셀러리로 프리미엄 기능을 사용하세요 · 1 ${CEL} ≈ ₩20,000 가치</small></h2>
  <div class="grid g3">
    <div class="card kpi"><div class="lbl">내 셀러리</div><div class="val" style="display:flex;align-items:center;gap:8px">${CEL} ${bal}</div><div class="sub">획득 ${earned} + 이벤트/충전 − 사용</div></div>
    <div class="card kpi"><div class="lbl">획득 규칙</div><div class="val" style="font-size:20px;display:flex;align-items:center;gap:6px">₩500만 = 1 ${CEL}</div><div class="sub">확정 매출 기준 · 다음 1개까지 ₩${fmt(toNext)}</div></div>
    <div class="card"><div class="lbl-sm">충전 (시뮬 결제)</div>
      <div class="btnrow" style="margin-top:10px">${TOPUP.map(t=>`<button class="sm" data-act="topup" data-k="${t.n}">${CEL} ${t.n} · ₩${fmt(t.won)}</button>`).join('')}</div>
      <p style="font-size:11.5px;color:var(--mute);margin:10px 0 0">충전 셀러리는 환불 불가 · 획득 셀러리와 합산 사용</p></div>
  </div>
  <div class="sec">${isBrand?'브랜드 전용 아이템':'인플루언서 전용 아이템'} <span style="font-weight:400;letter-spacing:0;text-transform:none;color:var(--mute)">— ${isBrand?'브랜드 센터':'인플루언서 센터'}에서만 구매·사용</span></div>
  <div class="grid g2">${items.map(it=>`<div class="card shop-item">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div><div style="font-weight:800;font-size:15px">${it.name}</div><div style="font-size:12.5px;color:var(--mute);margin-top:4px">${it.desc}</div></div>
        <span class="celprice">${CEL} ${it.price}</span>
      </div>
      <div class="btnrow" style="margin-top:12px">
        ${it.auto?`<span class="st gray" style="animation:none">사용 시 자동 차감</span>`
          :(owned[it.id]&&!it.repeat&&passActive(ent,it.id,it.days))?`<span class="st green">보유 중${it.days?` · ${Math.max(0,it.days-Math.floor((today()-P(owned[it.id]))/DAY))}일 남음`:(it.id==='featured'||it.id==='boost'?' · 활성':'')}</span>`
          :`<button class="pri sm" data-act="buyItem" data-k="${it.id}">${CEL} ${it.price} 로 구매</button>${it.id==='sample'&&!isBrand?`<span class="st ${sampleLeft(ent)===Infinity?'green':sampleLeft(ent)>0?'blue':'red'}" style="animation:none">이번 달 남은 횟수 ${sampleLeft(ent)===Infinity?'무제한':sampleLeft(ent)+'회'}</span>`:''}`}
      </div>
    </div>`).join('')}</div>
  <div class="sec">셀러리 내역</div>
  <div class="tblw"><table>
    <thead><tr><th>일자</th><th>내용</th><th class="num">변동</th></tr></thead>
    <tbody>${ledger.map(e=>`<tr><td class="num">${md(P(e.at))}</td><td>${esc(e.memo)}</td><td class="num" style="color:${e.delta>0?'var(--red)':'var(--danger)'};font-weight:700">${e.delta>0?'+':''}${e.delta} ${CEL}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">내역이 없습니다</td></tr>'}</tbody>
  </table></div>`;
}

/* ============ LIVE SALES (seller + brand shared) ============ */
function vSales(){
  let cs;
  if(S.view.role==='seller') cs=D_().campaigns.filter(c=>c.sellerId===S.actingSeller&&c.status==='LIVE');
  else {const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);cs=D_().campaigns.filter(c=>myP.includes(c.productId)&&c.status==='LIVE');}
  const t=ymd(today());
  const head=`<h2 class="pg">실시간 매출 <small>LIVE 판매의 판매 현황 — 주문이 들어오면 즉시 반영</small></h2>
  <div style="margin-bottom:16px"><button class="${liveTimer?'danger':'pri'}" data-act="toggleLive">${liveTimer?'⏸ 실시간 판매 시뮬레이션 중지':'▶ 실시간 판매 시뮬레이션 시작'}</button>
  <span style="font-size:12px;color:var(--mute);margin-left:10px">실서비스에선 결제 웹훅으로 자동 반영됩니다</span></div>`;
  if(!cs.length) return head+`<div class="listcard"><div class="empty">지금 LIVE 상태인 판매가 없습니다 — 캠페인을 시작해보세요</div></div>`;
  return head+cs.map(c=>{
    const p=prod(c.productId),s=seller(c.sellerId),k=calc(c);
    const os=campOrders(c.id);
    const todayOs=os.filter(o=>o.at===t&&o.status==='PAID');
    const todayRev=todayOs.reduce((a,o)=>a+o.unit*o.qty,0);
    const visits=Math.round((k.paidCnt+k.refCnt)*17.3);
    const conv=visits?((k.paidCnt+k.refCnt)/visits*100).toFixed(1):'0.0';
    // last 7 days bars
    const days=[...Array(7)].map((_,i)=>{const d=ymd(addD(today(),i-6));
      const rev=os.filter(o=>o.at===d&&o.status!=='CANCELED').reduce((a,o)=>a+o.unit*o.qty,0);
      return {d,rev};});
    const mx=Math.max(...days.map(x=>x.rev),1);
    const feed=os.slice(-10).reverse();
    return `<div class="sec">${esc(p.name)} · ${s.handle} <span class="st live" style="margin-left:4px"><span class="pulse"></span>진행중</span></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">오늘 매출</div><div class="val">₩${fmt(todayRev)}</div><div class="sub">주문 ${todayOs.length}건</div></div>
      <div class="card kpi"><div class="lbl">누적 확정 매출</div><div class="val">₩${fmt(k.net)}</div><div class="sub">결제 ${k.paidCnt}건 · 환불 ${k.refCnt}건</div></div>
      <div class="card kpi"><div class="lbl">${S.view.role==='seller'?'내 수수료 (실시간)':'브랜드 정산액 (실시간)'}</div><div class="val" style="color:var(--money)">₩${fmt(S.view.role==='seller'?k.sfTotal*(1-WHT):k.brandPay)}</div><div class="sub">${S.view.role==='seller'?'원천징수 후 예상':'수수료 차감 후 예상'}</div></div>
      <div class="card kpi"><div class="lbl">방문 → 구매 전환</div><div class="val">${conv}%</div><div class="sub">방문 ${fmt(visits)}회 (추정)</div></div>
    </div>
    <div class="livegrid" style="margin-top:16px">
      <div class="card"><h4 style="margin:0 0 4px;font-size:13px">최근 7일 매출</h4>
        <div class="barwrap"><div class="bars">${days.map(x=>`<div class="b" style="height:${Math.max(3,x.rev/mx*100)}%"><span class="bl">${x.rev?'₩'+fmt(Math.round(x.rev/1000))+'k':''}</span><span class="bd">${md(P(x.d))}</span></div>`).join('')}</div></div>
      </div>
      <div class="card" style="padding:0"><h4 style="margin:0;padding:14px 16px 8px;font-size:13px">주문 피드</h4>
        <div class="feed">${feed.map(o=>`<div class="rowitem"><div class="grow"><span style="font-weight:600">${o.buyer}</span> <span class="sub">${o.qty}개 · ${md(P(o.at))}</span></div><span class="num" style="font-family:'IBM Plex Mono',monospace">₩${fmt(o.unit*o.qty)}</span>${o.status==='REFUNDED'?'<span class="st red">환불</span>':''}</div>`).join('')||'<div class="empty">아직 주문 없음</div>'}</div>
      </div>
    </div>
    <div style="margin-top:12px"><button class="sm ghost" data-act="open" data-k="${c.id}">캠페인 상세 →</button></div>`;
  }).join('');
}
