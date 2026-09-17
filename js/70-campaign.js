/* ============ CAMPAIGN DETAIL ============ */
function vCampDetail(cid){
  const c=camp(cid);if(!c)return '<div class="empty">캠페인을 찾을 수 없습니다</div>';
  const p=prod(c.productId),b=brand(p.brandId),s=seller(c.sellerId);
  const k=calc(c);
  const msgs=(D_().messages[cid]||[]);
  const role=S.view.role==='brand'?'brand':S.view.role==='admin'?'admin':'seller';
  const linkUrl=`sellery.life/s/${s.handle.slice(1)}/${cid}`;
  return `<button class="ghost sm" data-act="back">← 목록으로</button>
  <div class="det-head" style="margin-top:12px">
    ${pIcon(p,52)}
    <div style="flex:1;min-width:220px">
      <div class="t">${esc(p.name)} <span style="color:var(--mute);font-weight:400;font-size:13px">· ${cid.toUpperCase()}</span></div>
      <div style="font-size:12.5px;color:var(--mute)"><span class="chip brand">${b.name}</span> × <span class="chip seller">${platIcon(s)} ${s.name} ${s.handle}</span>
      · 판매가 ₩${fmt(p.gp)} · 수수료 ${(p.rate*100).toFixed(0)}%
      ${c.start?` · 기간 ${md(P(c.start))}–${md(P(c.end))}`:''}</div>
      ${stepper(c.status)}
    </div>
    <div>${stChip(c.status)}</div>
  </div>
  <div class="det-body">
    <div class="thread">
      <div class="msgs">${msgs.map(m=>{
        if(m.type==='sys')return `<div class="sysline">${m.txt} · ${md(P(m.at))}</div>`;
        if(m.type==='warn')return `<div class="warnline">${esc(m.txt)}</div>`;
        return `<div class="msg ${m.role}"><div class="who" style="color:${m.role==='admin'?'var(--ink)':`var(--${m.role==='brand'?'brand':'seller'}-c)`}">${m.role==='brand'?b.name:m.role==='admin'?'셀러리 운영팀':s.name}</div>${esc(m.txt)}<div class="tm">${md(P(m.at))}</div></div>`;
      }).join('')||'<div class="sysline">대화가 없습니다</div>'}</div>
      <div class="composer">
        <span class="as">${role==='brand'?'브랜드':role==='admin'?'브랜드(관리자 대행)':'인플루언서'}로 발신</span>
        <input id="chatIn" placeholder="메시지 입력… (시스템 승인·일정은 우측 버튼으로)" data-enter="sendChat">
        <button class="pri" data-act="sendChat" data-k="${cid}">전송</button>
      </div>
    </div>
    <div class="actions">
      ${detActions(c,k,p,s,linkUrl)}
      <div class="card stmtcard">
        <h4>정산 미리보기</h4>
        <table class="stmt" style="min-width:0;font-size:12.5px">
          <tr><td>결제 ${k.paidCnt+k.refCnt}건</td><td class="num">₩${fmt(k.gross)}</td></tr>
          <tr><td>환불 ${k.refCnt}건</td><td class="num">−₩${fmt(k.refund)}</td></tr>
          <tr><td><b>확정 매출</b></td><td class="num"><b>₩${fmt(k.net)}</b></td></tr>
          ${k.sampleNet?`<tr><td>　└ 샘플 구매분 (인플 수수료 0)</td><td class="num">₩${fmt(k.sampleNet)}</td></tr>`:''}
          <tr><td>PG ${(PG_RATE*100).toFixed(1)}%</td><td class="num">−₩${fmt(k.pg)}</td></tr>
          <tr><td>인플루언서 ${(p.rate*100).toFixed(0)}%${k.gBonus?` <b style="color:var(--red)">+${(gradeBonusOf(s)*100).toFixed(1)}%p ${gname(s)}</b>`:''}${k.rb?' <b style="color:var(--red)">+1%p 추천</b>':''}</td><td class="num">−₩${fmt(k.sfTotal)}</td></tr>
          ${k.rb?`<tr><td>추천인 보상 2%</td><td class="num">−₩${fmt(k.refReward)}</td></tr>`:''}
          ${k.bb?`<tr><td>브랜드 추천인 보상 1%</td><td class="num">−₩${fmt(k.bReward)}</td></tr><tr><td>신규 브랜드 수수료 할인 −1%p</td><td class="num" style="color:var(--red)">+₩${fmt(k.bBoost)}</td></tr>`:''}
          ${k.bDisc?`<tr><td>브랜드 ${bgname(b)} 등급 수수료 할인 −${(bDiscOf(b)*100).toFixed(1)}%p</td><td class="num" style="color:var(--red)">+₩${fmt(k.bDisc)}</td></tr>`:''}
          <tr><td>플랫폼 ${(PLAT_RATE*100).toFixed(0)}%${k.costs?' (보너스·보상·할인 차감 후)':''}</td><td class="num">−₩${fmt(k.pf)}</td></tr>
          <tr class="tot"><td>브랜드 정산액</td><td class="num">₩${fmt(k.brandPay)}</td></tr>
        </table>
        ${c.end?`<div style="font-size:11.5px;color:var(--mute);margin-top:8px">정산 기준일(D+${CLEAR_DAYS}): <b>${md(settleDue(c))}</b></div>`:''}
      </div>
    </div>
  </div>`;
}
function detActions(c,k,p,s,linkUrl){
  const A=[];
  const V=S.view.role; // seller | brand | admin — 액션은 해당 역할에게만
  const card=(h,hint,btns)=>`<div class="card"><h4>${h}</h4><p class="hint">${hint}</p><div class="btnrow">${btns}</div></div>`;
  const sim=(h,hint,btns)=>`<div class="sim" style="margin-bottom:12px"><h4>⏱ ${h}</h4><p>${hint}</p><div class="btnrow">${btns}</div></div>`;
  const wait=(t,d)=>card(t+' ⏳',d,'');
  switch(c.status){
    case 'SAMPLE_REQUESTED':
      if(V==='seller') A.push(wait('브랜드 승인 대기 중','샘플 요청이 접수됐어요. 브랜드가 프로필을 검토 중입니다 — 보통 24시간 내 응답해요.'));
      else A.push(card('샘플 요청 검토 <span class="chip brand">브랜드 액션</span>',
        `${platIcon(s)} ${s.name} ${s.handle} · 팔로워 ${fmt(s.followers)} · 등급 ${gname(s)}. 승인 시 배송지가 브랜드에 전달됩니다.`,
        `<button class="pri" data-act="approveSample" data-k="${c.id}">승인</button>
         <button class="danger" data-act="rejectSample" data-k="${c.id}">거절</button>`));
      break;
    case 'INVITED':
      if(V==='seller') A.push(card('브랜드 직접 제안 <span class="chip seller">인플루언서 액션</span>',
        `<b>${esc(brand(p.brandId).name)}</b>가 <b>${esc(p.name)}</b> 판매를 제안했어요 · 수수료 ${(p.rate*100).toFixed(0)}%${gradeBonusOf(s)?` + 등급 보너스 ${(gradeBonusOf(s)*100).toFixed(1)}%p`:''} · 수락 시 샘플 발송 단계부터 시작됩니다 (무상 · 이달 한도 미차감).`,
        `<button class="pri" data-act="acceptInvite" data-k="${c.id}">수락 → 샘플 받기</button>
         <button data-act="declineInvite" data-k="${c.id}">거절</button>`));
      else A.push(wait('인플루언서 수락 대기 중','제안을 보냈어요. 인플루언서가 수락하면 샘플 발송 단계로 넘어갑니다 — 보통 48시간 내 응답해요.'));
      break;
    case 'DECLINED': A.push(card('제안 거절됨','인플루언서가 이번 제안을 수락하지 않았습니다.'+(c.celRefunded?` 제안권 ${CEL} ${c.celRefunded} 환급 완료.`:''),'')); break;
    case 'SAMPLE_PURCHASED':{
      const sp=c.samplePaid||{};const rf=spOf(p).refund;
      if(V==='seller') A.push(wait('결제 완료 · 샘플 발송 준비 중',`샘플 구매 ₩${fmt(sp.price||0)}${sp.cel?` (${CEL} ${sp.cel} + ₩${fmt(sp.cash||0)})`:' (현금)'} — 브랜드가 발송하면 운송장이 표시됩니다.${rf?' 판매 확정 시 구매액이 환급됩니다.':''}`));
      else A.push(card(`샘플 발송 <span class="chip brand">브랜드 액션</span> <span class="st green" style="animation:none">구매 완료 ₩${fmt(sp.price||0)}</span>`,'인플루언서가 샘플을 구매했습니다(승인 불필요). 운송장 번호를 입력하면 배송 추적이 시작됩니다.',
        `<input id="trackIn" placeholder="운송장 번호 (예: 6890-1234-5678)" style="margin-bottom:8px">
         <button class="pri" data-act="shipSample" data-k="${c.id}">발송 처리</button>`));
      break;}
    case 'SAMPLE_APPROVED':
      if(V==='seller') A.push(wait('샘플 발송 준비 중','브랜드가 요청을 승인했어요. 샘플이 발송되면 운송장이 여기 표시됩니다.'));
      else A.push(card('샘플 발송 <span class="chip brand">브랜드 액션</span>','운송장 번호를 입력하면 배송 추적이 시작됩니다.',
        `<input id="trackIn" placeholder="운송장 번호 (예: 6890-1234-5678)" style="margin-bottom:8px">
         <button class="pri" data-act="shipSample" data-k="${c.id}">발송 처리</button>`));
      break;
    case 'SAMPLE_SHIPPED':
      if(V==='brand') A.push(wait('인플루언서 수령 대기 중',`운송장 ${c.tracking||'—'} · 인플루언서가 수령을 확인하면 테스트가 시작됩니다.`));
      else A.push(card('샘플 수령 확인 <span class="chip seller">인플루언서 액션</span>',`운송장 ${c.tracking||'—'} · 수령 확인 시 테스트 기한 14일이 시작됩니다.`,
        `<button class="pri" data-act="receiveSample" data-k="${c.id}">수령 확인</button>`));
      break;
    case 'TESTING':
      if(V==='brand') A.push(wait('인플루언서 테스트 중',`인플루언서가 샘플을 사용해보고 있어요. 기한 ${c.testDue?md(P(c.testDue)):'—'} 까지 진행 여부를 응답합니다.`));
      else A.push(card('테스트 후 진행 결정 <span class="chip seller">인플루언서 액션</span>',
        `기한 ${c.testDue?md(P(c.testDue)):'—'} 까지. 진행 시 판매 일정을 제안합니다.`,
        `<button class="pri" data-act="openSchedule" data-k="${c.id}">진행할게요 → 일정 제안</button>
         <button data-act="passCamp" data-k="${c.id}">이번엔 패스</button>`));
      break;
    case 'SCHEDULE_PROPOSED':
      if(V==='seller') A.push(wait('브랜드 일정 승인 대기',`제안한 기간 <b>${md(P(c.propStart))} – ${md(P(c.propEnd))}</b> · 재고 ${fmt(c.propQty)}개를 브랜드가 검토 중이에요.`));
      else A.push(card('일정 승인 <span class="chip brand">브랜드 액션</span>',
        `제안 기간: <b>${md(P(c.propStart))} – ${md(P(c.propEnd))}</b> · 배정 재고 ${fmt(c.propQty)}개. 승인하면 이 기간이 캘린더에 표시됩니다(플래티넘 이상이 잡은 기간은 상위 등급만 추가 진입).`,
        `<button class="pri" data-act="confirmSchedule" data-k="${c.id}">일정 승인</button>
         <button class="danger" data-act="rejectSchedule" data-k="${c.id}">반려 (재제안 요청)</button>`));
      break;
    case 'SCHEDULE_CONFIRMED':{
      const dday=Math.ceil((P(c.start)-today())/DAY);
      A.push(card('판매 대기 중',`시작 ${md(P(c.start))} (D-${Math.max(dday,0)}) — 시작 시각에 링크가 자동 활성화됩니다.`,''));
      if(V==='admin') A.push(sim('시뮬레이션','실서비스에선 스케줄러가 자동 처리합니다.',
        `<button class="sm" data-act="goLive" data-k="${c.id}">판매 시작 처리</button>`));
      break;}
    case 'LIVE':
      A.push(card('판매 링크 <span class="st live"><span class="pulse"></span>LIVE</span>',
        `<code style="font-size:11.5px">${linkUrl}</code> · 종료 ${md(P(c.end))}`,
        `<button class="pri" data-act="preview" data-k="${c.id}">판매 페이지 미리보기</button>
         <button data-act="copyLink" data-k="${linkUrl}">링크 복사</button>`));
      if(V==='admin') A.push(sim('판매 시뮬레이션','구매자 주문을 흉내내 정산 숫자가 움직이는 걸 확인하세요.',
        `<button class="sm" data-act="simOrders" data-k="${c.id}">주문 +5건</button>
         <button class="sm" data-act="simOrders20" data-k="${c.id}">주문 +20건</button>
         <button class="sm" data-act="endCamp" data-k="${c.id}">판매 종료 처리</button>`));
      break;
    case 'CLEARING':{
      const due=settleDue(c);
      A.push(card('교환·환불 처리 기간',
        `종료 ${md(P(c.end))} → 정산 기준일 <b>${md(due)}</b> (D+${CLEAR_DAYS}). 이 기간의 환불은 정산액에서 차감됩니다.`,''));
      if(V==='admin') A.push(sim('시뮬레이션','',`<button class="sm" data-act="ffwd" data-k="${c.id}">⏩ 3주 경과 처리</button>`));
      break;}
    case 'SETTLED':
      A.push(card('정산 완료 ✓',`인플루언서 지급 ₩${fmt(k.sfTotal*(1-sellerWht(s)))}${sellerWht(s)?' (원천징수 3.3% 후)':' (사업자 · 세금계산서)'} · 브랜드 지급 ₩${fmt(k.brandPay)}. 성과가 좋았다면 같은 조합으로 바로 재판매를 열 수 있습니다.`,
        `${V!=='brand'?`<button class="pri" data-act="regongu" data-k="${c.id}">🔁 재판매 제안 (샘플 생략)</button>`:''}
         <button data-act="settleCSV">명세 CSV</button>`));
      break;
    case 'REJECTED': A.push(card('거절된 요청','브랜드가 이번 요청을 승인하지 않았습니다.','')); break;
    case 'PASSED': A.push(card('인플루언서 패스','인플루언서가 테스트 후 진행하지 않기로 했습니다.','')); break;
  }
  return A.join('');
}

/* ============ modals ============ */
function openModal(html){$('#modalroot').innerHTML=`<div class="modal-bg"><div class="modal">${html}</div></div>`;}
function closeModal(){$('#modalroot').innerHTML='';}
function scheduleModal(cid){
  const c=camp(cid),p=prod(c.productId);
  const slots=D_().campaigns.filter(x=>x.productId===p.id&&['SCHEDULE_CONFIRMED','LIVE'].includes(x.status));
  openModal(`<h3>판매 일정 제안 — ${esc(p.name)}</h3>
  <div class="fld"><label>이 상품의 확정 기간 — ${gfull(PRIORITY_TIER).replace(/<[^>]+>/g,'').trim()} 이상이 잡은 기간은 상위 등급만 진입 가능</label>
    <div class="slots">${slots.map(x=>`<div class="slot"><span class="rng">${md(P(x.start))} – ${md(P(x.end))}</span><span>${seller(x.sellerId).handle} 확정</span></div>`).join('')||'<div class="slot">아직 확정된 기간 없음</div>'}</div></div>
  <div class="fld"><label>시작일</label><input type="date" id="schStart" value="${ymd(addD(today(),7))}" min="${ymd(addD(today(),1))}"></div>
  <div class="fld"><label>기간</label><select id="schLen"><option value="3">3일</option><option value="5" selected>5일</option><option value="7">7일</option></select></div>
  <div class="fld"><label>희망 배정 재고 <span style="font-weight:400">— 배정 가능 ${fmt(stockLeft(p,cid))}개</span></label><input type="number" id="schQty" value="${Math.min(500,stockLeft(p,cid))}" min="50" step="50" max="${stockLeft(p,cid)}"></div>
  <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="proposeSchedule" data-k="${cid}">승인 요청 보내기</button></div>`);
}
function sampleBuyModal(pid){
  const p=prod(pid),me=seller(S.actingSeller),b=brand(p.brandId),sp=spOf(p),pr=samplePrice(p),sl=sampleSplit(pr),bal=celBal(S.actingSeller);
  const canCel=sl.cel>0&&bal>=sl.cel;
  openModal(`<h3>샘플 구매 — ${pIcon(p,26)} ${esc(p.name)}</h3>
  <div style="font-size:12.5px;color:var(--mute);margin:-8px 0 12px">${esc(b.name)} · 무상 기준 <span class="gradebox sm">${gfull(sp.freeGrade)}</span> 이상 · 내 등급 <span class="gradebox sm">${gfull(gname(me))}</span></div>
  <table class="stmt" style="min-width:0;font-size:13px">
    ${sp.buyMode==='fixed'?`<tr><td>브랜드 지정 샘플가 (1회 한정)</td><td class="num"><b>₩${fmt(pr)}</b></td></tr>`
    :`<tr><td>판매가</td><td class="num">₩${fmt(p.gp)}</td></tr><tr><td>− 내 수수료 ${(p.rate*100).toFixed(0)}%</td><td class="num">−₩${fmt(p.gp-pr)}</td></tr><tr class="tot"><td>샘플 구매가</td><td class="num">₩${fmt(pr)}</td></tr>`}
  </table>
  <div class="lbl-sm" style="margin:14px 0 6px">결제 수단</div>
  <label class="opt ${canCel?'':'on'}" style="display:flex;gap:10px"><input type="radio" name="spay" value="cash" ${canCel?'':'checked'}> <span>현금 결제 (셀러리 안전결제)</span><b>₩${fmt(pr)}</b></label>
  <label class="opt ${canCel?'on':''}" style="display:flex;gap:10px;${sl.cel?'':'opacity:.5'}"><input type="radio" name="spay" value="cel" ${canCel?'checked':'disabled'}> <span>셀러리 우선 결제 <span style="color:var(--mute)">(1${CEL} = ₩${fmt(SAMPLE_CEL_WON)} · 보유 ${CEL} ${bal})</span></span><b>${sl.cel?`${CEL} ${sl.cel}${sl.cash?' + ₩'+fmt(sl.cash):''}`:'해당 없음'}</b></label>
  ${sl.cel&&!canCel?`<div style="font-size:12px;color:var(--danger);margin-top:6px">셀러리 ${sl.cel}개가 필요해요 (보유 ${bal}) — <span data-act="shopGo" style="text-decoration:underline;cursor:pointer">셀러리 샵에서 충전</span></div>`:''}
  <p style="font-size:12px;color:var(--mute);margin-top:12px">구매 샘플은 브랜드 승인 없이 바로 발송 단계로 넘어가고, 이달 무상 한도를 쓰지 않습니다. 브랜드는 일반 판매 1건과 동일하게 정산받습니다(플랫폼 수수료 10% 동일).${sp.refund?' <b>이 상품은 판매 확정 시 샘플 구매액을 환급합니다.</b>':''}</p>
  <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="confirmSampleBuy" data-k="${pid}">결제하고 샘플 받기</button></div>`);
}
/* 인플루언서 프로필 모달 — 갤러리 카드(데이터 게이트 포함) 그대로 */
function sellerProfileModal(sid){
  const sl=seller(sid);if(!sl)return;S.profileOpen=sid;
  openModal(`<h3 style="display:flex;align-items:center;gap:8px">인플루언서 프로필 <span class="st gray" style="animation:none">${sl.hidden?'비공개':'공개'}</span></h3>
  <div class="profile-wrap">${sellerCard(sl,'')}</div>
  <div class="foot"><button data-act="closeModal">닫기</button></div>`);
}
function inviteModal(sid){
  const s=seller(sid);
  const disp=s.hidden?'○○○ 인플루언서 (익명)':s.name+' '+s.handle;
  const myP=D_().products.filter(p=>p.brandId===S.actingBrand&&p.status==='listed');
  if(!myP.length){toast('노출 중인 상품이 없습니다 — 상품을 먼저 등록하세요');return;}
  openModal(`<h3>판매 직접 제안 — ${disp}</h3>
  <div class="fld"><label>제안할 상품</label><select id="invProd">${myP.map(p=>`<option value="${p.id}">${p.name} · 판매가 ₩${fmt(p.gp)} · 수수료 ${(p.rate*100).toFixed(0)}%</option>`).join('')}</select></div>
  <div class="fld"><label>제안 메시지</label><textarea id="invMsg" rows="3">안녕하세요${s.hidden?'':' '+s.name+'님'}, ${brand(S.actingBrand).name}입니다. 채널 결이 저희 상품과 잘 맞아 판매를 제안드려요. 샘플부터 보내드릴게요!</textarea></div>
  <p style="font-size:12px;color:var(--mute)">인플루언서가 수락하면 샘플 발송 단계부터 시작됩니다 · 거절 시 사용한 제안권(다이아·블랙 ${CEL} 10)은 자동 환급됩니다.</p>
  <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="confirmInvite" data-k="${sid}">제안 보내기</button></div>`);
}
let NP={thumb:null,imgs:[]};
function fileToDataURL(file,maxW,cb){
  const img=new Image();
  img.onload=()=>{
    const sc=Math.min(1,maxW/img.width);
    const w=Math.round(img.width*sc),h=Math.round(img.height*sc);
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;
    cv.getContext('2d').drawImage(img,0,0,w,h);
    cb(cv.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',.8));
    URL.revokeObjectURL(img.src);
  };
  img.src=URL.createObjectURL(file);
}
function productModal(pid){
  const ed=pid?prod(pid):null;
  const sp=ed?spOf(ed):{freeGrade:'실버',buyMode:'auto',fixedPrice:0,refund:false};
  const locked=ed&&D_().campaigns.some(c=>c.productId===ed.id&&['SCHEDULE_CONFIRMED','LIVE','CLEARING'].includes(c.status));
  NP={thumb:ed?ed.thumb:null,imgs:ed&&ed.imgs?ed.imgs.slice():[]};
  openModal(`<h3>${ed?'상품 수정 — '+esc(ed.name):'새 상품 등록'}</h3>
  ${locked?`<div class="notice" style="margin:0 0 12px">진행 중·확정된 판매가 있어 <b>판매가·수수료율은 변경할 수 없습니다</b>(신뢰 보호). 재고·샘플 정책·옵션·이미지·독점권은 수정 가능합니다.</div>`:''}
  <div class="fld"><label>상품명</label><input id="npName" value="${ed?esc(ed.name):''}" placeholder="예: 콜라겐 부스터 샷"></div>
  <div class="fld"><label>한 줄 설명</label><input id="npDesc" value="${ed?esc(ed.desc):''}" placeholder="예: 저분자 콜라겐 · 30포"></div>
  <div class="grid g2">
    <div class="fld"><label>썸네일 이미지 <span style="font-weight:400">— 누끼(배경 제거) PNG 권장</span></label>
      <div class="btnrow"><button class="sm ghost" data-act="npThumbPick">이미지 선택</button><span id="npThumbInfo" style="font-size:11.5px;color:var(--mute);align-self:center">${ed&&ed.thumb?`✓ 등록됨 <img src="${ed.thumb}" alt="" style="height:24px;vertical-align:middle;margin-left:6px">`:'미첨부'}</span></div></div>
    <div class="fld"><label>상세페이지 이미지 <span style="font-weight:400">(최대 4장)</span></label>
      <div class="btnrow"><button class="sm ghost" data-act="npImgPick">이미지 추가</button><span id="npImgInfo" style="font-size:11.5px;color:var(--mute);align-self:center">${ed&&ed.imgs?ed.imgs.length:0}장</span></div></div>
  </div>
  <div class="grid g2">
    <div class="fld"><label>독점권 오퍼 <span style="font-weight:400">(선택 · 등급 기준)</span></label>
      <select id="npExcl"><option value="">사용 안 함</option>${GRADES.slice(0,4).map(t=>`<option value="${t.g}" ${ed&&ed.exclusive&&exGradeOf(ed)===t.g?'selected':''}>${t.g} 등급 이상</option>`).join('')}</select></div>
    <div class="fld"><label>독점권 내용</label><input id="npExclLabel" value="${ed&&ed.exclusive?esc(ed.exclusive.label||''):''}" placeholder="예: 인스타그램 판매 독점권 · 3개월"></div>
  </div>
  <div class="fld"><label>카테고리 <span style="font-weight:400">— 건강·웰니스만 등록 가능</span></label><select id="npCat">${CATS.filter(c=>c!=='전체').map(c=>`<option value="${c}" ${ed&&ed.cat===c?'selected':''}>${c} — ${CAT_INFO[c].desc} (${CAT_INFO[c].ex})</option>`).join('')}</select>
    <div style="font-size:11.5px;color:var(--mute);margin-top:5px">${CAT_POLICY} 범위 밖 상품은 검수에서 반려됩니다.</div></div>
  <div class="grid g2">
    <div class="fld"><label>소비자가 (₩)</label><input id="npCp" type="number" value="${ed?ed.cp:39000}" step="1000" ${locked?'disabled':''}></div>
    <div class="fld"><label>판매가 (₩)</label><input id="npGp" type="number" value="${ed?ed.gp:29900}" step="100" ${locked?'disabled':''}></div>
    <div class="fld"><label>총 수수료율 (%) — 플랫폼 10%p 포함</label><input id="npRate" type="number" value="${ed?Math.round((ed.rate+PLAT_RATE)*100):30}" min="11" max="50" ${locked?'disabled':''}>
      <div id="npRateCalc" style="font-size:11.5px;margin-top:5px;color:var(--mute)">→ 플랫폼 <b>10%p</b> + 제안 수수료 <b style="color:var(--red)">20%</b> · 등급 보너스 포함 최대 <b>23%</b> (블랙, 보너스는 플랫폼 부담)</div></div>
    <div class="fld"><label>재고</label><input id="npStock" type="number" value="${ed?ed.stock:1000}" step="100"></div>
  </div>
  <div class="fld"><label>샘플 내용</label><input id="npSample" value="${ed?esc(ed.sample):'무상 1개'}" placeholder="예: 무상 1박스"></div>
  <div class="card" style="padding:14px 16px;margin:4px 0 12px;background:var(--surface-2)"><div class="lbl-sm" style="margin-bottom:8px">🎁 샘플 정책</div>
    <div class="grid g2">
      <div class="fld"><label>무상 샘플 기준 등급 <span style="font-weight:400">(이상 · 1회)</span></label><select id="npFreeGrade">${GRADES.slice().reverse().map(t=>`<option value="${t.g}" ${t.g===sp.freeGrade?'selected':''}>${t.g} 이상</option>`).join('')}</select>
        <div style="font-size:11px;color:var(--mute);margin-top:4px">권장: 3만원 미만 브론즈 · 3~8만원 실버 · 8만원 이상 골드</div></div>
      <div class="fld"><label>등급 미달 시 샘플 구매가</label><select id="npBuyMode"><option value="auto" ${sp.buyMode!=='fixed'?'selected':''}>자동 — 판매가 − 인플루언서 수수료</option><option value="fixed" ${sp.buyMode==='fixed'?'selected':''}>브랜드 지정가 (1회 한정)</option></select>
        <input id="npFixed" type="number" step="100" value="${sp.fixedPrice||''}" placeholder="지정가 (₩) — 지정가 선택 시" style="margin-top:6px"></div>
    </div>
    <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:4px"><input type="checkbox" id="npRefund" style="width:auto;margin:0" ${sp.refund?'checked':''}> 판매 확정 시 샘플 구매액 환급 (신규 인플루언서 유입용)</label>
    <div style="font-size:11px;color:var(--mute);margin-top:6px">샘플 구매는 인플루언서 수수료 0의 판매 1건으로 정산됩니다(플랫폼 10% 동일). 인플루언서는 현금 또는 셀러리(1🥬=₩20,000)로 결제합니다.</div>
  </div>
  <div class="fld"><label>구매 옵션 <span style="font-weight:400">— 한 줄에 하나, "옵션명 | 가격" (비우면 1개/2개 세트/3개 세트 자동 생성)</span></label>
    <textarea id="npOpts" rows="3" placeholder="1박스 (30포) | 29900&#10;2박스 세트 | 56800&#10;3박스 + 쉐이커 | 79900">${ed&&ed.options?ed.options.map(o=>esc(o.n)+' | '+o.price).join('\n'):''}</textarea></div>
  <p style="font-size:12px;color:var(--mute)">${ed?'수정한 내용은 저장 즉시 인플루언서·고객 화면에 반영됩니다. 판매가·수수료율을 바꾸면 재검수가 필요할 수 있습니다.':'등록 후 플랫폼 검수(관리자 탭)를 통과하면 인플루언서에게 노출됩니다. 고객 구매 페이지에는 옵션·가격·상세 이미지가 그대로 노출됩니다.'}</p>
  <div class="foot"><button data-act="closeModal">취소</button>${ed?`<button class="danger" data-act="deleteProduct" data-k="${ed.id}">삭제</button>`:''}<button class="pri" data-act="${ed?'saveProduct':'createProduct'}" data-k="${ed?ed.id:''}">${ed?'저장':'검수 요청'}</button></div>`);
}
