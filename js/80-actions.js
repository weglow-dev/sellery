/* ============ actions ============ */
const pushAdminLog=null;
function transition(cid,st,sysTxt){const c=camp(cid);c.status=st;if(sysTxt)pushSys(cid,sysTxt);save();render();}
const ACT={
  role(k){S.view={role:k,screen:'home',cid:null};render();},
  logout(){try{localStorage.removeItem('sellery-session');}catch(e){}S.session=null;location.href='login.html?role='+(S.view.role==='brand'?'brand':'seller');},
  screen(k){S.view.screen=k;S.view.cid=null;S.view.store=null;render();},
  goHome(){S.view={role:S.view.role,screen:'home',cid:null};render();},
  gotoMy(){
    if(S.view.role==='brand'){S.view={role:'brand',screen:'my',cid:null};render();return;}
    if(S.view.role==='admin'&&S.lockedRole){toast('관리자 설정은 준비 중입니다');return;}
    if(S.view.role==='customer'){if(S.cust){S.view={role:'customer',screen:'orders',cid:null,store:null};render();}else kakaoStart('');return;}
    S.view={role:'seller',screen:'my',cid:null};render();
  },
  saveBrandInfo(){
    const b=brand(S.actingBrand);
    const bank=$('#bmBank').value,account=$('#bmAccount').value.trim(),holder=$('#bmHolder').value.trim(),bizNo=$('#bmBizNo').value.trim();
    b.manager=$('#bmManager').value.trim()||b.manager;
    b.email=$('#bmEmail').value.trim()||b.email;
    if(bank==='선택'||!account||!holder||!bizNo){toast('은행·계좌·예금주·사업자등록번호를 입력해주세요');save();render();return;}
    b.settleInfo={...(b.settleInfo||{}),bank,account,holder,bizNo,mailOrder:$('#bmMailOrder').value.trim()};
    save();render();toast('브랜드 정보 저장 완료');
  },
  brandLogoPick(){
    let inp=document.getElementById('brandLogoFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.id='brandLogoFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        const f=inp.files[0];if(!f)return;
        const img=new Image();
        img.onload=()=>{
          const sz=192,cv=document.createElement('canvas');cv.width=sz;cv.height=sz;
          const x=cv.getContext('2d');
          const m=Math.min(img.width,img.height);
          x.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,sz,sz);
          brand(S.actingBrand).logo=cv.toDataURL(f.type==='image/png'?'image/png':'image/jpeg',.85);
          save();render();toast('브랜드 로고가 등록되었습니다');
          URL.revokeObjectURL(img.src);
        };
        img.src=URL.createObjectURL(f);
        inp.value='';
      });
    }
    inp.click();
  },
  brandDocPick(){
    let inp=document.getElementById('brandDocFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='image/*,.pdf';inp.id='brandDocFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        const f=inp.files[0];if(!f)return;
        const b=brand(S.actingBrand);
        b.settleInfo={...(b.settleInfo||{}),bizDoc:f.name};
        save();render();toast('사업자등록증 첨부 완료 (프로토타입: 파일명만 저장)');
        inp.value='';
      });
    }
    inp.click();
  },
  open(k){S.view.cid=k;render();},
  back(){S.view.cid=null;render();},
  setSeller(k,el){S.actingSeller=el.value;render();},
  setBrand(k,el){S.actingBrand=el.value;render();},
  setCat(k){S.catFilter=k;render();},
  setStage(k){S.stage=k;try{localStorage.setItem('slry-stage',k);}catch(e){}render();},
  calNav(k){S.calOff=k==='0'?0:(S.calOff||0)+ +k;render();},
  setGalGrade(k){S.galGrade=k;render();},
  setGalPlat(k){S.galPlat=k;render();},
  reset(){if(confirm('시드 데이터로 초기화할까요? 테스트 중 만든 데이터가 사라집니다.')){try{localStorage.removeItem(LS);}catch(e){};clearLinkCtx();S.data=seedData();save();S.view.cid=null;render();toast('초기화 완료');}},
  closeModal(){S.profileOpen=null;closeModal();},
  sellerProfile(sid){sellerProfileModal(sid);},

  reqSample(pid){
    const p=prod(pid);
    if(p.exclusiveSellerId&&p.exclusiveSellerId!==S.actingSeller){toast('이 상품은 독점 인플루언서가 확정되어 샘플 요청이 제한됩니다');return;}
    const me=seller(S.actingSeller);
    if(!freeEligible(p,me)){toast(`무상 샘플은 ${spOf(p).freeGrade} 등급 이상 — 샘플 구매로 진행할 수 있어요`);sampleBuyModal(pid);return;}
    if(hadFreeSample(p,me)){toast('이 상품의 무상 샘플은 이미 받았어요 (상품당 1회) — 샘플 구매로 진행');sampleBuyModal(pid);return;}
    if(sampleLeft(me)<=0){toast(`이번 달 무상 샘플 한도를 모두 사용했어요 (한도 ${sampleQuota(me)}회) — 샘플 구매로 진행`);sampleBuyModal(pid);return;}
    const id='c'+(D_().seq++);
    D_().campaigns.push({id,sellerId:S.actingSeller,productId:pid,status:'SAMPLE_REQUESTED',createdAt:ymd(today())});
    const s=seller(S.actingSeller);
    pushSys(id,`인플루언서 <b>${s.name}(${s.handle})</b>가 샘플을 요청했습니다`);
    save();S.view={role:'seller',screen:'camps',cid:id};render();toast('샘플 요청 완료 — 브랜드 승인 대기');
  },
  invite(sid){inviteModal(sid);},
  sampleBuy(pid){closeModal();sampleBuyModal(pid);},
  confirmSampleBuy(pid){
    const p=prod(pid),me=seller(S.actingSeller);const pr=samplePrice(p),sp=sampleSplit(pr);
    const method=($('input[name=spay]:checked')||{}).value||'cash';
    let paid={price:pr,cel:0,cash:pr,method:'cash'};
    if(method==='cel'){ if(!celSpend(S.actingSeller,sp.cel,`샘플 구매 · ${p.name} (₩${fmt(sp.cel*SAMPLE_CEL_WON)} 상당)`))return; paid={price:pr,cel:sp.cel,cash:sp.cash,method:'cel'}; }
    const id='c'+(D_().seq++);
    D_().campaigns.push({id,sellerId:S.actingSeller,productId:pid,status:'SAMPLE_PURCHASED',createdAt:ymd(today()),purchased:true,samplePaid:paid});
    D_().orders.push({id:'o'+(D_().seq++),campaignId:id,buyer:`${me.name} (샘플 구매)`,qty:1,unit:pr,status:'PAID',at:ymd(today()),sample:true});
    pushSys(id,`🧾 인플루언서 <b>${me.name}(${me.handle})</b>가 샘플을 <b>구매</b>했습니다 · ₩${fmt(pr)}${paid.cel?` (${CEL} ${paid.cel} + ₩${fmt(paid.cash)})`:' (현금)'} · 브랜드는 일반 판매와 동일하게 정산${spOf(p).refund?' · 판매 확정 시 구매액 환급':''}`);
    closeModal();save();S.view={role:'seller',screen:'camps',cid:id};render();toast('샘플 구매 완료 — 브랜드 발송 대기');
  },
  unlockSellerData(sid){
    const b=S.actingBrand;
    const pr=spendData(b,seller(sid),`데이터 확인 · ${seller(sid).name} ${seller(sid).handle} (${gname(seller(sid))})`);if(pr===false)return;
    const m=D_().brandDataUnlocks=D_().brandDataUnlocks||{};
    (m[b]=m[b]||[]).push(sid);
    save();render();if(S.profileOpen===sid)sellerProfileModal(sid);toast(pr===0?`브랜드 ${bgname(brand(b))} 등급 혜택 — 무료 열람 (이달 ${freeRefLeft(brand(b))}회 남음)`:`🥬 ${pr} 사용 — ${seller(sid).name}님의 성과 데이터가 열렸습니다`);
  },
  unlockRef(sid){
    const pr=spendData(S.actingBrand,seller(sid),`익명 레퍼런스 열람 · ○○○ 인플루언서 (${gname(seller(sid))})`);if(pr===false)return;
    (D_().unlockedRefs=D_().unlockedRefs||[]).push(sid);
    save();render();toast(pr===0?`브랜드 등급 혜택 — 무료 열람 (이달 ${freeRefLeft(brand(S.actingBrand))}회 남음)`:`🥬 ${pr} 사용 — 레퍼런스 상세 지표가 공개되었습니다`);
  },
  shopGo(){closeModal();S.view.screen='shop';render();},
  // 홈 TOP5 행 클릭: 공개 인플루언서 → 갤러리로 이동 + 바로 제안 / 비공개 → 🥬 2 구매 확인 후 제안
  topSeller(sid){
    const s=seller(sid); const un=(D_().unlockedRefs||[]).includes(sid); const pr=dataPrice(s);
    if(!s.hidden||un){S.view={role:'brand',screen:'gallery'};render();inviteModal(sid);return;}
    openModal(`<h3><span class="gradebox sm">${gfull(gname(s))}</span> ○○○ 인플루언서 <span class="st gray" style="animation:none">비공개</span></h3>
    <div style="font-family:'Archivo',sans-serif;font-size:23px;font-weight:800;margin:6px 0 2px">₩${fmt(s.m3Sales)} <span style="font-size:11px;color:var(--mute);font-weight:500">최근 3개월 매출</span></div>
    <div style="font-size:12.5px;color:var(--mute)">${platIcon(s)} ${s.cat} 주력 · 팔로워 ●●●,●●● · 좋아요 평균 ●,●●● — 상세 지표 잠김</div>
    <p style="font-size:13px;margin:14px 0 4px">비공개 인플루언서는 레퍼런스를 열람한 뒤 판매 제안을 보낼 수 있습니다. 열람 시 팔로워·참여율·매출/팔로워 지표가 공개되고 제안 화면으로 바로 이동합니다.</p>
    <div style="font-size:12px;color:var(--mute)">열람 가격은 등급별 ${CEL} 1–5 (${gfull(gname(s))} = ${CEL} ${pr}) · 보유 <b>${CEL} ${celBal(S.actingBrand)}</b> · 사용 후 ${CEL} ${celBal(S.actingBrand)-pr}</div>
    <div class="foot"><button data-act="closeModal">닫기</button><button data-act="shopGo">${CEL} 충전</button><button class="pri" data-act="unlockRefGo" data-k="${sid}">${CEL} ${pr} · 구매해서 보기</button></div>`);
  },
  unlockRefGo(sid){
    closeModal();
    const pr=spendData(S.actingBrand,seller(sid),`익명 레퍼런스 열람 · ○○○ 인플루언서 (${gname(seller(sid))})`);if(pr===false)return;
    (D_().unlockedRefs=D_().unlockedRefs||[]).push(sid);
    save();S.view={role:'brand',screen:'gallery'};render();toast(pr===0?'브랜드 등급 혜택 — 무료 열람. 바로 제안해보세요':`🥬 ${pr} 사용 — 레퍼런스가 공개되었습니다. 바로 제안해보세요`);inviteModal(sid);
  },
  prodDetail(pid){productDetailModal(pid);},
  reqSampleM(pid){closeModal();ACT.reqSample(pid);},
  reqExclusive(pid){
    (D_().exclusiveReqs=D_().exclusiveReqs||[]).push({id:'x'+(D_().seq++),productId:pid,sellerId:S.actingSeller,status:'PENDING',at:ymd(today())});
    closeModal();save();render();toast('독점권 신청 완료 — 브랜드에 내 프로필이 공개되고 승인 대기 상태가 됩니다');
  },
  approveExcl(rid){
    const r=D_().exclusiveReqs.find(x=>x.id===rid);if(!r)return;
    r.status='APPROVED';prod(r.productId).exclusiveSellerId=r.sellerId;
    save();render();toast(`독점권 승인 — ${seller(r.sellerId).name}(${seller(r.sellerId).handle})만 이 상품을 진행할 수 있습니다`);
  },
  rejectExcl(rid){
    const r=D_().exclusiveReqs.find(x=>x.id===rid);if(!r)return;
    r.status='REJECTED';save();render();toast('독점권 신청을 거절했습니다');
  },
  addCh(){channelModal(null);},
  editCh(chId){channelModal(chId);},
  saveCh(chId){
    const me=seller(S.actingSeller);
    const platform=$('#chPlat').value,handle=$('#chHandle').value.trim(),url=$('#chUrl').value.trim(),fol=+$('#chFol').value||0;
    if(!handle){toast('계정 핸들을 입력해주세요');return;}
    me.channels=me.channels||[];
    if(chId){
      const ch=me.channels.find(c=>c.id===chId);
      const changed=ch.handle!==handle||ch.platform!==platform;
      Object.assign(ch,{platform,handle,url,followers:fol});
      if(changed){ch.verified=false;delete ch.vcode;if(ch.primary){/* 대표 채널 정보 동기화는 재인증 후 */}}
      closeModal();save();render();toast(changed?'채널 수정됨 — 사칭 방지를 위해 재인증이 필요합니다':'채널 수정 완료');
    }else{
      me.channels.push({id:'ch'+(D_().seq++),platform,handle,url,followers:fol,verified:false});
      closeModal();save();render();toast('채널 추가됨 — 인증을 진행해주세요');
    }
  },
  delCh(chId){
    const me=seller(S.actingSeller);
    const ch=(me.channels||[]).find(c=>c.id===chId);
    if(ch&&ch.primary){toast('메인 SNS 채널은 삭제할 수 없습니다 — 먼저 다른 채널을 메인으로 설정하세요');return;}
    me.channels=me.channels.filter(c=>c.id!==chId);
    save();render();toast('채널 삭제됨');
  },
  setPrimaryCh(chId){
    const me=seller(S.actingSeller);
    const ch=(me.channels||[]).find(c=>c.id===chId);
    if(!ch||!ch.verified){toast('인증된 채널만 메인 SNS로 설정할 수 있습니다');return;}
    me.channels.forEach(c=>c.primary=(c.id===chId));
    me.platform=ch.platform;me.handle=ch.handle;if(ch.followers)me.followers=ch.followers;
    save();render();toast(`메인 SNS 변경 — ${ch.handle} (갤러리·필터에 이 채널 기준으로 노출됩니다)`);
  },
  openVerify(chId){verifyModal(chId);},
  copyVcode(code){try{navigator.clipboard.writeText(code);toast('인증 코드 복사됨');}catch(e){toast('복사 실패 — 코드: '+code);}},
  confirmVerify(chId){
    const me=seller(S.actingSeller);
    const ch=(me.channels||[]).find(c=>c.id===chId);if(!ch)return;
    ch.verified=true;delete ch.vcode;
    closeModal();save();render();toast(`✓ ${ch.handle} 인증 완료 — 이제 브랜드에 노출됩니다 (시뮬레이션)`);
  },
  saveSettleInfo(){
    const me=seller(S.actingSeller);
    const type=$('#siType').value,bank=$('#siBank').value,account=$('#siAccount').value.trim(),holder=$('#siHolder').value.trim(),bizNo=$('#siBizNo').value.trim();
    if(bank==='선택'||!account||!holder){toast('은행·계좌번호·예금주를 입력해주세요');return;}
    if(type==='biz'&&!bizNo){toast('사업자 정산은 사업자등록번호가 필요합니다');return;}
    me.settleInfo={...(me.settleInfo||{}),type,bank,account,holder,bizNo};
    save();render();toast('정산 정보 저장 완료 — 다음 정산부터 이 계좌로 지급됩니다');
  },
  bizDocPick(){
    let inp=document.getElementById('bizFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='image/*,.pdf';inp.id='bizFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        const f=inp.files[0];if(!f)return;
        const me=seller(S.actingSeller);
        me.settleInfo={...(me.settleInfo||{}),bizDoc:f.name};
        save();render();toast('사업자등록증 첨부 완료 (프로토타입: 파일명만 저장)');
        inp.value='';
      });
    }
    inp.click();
  },
  avatarPick(){
    let inp=document.getElementById('avFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.id='avFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        const f=inp.files[0];if(!f)return;
        const img=new Image();
        img.onload=()=>{
          const sz=256,cv=document.createElement('canvas');cv.width=sz;cv.height=sz;
          const x=cv.getContext('2d');
          const m=Math.min(img.width,img.height);
          x.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,sz,sz);
          seller(S.actingSeller).img=cv.toDataURL('image/jpeg',.82);
          save();render();toast('프로필 사진이 등록되었습니다');
          URL.revokeObjectURL(img.src);
        };
        img.src=URL.createObjectURL(f);
        inp.value='';
      });
    }
    inp.click();
  },
  buyItem(id){
    const isBrand=S.view.role==='brand';
    const who=isBrand?S.actingBrand:S.actingSeller;
    const ent=isBrand?brand(who):seller(who);
    const it=SHOP[isBrand?'brand':'seller'].find(x=>x.id===id);if(!it)return;
    if(!celSpend(who,it.price,`${it.name} 구매`))return;
    if(id==='sample'){ent.sampleExtra=(ent.sampleExtra||0)+1;save();render();toast(`✓ 샘플 요청 횟수 +1 (이번 달 남은 횟수 ${sampleLeft(ent)}회, −1 🥬)`);return;}
    ent.celeryItems={...(ent.celeryItems||{}),[id]:ymd(today())};
    if(id==='boost'){const p=D_().products.find(x=>x.brandId===who&&x.status==='listed');if(p){p.boosted=true;p.celeryItems={...(p.celeryItems||{}),boost:ymd(today())};}}
    if(id==='fastreview'){D_().products.filter(x=>x.brandId===who&&x.status==='pending').forEach(x=>{x.status='listed';x.stock=x.stock||500;});}
    if(id==='homefeature'){ // 고객 홈 상단 노출 (7일): 브랜드 → 내 상품의 진행 중 판매, 인플루언서 → 내 진행 중 판매
      const cs=D_().campaigns.filter(c=>['LIVE','SCHEDULE_CONFIRMED'].includes(c.status)&&(isBrand?prod(c.productId).brandId===who:c.sellerId===who));
      if(!cs.length){toast('노출할 진행 중·예정 판매가 없어 적용되지 않았습니다 (셀러리는 차감되지 않음)');(D_().celeryLedger).pop();save();render();return;}
      cs.forEach(c=>c.homeFeatured=ymd(today()));
    }
    save();render();toast(`✓ ${it.name} 구매 완료 (−${it.price} 🥬)`);
  },
  topup(n){
    const isBrand=S.view.role==='brand';
    const who=isBrand?S.actingBrand:S.actingSeller;
    const t=TOPUP.find(x=>x.n===+n);if(!t)return;
    (D_().celeryLedger=D_().celeryLedger||[]).push({who,at:ymd(today()),delta:t.n,won:t.won,memo:`셀러리 충전 (₩${fmt(t.won)} 시뮬 결제)`});
    save();render();toast(`🥬 ${t.n} 충전 완료 (시뮬레이션)`);
  },
  buyDataPass(pid){
    if(!celSpend(S.actingSeller,2,'매출 데이터 확인권 구매'))return;
    const me=seller(S.actingSeller);me.celeryItems={...(me.celeryItems||{}),datapass:ymd(today())};
    save();productDetailModal(pid);toast('✓ 매출 데이터 확인권 적용 — 전체 실적이 열렸습니다 (−2 🥬)');
  },
  copyBrandRef(code){
    try{navigator.clipboard.writeText(`셀러리에 브랜드 입점하세요! 가입 시 추천 코드 ${code} 입력하면 첫 ${BREF_TIMES}회 판매 플랫폼 수수료 −1%p → sellery.life/brand`);toast('브랜드 추천 메시지 복사됨');}
    catch(e){toast('복사 실패 — 코드: '+code);}
  },
  copyRef(code){
    try{navigator.clipboard.writeText(`셀러리에서 같이 판매해요! 가입할 때 추천 코드 ${code} 입력하면 첫 5회 판매 수수료 +1% → sellery.life`);toast('추천 메시지 복사됨 — DM으로 공유하세요');}
    catch(e){toast('복사 실패 — 코드: '+code);}
  },
  confirmInvite(sid){
    const pid=$('#invProd').value;const msg=$('#invMsg').value.trim();
    if(prod(pid).exclusiveSellerId&&prod(pid).exclusiveSellerId!==sid){toast('이 상품은 독점 인플루언서가 확정되어 다른 인플루언서에게 제안할 수 없습니다');return;}
    const tg=gname(seller(sid));
    if((tg==='다이아'||tg==='블랙')&&!celSpend(S.actingBrand,10,`${tg} 인플루언서 제안 · ${prod(pid).name}`))return;
    const id='c'+(D_().seq++);
    const celUsed=(tg==='다이아'||tg==='블랙')?10:0;
    D_().campaigns.push({id,sellerId:sid,productId:pid,status:'INVITED',createdAt:ymd(today()),invited:true,celUsed});
    pushSys(id,`브랜드 <b>${brand(S.actingBrand).name}</b>가 <b>${prod(pid).name}</b> 판매를 직접 제안했습니다 · 인플루언서 수락 대기`);
    if(msg)pushChat(id,'brand',msg);
    closeModal();save();S.view.cid=id;render();toast(`${seller(sid).hidden?'○○○ 인플루언서':seller(sid).name+'님'}에게 제안 발송 — 수락 대기`);
  },
  acceptInvite(cid){
    const c=camp(cid),s=seller(c.sellerId),p=prod(c.productId);
    if(p.exclusiveSellerId&&p.exclusiveSellerId!==c.sellerId){toast('이 상품은 다른 인플루언서의 독점권이 확정되어 진행할 수 없습니다');return;}
    if(p.status!=='listed'){toast('현재 노출 중단된 상품입니다 — 브랜드에 문의하세요');return;}
    transition(cid,'SAMPLE_APPROVED',`인플루언서가 제안을 <b>수락</b>했습니다 · 샘플 발송 단계로 이동 (배송지 전달됨)${s.hidden?` · 🔓 익명 인플루언서 신원 공개 — <b>${esc(s.name)} ${s.handle}</b>`:''}`);
    toast('제안 수락 — 브랜드가 샘플을 발송하면 운송장이 표시됩니다');
  },
  declineInvite(cid){
    const c=camp(cid),p=prod(c.productId),b=brand(p.brandId);
    if(c.celUsed){(D_().celeryLedger=D_().celeryLedger||[]).push({who:b.id,at:ymd(today()),delta:c.celUsed,memo:`제안 거절 환급 · ${p.name}`});c.celRefunded=c.celUsed;}
    transition(cid,'DECLINED',`인플루언서가 제안을 <b>거절</b>했습니다${c.celRefunded?` · 제안권 ${CEL} ${c.celRefunded} 브랜드에 환급`:''}`);
    toast('제안을 거절했습니다');
  },
  toggleLive(){
    if(liveTimer){clearInterval(liveTimer);liveTimer=null;toast('실시간 시뮬레이션 중지');render();return;}
    liveTimer=setInterval(()=>{
      const ls=D_().campaigns.filter(c=>c.status==='LIVE');
      if(!ls.length)return;
      if(Math.random()<.8){
        const c=ls[Math.floor(Math.random()*ls.length)];
        const p=prod(c.productId);
        const names=['김*은','이*아','박*희','최*진','정*수','한*별','윤*서','장*미'];
        D_().orders.push({id:'o'+(D_().seq++),campaignId:c.id,buyer:names[Math.floor(Math.random()*8)],qty:Math.random()<.2?2:1,unit:p.gp,status:'PAID',at:ymd(today())});
        save();
        const ae=document.activeElement;
        if(!(ae&&['INPUT','TEXTAREA','SELECT'].includes(ae.tagName))&&!document.querySelector('.modal-bg'))render();
      }
    },3500);
    toast('실시간 판매 시뮬레이션 시작 — 3~4초마다 주문 발생');render();
  },
  trackOne(oid){
    openModal(`<h3>운송장 입력 — ${oid.toUpperCase()}</h3>
    <div class="fld"><label>택배사</label><select id="tkCo">${['CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배'].map(x=>`<option>${x}</option>`).join('')}</select></div>
    <div class="fld"><label>운송장 번호</label><input id="tkNo" inputmode="numeric" placeholder="6890-1234-5678"></div>
    <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="saveTrackOne" data-k="${oid}">저장 · 배송중 처리</button></div>`);
  },
  saveTrackOne(oid){
    const o=D_().orders.find(x=>x.id===oid);if(!o)return;
    const t=$('#tkNo').value.trim();if(!t){toast('운송장 번호를 입력하세요');return;}
    o.tracking=t;o.courier=$('#tkCo').value;
    closeModal();save();render();toast('운송장 저장 — 배송중 처리 (구매자 알림은 실서비스에서 자동 발송)');
  },
  trackCSVTemplate(){
    const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);
    const cids=D_().campaigns.filter(c=>myP.includes(c.productId)).map(c=>c.id);
    const rows=[['주문번호','운송장번호']];
    D_().orders.filter(o=>cids.includes(o.campaignId)&&o.status==='PAID'&&!o.tracking).forEach(o=>rows.push([o.id.toUpperCase(),'']));
    dlCSV(`송장양식_${ymd(today())}.csv`,rows);
    toast(`송장 양식 다운로드 — 미발송 ${rows.length-1}건, 운송장번호 채워서 업로드하세요`);
  },
  trackCSVPick(){
    let inp=document.getElementById('trackCSVFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='.csv,.txt';inp.id='trackCSVFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        const f=inp.files[0];if(!f)return;
        const rd=new FileReader();
        rd.onload=()=>{
          const lines=String(rd.result).replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
          let n=0;
          lines.forEach(ln=>{
            const cells=ln.split(/[,\t]/).map(x=>x.replace(/^"|"$/g,'').trim());
            if(cells.length<2||!cells[1]||/주문번호/.test(cells[0]))return;
            const o=D_().orders.find(x=>x.id.toUpperCase()===cells[0].toUpperCase());
            if(o&&o.status==='PAID'){o.tracking=cells[1];n++;}
          });
          save();render();
          toast(n?`✓ 송장 ${n}건 적용 완료 — 배송중 처리`:'매칭된 주문이 없습니다 — 주문번호 열을 확인하세요');
        };
        rd.readAsText(f);
        inp.value='';
      });
    }
    inp.click();
  },
  poCSV(){
    const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);
    const cids=D_().campaigns.filter(c=>myP.includes(c.productId)).map(c=>c.id);
    const os=D_().orders.filter(o=>cids.includes(o.campaignId));
    const rows=[['주문번호','일자','상품','인플루언서','구매자','수량','단가','금액','상태']];
    os.forEach(o=>{const c=camp(o.campaignId),p=prod(c.productId);
      rows.push([o.id.toUpperCase(),o.at,p.name,seller(c.sellerId).handle,o.buyer,o.qty,o.unit,o.unit*o.qty,o.status==='PAID'?'결제완료':'환불']);});
    dlCSV(`발주서_${brand(S.actingBrand).name}_${ymd(today())}.csv`,rows);
    toast(`발주서 CSV 다운로드 — 주문 ${os.length}건`);
  },
  poEmail(){
    const po=D_().autoPO||{};
    const email=($('#poEmailIn')&&$('#poEmailIn').value.trim())||po.email||'logistics@brand.co';
    toast(`✉ 발주서가 ${email}(으)로 발송되었습니다 (시뮬레이션)`);
  },
  saveAutoPO(){
    const email=$('#poEmailIn').value.trim()||'logistics@brand.co';
    const cur=D_().autoPO||{on:false};
    D_().autoPO={on:!cur.on,email};
    save();render();toast(D_().autoPO.on?`자동 발주 ON — 매일 09:00 ${email} 발송`:'자동 발주 OFF');
  },
  regongu(cid){
    const old=camp(cid);
    const id='c'+(D_().seq++);
    const prio=passActive(seller(old.sellerId),'regongu',30);
    D_().campaigns.push({id,sellerId:old.sellerId,productId:old.productId,status:'TESTING',testDue:ymd(addD(today(),14)),createdAt:ymd(today()),regongu:true});
    pushSys(id,`🔁 <b>재판매</b> — 지난 판매(${cid.toUpperCase()}) 성과 기반. 샘플 단계 생략, 일정 제안부터 시작합니다${prio?' · <b>재판매 우선권</b> 보유: 일정 제안 시 즉시 확정':''}`);
    save();S.view.cid=id;render();toast('재판매 캠페인 생성 — 일정 제안부터 시작');
  },
  settleCSV(){
    let cs;
    if(S.view.role==='seller') cs=D_().campaigns.filter(c=>c.sellerId===S.actingSeller&&['LIVE','CLEARING','SETTLED'].includes(c.status));
    else {const myP=D_().products.filter(p=>p.brandId===S.actingBrand).map(p=>p.id);cs=D_().campaigns.filter(c=>myP.includes(c.productId)&&['LIVE','CLEARING','SETTLED'].includes(c.status));}
    const rows=[['캠페인','상품','인플루언서','시작','종료','확정매출','PG수수료','인플루언서수수료','플랫폼수수료','브랜드정산액','상태']];
    cs.forEach(c=>{const k=calc(c),p=prod(c.productId);
      rows.push([c.id.toUpperCase(),p.name,seller(c.sellerId).handle,c.start||'',c.end||'',k.net,Math.round(k.pg),Math.round(k.sfTotal),Math.round(k.pf),Math.round(k.brandPay),ST[c.status].l]);});
    dlCSV(`정산명세_${ymd(today())}.csv`,rows);
    toast('정산 명세 CSV 다운로드');
  },
  approveSample(cid){transition(cid,'SAMPLE_APPROVED','브랜드가 샘플 요청을 <b>승인</b>했습니다 · 배송지 전달됨');toast('샘플 승인');},
  rejectSample(cid){transition(cid,'REJECTED','브랜드가 샘플 요청을 거절했습니다');toast('거절 처리');},
  shipSample(cid){
    const t=($('#trackIn')&&$('#trackIn').value.trim())||'6890-'+Math.floor(1000+Math.random()*9000)+'-'+Math.floor(1000+Math.random()*9000);
    const c=camp(cid);c.tracking=t;
    transition(cid,'SAMPLE_SHIPPED',`샘플 발송 · 운송장 <b>${t}</b>`);toast('발송 처리 완료');
  },
  receiveSample(cid){
    const c=camp(cid);c.testDue=ymd(addD(today(),14));
    transition(cid,'TESTING',`인플루언서가 샘플을 수령했습니다 · 테스트 기한 <b>${md(P(c.testDue))}</b>`);toast('수령 확인 — 테스트 시작');
  },
  passCamp(cid){transition(cid,'PASSED','인플루언서가 테스트 후 <b>패스</b>를 선택했습니다');toast('패스 처리');},
  openSchedule(cid){scheduleModal(cid);},
  proposeSchedule(cid){
    const st=$('#schStart').value,len=+$('#schLen').value,qty=+$('#schQty').value;
    if(!st){toast('시작일을 선택하세요');return;}
    const en=ymd(addD(P(st),len-1));
    const c=camp(cid);
    const blk=periodBlock(c.productId,st,en,cid,c.sellerId);
    if(blk){toast(`⚠ 이 기간은 ${gname(blk)} 등급 인플루언서가 선점했습니다 — ${gfull(PRIORITY_TIER).replace(/<[^>]+>/g,'').trim()} 이상만 함께 판매할 수 있어요. 다른 날짜를 선택해주세요`);return;}
    if(qty<=0){toast('배정 재고를 입력하세요');return;}
    const sl_=stockLeft(prod(c.productId),cid);if(qty>sl_){toast(`⚠ 배정 가능한 재고를 초과했어요 (잔여 ${fmt(sl_)}개) — 수량을 줄여주세요`);return;}
    c.propStart=st;c.propEnd=en;c.propQty=qty;
    closeModal();
    if(c.regongu&&passActive(seller(c.sellerId),'regongu',30)){
      c.start=st;c.end=en;c.qty=qty;
      transition(cid,'SCHEDULE_CONFIRMED',`⚡ <b>재판매 우선권</b> — 일정 <b>${md(P(st))} – ${md(P(en))}</b> · 재고 ${fmt(qty)} 즉시 확정 (브랜드 승인 생략)`);
      toast('재판매 우선권 — 일정 즉시 확정');return;
    }
    transition(cid,'SCHEDULE_PROPOSED',`인플루언서가 판매 일정을 제안했습니다 · <b>${md(P(st))} – ${md(P(en))}</b> · 재고 ${fmt(qty)}`);
    toast('일정 제안 완료 — 브랜드 승인 대기');
  },
  confirmSchedule(cid){
    const c=camp(cid);
    const blk2=periodBlock(c.productId,c.propStart,c.propEnd,cid,c.sellerId);
    if(blk2){toast(`⚠ 제안 이후 ${gname(blk2)} 등급 인플루언서가 이 기간을 선점했어요 — 반려하고 재제안을 요청하세요`);return;}
    const sl_=stockLeft(prod(c.productId),cid);if(c.propQty>sl_){toast(`⚠ 잔여 재고(${fmt(sl_)}개)보다 많은 수량입니다 — 재고를 늘리거나 반려하세요`);return;}
    c.start=c.propStart;c.end=c.propEnd;c.qty=c.propQty;
    transition(cid,'SCHEDULE_CONFIRMED',`브랜드가 일정을 <b>승인</b>했습니다 · ${md(P(c.start))} – ${md(P(c.end))} 기간 확정`);
    toast('일정 확정 — 캘린더 잠금');
  },
  rejectSchedule(cid){transition(cid,'TESTING','브랜드가 일정을 반려했습니다 · 다른 기간으로 재제안해주세요');toast('반려 — 인플루언서 재제안 대기');},
  goLive(cid){
    const c=camp(cid);
    if(P(c.start)>today()){c.start=ymd(today());if(P(c.end)<P(c.start))c.end=ymd(addD(today(),4));}
    transition(cid,'LIVE','판매 링크 활성화 — <b>판매 시작</b>');toast('판매 LIVE! 링크가 활성화되었습니다');
  },
  simOrders(cid){simSell(cid,5);},
  simOrders20(cid){simSell(cid,20);},
  endCamp(cid){
    const c=camp(cid);c.end=ymd(today());
    transition(cid,'CLEARING',`판매 종료 · 교환/환불 기간 시작 (정산 예정 <b>${md(settleDue(c))}</b>)`);
    const po=D_().autoPO;
    if(po&&po.on){pushSys(cid,`📦 최종 발주서 자동 발송 완료 — ${esc(po.email)} (자동 발주)`);save();render();}
    toast('판매 종료 — D+21 클리어링 시작'+(po&&po.on?' · 최종 발주서 자동 발송됨':''));
  },
  ffwd(cid){
    const c=camp(cid);c.end=ymd(addD(today(),-CLEAR_DAYS));
    pushSys(cid,'⏩ (시뮬레이션) 3주 경과 — 정산 기준일 도래');
    save();render();toast('3주 경과 처리 — 관리자 탭에서 정산 실행 가능');
  },
  refund(oid){
    const o=D_().orders.find(x=>x.id===oid);if(!o||o.status!=='PAID')return;
    if(camp(o.campaignId).status==='SETTLED'){toast('정산이 완료된 판매의 주문은 환불 처리할 수 없습니다 — 별도 CS 정산 조정 필요');return;}
    if(o.sample){toast('인플루언서 샘플 구매분은 브랜드 정산에 포함된 건이라 여기서 환불하지 않습니다 — 캠페인 스레드에서 협의');return;}
    o.status='REFUNDED';
    pushSys(o.campaignId,`환불 처리 · ${o.buyer} · ₩${fmt(o.unit*o.qty)} (정산액 차감)`);
    save();render();toast('환불 처리 — 정산 기준액에서 차감됨');
  },
  runSettle(cid){
    const c=camp(cid),k=calc(c),p=prod(c.productId),sl=seller(c.sellerId);
    c.status='SETTLED';c.settledAt=ymd(today());
    if(+c.id.slice(1)>=100)sl.m3Sales=(sl.m3Sales||0)+k.net;   // 시드 이후 생성된 판매만 3개월 매출(등급·셀러리 획득 기준)에 누적
    let refundCash=0;
    if(c.samplePaid&&spOf(p).refund&&!c.sampleRefunded){const sp=c.samplePaid;if(sp.cel)(D_().celeryLedger=D_().celeryLedger||[]).push({who:c.sellerId,at:ymd(today()),delta:sp.cel,memo:`샘플 구매 환급 · ${p.name}`});refundCash=sp.cash||0;c.sampleRefunded=true;pushSys(cid,`🎁 샘플 구매액 환급 — ${sp.cel?`${CEL} ${sp.cel}`:''}${sp.cel&&refundCash?' + ':''}${refundCash?'₩'+fmt(refundCash):''} (판매 확정 조건 충족)`);}
    const bz=brand(p.brandId);const holdS=!(sl.settleInfo&&sl.settleInfo.account),holdB=!(bz.settleInfo&&bz.settleInfo.account);
    D_().settlements.push({at:ymd(today()),cid,title:`${p.name} · ${sl.handle}`,net:k.net,brandPay:k.brandPay,sellerPay:k.sfTotal*(1-sellerWht(sl))+refundCash,platFee:k.pf,pfNet:k.pfNet,holdS,holdB});
    if(holdS||holdB)pushSys(cid,`⏸ 지급 보류 — ${[holdS?'인플루언서':'',holdB?'브랜드':''].filter(Boolean).join('·')} 정산 계좌 미등록. 마이페이지에서 정산 정보를 등록하면 다음 지급 배치에 포함됩니다.`);
    if(k.refReward>0){
      const refId=seller(c.sellerId).referredBy;
      (D_().refEarnings=D_().refEarnings||[]).push({at:ymd(today()),referrerId:refId,fromSellerId:c.sellerId,campaignId:cid,amt:k.refReward});
      pushSys(cid,`추천 보상 지급 — 추천인 ${seller(refId).name}에게 확정 매출의 2% ₩${fmt(k.refReward)} (플랫폼 부담)`);
    }
    if(k.bReward>0){
      const rb=brand(p.brandId).referredBy;
      (D_().brandRefEarnings=D_().brandRefEarnings||[]).push({at:ymd(today()),referrerId:rb,fromBrandId:p.brandId,campaignId:cid,amt:k.bReward});
      pushSys(cid,`브랜드 추천 보상 — 추천 브랜드 ${brand(rb).name}에게 확정 매출의 1% ₩${fmt(k.bReward)} · 신규 브랜드 수수료 −1%p 적용 (플랫폼 부담)`);
    }
    pushSys(cid,`<b>정산 완료</b> · 브랜드 ₩${fmt(k.brandPay)}${k.bb?' (추천 할인 −1%p 포함)':''}${k.bDisc?' (등급 할인 포함)':''} · 인플루언서 ₩${fmt(k.sfTotal)}${k.gBonus?` (${gname(sl)} 보너스 포함)`:''}${k.rb?' (추천 부스트 +1%p 포함)':''} → ${sellerWht(sl)?`원천징수 3.3% 공제 후 ₩${fmt(k.sfTotal*(1-WHT))}`:'사업자 정산(세금계산서) ₩'+fmt(k.sfTotal)} · 명세 발행`);
    save();render();toast('정산 실행 완료 — 양측 지급 및 명세 발행');
  },
  approveProduct(pid){const p=prod(pid);p.status='listed';delete p.rejectReason;p.stock=p.stock||500;save();render();toast(`${p.name} 노출 승인`);},
  rejectProduct(pid){const p=prod(pid);const why=prompt('반려 사유 (브랜드에 표시됩니다)','건강·웰니스 카테고리 범위 밖 / 허위·과장 표기 확인 필요');if(why===null)return;p.status='rejected';p.rejectReason=why||'검수 기준 미달';save();render();toast(`${p.name} 반려 — 브랜드가 수정 후 재검수 요청할 수 있습니다`);},
  newProduct(){productModal();},
  editProduct(pid){productModal(pid);},
  saveProduct(pid){
    const p=prod(pid);if(!p)return;
    const nm=$('#npName').value.trim();if(!nm){toast('상품명을 입력하세요');return;}
    const locked=D_().campaigns.some(c=>c.productId===pid&&['SCHEDULE_CONFIRMED','LIVE','CLEARING'].includes(c.status));
    const exg=$('#npExcl').value;
    p.name=nm;p.desc=$('#npDesc').value.trim()||'—';p.cat=$('#npCat').value||p.cat;
    if(NP.thumb)p.thumb=NP.thumb;
    if(NP.imgs&&NP.imgs.length)p.imgs=NP.imgs.slice(0,4);
    p.stock=+$('#npStock').value||0;p.sample=$('#npSample').value||p.sample;
    p.options=$('#npOpts').value.split(/\n/).map(l=>l.split('|')).filter(a=>a.length>=2&&a[0].trim()&&+a[1].replace(/[^\d]/g,'')).map(a=>({n:a[0].trim(),price:+a[1].replace(/[^\d]/g,'')}));
    p.samplePolicy={freeGrade:$('#npFreeGrade').value||'실버',buyMode:$('#npBuyMode').value||'auto',fixedPrice:+$('#npFixed').value||0,refund:!!($('#npRefund')&&$('#npRefund').checked)};
    if(exg)p.exclusive={grade:exg,label:$('#npExclLabel').value.trim()||exg+' 등급 독점권'};else if(!p.exclusiveSellerId)delete p.exclusive;
    if(!locked){const cp=+$('#npCp').value||p.cp,gp=+$('#npGp').value||p.gp,rate=Math.max(5,(+$('#npRate').value||30)-PLAT_RATE*100)/100;
      const priceChanged=(gp!==p.gp||rate!==p.rate);p.cp=cp;p.gp=gp;p.rate=rate;
      if(priceChanged&&p.status==='listed'){p.status='pending';toast('판매가·수수료율 변경 — 재검수 대기로 전환됩니다');}}
    if(p.status==='rejected'){p.status='pending';delete p.rejectReason;}
    NP={thumb:null,imgs:[]};closeModal();save();render();toast(p.status==='pending'?`${p.name} 수정 저장 — 재검수 요청됨`:`${p.name} 수정 저장 완료`);
  },
  deleteProduct(pid){
    const p=prod(pid);if(!p)return;
    const used=D_().campaigns.some(c=>c.productId===pid&&!['REJECTED','PASSED','DECLINED'].includes(c.status));
    if(used){toast('진행 이력이 있는 상품은 삭제할 수 없습니다 — 노출 중단을 사용하세요');return;}
    if(!confirm(`${p.name}을(를) 삭제할까요?`))return;
    D_().products=D_().products.filter(x=>x.id!==pid);closeModal();save();render();toast('상품 삭제됨');
  },
  toggleListing(pid){
    const p=prod(pid);if(!p||p.status==='pending'||p.status==='rejected')return;
    p.status=p.status==='listed'?'paused':'listed';
    save();render();toast(p.status==='listed'?`${p.name} 노출 재개`:`${p.name} 노출 중단 — 새 샘플 요청이 막힙니다`);
  },
  createProduct(){
    const nm=$('#npName').value.trim();if(!nm){toast('상품명을 입력하세요');return;}
    const exg=$('#npExcl').value;
    D_().products.push({id:'p'+(D_().seq++),brandId:S.actingBrand,name:nm,desc:$('#npDesc').value.trim()||'—',em:'📦',cat:$('#npCat').value||'건기식',
      thumb:NP.thumb||null,imgs:NP.imgs.slice(0,4),
      options:$('#npOpts').value.split(/\n/).map(l=>l.split('|')).filter(a=>a.length>=2&&a[0].trim()&&+a[1].replace(/[^\d]/g,'')).map(a=>({n:a[0].trim(),price:+a[1].replace(/[^\d]/g,'')})),
      cp:+$('#npCp').value||0,gp:+$('#npGp').value||0,rate:Math.max(5,(+$('#npRate').value||30)-PLAT_RATE*100)/100,sample:$('#npSample').value||'무상 1개',samplePolicy:{freeGrade:$('#npFreeGrade').value||'실버',buyMode:$('#npBuyMode').value||'auto',fixedPrice:+$('#npFixed').value||0,refund:!!($('#npRefund')&&$('#npRefund').checked)},stock:+$('#npStock').value||0,status:'pending',
      ...(exg?{exclusive:{grade:exg,label:$('#npExclLabel').value.trim()||exg+' 등급 독점권'}}:{})});
    NP={thumb:null,imgs:[]};
    closeModal();save();render();toast('검수 요청 완료 — 관리자 승인 후 노출');
  },
  npThumbPick(){
    let inp=document.getElementById('npThumbFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.id='npThumbFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        const f=inp.files[0];if(!f)return;
        fileToDataURL(f,360,url=>{NP.thumb=url;
          const el=$('#npThumbInfo');if(el)el.innerHTML=`✓ 첨부됨 <img src="${url}" alt="" style="height:28px;vertical-align:middle;margin-left:6px;border:1px solid var(--soft-line)">`;});
        inp.value='';
      });
    }
    inp.click();
  },
  npImgPick(){
    let inp=document.getElementById('npImgFile');
    if(!inp){
      inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;inp.id='npImgFile';inp.hidden=true;
      document.body.appendChild(inp);
      inp.addEventListener('change',()=>{
        [...inp.files].slice(0,4-NP.imgs.length).forEach(f=>fileToDataURL(f,700,url=>{
          NP.imgs.push(url);
          const el=$('#npImgInfo');if(el)el.textContent=`${NP.imgs.length}장 첨부됨`;
        }));
        inp.value='';
      });
    }
    inp.click();
  },
  /* ---- 고객 구매 페이지 / 고객 화면 ---- */
  preview(cid){S.view.store=cid;S.storeOpt=0;S.storeQty=1;S.storeTop=true;render();},
  previewProduct(pid){closeModal();S.view.store='p:'+pid;S.storeOpt=0;S.storeQty=1;S.storeTop=true;render();},
  storeBack(){S.view.store=null;render();},   // 링크 진입 보호(S.linkCtx)는 유지 — 홈으로 가도 경쟁 판매 비노출
  pickOpt(i){S.storeOpt=+i;render();},
  qtyDelta(d){S.storeQty=Math.max(1,Math.min(10,(S.storeQty||1)+ +d));render();},
  buyNow(cid){
    const c=camp(cid),p=prod(c.productId);
    if(S.view.role!=='customer'){toast('미리보기에서는 주문이 생성되지 않습니다 — 고객 화면에서 구매 흐름을 확인하세요 (주문 시뮬레이션은 관리자 스레드)');return;}
    if(c.status!=='LIVE'){toast('현재 판매 중이 아닙니다');return;}
    const opts=optsOf(p),o=opts[Math.min(S.storeOpt||0,opts.length-1)],q=S.storeQty||1;
    const left=(c.qty||0)-soldQty(cid);
    if(left<q){toast(`남은 수량이 부족합니다 (잔여 ${Math.max(0,left)}개)`);return;}
    if(!S.cust){kakaoStart('buy:'+cid);return;}   // 카카오 로그인 → 바로 이어서 주문
    const id=placeOrder(c,o,q);
    S.storeQty=1;save();render();orderDoneModal([id]);
  },
  openCS(k){const [cid,oid]=String(k).split('|');csModal(cid,oid||'');},
  submitCS(cid){
    const type=$('#csType').value, msg=$('#csMsg').value.trim(), oid=$('#csOrder').value.trim();
    if(!msg){toast('문의 내용을 입력해주세요');return;}
    const c=camp(cid),p=prod(c.productId),b=brand(p.brandId);
    const id='cs'+(D_().seq++);
    csList().push({id,cid,orderId:oid||null,buyer:S.cust?S.cust.name:'고객',type,msg,status:'OPEN',at:ymd(today())});
    pushSys(cid,`💬 구매 고객이 <b>${esc(type)}</b> 문의를 남겼습니다 — <b>${esc(b.name)}</b> 고객 문의함으로 전달되었습니다`);
    closeModal();save();render();
    toast(`문의가 ${b.name}에 접수되었습니다 — 답변은 알림톡으로 안내됩니다`);
  },
  csReply(id){
    const x=csList().find(v=>v.id===id);if(!x)return;
    const c=camp(x.cid),p=c&&prod(c.productId);
    openModal(`<h3>고객 문의 답변 — ${esc(x.type)}</h3>
    <div class="sub" style="color:var(--mute);font-size:12.5px;margin:-6px 0 12px">${p?esc(p.name):''} · 주문 ${x.orderId?esc(x.orderId.toUpperCase()):'—'} · ${md(P(x.at))}</div>
    <div style="font-size:13px;background:var(--surface-2);border:1.5px solid var(--soft-line);padding:10px 12px;margin-bottom:13px">${esc(x.msg)}</div>
    <div class="fld"><label>답변</label><textarea id="csRep" rows="4" placeholder="처리 방법과 일정을 안내해주세요">${x.reply?esc(x.reply):''}</textarea></div>
    <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="saveCSReply" data-k="${id}">답변 보내기</button></div>`);
  },
  saveCSReply(id){
    const x=csList().find(v=>v.id===id);if(!x)return;
    const t=$('#csRep').value.trim();if(!t){toast('답변 내용을 입력해주세요');return;}
    x.reply=t;x.repliedAt=ymd(today());x.status='ANSWERED';
    pushSys(x.cid,`💬 브랜드가 고객 문의에 답변했습니다 (${esc(x.type)})`);
    closeModal();save();render();toast('답변 전송 — 고객에게 알림톡으로 안내됩니다');
  },
  csClose(id){const x=csList().find(v=>v.id===id);if(!x)return;x.status='CLOSED';save();render();toast('처리 종료로 변경했습니다');},
  verifyStore(cid){
    const c=camp(cid),p=prod(c.productId),s=seller(c.sellerId),b=brand(p.brandId);
    const ch=(s.channels||[]).filter(x=>x.verified);
    openModal(`<h3>${CEL} 셀러리 판매 인증</h3>
    <div class="notice" style="margin:8px 0 12px">이 판매 페이지는 셀러리가 발급한 정식 링크입니다. 사칭 링크는 이 인증 정보를 표시할 수 없습니다.</div>
    <table class="stmt" style="min-width:0;font-size:13px">
      <tr><td>인증 링크</td><td class="num">sellery.life/s/${s.handle.slice(1)}/${cid} <span class="st green" style="animation:none">유효</span></td></tr>
      <tr><td>판매 인플루언서</td><td class="num">${platIcon(s)} ${esc(s.name)} ${s.handle} · <span class="gradebox sm">${gfull(gname(s))}</span></td></tr>
      <tr><td>인증 채널</td><td class="num">${ch.map(x=>`${PLAT_ICONS[x.platform]||''} ${esc(x.handle)} ✓`).join('<br>')||'—'}</td></tr>
      <tr><td>공급 브랜드</td><td class="num">${esc(b.name)} · <span class="gradebox sm">${gfull(bgname(b))}</span>${b.settleInfo&&b.settleInfo.bizNo?` · 사업자 ${esc(b.settleInfo.bizNo)}`:' · 인증 브랜드'}</td></tr>
      <tr><td>판매 기간</td><td class="num">${c.start?md(P(c.start))+' – '+md(P(c.end)):'—'}</td></tr>
      <tr><td>결제·정산</td><td class="num">셀러리 에스크로 보관 · 종료 후 ${CLEAR_DAYS}일 환불 보호</td></tr>
    </table>
    <div class="foot"><button class="pri" data-act="closeModal">닫기</button></div>`);
  },
  custSeller(sid){S.custSel=sid;S.view={role:S.view.role==='customer'?'customer':S.view.role,screen:'home',cid:null,store:null};if(S.view.role!=='customer'){S.view.role='customer';S.lockedRole=S.lockedRole;}render();},
  custAll(){S.custSel=null;render();},
  custCat(k){S.custCat=k;render();},
  faqToggle(i){S.faqOpen=S.faqOpen===+i?null:+i;render();},
  /* ---- 고객 카카오 로그인 · 장바구니 · 내 주문 ---- */
  custJoin(){kakaoStart('');},
  kakaoPick(k){ // 데모 계정 선택 → 즉시 로그인 (재확인 없음)
    let acc=KAKAO_DEMO.find(a=>a.id===k);
    if(k==='__other'){const nm=prompt('카카오 계정 이름 (데모)');if(!nm||!nm.trim())return;acc={id:'k'+Date.now().toString(36),name:nm.trim(),email:''};}
    if(acc)kakaoSignIn(acc);
  },
  custLogout(){saveCust(null);if(S.view.screen==='orders')S.view.screen='home';render();toast('로그아웃했어요');},
  custGoOrders(){closeModal();S.view={role:'customer',screen:'orders',cid:null,store:null};render();},
  addCart(cid){
    const c=camp(cid);if(!c||c.status!=='LIVE'){toast('현재 판매 중이 아닙니다');return;}
    const p=prod(c.productId),opts=optsOf(p),oi=Math.min(S.storeOpt||0,opts.length-1),q=S.storeQty||1;
    const left=(c.qty||0)-soldQty(cid);if(left<q){toast(`남은 수량이 부족합니다 (잔여 ${Math.max(0,left)}개)`);return;}
    cartAdd(cid,oi,q);S.storeQty=1;render();toast(`장바구니에 담았어요 · ${cartN()}개`);
  },
  cartQty(k){const [i,d]=String(k).split('|');const it=(S.cart||[])[+i];if(!it)return;it.qty=Math.max(1,Math.min(10,it.qty+ +d));saveCart();render();},
  cartRemove(i){(S.cart||[]).splice(+i,1);saveCart();render();},
  cartCheckout(){
    if(!S.cust){kakaoStart('checkout');return;}   // 로그인 → 바로 결제 이어서
    const L=cartLines().filter(x=>x.ok);if(!L.length){toast('결제할 수 있는 상품이 없어요');return;}
    const ids=L.map(x=>placeOrder(x.c,x.o,x.it.qty));
    const done=new Set(L.map(x=>x.i));S.cart=(S.cart||[]).filter((_,i)=>!done.has(i));saveCart();
    save();render();orderDoneModal(ids);
  },
  custRefund(oid){
    const o=D_().orders.find(x=>x.id===oid);if(!o||!S.cust||o.buyerId!==S.cust.id||o.status!=='PAID')return;
    const c=camp(o.campaignId),p=prod(c.productId);
    if(c.status==='SETTLED'){toast('정산이 끝난 주문은 브랜드 고객 문의로 접수해주세요');return;}
    openModal(`<h3>환불 신청</h3>
    <div style="font-size:13.5px;margin-bottom:10px"><b>${esc(p.name)}</b> · ${esc(o.opt||'')} × ${o.qty} · <b>₩${fmt(o.unit*o.qty)}</b></div>
    <div class="notice" style="margin:0 0 12px">결제 대금은 <b>셀러리</b>가 보관 중이라 브랜드 확인을 기다리지 않고 바로 환불됩니다. 이미 발송된 상품은 회수 후 처리돼요.</div>
    <div class="foot"><button data-act="closeModal">취소</button><button class="pri" data-act="custRefundGo" data-k="${oid}">환불 신청</button></div>`);
  },
  custRefundGo(oid){
    const o=D_().orders.find(x=>x.id===oid);if(!o||o.status!=='PAID')return;
    o.status='REFUNDED';pushSys(o.campaignId,`↩ 고객 환불 신청 · ${esc(o.buyer)} · ₩${fmt(o.unit*o.qty)} (정산액 차감)`);
    closeModal();save();render();toast('환불 신청 완료 — 결제수단으로 3영업일 내 환급');
  },
  goCenter(role){S.lockedRole=false;S.view={role,screen:'home',cid:null,store:null};render();},
  notifyMe(){toast('오픈 알림 신청 완료 — 판매 시작 시 카카오 알림톡으로 안내 (시뮬레이션)');},
  /* ---- 관리자: 자동 제안 ---- */
  saveOpex(){const o={};Object.keys(OPEX_DEF).forEach(k=>{const el=$('#ox_'+k);o[k]=el?Math.max(0,+el.value||0):OPEX_DEF[k];});D_().opex=o;save();render();toast('운영 비용 저장 — 순이익 재계산');},
  resetOpex(){delete D_().opex;save();render();toast('운영 비용 기본값으로 복원');},
  admPQLive(v){S.admPQ=v;clearTimeout(S._pq);S._pq=setTimeout(()=>{const el=$('#admPQ');const pos=el?el.selectionStart:0;render();const n=$('#admPQ');if(n){n.focus();n.setSelectionRange(pos,pos);}},200);},
  admPQClear(){S.admPQ='';render();},
  admIQLive(v){S.admIQ=v;clearTimeout(S._iq);S._iq=setTimeout(()=>{const el=$('#admIQ');const pos=el?el.selectionStart:0;render();const n=$('#admIQ');if(n){n.focus();n.setSelectionRange(pos,pos);}},200);},
  admIQClear(){S.admIQ='';render();},
  bcF(k){S.bcF=k;render();},
  admPS(k){S.admPS=k;render();}, admPB(k){S.admPB=k;render();}, admPC(k){S.admPC=k;render();},
  admIG(k){S.admIG=k;render();}, admOF(k){S.admOF=k;render();}, admCF(k){S.admCF=k;S.view.screen='home';render();},
  admGo(k){const [scr,f]=k.split('|');if(scr==='products'&&f)S.admPS=f;if(scr==='orders'&&f)S.admOF=f;S.view={role:'admin',screen:scr,cid:null,store:null};render();},
  admBrandProducts(bid){S.admPB=bid;S.admPS='all';S.view={role:'admin',screen:'products',cid:null,store:null};render();},
  admToggleHidden(sid){const x=seller(sid);x.hidden=!x.hidden;save();render();toast(`${x.name} ${x.hidden?'비공개':'공개'} 전환`);},
  admGrant(who){(D_().celeryLedger=D_().celeryLedger||[]).push({who,at:ymd(today()),delta:3,memo:'관리자 이벤트 지급'});save();render();toast('🥬 3 지급 완료');},
  runSettleAll(){const list=D_().campaigns.filter(c=>c.status==='CLEARING'&&settleDue(c)<=today());list.forEach(c=>ACT.runSettle(c.id));toast(`일괄 정산 ${list.length}건 완료`);},
  toggleReq(){const n=S.view.role==='brand'?brandPending().n:sellerPending().n;const isOpen=n?(S.reqOpen!==false):(S.reqOpen===true);S.reqOpen=!isOpen;render();},
  dmSearch(){S.dmQ=($('#dmQ')||{}).value||'';render();},
  dmSearchLive(v){S.dmQ=v;clearTimeout(S._dmT);S._dmT=setTimeout(()=>{const el=$('#dmQ');const pos=el?el.selectionStart:0;render();const n=$('#dmQ');if(n){n.focus();n.setSelectionRange(pos,pos);}},220);},
  dmClear(){S.dmQ='';render();},
  brandGradeModal(){const b=brand(S.actingBrand);openModal(`<h3>브랜드 등급 · 혜택</h3>${brandGradeHtml(b).replace('<div class="sec">','<div class="lbl-sm" style="margin:6px 0 10px">')}<div class="foot"><button class="pri" data-act="closeModal">닫기</button></div>`);},
  toggleAutoPropose(bid){const b=brand(bid);b.autoPropose=!b.autoPropose;save();render();toast(`${b.name} 자동 제안 ${b.autoPropose?'ON':'OFF'}`);},
  runAutoPropose(){
    const list=autoMatches().slice(0,5);let n=0,skip=0;
    list.forEach(({b,p,s})=>{
      const tg=gname(s);
      if((tg==='다이아'||tg==='블랙')&&celBal(b.id)<10){skip++;return;}
      const celUsed=(tg==='다이아'||tg==='블랙')?10:0;
      if(celUsed)celSpend(b.id,10,`${tg} 인플루언서 자동 제안 · ${p.name}`);
      const id='c'+(D_().seq++);
      D_().campaigns.push({id,sellerId:s.id,productId:p.id,status:'INVITED',createdAt:ymd(today()),invited:true,auto:true,celUsed});
      pushSys(id,`🤖 <b>셀러리 자동 제안</b> — 트렌드·카테고리 적합도 기반으로 <b>${esc(b.name)}</b>가 <b>${esc(p.name)}</b> 판매를 제안했습니다 · 인플루언서 수락 대기`);
      n++;
    });
    save();render();toast(`자동 제안 ${n}건 발송${skip?` · ${skip}건은 브랜드 셀러리 부족으로 보류`:''}`);
  },
  copyLink(url){
    try{navigator.clipboard.writeText('https://'+url);toast('링크 복사됨');}catch(e){toast('복사 실패 — 수동으로 복사해주세요');}
  },
  sendChat(cid){
    const inp=$('#chatIn');const t=inp.value.trim();if(!t)return;
    pushChat(cid,S.view.role==='seller'?'seller':'brand',t);   // 관리자는 브랜드 대행으로 발신 (사용자 결정)
    save();render();
  }
};
function simSell(cid,n){
  const c=camp(cid),p=prod(c.productId);
  const names=['김*은','이*아','박*희','최*진','정*수','한*별','윤*서','장*미'];
  for(let i=0;i<n;i++){
    D_().orders.push({id:'o'+(D_().seq++),campaignId:cid,buyer:names[Math.floor(Math.random()*8)],
      qty:Math.random()<.25?2:1,unit:p.gp,status:'PAID',at:ymd(today())});
  }
  save();render();toast(`주문 ${n}건 발생 (시뮬레이션)`);
}

/* ============ 고객 주문 · 카카오 로그인 헬퍼 ============ */
/* 주문 1건 생성 — 구매하기·장바구니 결제 공통. 로그인 고객이면 buyerId로 '내 주문'에 연결 */
function placeOrder(c,o,q){
  const id='o'+(D_().seq++);
  D_().orders.push({id,campaignId:c.id,buyer:S.cust?S.cust.name:'고객(구매 페이지)',buyerId:S.cust?S.cust.id:null,qty:q,unit:o.price,opt:o.n,status:'PAID',at:ymd(today())});
  return id;
}
function orderDoneModal(ids){
  const os=ids.map(id=>D_().orders.find(o=>o.id===id)).filter(Boolean);if(!os.length)return;
  const total=os.reduce((a,o)=>a+o.unit*o.qty,0);
  openModal(`<h3>주문 완료 ✓</h3>
  <div class="notice" style="margin:8px 0 12px">결제 금액은 <b>셀러리</b>가 안전하게 보관하고, 판매 종료 후 교환/환불 기간(${CLEAR_DAYS}일)이 지나면 브랜드·인플루언서에게 정산됩니다.</div>
  <table class="stmt" style="min-width:0;font-size:13px">
    ${os.map(o=>{const c=camp(o.campaignId),p=prod(c.productId),s=seller(c.sellerId);return `<tr><td>${o.id.toUpperCase()}</td><td class="num">${esc(p.name)} · ${esc(o.opt||'')} × ${o.qty} · <b>₩${fmt(o.unit*o.qty)}</b><div style="font-size:11.5px;color:var(--mute);font-weight:400">${esc(s.name)} ${s.handle} · ${esc(brand(p.brandId).name)} 직배송</div></td></tr>`;}).join('')}
    ${os.length>1?`<tr class="tot"><td>총 결제</td><td class="num">₩${fmt(total)}</td></tr>`:''}
  </table>
  <p style="font-size:12px;color:var(--mute);margin-top:10px">${S.cust?`<b>${esc(S.cust.name)}</b>님의 <b>내 주문</b>에서 배송·환불을 관리할 수 있어요. `:''}운송장은 카카오 알림톡으로 안내됩니다. 실서비스에서는 이 단계에서 PG 결제창이 열립니다.</p>
  <div class="foot"><button data-act="openCS" data-k="${os[0].campaignId}|${os[0].id}">문의하기</button>${S.cust?`<button data-act="custGoOrders">내 주문</button>`:''}<button class="pri" data-act="closeModal">확인</button></div>`);
}
/* 카카오 로그인 — KAKAO_JS_KEY가 있으면 카카오 JS SDK(실계정), 없으면 데모 계정 선택 창.
   선택/인증 즉시 로그인되고(재확인 없음), 로그인 전에 하려던 동작(after: 'buy:<cid>' | 'checkout')을 이어서 실행한다. */
function kakaoStart(after){
  S.kakaoAfter=after||'';
  if(KAKAO_JS_KEY){kakaoReal();return;}
  openModal(`<div class="kwin"><div class="khd">${KAKAO_ICON} <b>카카오계정으로 로그인</b><div class="ksub">셀러리 고객 로그인은 카카오만 지원해요</div></div>
    <div class="klist">${KAKAO_DEMO.map(a=>`<button data-act="kakaoPick" data-k="${a.id}"><span class="kav">${esc(a.name[0])}</span><span><b>${esc(a.name)}</b><small>${esc(a.email)}</small></span></button>`).join('')}
      <button data-act="kakaoPick" data-k="__other"><span class="kav" style="background:#eee;color:#555">+</span><span><b>다른 카카오계정</b><small>데모 — 이름만 입력</small></span></button></div>
    <div class="kft">데모 화면 · 실서비스에서는 카카오 로그인 창이 열리고 동의 후 바로 로그인됩니다</div></div>`);
}
function kakaoSignIn(acc){
  saveCust({id:acc.id,name:acc.name,email:acc.email||'',kakao:true,at:ymd(today())});closeModal();
  const a=S.kakaoAfter||'';S.kakaoAfter='';
  toast(`${acc.name}님, 카카오로 로그인했어요`);
  if(a==='checkout'){ACT.cartCheckout();return;}
  if(a.startsWith('buy:')){ACT.buyNow(a.slice(4));return;}
  render();
}
/* 실서비스 경로 (카카오 JS SDK v2): authorize()는 카카오 로그인 페이지로 리다이렉트하고 ?code= 로 돌아온다.
   인가 코드 → 토큰 교환은 REST API 키가 필요해 서버(예: /auth/kakao)에서 처리해야 하며, 그 서버가
   kakaoSignIn({id,name,email})과 같은 모양으로 세션을 내려주면 나머지 흐름은 그대로 동작한다. */
function kakaoReal(){
  const go=()=>{try{if(!Kakao.isInitialized())Kakao.init(KAKAO_JS_KEY);
    Kakao.Auth.authorize({redirectUri:location.origin+location.pathname,state:'cust:'+(S.kakaoAfter||''),scope:'profile_nickname,account_email'});}
    catch(e){toast('카카오 로그인 초기화 실패 — JavaScript 키와 등록 도메인을 확인해주세요');}};
  if(window.Kakao){go();return;}
  const sc=document.createElement('script');sc.src='https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';sc.crossOrigin='anonymous';sc.onload=go;sc.onerror=()=>toast('카카오 SDK를 불러오지 못했어요');document.head.appendChild(sc);
}
