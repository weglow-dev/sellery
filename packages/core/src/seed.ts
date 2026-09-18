/* ============ seed (js/01-seed.js) ============ */
import { addD, md, P, today, ymd } from './util';
import { BLOGO1, BLOGO2, AV1 } from './seed-assets';
import type { Data } from './types';

export function seedData(): Data {
	const t = today();
	const D = (n: number) => ymd(addD(t, n));
	const data: Data = {
		brands: [
			{ id: 'b1', name: '바인허브', cat: '건강기능식품', manager: '김바인', email: 'partner@vyneherb.co', settleInfo: { bank: '기업', account: '12345678901234', holder: '(주)바인허브', bizNo: '214-88-01234', mailOrder: '제2024-서울강남-01234호' }, gmvBase: 52000000, logo: BLOGO1, refCode: 'VYNE-01', autoPropose: true },
			{ id: 'b2', name: '글로헬스', cat: '이너뷰티·피부', manager: '박글로', email: 'official@weglow.biz', settleInfo: { bank: '신한', account: '11022233344455', holder: '(주)위글로우', bizNo: '331-87-02211' }, gmvBase: 382000000, logo: BLOGO2, refCode: 'GLO-002', referredBy: 'b1' }
		],
		brandRefEarnings: [{ at: D(-20), referrerId: 'b1', fromBrandId: 'b2', campaignId: '(지난 판매)', amt: 318000 }],
		celeryLedger: [
			{ who: 's1', at: D(-30), delta: 3, memo: '가입 축하 지급' },
			{ who: 's1', at: D(-6), delta: -2, memo: '매출 데이터 확인권 구매' },
			{ who: 's2', at: D(-40), delta: 3, memo: '가입 축하 지급' },
			{ who: 's3', at: D(-25), delta: 3, memo: '가입 축하 지급' },
			{ who: 's6', at: D(-5), delta: 3, memo: '가입 축하 지급' }, { who: 's7', at: D(-4), delta: 3, memo: '가입 축하 지급' }, { who: 's8', at: D(-9), delta: 3, memo: '가입 축하 지급' },
			{ who: 'b1', at: D(-45), delta: 5, memo: '입점 이벤트 지급' },
			{ who: 'b1', at: D(-3), delta: -2, memo: '익명 레퍼런스 열람 · ○○○ 인플루언서' },
			{ who: 'b2', at: D(-40), delta: 5, memo: '입점 이벤트 지급' }
		],
		sellers: [
			{ id: 's1', name: '지유', handle: '@jiyu_beauty', email: 'jiyu@sellery.demo', platform: 'instagram', settleInfo: { type: 'personal', bank: '카카오뱅크', account: '3333012345678', holder: '김지유' }, img: AV1 || '/assets/av-s1.svg', followers: 84300, cat: '이너뷰티·피부', likesAvg: 3100, recentLikes: [2900, 3400, 2800, 3600, 3100, 3500], m3Sales: 15600000, refCode: 'JIYU10', intro: '스킨케어·이너뷰티 리뷰어. 콜라겐·글루타치온 판매 다수 진행.',
				channels: [
					{ id: 'ch1', platform: 'instagram', handle: '@jiyu_beauty', url: 'instagram.com/jiyu_beauty', followers: 84300, verified: true, primary: true },
					{ id: 'ch2', platform: 'youtube', handle: '지유의 뷰티랩', url: 'youtube.com/@jiyulab', followers: 12400, verified: false }
				] },
			{ id: 's2', name: '혜린', handle: '@hyerin_pick', email: 'hyerin@sellery.demo', platform: 'instagram', settleInfo: { type: 'biz', bank: '국민', account: '94820111222333', holder: '혜린스튜디오', bizNo: '512-21-00987' }, img: '/assets/av-s2.svg', followers: 126000, cat: '웰니스 푸드', likesAvg: 4200, recentLikes: [3900, 4600, 4100, 4400, 4000, 4700], m3Sales: 22840000, refCode: 'HYERIN', intro: '웰니스 라이프 큐레이터. 식품·간식 카테고리 재판매율 높음.',
				channels: [{ id: 'ch3', platform: 'instagram', handle: '@hyerin_pick', url: 'instagram.com/hyerin_pick', followers: 126000, verified: true, primary: true }] },
			{ id: 's3', name: '민지', handle: '@minji_diet', email: 'minji@sellery.demo', platform: 'naver', settleInfo: { type: 'personal', bank: '토스뱅크', account: '100012345678', holder: '박민지' }, img: '/assets/av-s3.svg', followers: 45200, cat: '다이어트·체형', likesAvg: 1900, recentLikes: [1700, 2100, 1800, 2000, 1900, 2200], m3Sales: 13221900, refCode: 'MINJI5', referredBy: 's1', intro: '다이어트 여정 기록 4년차. 팔로워 대비 판매 전환 최상위.',
				channels: [{ id: 'ch4', platform: 'naver', handle: '@minji_diet', url: 'blog.naver.com/minji_diet', followers: 45200, verified: true, primary: true }] },
			{ id: 's4', name: '서아', handle: '@seoa_health', email: 'seoa@sellery.demo', platform: 'youtube', img: '/assets/av-s4.svg', followers: 118000, cat: '비타민·영양', likesAvg: 5400, recentLikes: [5100, 5800, 5200, 5600, 5400], m3Sales: 52000000, refCode: 'SEOA88', hidden: true, intro: '건기식 전문. 비공개 프로필.',
				channels: [{ id: 'ch5', platform: 'youtube', handle: '@seoa_health', url: 'youtube.com/@seoa_health', followers: 118000, verified: true, primary: true }] },
			{ id: 's5', name: '로라', handle: '@lola_beauty', email: 'lola@sellery.demo', platform: 'tiktok', img: '/assets/av-s5.svg', followers: 210000, cat: '이너뷰티·피부', likesAvg: 12800, recentLikes: [12100, 13400, 12600, 13100, 12800], m3Sales: 87000000, refCode: 'LOLA00', hidden: true, intro: '이너뷰티 메가 인플루언서. 비공개 프로필.',
				channels: [{ id: 'ch6', platform: 'tiktok', handle: '@lola_beauty', url: 'tiktok.com/@lola_beauty', followers: 210000, verified: true, primary: true }] },
			{ id: 's6', name: '하늘', handle: '@haneul_fit', email: 'haneul@sellery.demo', platform: 'instagram', img: '/assets/av-s6.svg', followers: 62000, cat: '다이어트·체형', likesAvg: 2400, recentLikes: [2100, 2600, 2300, 2700, 2500, 2900], m3Sales: 9800000, refCode: 'HANEUL', intro: '홈트·바디 프로필 크리에이터. 다이어트 판매 반응 좋음.',
				channels: [{ id: 'ch7', platform: 'instagram', handle: '@haneul_fit', url: 'instagram.com/haneul_fit', followers: 62000, verified: true, primary: true }] },
			{ id: 's7', name: '소민', handle: '@somin_beauty', email: 'somin@sellery.demo', platform: 'youtube', img: '/assets/av-s7.svg', followers: 38000, cat: '이너뷰티·피부', likesAvg: 5100, recentLikes: [4600, 5300, 4900, 5500, 5200], m3Sales: 6200000, refCode: 'SOMIN7', intro: '이너뷰티·더마 리뷰 유튜버. 구독자 신뢰도·댓글 반응 상위.',
				channels: [{ id: 'ch8', platform: 'youtube', handle: '@somin_beauty', url: 'youtube.com/@somin_beauty', followers: 38000, verified: true, primary: true }] },
			{ id: 's8', name: '유나', handle: '@yuna_healthy', email: 'yuna@sellery.demo', platform: 'naver', img: '/assets/av-s8.svg', followers: 71000, cat: '비타민·영양', likesAvg: 1600, recentLikes: [1400, 1700, 1500, 1800, 1700, 1900], m3Sales: 18400000, refCode: 'YUNA88', intro: '건기식·영양제 블로거. 검색 유입 강함, 재판매율 71%.',
				channels: [{ id: 'ch9', platform: 'naver', handle: '@yuna_healthy', url: 'blog.naver.com/yuna_healthy', followers: 71000, verified: true, primary: true }] }
		],
		productViews: [
			{ sellerId: 's6', productId: 'p1', ago: '2시간 전' }, { sellerId: 's8', productId: 'p7', ago: '3시간 전' }, { sellerId: 's3', productId: 'p2', ago: '5시간 전' },
			{ sellerId: 's7', productId: 'p9', ago: '4시간 전' }, { sellerId: 's2', productId: 'p4', ago: '어제' }, { sellerId: 's6', productId: 'p5', ago: '어제' }
		],
		unlockedRefs: [],
		brandDataUnlocks: { b1: ['s1'], b2: ['s7'] },
		external: {
			s1: [{ name: '저분자 피쉬콜라겐 스틱', brand: '타사 A', src: 'instagram', at: D(-5), price: 32000 }],
			s2: [{ name: '프로바이오틱스 30포', brand: '타사 B', src: 'instagram', at: D(-2), price: 39000 }, { name: '저당 그래놀라 3팩', brand: '타사 C', src: 'instagram', at: D(-11), price: 28000 }],
			s3: [{ name: '곤약 젤리 30팩', brand: '타사 D', src: 'naver', at: D(-6), price: 24900 }],
			s4: [{ name: '오메가3 rTG', brand: '타사 E', src: 'youtube', at: D(-3), price: 41000 }],
			s5: [{ name: '글루타치온 필름', brand: '타사 F', src: 'tiktok', at: D(-1), price: 33000 }, { name: '콜라겐 젤리 스틱', brand: '타사 G', src: 'tiktok', at: D(-8), price: 29000 }],
			s6: [{ name: '단백질 쉐이크 14팩', brand: '타사 H', src: 'instagram', at: D(-4), price: 34000 }],
			s7: [{ name: '비오틴 츄어블', brand: '타사 I', src: 'youtube', at: D(-7), price: 24000 }],
			s8: [{ name: '마그네슘 글리시네이트', brand: '타사 J', src: 'naver', at: D(-3), price: 29000 }]
		},
		exclusiveReqs: [{ id: 'x1', productId: 'p1', sellerId: 's4', status: 'PENDING', at: D(-1) }],
		refEarnings: [{ at: D(-24), referrerId: 's1', fromSellerId: 's3', campaignId: '(지난 판매)', amt: 186400 }],
		products: [
			{ id: 'p1', brandId: 'b1', name: '버닝온', desc: '다이어트 부스터 · 6,000mg × 30포', em: '🔥', thumb: '/assets/burningon.webp', cat: '다이어트·체형', cp: 39000, gp: 29900, rate: .20, sample: '무상 1박스', stock: 2000, status: 'listed', t: { g: '+240%', note: '분기 매출 급등' }, exclusive: { grade: '다이아', label: '인스타그램 판매 독점권 · 3개월' },
				samplePolicy: { freeGrade: '실버', buyMode: 'auto', fixedPrice: 0, refund: false }, options: [{ n: '1박스 (30포)', price: 29900 }, { n: '2박스 세트 (60포)', price: 56800 }, { n: '3박스 + 쉐이커 증정', price: 79900 }] },
			{ id: 'p2', brandId: 'b1', name: '치팅온', desc: '탄수화물 컷 · 2,400mg × 30포', em: '🍚', thumb: '/assets/cheatingon.webp', cat: '다이어트·체형', cp: 35000, gp: 26900, rate: .20, sample: '무상 1박스', stock: 1500, status: 'listed',
				options: [{ n: '1박스 · 오리지널', price: 26900 }, { n: '1박스 · 레몬맛', price: 26900 }, { n: '2박스 세트 (맛 선택 혼합)', price: 49900 }] },
			{ id: 'p3', brandId: 'b1', name: '벨리라잇', desc: '차전자피 식이섬유 · 5.5g × 30포', em: '✨', thumb: '/assets/bellylight.webp', cat: '다이어트·체형', cp: 33000, gp: 24900, rate: .18, sample: '무상 1박스', stock: 1200, status: 'listed' },
			{ id: 'p4', brandId: 'b2', name: 'GL-01 스킨 샷', desc: '스킨 롱제비티 액상샷 · 20g × 30포', em: '🍍', thumb: '/assets/gl01.webp', cat: '이너뷰티·피부', cp: 119000, gp: 89000, rate: .15, sample: '무상 2주분', stock: 800, status: 'listed', t: { g: '+38%', note: '이너뷰티 상승세' }, exclusive: { grade: '플래티넘', label: '이너뷰티 단독 판매권 · 2개월' },
				samplePolicy: { freeGrade: '플래티넘', buyMode: 'auto', fixedPrice: 0, refund: true }, options: [{ n: '1개월분 (30포)', price: 89000 }, { n: '3개월분 (90포) · 12% 할인', price: 235000 }, { n: '6개월분 (180포) · 20% 할인', price: 427000 }] },
			{ id: 'p5', brandId: 'b1', name: '데일리 플랜트 프로틴', desc: '식물성 단백질 18g · 40g × 7포', em: '🌱', thumb: '/assets/protein.webp', cat: '웰니스 푸드', cp: 42000, gp: 31900, rate: .22, sample: '무상 1통', stock: 900, status: 'listed' },
			{ id: 'p7', brandId: 'b1', name: '아이클리어 루테인', desc: '마리골드 루테인 20mg · 60캡슐', em: '👁️', cat: '눈·뇌 건강', cp: 36000, gp: 27900, rate: .20, sample: '무상 1병', stock: 1000, status: 'listed', t: { g: '+112%', note: '루테인 카테고리 급상승' } },
			{ id: 'p8', brandId: 'b1', name: '데일리 멀티비타민', desc: '비타민 13종 올인원 · 90정', em: '💊', cat: '비타민·영양', cp: 32000, gp: 23900, rate: .18, sample: '무상 1병', stock: 1400, status: 'listed' },
			{ id: 'p9', brandId: 'b2', name: '글로우 시카 세럼', desc: '더마 진정 세럼 · 50ml', em: '🧴', cat: '이너뷰티·피부', cp: 45000, gp: 33900, rate: .25, sample: '무상 1개', stock: 700, status: 'listed', samplePolicy: { freeGrade: '골드', buyMode: 'fixed', fixedPrice: 15000, refund: false } },
			{ id: 'p10', brandId: 'b2', name: '수분광 앰플 마스크', desc: '더마 보습 앰플 마스크 · 10매', em: '🎭', cat: '이너뷰티·피부', cp: 24000, gp: 17900, rate: .22, sample: '무상 3매', stock: 1800, status: 'listed' },
			{ id: 'p6', brandId: 'b2', name: '글로우 콜라겐 젤리', desc: '저분자 콜라겐 스틱 젤리 · 14포', em: '🍑', cat: '이너뷰티·피부', cp: 29000, gp: 21900, rate: .20, sample: '무상 1박스', stock: 0, status: 'pending' }
		],
		campaigns: [
			{ id: 'c1', sellerId: 's1', productId: 'p1', status: 'LIVE', start: D(-2), end: D(2), qty: 800, createdAt: D(-14) },
			{ id: 'c2', sellerId: 's1', productId: 'p4', status: 'SAMPLE_PURCHASED', createdAt: D(-1), purchased: true, samplePaid: { price: 75650, cel: 0, cash: 75650, method: 'cash' } },
			{ id: 'c3', sellerId: 's1', productId: 'p2', status: 'TESTING', testDue: D(11), createdAt: D(-6) },
			{ id: 'c4', sellerId: 's2', productId: 'p1', status: 'SCHEDULE_CONFIRMED', start: D(7), end: D(11), qty: 1000, createdAt: D(-10) },
			{ id: 'c5', sellerId: 's3', productId: 'p3', status: 'CLEARING', start: D(-18), end: D(-13), qty: 500, createdAt: D(-30) },
			{ id: 'c6', sellerId: 's2', productId: 'p5', status: 'SETTLED', start: D(-40), end: D(-35), qty: 600, createdAt: D(-55), settledAt: D(-14) },
			{ id: 'c7', sellerId: 's6', productId: 'p1', status: 'SAMPLE_REQUESTED', createdAt: D(0) },
			{ id: 'c8', sellerId: 's8', productId: 'p7', status: 'SAMPLE_REQUESTED', createdAt: D(-1) },
			{ id: 'c9', sellerId: 's2', productId: 'p3', status: 'SCHEDULE_PROPOSED', propStart: D(12), propEnd: D(16), propQty: 600, createdAt: D(-8) },
			{ id: 'c10', sellerId: 's3', productId: 'p2', status: 'SAMPLE_APPROVED', createdAt: D(-2) },
			{ id: 'c11', sellerId: 's7', productId: 'p9', status: 'SAMPLE_REQUESTED', createdAt: D(0) },
			{ id: 'c12', sellerId: 's8', productId: 'p2', status: 'LIVE', start: D(-3), end: D(3), qty: 600, createdAt: D(-16) },
			{ id: 'c13', sellerId: 's1', productId: 'p10', status: 'INVITED', createdAt: D(0), invited: true, celUsed: 0 },
			{ id: 'c14', sellerId: 's1', productId: 'p6', status: 'SAMPLE_SHIPPED', createdAt: D(-3), tracking: '6812-4471-2039' }
		],
		orders: [],
		cs: [
			{ id: 'cs1', cid: 'c1', orderId: 'o101', buyer: '김*은', type: '배송 문의', msg: '주문한 지 3일째인데 아직 운송장이 안 떠요. 언제쯤 발송되나요?', status: 'OPEN', at: D(-1) },
			{ id: 'cs2', cid: 'c5', orderId: 'o220', buyer: '이*아', type: '교환·반품', msg: '포장이 찌그러진 상태로 왔습니다. 교환 가능할까요?', status: 'ANSWERED', at: D(-12), reply: '불편을 드려 죄송합니다. 오늘 새 제품으로 재발송했고 기존 상품은 회수 신청해두었습니다.', repliedAt: D(-11) }
		],
		messages: {},
		settlements: [],
		seq: 100
	};
	// seed orders
	const mkOrders = (cid: string, gp: number, n: number, nRef: number, fromD: number, span: number) => {
		const names = ['김*은', '이*아', '박*희', '최*진', '정*수', '한*별', '윤*서', '장*미', '오*랑', '신*혜'];
		for (let i = 0; i < n; i++) {
			data.orders.push({ id: 'o' + data.seq++, campaignId: cid, buyer: names[i % 10], qty: 1 + (i % 3 === 0 ? 1 : 0), unit: gp, status: i < nRef ? 'REFUNDED' : 'PAID', at: D(fromD + (i % span)) });
		}
	};
	mkOrders('c1', 29900, 34, 1, -2, 4);
	mkOrders('c12', 26900, 57, 2, -3, 5);
	mkOrders('c5', 24900, 412, 14, -18, 5);
	mkOrders('c6', 31900, 548, 11, -40, 5);
	data.orders.push({ id: 'o' + data.seq++, campaignId: 'c2', buyer: '지유 (샘플 구매)', qty: 1, unit: 75650, status: 'PAID', at: D(-1), sample: true });
	// 시드 배송 상태: 종료·정산 판매(c5,c6)는 전량 발송 완료, 진행 중(c1,c12)은 어제까지 주문만 발송
	const couriers = ['CJ대한통운', '우체국택배', '한진택배', '롯데택배'];
	data.orders.forEach((o, i) => {
		if (o.status !== 'PAID') return;
		const shipped = ['c5', 'c6'].includes(o.campaignId) || o.at < D(0);
		if (shipped) { o.tracking = '6890-' + String(1000 + (i * 37) % 9000).padStart(4, '0') + '-' + String(1000 + (i * 53) % 9000).padStart(4, '0'); o.courier = couriers[i % 4]; }
	});
	// seed messages
	const sys = (cid: string, txt: string, d: string) => { (data.messages[cid] = data.messages[cid] || []).push({ type: 'sys', txt, at: d }); };
	const chat = (cid: string, role: 'seller' | 'brand', txt: string, d: string) => { (data.messages[cid] = data.messages[cid] || []).push({ type: 'chat', role, txt, at: d }); };
	sys('c2', '🧾 인플루언서 <b>지유(@jiyu_beauty)</b>가 샘플을 <b>구매</b>했습니다 · ₩75,650 (현금) · 무상 기준 플래티넘 미달 → 구매 · 판매 확정 시 환급 상품', D(-1));
	chat('c2', 'seller', '안녕하세요! GL-01 직접 한 달 먹어보고 진행 결정하고 싶어요. 성분표도 같이 받아볼 수 있을까요?', D(-1));
	sys('c3', '샘플 요청 → 승인 → 배송 완료 · 수령 확인됨', D(-3));
	sys('c3', '테스트 기한: ' + md(P(D(11))) + ' 까지 진행 여부 응답', D(-3));
	chat('c3', 'brand', '치팅온은 식전 30분 섭취 기준으로 안내 부탁드려요. 상세페이지 가이드 첨부합니다 📎 cheatingon-guide.pdf', D(-2));
	chat('c3', 'seller', '네! 2주 먹어보고 후기 정리해서 일정 제안드릴게요.', D(-2));
	sys('c1', '일정 확정 ' + md(P(D(-2))) + ' – ' + md(P(D(2))) + ' · 배정 재고 800', D(-7));
	sys('c1', '판매 링크 활성화 — 판매 시작', D(-2));
	sys('c5', '판매 종료 · 교환/환불 기간 시작 (정산 예정 ' + md(addD(P(D(-13)), 21)) + ')', D(-13));
	sys('c6', '정산 완료 · 명세 발행', D(-14));
	sys('c7', '인플루언서 <b>하늘(@haneul_fit)</b>가 샘플을 요청했습니다', D(0));
	chat('c7', 'seller', '안녕하세요! 홈트 루틴이랑 같이 버닝온 2주 챌린지 콘텐츠로 풀어보고 싶어요. 샘플 부탁드립니다 💪', D(0));
	sys('c8', '인플루언서 <b>유나(@yuna_healthy)</b>가 샘플을 요청했습니다', D(-1));
	chat('c8', 'seller', '루테인 검색 유입 글로 리뷰 준비 중이에요. 성분표와 함께 샘플 받아볼 수 있을까요?', D(-1));
	sys('c9', '인플루언서가 판매 일정을 제안했습니다 · <b>' + md(P(D(12))) + ' – ' + md(P(D(16))) + '</b> · 재고 600', D(0));
	chat('c9', 'seller', '추석 전 타이밍으로 잡아봤어요. 이 기간 승인 부탁드려요!', D(0));
	sys('c10', '브랜드가 샘플 요청을 <b>승인</b>했습니다 · 배송지 전달됨', D(-1));
	sys('c11', '인플루언서 <b>소민(@somin_beauty)</b>가 샘플을 요청했습니다', D(0));
	sys('c12', '일정 확정 ' + md(P(D(-3))) + ' – ' + md(P(D(3))) + ' · 배정 재고 600', D(-9));
	chat('c12', 'seller', '블로그 리뷰 글 상단에 링크 고정했어요. 검색 유입이 꾸준해서 기간 내 목표 500개 갈 것 같습니다!', D(-2));
	chat('c12', 'brand', '좋습니다 유나님, 재고 여유 있으니 필요하면 100개 추가 배정 가능해요.', D(-2));
	sys('c12', '판매 링크 활성화 — <b>판매 시작</b>', D(-3));
	sys('c13', '브랜드 <b>글로헬스</b>가 <b>수분광 앰플 마스크</b> 판매를 직접 제안했습니다 · 인플루언서 수락 대기', D(0));
	chat('c13', 'brand', '지유님 안녕하세요, 글로헬스입니다. GL-01 리뷰 결이 좋아서 앰플 마스크도 함께 제안드려요. 수락해주시면 바로 샘플 보내드릴게요!', D(0));
	return data;
}
