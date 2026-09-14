/* ============ state ============ */
const LS='sellery-proto-v29';
const BREF_RATE=0.01, BREF_DISC=0.01, BREF_TIMES=3;
/* ---- 셀러리(🥬) 포인트 경제 ---- */
const CELERY_PER=5000000; // 확정 매출 ₩500만당 1🥬
const OPEX_DEF={server:30000,db:35000,cs:50000,domain:15000,misc:30000,pgFixed:0,kakaoPer:15,claudePerCrawl:120,claudePerMatch:300}; // 운영 비용 기본값(월, ₩)
/* 인플루언서 데이터 열람 가격 — 등급이 높을수록 비쌈 */
const DATA_PRICE={'스타터':1,'브론즈':1,'실버':2,'골드':2,'플래티넘':3,'다이아':4,'블랙':5};
function dataPrice(s){return DATA_PRICE[gname(s)]||2;}
/* 등급 혜택을 정산에 실제 반영: 인플루언서 등급 보너스(%p, 플랫폼 부담) · 브랜드 등급 수수료 할인(플랫폼 부담) */
const BG_DISC={'블랙':0.02,'다이아':0.015,'플래티넘':0.01,'골드':0.005};
function gradeBonusOf(s){const t=GRADES.find(t=>t.g===gname(s));return t?t.bonus/100:0;}
function bDiscOf(b){return BG_DISC[bgname(b)]||0;}
/* 브랜드 다이아·블랙: 인플루언서 데이터/레퍼런스 열람 월 5회 무료 */
function freeRefLeft(b){const g=bgname(b);if(g!=='다이아'&&g!=='블랙')return 0;const ym=ymd(today()).slice(0,7);return Math.max(0,5-(((b.freeRefUsed||{})[ym])||0));}
function spendData(bid,s,memo){
  const b=brand(bid);
  if(freeRefLeft(b)>0){const ym=ymd(today()).slice(0,7);b.freeRefUsed={...(b.freeRefUsed||{}),[ym]:((((b.freeRefUsed||{})[ym])||0)+1)};return 0;}
  const pr=dataPrice(s);return celSpend(bid,pr,memo)?pr:false;
}
/* 데모: 실제 누끼가 있는 상품만 노출·추천 (DEMO_REAL_ONLY=false로 해제) */
const DEMO_REAL_ONLY=false;   // 사용자: 다른 예시 상품은 유지, 실제 누끼 상품을 상단 배치
function hasReal(p){return !!(p&&p.thumb&&!String(p.thumb).startsWith('data:'));}
function demoVisible(p){return !DEMO_REAL_ONLY||hasReal(p);}
const realFirst=(a,b)=>(hasReal(b)?1:0)-(hasReal(a)?1:0);
/* 상품 옵션: 브랜드 미등록 시 기본 묶음 옵션 자동 생성 */
function optsOf(p){
  if(p.options&&p.options.length)return p.options;
  const r=v=>Math.round(v/100)*100;
  return [{n:'1개',price:p.gp},{n:'2개 세트 · 5% 추가 할인',price:r(p.gp*2*.95)},{n:'3개 세트 · 10% 추가 할인',price:r(p.gp*3*.9)}];
}
function soldQty(cid){return campOrders(cid).filter(o=>o.status==='PAID').reduce((a,o)=>a+o.qty,0);}
/* 성장세(최근 좋아요 후반 vs 전반) — "요즘 뜨는 인플루언서" */
function growthOf(s){const r=s.recentLikes||[];if(r.length<2)return 0;const h=Math.ceil(r.length/2);const m=x=>x.reduce((a,b)=>a+b,0)/x.length;return (m(r.slice(h))/m(r.slice(0,h))-1)*100;}
const CATMAP={'건강기능식품':['다이어트·체형','비타민·영양','눈·뇌 건강','장·소화','활력·수면','웰니스 푸드'],'이너뷰티':['이너뷰티·피부']};
function catFit(p,s){const g=Object.values(CATMAP).find(x=>x.includes(p.cat));return !!g&&g.includes(s.cat);}
/* 자동 제안 후보 (브랜드가 자동 제안 ON인 상품 × 카테고리 적합 인플루언서, 진행 중 캠페인 제외) */
function autoMatches(){
  const out=[];
  D_().brands.filter(b=>b.autoPropose).forEach(b=>{
    D_().products.filter(p=>p.brandId===b.id&&p.status==='listed'&&!p.exclusiveSellerId).forEach(p=>{
      const cands=D_().sellers.filter(s=>catFit(p,s)&&!D_().campaigns.some(c=>c.productId===p.id&&c.sellerId===s.id&&!['REJECTED','PASSED','DECLINED','SETTLED'].includes(c.status)))
        .map(s=>({b,p,s,growth:growthOf(s),score:Math.round(growthOf(s)*0.6+(s.m3Sales/s.followers)/10+(s.hidden?0:5))}))
        .sort((a,b)=>b.score-a.score).slice(0,2);
      out.push(...cands);
    });
  });
  return out.sort((a,b)=>b.score-a.score);
}
/* 스케줄러 대행: 시작일 도래 → LIVE, 종료일 경과 → CLEARING */
function autoTick(){
  let ch=false;
  D_().campaigns.forEach(c=>{
    if(c.status==='SCHEDULE_CONFIRMED'&&c.start&&P(c.start)<=today()){c.status='LIVE';pushSys(c.id,'판매 시작 시각 도래 — 판매 링크 자동 활성화 (스케줄러)');ch=true;}
    if(c.status==='LIVE'&&c.end&&P(c.end)<today()){c.status='CLEARING';pushSys(c.id,`판매 기간 종료 (스케줄러) · 교환/환불 기간 시작 · 정산 예정 <b>${md(settleDue(c))}</b>`);ch=true;}
  });
  if(ch)save();
}
const CELOGO=`<svg class="celic" viewBox="0 0 28 32" width="14" height="16" aria-label="셀러리" fill="none" stroke="#2f5a1a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="7" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(-28 7 9)"/><ellipse cx="21" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(28 21 9)"/><ellipse cx="14" cy="7.4" rx="5.4" ry="6.2" fill="#93d64f"/><path d="M14 3.6v7.2M6.6 6.2l1.8 5.2M21.4 6.2l-1.8 5.2" stroke="#3f7a24" stroke-width="1.2"/><path d="M7.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad"/><path d="M16.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad"/><path d="M11.7 12.4h4.6v15a2.3 2.3 0 0 1-4.6 0z" fill="#eaf6cf"/><path d="M9.5 15.5v8.5M14 15v11M18.5 15.5v8.5" stroke="#b5dc85" stroke-width="1.2"/></svg>`;
const CEL=CELOGO.replace('width="14" height="16"','width="15" height="17"');
const LOGO_ICON=`<svg class="celogo" viewBox="0 0 28 32" aria-hidden="true" fill="none" stroke="#2f5a1a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="7" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(-28 7 9)"/><ellipse cx="21" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(28 21 9)"/><ellipse cx="14" cy="7.4" rx="5.4" ry="6.2" fill="#93d64f"/><path d="M14 3.6v7.2M6.6 6.2l1.8 5.2M21.4 6.2l-1.8 5.2" stroke="#3f7a24" stroke-width="1.2"/><path d="M7.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad"/><path d="M16.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad"/><path d="M11.7 12.4h4.6v15a2.3 2.3 0 0 1-4.6 0z" fill="#eaf6cf"/><path d="M9.5 15.5v8.5M14 15v11M18.5 15.5v8.5" stroke="#b5dc85" stroke-width="1.2"/></svg>`; // 로고 전용 일러스트 셀러리 (사용자 결정: 픽셀 대신 라운드 일러스트, 텍스트는 Archivo 유지)
const SHOP={
  seller:[
    {id:'samplepay',name:'샘플 구매 셀러리 결제',price:'1 = ₩20,000',desc:'무상 기준 등급 미달·상품당 1회 소진·이달 한도 소진 시 샘플을 구매합니다(판매가 − 내 수수료, 또는 브랜드 지정가). 결제 시 셀러리를 1🥬=₩20,000으로 사용, 부족분은 현금 — 구매 화면에서 자동 안내',auto:true},
    {id:'datapass',name:'매출 데이터 확인권',price:2,desc:'상품별 익명 판매 실적(팔로워·참여율·매출) 전체 열람 — 1회 구매로 계정에 영구 적용'},
    {id:'featured',name:'프로필 상단 노출 (7일)',price:3,desc:'브랜드 인플루언서 갤러리 추천 카드 최상단 고정 + 추천 뱃지'},
    {id:'homefeature',name:'고객 홈 상단 노출 (7일)',price:3,desc:'sellery.co.kr 고객 홈 "진행 중인 판매" 최상단에 내 진행 중·예정 판매 고정 + 추천 뱃지'},
    {id:'regongu',name:'재판매 우선권 (30일)',price:2,desc:'같은 상품 재판매 시 일정 제안이 브랜드 승인 없이 즉시 확정 (겹치는 기간 제외)'}
  ],
  brand:[
    {id:'diamond',name:'다이아↑ 인플루언서 제안권',price:10,desc:'다이아·블랙 등급 인플루언서에게 판매 제안 1회 — 제안 시 자동 차감',auto:true},
    {id:'ref',name:'익명 레퍼런스 열람권',price:'1–5',desc:'비공개 인플루언서의 상세 지표 열람 후 바로 제안 — 등급별 가격 (스타터·브론즈 1 / 실버·골드 2 / 플래티넘 3 / 다이아 4 / 블랙 5), 스카우트·홈 TOP5에서 자동 사용',auto:true},
    {id:'sdata',name:'인플루언서 데이터 확인',price:'1–5',desc:'갤러리에서 인플루언서 1명의 매출·판매당 평균·참여율·이력·외부 판매 예상 열람 — 등급별 가격 (스타터·브론즈 1 / 실버·골드 2 / 플래티넘 3 / 다이아 4 / 블랙 5), 카드에서 자동 사용. 함께 판매한 인플루언서는 무료',auto:true},
    {id:'datapass',name:'인플루언서 데이터 패스 (30일)',price:30,desc:'30일간 갤러리 전체 인플루언서 데이터 무제한 열람 — 만료 후 재구매',days:30},
    {id:'boost',name:'상품 상단 부스트 (7일)',price:3,desc:'내 대표 상품을 인플루언서 상품 갤러리 최상단에 고정 + 부스트 뱃지'},
    {id:'homefeature',name:'고객 홈 상단 노출 (7일)',price:5,desc:'sellery.co.kr 고객 홈 "진행 중인 판매" 최상단에 내 상품의 진행 중·예정 판매 고정 + 추천 뱃지'},
    {id:'fastreview',name:'우선 검수권',price:1,desc:'검수 대기 상품을 즉시 노출 승인'}
  ]
};
const TOPUP=[{n:5,won:100000},{n:10,won:190000},{n:30,won:540000}]; // 1🥬 ≈ ₩20,000 (획득 난도 ₩1,000만 매출당 1🥬에 맞춘 가치)
function celEarned(who){
  if(who[0]==='s'){const s=seller(who);return s?Math.floor(s.m3Sales/CELERY_PER):0;}
  const b=brand(who);return b?Math.floor(bGmv(b)/CELERY_PER):0;
}
function celBal(who){return celEarned(who)+(D_().celeryLedger||[]).filter(e=>e.who===who).reduce((a,e)=>a+e.delta,0);}
/* 샘플 요청 한도: 등급 기본 + 셀러리로 구매한 추가 횟수 − 이번 달 사용 */
function sampleQuota(s){const i=tierIdx(gname(s));return i<=tierIdx('플래티넘')?5:(i<=tierIdx('실버')?2:1);}
function sampleUsed(s){const ym=ymd(today()).slice(0,7);return D_().campaigns.filter(c=>c.sellerId===s.id&&!c.invited&&!c.purchased&&(c.createdAt||'').slice(0,7)===ym).length;}
function sampleLeft(s){const q=sampleQuota(s);return q===Infinity?Infinity:Math.max(0,q+(s.sampleExtra||0)-sampleUsed(s));}
/* ---- 샘플 정책: 무상 = 등급 권한(브랜드가 상품별 기준 등급 설정, 1회) · 유료 = 상품가 연동 구매(판매가 − 내 수수료, 또는 브랜드 지정가) · 결제 = 현금 또는 셀러리(1🥬=₩20,000) ---- */
const SAMPLE_CEL_WON=20000;
function spOf(p){if(p.samplePolicy)return p.samplePolicy;const g=p.gp<30000?'브론즈':p.gp<80000?'실버':'골드';return {freeGrade:g,buyMode:'auto',fixedPrice:0,refund:false};}
function samplePrice(p){const sp=spOf(p);return sp.buyMode==='fixed'&&sp.fixedPrice?sp.fixedPrice:Math.round(p.gp*(1-p.rate)/10)*10;}
function sampleSplit(price){const cel=Math.floor(price/SAMPLE_CEL_WON);return {cel,cash:price-cel*SAMPLE_CEL_WON};}
function freeEligible(p,s){const i=tierIdx(gname(s));return i>-1&&i<=tierIdx(spOf(p).freeGrade);}
function hadFreeSample(p,s){return D_().campaigns.some(c=>c.productId===p.id&&c.sellerId===s.id&&!c.purchased&&!c.invited&&!['REJECTED','DECLINED'].includes(c.status));}
function sampleLine(p){const sp=spOf(p),pr=samplePrice(p),sl=sampleSplit(pr);return `${gfull(sp.freeGrade)} 이상 무상 1회 · 미달 시 ₩${fmt(pr)} 구매${sl.cel?` (${CEL} ${sl.cel}${sl.cash?' + ₩'+fmt(sl.cash):''})`:''}${sp.buyMode==='fixed'?' · 브랜드 지정가':''}${sp.refund?' · 판매 확정 시 환급':''}`;}
/* 인플루언서용 샘플 버튼 분기 */
function sampleBtnHtml(p,fromModal){
  const me=seller(S.actingSeller);if(!me)return '';
  if(p.exclusiveSellerId&&p.exclusiveSellerId!==S.actingSeller)return `<button class="sm" disabled style="opacity:.5">독점 잠김</button>`;
  const already=D_().campaigns.some(c=>c.sellerId===S.actingSeller&&c.productId===p.id&&!['REJECTED','PASSED','DECLINED','SETTLED'].includes(c.status));
  if(already)return `<button class="sm" disabled style="opacity:.5">진행 중</button>`;
  const canFree=freeEligible(p,me)&&!hadFreeSample(p,me)&&sampleLeft(me)>0;
  if(canFree)return `<button class="pri ${fromModal?'':'sm'}" data-act="${fromModal?'reqSampleM':'reqSample'}" data-k="${p.id}">무상 샘플 요청</button>`;
  return `<button class="pri ${fromModal?'':'sm'}" data-act="sampleBuy" data-k="${p.id}" title="${!freeEligible(p,me)?'무상 기준 등급 미달':hadFreeSample(p,me)?'무상 샘플은 상품당 1회':'이달 무상 한도 소진'}">샘플 구매 ₩${fmt(samplePrice(p))}</button>`;
}
/* 외부 판매 크롤링 추정: 도달 = 팔로워×참여율×노출계수(6), 전환 1.5%, ±25% */
function estExternal(s,item){const eng=s.likesAvg/s.followers;const orders=s.followers*eng*6*0.015;const mid=orders*item.price;return {lo:mid*0.75,hi:mid*1.25,orders:Math.round(orders)};}
function passActive(ent,id,days){const d=ent&&ent.celeryItems&&ent.celeryItems[id];if(!d)return false;if(!days)return true;return (today()-P(d))/DAY<days;}
function celSpend(who,n,memo){
  if(celBal(who)<n){toast(`🥬 셀러리가 부족합니다 (보유 ${celBal(who)} / 필요 ${n}) — 셀러리 샵에서 충전하세요`);return false;}
  (D_().celeryLedger=D_().celeryLedger||[]).push({who,at:ymd(today()),delta:-n,memo});return true;
}
const SEMOJI={'s1':'💄','s2':'🛋️','s3':'🏃‍♀️','s6':'💪','s7':'🌸','s8':'🥗'};
const PLAT_NAMES={instagram:'인스타그램',youtube:'유튜브',naver:'네이버 블로그',tiktok:'틱톡'};
const GRADES=[
  {g:'블랙',min:100000000,bonus:3,pct:1,perk:'수수료 +3%p · 샘플 월 5회 · 전담 매니저 · 판매 기간 우선권 · 독점권 우선 협상'},
  {g:'다이아',min:50000000,bonus:2,pct:3,perk:'수수료 +2%p · 샘플 월 5회 · 독점권 신청 · 판매 기간 우선권 · 스카우트 최상단'},
  {g:'플래티넘',min:30000000,bonus:1.5,pct:8,perk:'수수료 +1.5%p · 샘플 월 5회 · 신상품 우선 제안권 · 판매 기간 우선권'},
  {g:'골드',min:15000000,bonus:1,pct:18,perk:'수수료 +1%p · 샘플 월 2회'},
  {g:'실버',min:8000000,bonus:0.5,pct:35,perk:'수수료 +0.5%p · 샘플 월 2회'},
  {g:'브론즈',min:3000000,bonus:0.3,pct:60,perk:'수수료 +0.3%p · 샘플 월 1회'},
  {g:'스타터',min:0,bonus:0,pct:100,perk:'기본 수수료율 · 샘플 월 1회'}
];
const gradeOf=m=>GRADES.find(t=>m>=t.min);
const gname=s=>gradeOf(s.m3Sales).g;
/* grade marks — evolving shield: chevrons → star → wings → crown as tier rises */
const _SH=f=>`<path d="M10 1.3 14.2 2.9v3.9c0 2.6-1.7 4.4-4.2 5.3-2.5-.9-4.2-2.7-4.2-5.3V2.9z" fill="${f}" stroke="#141414" stroke-width="1.3" stroke-linejoin="round"/>`;
const _STAR=f=>`<path d="M10 3.9 10.8 5.7 12.7 5.9 11.3 7.2 11.7 9.1 10 8.1 8.3 9.1 8.7 7.2 7.3 5.9 9.2 5.7z" fill="${f}"/>`;
const _WING2=`<path d="M5.2 4.8H2.6M5.2 6.9H3.6M14.8 4.8h2.6M14.8 6.9h1.6" stroke="#141414" stroke-width="1.3" stroke-linecap="round"/>`;
const _WING3=`<path d="M5.2 4.2H1.6M5.2 6.2H2.6M5.2 8.2H3.6M14.8 4.2h3.6M14.8 6.2h2.6M14.8 8.2h1.6" stroke="#141414" stroke-width="1.3" stroke-linecap="round"/>`;
const _CROWN=`<path d="M7.6 1 8.7-.9 10 .7 11.3-.9 12.4 1z" fill="#f7df3e" stroke="#141414" stroke-width=".9" stroke-linejoin="round"/>`;
const _gsvg=inner=>`<svg class="gi" viewBox="0 -2 20 16" width="17" height="13.6">${inner}</svg>`;
const GICON={
  '스타터':_gsvg(_SH('#e6e3d2')),
  '브론즈':_gsvg(_SH('#cd8f5a')+`<path d="M8.2 5.6 10 7.1 11.8 5.6" fill="none" stroke="#141414" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  '실버':_gsvg(_SH('#cdd2da')+`<path d="M8.2 4.6 10 6.1 11.8 4.6M8.2 6.8 10 8.3 11.8 6.8" fill="none" stroke="#141414" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  '골드':_gsvg(_SH('#f2a91d')+_STAR('#fff')),
  '플래티넘':_gsvg(_WING2+_SH('#9fd8d3')+_STAR('#141414')),
  '다이아':_gsvg(_WING3+_SH('#a9c6ff')+`<path d="M10 3.7 12 6.2 10 8.7 8 6.2z" fill="#fff" stroke="#141414" stroke-width=".7"/>`),
  '블랙':_gsvg(_WING3+_CROWN+_SH('#17150f')+_STAR('#f7df3e'))
};
const gfull=n=>`${GICON[n]||''} ${n}`;
const tierIdx=g=>GRADES.findIndex(t=>t.g===g);
const exGradeOf=p=>p.exclusive&&(p.exclusive.grade||(p.exclusive.min>=50000000?'다이아':'플래티넘'));
const exEligible=(p,s)=>tierIdx(gname(s))>-1&&tierIdx(gname(s))<=tierIdx(exGradeOf(p));
/* brand grades — cumulative confirmed GMV, perks are brand-side */
const BGRADES=[
  {g:'블랙',min:1000000000,pct:1,perk:'플랫폼 수수료 −2%p · 전담 파트너 매니저 · 기획전 최상단'},
  {g:'다이아',min:500000000,pct:3,perk:'수수료 −1.5%p · 스카우트 열람권 월 5회 무료'},
  {g:'플래티넘',min:200000000,pct:8,perk:'수수료 −1%p · 상위 인플루언서 우선 매칭'},
  {g:'골드',min:80000000,pct:18,perk:'수수료 −0.5%p · 카탈로그 상단 노출'},
  {g:'실버',min:30000000,pct:35,perk:'상품 검수 우선 처리'},
  {g:'브론즈',min:10000000,pct:60,perk:'인증 브랜드 뱃지'},
  {g:'스타터',min:0,pct:100,perk:'기본 조건'}
];
function bGmv(b){
  const myP=D_().products.filter(p=>p.brandId===b.id).map(p=>p.id);
  return (b.gmvBase||0)+D_().campaigns.filter(c=>myP.includes(c.productId)).reduce((a,c)=>a+netOf(c),0);
}
/* 확정 매출(주문 기준) — calc()와 순환 참조 없이 등급 계산에 사용 */
function netOf(c){const os=campOrders(c.id);return os.filter(o=>o.status==='PAID').reduce((a,o)=>a+o.unit*o.qty,0);}
const bgradeOf=v=>BGRADES.find(t=>v>=t.min);
const bgname=b=>bgradeOf(bGmv(b)).g;
function pyrHtml(tiers,cur){
  return `<div class="pyr">${tiers.map((t,i)=>{const mine=t.g===cur;
    return `<div class="pyr-row ${mine?'me':''}" style="width:calc(128px + ${(i*11).toFixed(1)}%)"><span>${GICON[t.g]} ${t.g}${mine?' <span class="mebadge">MY</span>':''}</span><span class="pct">상위 ${t.pct}%</span></div>`;}).join('')}</div>`;
}
const REF_RATE=0.02, REF_BOOST=0.01, REF_TIMES=5;
const PLAT_ICONS={
  instagram:`<svg class="plic" viewBox="0 0 24 24" width="14" height="14" aria-label="Instagram"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#C13584" stroke-width="2.4"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="#C13584" stroke-width="2.4"/><circle cx="17.6" cy="6.4" r="1.5" fill="#C13584"/></svg>`,
  youtube:`<svg class="plic" viewBox="0 0 24 24" width="15" height="15" aria-label="YouTube"><rect x="1.5" y="5" width="21" height="14" rx="4" fill="#FF0000"/><path d="M10 9.3v5.4l4.8-2.7z" fill="#fff"/></svg>`,
  naver:`<svg class="plic" viewBox="0 0 24 24" width="13" height="13" aria-label="Naver Blog"><rect width="24" height="24" rx="4" fill="#03C75A"/><path d="M6.5 5.5h3.6l3.3 5V5.5h4.1v13h-3.6l-3.3-5v5H6.5z" fill="#fff"/></svg>`,
  tiktok:`<svg class="plic" viewBox="0 0 24 24" width="13" height="13" aria-label="TikTok"><path d="M15.2 2c.4 2.4 1.9 4 4.3 4.3v3.2c-1.7 0-3.2-.5-4.3-1.4v6.9a5.8 5.8 0 11-5.8-5.8c.4 0 .7 0 1.1.1v3.3a2.6 2.6 0 101.6 2.4V2h3.1z" fill="#191919"/></svg>`
};
const platIcon=s=>PLAT_ICONS[s.platform]||'';
const PEN=`<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:5px"><path d="M17 3l4 4L8 20l-5 1 1-5z"/></svg>`;
const CAT_TRENDS=[
  {cat:'눈·뇌 건강',g:'+112%',note:'3040 눈 건강 관심 급상승'},
  {cat:'다이어트·체형',g:'+64%',note:'여름 시즌 · 검색량 급증'},
  {cat:'이너뷰티·피부',g:'+38%',note:'콜라겐 숏폼 바이럴'}
];
let S;
function load(){
  let d=null;
  try{const raw=localStorage.getItem(LS); if(raw) d=JSON.parse(raw);}catch(e){}
  S={view:{role:'seller',screen:'home',cid:null},actingSeller:'s1',actingBrand:'b1',data:d||seedData()};
}
function save(){try{localStorage.setItem(LS,JSON.stringify(S.data));}catch(e){}}
load();
/* 링크 진입 보호 저장소 — 인플루언서 링크로 들어온 방문은 브라우저에 기억해서,
   홈으로 이동하거나 새로고침해도 경쟁 판매가 계속 보이지 않게 한다.
   해제 시점: 그 판매가 끝나고 7일 경과 또는 캠페인이 사라졌을 때. */
const LINKCTX_KEY='slry-linkctx';
function saveLinkCtx(cid){try{localStorage.setItem(LINKCTX_KEY,JSON.stringify({cid,at:ymd(today())}));}catch(e){}}
function clearLinkCtx(){try{localStorage.removeItem(LINKCTX_KEY);}catch(e){}S.linkCtx=null;}
function loadLinkCtx(){
  try{
    const v=JSON.parse(localStorage.getItem(LINKCTX_KEY)||'null');
    if(!v||!v.cid)return null;
    const c=S.data.campaigns.find(x=>x.id===v.cid);
    if(!c){clearLinkCtx();return null;}
    if(c.end&&(today()-P(c.end))/DAY>7){clearLinkCtx();return null;}
    return {cid:v.cid};
  }catch(e){return null;}
}
/* center-specific links: index.html#influencer / #brand / #admin lock the UI to one center */
(function(){
  const h=(location.hash||'').replace('#','').toLowerCase();
  const map={influencer:'seller',seller:'seller',brand:'brand',admin:'admin',customer:'customer',shop:'customer'};
  if(map[h]){S.view.role=map[h];S.lockedRole=true;}
  /* 로그인 세션 (login.html) — 이메일 기반 파트너 계정. 세션이 있으면 접속 계정 고정 + 로그아웃 노출 */
  try{const ss=JSON.parse(localStorage.getItem('sellery-session')||'null');
    if(ss&&ss.role){S.session=ss;
      if(ss.role==='seller'&&S.data.sellers.some(x=>x.id===ss.id))S.actingSeller=ss.id;
      if(ss.role==='brand'&&S.data.brands.some(x=>x.id===ss.id))S.actingBrand=ss.id;
      if(!h||h===ss.role||(h==='influencer'&&ss.role==='seller')){S.view.role=ss.role;S.lockedRole=true;}}}catch(e){}
  S.linkCtx=loadLinkCtx();   // 이전 방문에서 링크로 들어왔다면 보호 유지
  const lm=h.match(/^(?:s|link)\/(c\d+)$/); if(lm&&S.data.campaigns.some(c=>c.id===lm[1])){S.view={role:'customer',screen:'home',cid:null,store:lm[1]};S.lockedRole=true;S.linkCtx={cid:lm[1]};saveLinkCtx(lm[1]);}  // 판매 링크 진입: index.html#s/c1 (helpers는 아래에서 정의되므로 S.data 직접 접근)
})();
window.addEventListener('hashchange',()=>{
  const h=(location.hash||'').replace('#','').toLowerCase();
  const map={influencer:'seller',seller:'seller',brand:'brand',admin:'admin',customer:'customer',shop:'customer'};
  const lm=h.match(/^(?:s|link)\/(c\d+)$/);
  if(lm&&S.data.campaigns.some(c=>c.id===lm[1])){S.view={role:'customer',screen:'home',cid:null,store:lm[1]};S.lockedRole=true;S.linkCtx={cid:lm[1]};saveLinkCtx(lm[1]);render();return;}
  if(map[h]){S.view={role:map[h],screen:'home',cid:null};S.lockedRole=true;}
  else S.lockedRole=false;
  render();
});
let liveTimer=null;
function dlCSV(name,rows){
  const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=name;document.body.appendChild(a);a.click();a.remove();
}

/* ============ helpers ============ */
const D_ = () => S.data;
const prod = id => D_().products.find(p=>p.id===id);
const brand = id => D_().brands.find(b=>b.id===id);
const seller = id => D_().sellers.find(s=>s.id===id);
const camp = id => D_().campaigns.find(c=>c.id===id);
const campOrders = cid => D_().orders.filter(o=>o.campaignId===cid);
function isRefBoost(c){
  const s=seller(c.sellerId);
  if(!s||!s.referredBy)return false;
  const list=D_().campaigns.filter(x=>x.sellerId===c.sellerId&&['LIVE','CLEARING','SETTLED'].includes(x.status))
    .sort((a,b)=>a.createdAt<b.createdAt?-1:1);
  const idx=list.findIndex(x=>x.id===c.id);
  return idx>-1&&idx<REF_TIMES;
}
function isBrandRefBoost(c){
  const p=prod(c.productId);const b=p&&brand(p.brandId);
  if(!b||!b.referredBy)return false;
  const myP=D_().products.filter(x=>x.brandId===b.id).map(x=>x.id);
  const list=D_().campaigns.filter(x=>myP.includes(x.productId)&&['LIVE','CLEARING','SETTLED'].includes(x.status))
    .sort((a,b)=>a.createdAt<b.createdAt?-1:1);
  const idx=list.findIndex(x=>x.id===c.id);
  return idx>-1&&idx<BREF_TIMES;
}
function calc(c){
  const os=campOrders(c.id);
  const gross=os.filter(o=>o.status!=='CANCELED').reduce((a,o)=>a+o.unit*o.qty,0);
  const refund=os.filter(o=>o.status==='REFUNDED').reduce((a,o)=>a+o.unit*o.qty,0);
  const net=gross-refund;
  const p=prod(c.productId), s=seller(c.sellerId), b=brand(p.brandId);
  const rb=isRefBoost(c), bb=isBrandRefBoost(c);
  const sampleNet=os.filter(o=>o.sample&&o.status==='PAID').reduce((a,o)=>a+o.unit*o.qty,0);   // 인플루언서 샘플 구매분: 인플 수수료·보너스 없음
  const pg=net*PG_RATE, sf=(net-sampleNet)*p.rate;
  const gBonus=(net-sampleNet)*gradeBonusOf(s);                       // 인플루언서 등급 보너스 (플랫폼 부담)
  const boost=rb?net*REF_BOOST:0, refReward=rb?net*REF_RATE:0;
  const bBoost=bb?net*BREF_DISC:0, bReward=bb?net*BREF_RATE:0;
  const bDisc=net*bDiscOf(b);                             // 브랜드 등급 수수료 할인 (플랫폼 부담)
  const pfGross=net*PLAT_RATE;
  const costs=gBonus+boost+refReward+bBoost+bReward+bDisc;
  const pf=pfGross-costs;                                 // 플랫폼 수수료 (보상·할인 차감 후, VAT 포함)
  const vat=pf>0?pf-pf/1.1:0;                             // 수수료 매출에 내포된 부가세 10%
  const pfNet=pf-vat;                                     // 플랫폼 순수익 (PG는 브랜드 정산에서 차감 — 플랫폼 수익 아님)
  return {gross,refund,net,sampleNet,pg,sf,gBonus,sfTotal:sf+gBonus+boost,boost,refReward,rb,bb,bBoost,bReward,bDisc,pfGross,costs,pf,vat,pfNet,
    brandPay:net-pg-sf-pfGross+bBoost+bDisc,
    paidCnt:os.filter(o=>o.status==='PAID').length,refCnt:os.filter(o=>o.status==='REFUNDED').length};
}
function sellerWht(s){return s.settleInfo&&s.settleInfo.type==='biz'?0:WHT;}   // 사업자 정산은 원천징수 없음(세금계산서)
function settleDue(c){ return addD(P(c.end),CLEAR_DAYS); }
function pushSys(cid,txt){(D_().messages[cid]=D_().messages[cid]||[]).push({type:'sys',txt,at:ymd(today())});}
function pushChat(cid,role,txt){
  const msgs=D_().messages[cid]=D_().messages[cid]||[];
  msgs.push({type:'chat',role,txt,at:ymd(today())});
  if(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|카톡|카카오톡|kakao/i.test(txt)){
    msgs.push({type:'warn',txt:'⚠ 연락처/외부 메신저 공유가 감지되었습니다. 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.',at:ymd(today())});
  }
}
function toast(t){
  const el=document.createElement('div');el.className='toast';el.textContent=t;
  $('#toasts').appendChild(el);setTimeout(()=>el.remove(),2600);
}
/* 기간 정책(2026-09-14 변경): 같은 상품이라도 기간은 기본 공유(누구나 오픈 가능).
   단 플래티넘 이상 인플루언서가 확정·진행 중인 기간에는 플래티넘 이상만 새로 진입할 수 있다.
   반환: 차단 사유가 되는 상위 등급 인플루언서 객체 (없으면 null) */
const PRIORITY_TIER = '플래티넘';
function periodHolders(pid,s,e,exceptCid){
  return D_().campaigns.filter(c=>c.productId===pid&&c.id!==exceptCid
    &&['SCHEDULE_CONFIRMED','LIVE'].includes(c.status)
    &&!(P(e)<P(c.start)||P(s)>P(c.end)));
}
function isPriority(sl){return sl&&tierIdx(gname(sl))>-1&&tierIdx(gname(sl))<=tierIdx(PRIORITY_TIER);}
function periodBlock(pid,s,e,exceptCid,sellerId){
  const me=seller(sellerId);
  if(isPriority(me))return null;                       // 플래티넘 이상은 언제나 진입 가능
  const hit=periodHolders(pid,s,e,exceptCid).find(c=>isPriority(seller(c.sellerId)));
  return hit?seller(hit.sellerId):null;                // 상위 등급이 선점한 기간이면 차단
}
/* 상품 재고 배정: 확정·진행 중 캠페인에 배정된 수량 합 (제안 시 잔여 재고 초과 불가) */
function allocated(pid,exceptCid){return D_().campaigns.filter(c=>c.productId===pid&&c.id!==exceptCid&&['SCHEDULE_CONFIRMED','LIVE'].includes(c.status)).reduce((a,c)=>a+(c.qty||0),0);}
function stockLeft(p,exceptCid){return Math.max(0,(p.stock||0)-allocated(p.id,exceptCid));}
/* ---- 고객 CS 문의: 접수되면 해당 판매의 브랜드로 바로 배정된다 ---- */
const CS_TYPES=['배송 문의','교환·반품','상품 문의','기타'];
const csList=()=>D_().cs=D_().cs||[];
const csBrandId=x=>{const c=camp(x.cid);return c?prod(c.productId).brandId:null;};
const csOf=bid=>csList().filter(x=>csBrandId(x)===bid);
const csOpen=bid=>csOf(bid).filter(x=>x.status==='OPEN');
/* pending counts for badges */
function counts(){
  const cs=D_().campaigns;
  return {
    seller: cs.filter(c=>['INVITED','SAMPLE_SHIPPED','TESTING'].includes(c.status)).length,
    brand: cs.filter(c=>['SAMPLE_REQUESTED','SCHEDULE_PROPOSED','SAMPLE_APPROVED'].includes(c.status)).length
      + (D_().exclusiveReqs||[]).filter(r=>r.status==='PENDING').length
      + csList().filter(x=>x.status==='OPEN').length,
    admin: D_().products.filter(p=>p.status==='pending').length + cs.filter(c=>c.status==='CLEARING'&&settleDue(c)<=today()).length
  };
}
