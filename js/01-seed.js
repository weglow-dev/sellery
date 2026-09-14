/* ============ seed ============ */
const svgURI=s=>'data:image/svg+xml;utf8,'+encodeURIComponent(s);
const BLOGO1=svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#41464c"/><text x="48" y="53" font-family="Arial,Helvetica,sans-serif" font-size="10.5" letter-spacing="3.2" fill="#ffffff" text-anchor="middle">VYNEHERB</text></svg>`);
const BLOGO2=svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#f4ebeb"/><text x="46" y="60" font-family="Georgia,serif" font-size="34" font-weight="300" fill="#3a1a22" text-anchor="middle">glo<tspan fill="#8a4a52" font-style="italic">.</tspan></text></svg>`);
const AV1='data:image/jpeg;base64,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';
function seedData(){
  const t = today();
  const D = n => ymd(addD(t,n));
  const data = {
    brands:[
      {id:'b1',name:'바인허브',cat:'건강기능식품',manager:'김바인',email:'partner@vyneherb.co',settleInfo:{bank:'기업',account:'12345678901234',holder:'(주)바인허브',bizNo:'214-88-01234',mailOrder:'제2024-서울강남-01234호'},gmvBase:52000000,logo:BLOGO1,refCode:'VYNE-01',autoPropose:true},
      {id:'b2',name:'글로헬스',cat:'이너뷰티·피부',manager:'박글로',email:'official@weglow.biz',settleInfo:{bank:'신한',account:'11022233344455',holder:'(주)위글로우',bizNo:'331-87-02211'},gmvBase:382000000,logo:BLOGO2,refCode:'GLO-002',referredBy:'b1'}
    ],
    brandRefEarnings:[
      {at:D(-20),referrerId:'b1',fromBrandId:'b2',campaignId:'(지난 판매)',amt:318000}
    ],
    celeryLedger:[
      {who:'s1',at:D(-30),delta:3,memo:'가입 축하 지급'},
      {who:'s1',at:D(-6),delta:-2,memo:'매출 데이터 확인권 구매'},
      {who:'s2',at:D(-40),delta:3,memo:'가입 축하 지급'},
      {who:'s3',at:D(-25),delta:3,memo:'가입 축하 지급'},
      {who:'s6',at:D(-5),delta:3,memo:'가입 축하 지급'},{who:'s7',at:D(-4),delta:3,memo:'가입 축하 지급'},{who:'s8',at:D(-9),delta:3,memo:'가입 축하 지급'},
      {who:'b1',at:D(-45),delta:5,memo:'입점 이벤트 지급'},
      {who:'b1',at:D(-3),delta:-2,memo:'익명 레퍼런스 열람 · ○○○ 인플루언서'},
      {who:'b2',at:D(-40),delta:5,memo:'입점 이벤트 지급'}
    ],
    sellers:[
      {id:'s1',name:'지유',handle:'@jiyu_beauty',email:'jiyu@sellery.demo',platform:'instagram',settleInfo:{type:'personal',bank:'카카오뱅크',account:'3333012345678',holder:'김지유'},img:(typeof AV1!=='undefined'&&AV1)?AV1:'assets/av-s1.svg',followers:84300,cat:'이너뷰티·피부',likesAvg:3100,recentLikes:[2900,3400,2800,3600,3100,3500],m3Sales:15600000,refCode:'JIYU10',intro:'스킨케어·이너뷰티 리뷰 전문. 평균 판매 전환율 상위 10%.',
        channels:[
          {id:'ch1',platform:'instagram',handle:'@jiyu_beauty',url:'instagram.com/jiyu_beauty',followers:84300,verified:true,primary:true},
          {id:'ch2',platform:'youtube',handle:'지유의 뷰티랩',url:'youtube.com/@jiyulab',followers:12400,verified:false}
        ]},
      {id:'s2',name:'혜린',handle:'@hyerin_pick',email:'hyerin@sellery.demo',platform:'instagram',settleInfo:{type:'biz',bank:'국민',account:'94820111222333',holder:'혜린스튜디오',bizNo:'512-21-00987'},img:'assets/av-s2.svg',followers:126000,cat:'웰니스 푸드',likesAvg:4200,recentLikes:[3900,4600,4100,4400,4000,4700],m3Sales:22840000,refCode:'HYERIN',intro:'웰니스 라이프 큐레이션(건강식·홈트). 재판매율 78%.',
        channels:[{id:'ch3',platform:'instagram',handle:'@hyerin_pick',url:'instagram.com/hyerin_pick',followers:126000,verified:true,primary:true}]},
      {id:'s3',name:'민지',handle:'@minji_diet',email:'minji@sellery.demo',platform:'naver',settleInfo:{type:'personal',bank:'토스뱅크',account:'100012345678',holder:'박민지'},img:'assets/av-s3.svg',followers:45200,cat:'다이어트·체형',likesAvg:1900,recentLikes:[1700,2100,1800,2000,1900,2200],m3Sales:13221900,refCode:'MINJI5',referredBy:'s1',intro:'다이어트 여정 기록 4년차. 팔로워 충성도 높음.',
        channels:[{id:'ch4',platform:'naver',handle:'@minji_diet',url:'blog.naver.com/minji_diet',followers:45200,verified:true,primary:true}]},
      {id:'s4',name:'서아',handle:'@seoa_health',email:'seoa@sellery.demo',platform:'youtube',img:'assets/av-s4.svg',followers:118000,cat:'비타민·영양',likesAvg:5400,recentLikes:[5100,5800,5200,5600,5400],m3Sales:52000000,refCode:'SEOA88',hidden:true,intro:'건기식 전문. 비공개 프로필.',
        channels:[{id:'ch5',platform:'youtube',handle:'@seoa_health',url:'youtube.com/@seoa_health',followers:118000,verified:true,primary:true}]},
      {id:'s5',name:'로라',handle:'@lola_beauty',email:'lola@sellery.demo',platform:'tiktok',img:'assets/av-s5.svg',followers:210000,cat:'이너뷰티·피부',likesAvg:12800,recentLikes:[12100,13400,12600,13100,12800],m3Sales:87000000,refCode:'LOLA00',hidden:true,intro:'이너뷰티 메가 인플루언서. 비공개 프로필.',
        channels:[{id:'ch6',platform:'tiktok',handle:'@lola_beauty',url:'tiktok.com/@lola_beauty',followers:210000,verified:true,primary:true}]},
      {id:'s6',name:'하늘',handle:'@haneul_fit',email:'haneul@sellery.demo',platform:'instagram',img:'assets/av-s6.svg',followers:62000,cat:'다이어트·체형',likesAvg:2400,recentLikes:[2100,2600,2300,2700,2500,2900],m3Sales:9800000,refCode:'HANEUL',intro:'홈트·바디 프로필 크리에이터. 다이어트 판매 반응 좋음.',
        channels:[{id:'ch7',platform:'instagram',handle:'@haneul_fit',url:'instagram.com/haneul_fit',followers:62000,verified:true,primary:true}]},
      {id:'s7',name:'소민',handle:'@somin_beauty',email:'somin@sellery.demo',platform:'youtube',img:'assets/av-s7.svg',followers:38000,cat:'이너뷰티·피부',likesAvg:5100,recentLikes:[4600,5300,4900,5500,5200],m3Sales:6200000,refCode:'SOMIN7',intro:'이너뷰티·더마 리뷰 유튜버. 구독자 신뢰도·댓글 반응 상위.',
        channels:[{id:'ch8',platform:'youtube',handle:'@somin_beauty',url:'youtube.com/@somin_beauty',followers:38000,verified:true,primary:true}]},
      {id:'s8',name:'유나',handle:'@yuna_healthy',email:'yuna@sellery.demo',platform:'naver',img:'assets/av-s8.svg',followers:71000,cat:'비타민·영양',likesAvg:1600,recentLikes:[1400,1700,1500,1800,1700,1900],m3Sales:18400000,refCode:'YUNA88',intro:'건기식·영양제 블로거. 검색 유입 강함, 재판매율 71%.',
        channels:[{id:'ch9',platform:'naver',handle:'@yuna_healthy',url:'blog.naver.com/yuna_healthy',followers:71000,verified:true,primary:true}]}
    ],
    productViews:[
      {sellerId:'s6',productId:'p1',ago:'2시간 전'},
      {sellerId:'s8',productId:'p7',ago:'3시간 전'},
      {sellerId:'s3',productId:'p2',ago:'5시간 전'},
      {sellerId:'s7',productId:'p9',ago:'4시간 전'},
      {sellerId:'s2',productId:'p4',ago:'어제'},
      {sellerId:'s6',productId:'p5',ago:'어제'}
    ],
    unlockedRefs:[],
    brandDataUnlocks:{b1:['s1'],b2:['s7']},
    external:{
      s1:[{name:'저분자 피쉬콜라겐 스틱',brand:'타사 A',src:'instagram',at:D(-5),price:32000}],
      s2:[{name:'프로바이오틱스 30포',brand:'타사 B',src:'instagram',at:D(-2),price:39000},{name:'저당 그래놀라 3팩',brand:'타사 C',src:'instagram',at:D(-11),price:28000}],
      s3:[{name:'곤약 젤리 30팩',brand:'타사 D',src:'naver',at:D(-6),price:24900}],
      s4:[{name:'오메가3 rTG',brand:'타사 E',src:'youtube',at:D(-3),price:41000}],
      s5:[{name:'글루타치온 필름',brand:'타사 F',src:'tiktok',at:D(-1),price:33000},{name:'콜라겐 젤리 스틱',brand:'타사 G',src:'tiktok',at:D(-8),price:29000}],
      s6:[{name:'단백질 쉐이크 14팩',brand:'타사 H',src:'instagram',at:D(-4),price:34000}],
      s7:[{name:'비오틴 츄어블',brand:'타사 I',src:'youtube',at:D(-7),price:24000}],
      s8:[{name:'마그네슘 글리시네이트',brand:'타사 J',src:'naver',at:D(-3),price:29000}]
    },
    exclusiveReqs:[
      {id:'x1',productId:'p1',sellerId:'s4',status:'PENDING',at:D(-1)}
    ],
    refEarnings:[
      {at:D(-24),referrerId:'s1',fromSellerId:'s3',campaignId:'(지난 판매)',amt:186400}
    ],
    products:[
      {id:'p1',brandId:'b1',name:'버닝온',desc:'다이어트 부스터 · 6,000mg × 30포',em:'🔥',thumb:'assets/burningon.webp',cat:'다이어트·체형',cp:39000,gp:29900,rate:.20,sample:'무상 1박스',stock:2000,status:'listed',t:{g:'+240%',note:'분기 매출 급등'},exclusive:{grade:'다이아',label:'인스타그램 판매 독점권 · 3개월'},
        samplePolicy:{freeGrade:'실버',buyMode:'auto',fixedPrice:0,refund:false},options:[{n:'1박스 (30포)',price:29900},{n:'2박스 세트 (60포)',price:56800},{n:'3박스 + 쉐이커 증정',price:79900}]},
      {id:'p2',brandId:'b1',name:'치팅온',desc:'탄수화물 컷 · 2,400mg × 30포',em:'🍚',thumb:'assets/cheatingon.webp',cat:'다이어트·체형',cp:35000,gp:26900,rate:.20,sample:'무상 1박스',stock:1500,status:'listed',
        options:[{n:'1박스 · 오리지널',price:26900},{n:'1박스 · 레몬맛',price:26900},{n:'2박스 세트 (맛 선택 혼합)',price:49900}]},
      {id:'p3',brandId:'b1',name:'벨리라잇',desc:'차전자피 식이섬유 · 5.5g × 30포',em:'✨',thumb:'assets/bellylight.webp',cat:'다이어트·체형',cp:33000,gp:24900,rate:.18,sample:'무상 1박스',stock:1200,status:'listed'},
      {id:'p4',brandId:'b2',name:'GL-01 스킨 샷',desc:'스킨 롱제비티 액상샷 · 20g × 30포',em:'🍍',thumb:'assets/gl01.webp',cat:'이너뷰티·피부',cp:119000,gp:89000,rate:.15,sample:'무상 2주분',stock:800,status:'listed',t:{g:'+38%',note:'이너뷰티 상승세'},exclusive:{grade:'플래티넘',label:'이너뷰티 단독 판매권 · 2개월'},
        samplePolicy:{freeGrade:'플래티넘',buyMode:'auto',fixedPrice:0,refund:true},options:[{n:'1개월분 (30포)',price:89000},{n:'3개월분 (90포) · 12% 할인',price:235000},{n:'6개월분 (180포) · 20% 할인',price:427000}]},
      {id:'p5',brandId:'b1',name:'데일리 플랜트 프로틴',desc:'식물성 단백질 18g · 40g × 7포',em:'🌱',thumb:'assets/protein.webp',cat:'웰니스 푸드',cp:42000,gp:31900,rate:.22,sample:'무상 1통',stock:900,status:'listed'},
      {id:'p7',brandId:'b1',name:'아이클리어 루테인',desc:'마리골드 루테인 20mg · 60캡슐',em:'👁️',cat:'눈·뇌 건강',cp:36000,gp:27900,rate:.20,sample:'무상 1병',stock:1000,status:'listed',t:{g:'+112%',note:'루테인 카테고리 급상승'}},
      {id:'p8',brandId:'b1',name:'데일리 멀티비타민',desc:'비타민 13종 올인원 · 90정',em:'💊',cat:'비타민·영양',cp:32000,gp:23900,rate:.18,sample:'무상 1병',stock:1400,status:'listed'},
      {id:'p9',brandId:'b2',name:'글로우 시카 세럼',desc:'더마 진정 세럼 · 50ml',em:'🧴',cat:'이너뷰티·피부',cp:45000,gp:33900,rate:.25,sample:'무상 1개',stock:700,status:'listed',samplePolicy:{freeGrade:'골드',buyMode:'fixed',fixedPrice:15000,refund:false}},
      {id:'p10',brandId:'b2',name:'수분광 앰플 마스크',desc:'더마 보습 앰플 마스크 · 10매',em:'🎭',cat:'이너뷰티·피부',cp:24000,gp:17900,rate:.22,sample:'무상 3매',stock:1800,status:'listed'},
      {id:'p6',brandId:'b2',name:'글로우 콜라겐 젤리',desc:'저분자 콜라겐 스틱 젤리 · 14포',em:'🍑',cat:'이너뷰티·피부',cp:29000,gp:21900,rate:.20,sample:'무상 1박스',stock:0,status:'pending'}
    ],
    campaigns:[
      {id:'c1',sellerId:'s1',productId:'p1',status:'LIVE',start:D(-2),end:D(2),qty:800,createdAt:D(-14)},
      {id:'c2',sellerId:'s1',productId:'p4',status:'SAMPLE_PURCHASED',createdAt:D(-1),purchased:true,samplePaid:{price:75650,cel:0,cash:75650,method:'cash'}},
      {id:'c3',sellerId:'s1',productId:'p2',status:'TESTING',testDue:D(11),createdAt:D(-6)},
      {id:'c4',sellerId:'s2',productId:'p1',status:'SCHEDULE_CONFIRMED',start:D(7),end:D(11),qty:1000,createdAt:D(-10)},
      {id:'c5',sellerId:'s3',productId:'p3',status:'CLEARING',start:D(-18),end:D(-13),qty:500,createdAt:D(-30)},
      {id:'c6',sellerId:'s2',productId:'p5',status:'SETTLED',start:D(-40),end:D(-35),qty:600,createdAt:D(-55),settledAt:D(-14)},
      {id:'c7',sellerId:'s6',productId:'p1',status:'SAMPLE_REQUESTED',createdAt:D(0)},
      {id:'c8',sellerId:'s8',productId:'p7',status:'SAMPLE_REQUESTED',createdAt:D(-1)},
      {id:'c9',sellerId:'s2',productId:'p3',status:'SCHEDULE_PROPOSED',propStart:D(12),propEnd:D(16),propQty:600,createdAt:D(-8)},
      {id:'c10',sellerId:'s3',productId:'p2',status:'SAMPLE_APPROVED',createdAt:D(-2)},
      {id:'c11',sellerId:'s7',productId:'p9',status:'SAMPLE_REQUESTED',createdAt:D(0)},
      {id:'c12',sellerId:'s8',productId:'p2',status:'LIVE',start:D(-3),end:D(3),qty:600,createdAt:D(-16)},
      {id:'c13',sellerId:'s1',productId:'p10',status:'INVITED',createdAt:D(0),invited:true,celUsed:0},
      {id:'c14',sellerId:'s1',productId:'p6',status:'SAMPLE_SHIPPED',createdAt:D(-3),tracking:'6812-4471-2039'}
    ],
    orders:[],
    cs:[
      {id:'cs1',cid:'c1',orderId:'o101',buyer:'김*은',type:'배송 문의',msg:'주문한 지 3일째인데 아직 운송장이 안 떠요. 언제쯤 발송되나요?',status:'OPEN',at:D(-1)},
      {id:'cs2',cid:'c5',orderId:'o220',buyer:'이*아',type:'교환·반품',msg:'포장이 찌그러진 상태로 왔습니다. 교환 가능할까요?',status:'ANSWERED',at:D(-12),reply:'불편을 드려 죄송합니다. 오늘 새 제품으로 재발송했고 기존 상품은 회수 신청해두었습니다.',repliedAt:D(-11)}
    ],
    messages:{},
    settlements:[],
    seq:100
  };
  // seed orders
  const mkOrders=(cid,gp,n,nRef,fromD,span)=>{
    const names=['김*은','이*아','박*희','최*진','정*수','한*별','윤*서','장*미','오*랑','신*혜'];
    for(let i=0;i<n;i++){
      data.orders.push({id:'o'+(data.seq++),campaignId:cid,buyer:names[i%10],qty:1+(i%3===0?1:0),
        unit:gp,status:i<nRef?'REFUNDED':'PAID',at:D(fromD+ (i%span))});
    }
  };
  mkOrders('c1',29900,34,1,-2,4);
  mkOrders('c12',26900,57,2,-3,5);
  mkOrders('c5',24900,412,14,-18,5);
  mkOrders('c6',31900,548,11,-40,5);
  data.orders.push({id:'o'+(data.seq++),campaignId:'c2',buyer:'지유 (샘플 구매)',qty:1,unit:75650,status:'PAID',at:D(-1),sample:true});
  // 시드 배송 상태: 종료·정산 판매(c5,c6)는 전량 발송 완료, 진행 중(c1,c12)은 어제까지 주문만 발송 (오늘 주문은 미발송)
  const couriers=['CJ대한통운','우체국택배','한진택배','롯데택배'];
  data.orders.forEach((o,i)=>{if(o.status!=='PAID')return;const shipped=['c5','c6'].includes(o.campaignId)||o.at<D(0);if(shipped){o.tracking='6890-'+String(1000+(i*37)%9000).padStart(4,'0')+'-'+String(1000+(i*53)%9000).padStart(4,'0');o.courier=couriers[i%4];}});
  // seed messages
  const sys=(cid,txt,d)=>{(data.messages[cid]=data.messages[cid]||[]).push({type:'sys',txt,at:d})};
  const chat=(cid,role,txt,d)=>{(data.messages[cid]=data.messages[cid]||[]).push({type:'chat',role,txt,at:d})};
  sys('c2','🧾 인플루언서 <b>지유(@jiyu_beauty)</b>가 샘플을 <b>구매</b>했습니다 · ₩75,650 (현금) · 무상 기준 플래티넘 미달 → 구매 · 판매 확정 시 환급 상품',D(-1));
  chat('c2','seller','안녕하세요! GL-01 직접 한 달 먹어보고 진행 결정하고 싶어요. 성분표도 같이 받아볼 수 있을까요?',D(-1));
  sys('c3','샘플 요청 → 승인 → 배송 완료 · 수령 확인됨',D(-3));
  sys('c3','테스트 기한: '+md(P(D(11)))+' 까지 진행 여부 응답',D(-3));
  chat('c3','brand','치팅온은 식전 30분 섭취 기준으로 안내 부탁드려요. 상세페이지 가이드 첨부합니다 📎 cheatingon-guide.pdf',D(-2));
  chat('c3','seller','네! 2주 먹어보고 후기 정리해서 일정 제안드릴게요.',D(-2));
  sys('c1','일정 확정 '+md(P(D(-2)))+' – '+md(P(D(2)))+' · 배정 재고 800',D(-7));
  sys('c1','판매 링크 활성화 — 판매 시작',D(-2));
  sys('c5','판매 종료 · 교환/환불 기간 시작 (정산 예정 '+md(addD(P(D(-13)),21))+')',D(-13));
  sys('c6','정산 완료 · 명세 발행',D(-14));
  sys('c7','인플루언서 <b>하늘(@haneul_fit)</b>가 샘플을 요청했습니다',D(0));
  chat('c7','seller','안녕하세요! 홈트 루틴이랑 같이 버닝온 2주 챌린지 콘텐츠로 풀어보고 싶어요. 샘플 부탁드립니다 💪',D(0));
  sys('c8','인플루언서 <b>유나(@yuna_healthy)</b>가 샘플을 요청했습니다',D(-1));
  chat('c8','seller','루테인 검색 유입 글로 리뷰 준비 중이에요. 성분표와 함께 샘플 받아볼 수 있을까요?',D(-1));
  sys('c9','인플루언서가 판매 일정을 제안했습니다 · <b>'+md(P(D(12)))+' – '+md(P(D(16)))+'</b> · 재고 600',D(0));
  chat('c9','seller','추석 전 타이밍으로 잡아봤어요. 이 기간 승인 부탁드려요!',D(0));
  sys('c10','브랜드가 샘플 요청을 <b>승인</b>했습니다 · 배송지 전달됨',D(-1));
  sys('c11','인플루언서 <b>소민(@somin_beauty)</b>가 샘플을 요청했습니다',D(0));
  sys('c12','일정 확정 '+md(P(D(-3)))+' – '+md(P(D(3)))+' · 배정 재고 600',D(-9));
  chat('c12','seller','블로그 리뷰 글 상단에 링크 고정했어요. 검색 유입이 꾸준해서 기간 내 목표 500개 갈 것 같습니다!',D(-2));
  chat('c12','brand','좋습니다 유나님, 재고 여유 있으니 필요하면 100개 추가 배정 가능해요.',D(-2));
  sys('c12','판매 링크 활성화 — <b>판매 시작</b>',D(-3));
  sys('c13','브랜드 <b>글로헬스</b>가 <b>수분광 앰플 마스크</b> 판매를 직접 제안했습니다 · 인플루언서 수락 대기',D(0));
  chat('c13','brand','지유님 안녕하세요, 글로헬스입니다. GL-01 리뷰 결이 좋아서 앰플 마스크도 함께 제안드려요. 수락해주시면 바로 샘플 보내드릴게요!',D(0));
  return data;
}
