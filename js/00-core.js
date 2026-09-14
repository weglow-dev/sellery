/* ============ utils ============ */
const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const DAY = 86400000;
const today = () => new Date(new Date().toDateString());
const addD = (d,n) => new Date(d.getTime()+n*DAY);
const md = d => `${d.getMonth()+1}/${d.getDate()}`;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const P = d => new Date(d+'T00:00:00');
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ============ status machine ============ */
const ST = {
  SAMPLE_REQUESTED:{l:'샘플 요청',c:'blue',turn:'brand'},
  INVITED:{l:'브랜드 제안 · 수락 대기',c:'blue',turn:'seller'},
  DECLINED:{l:'제안 거절',c:'gray'},
  REJECTED:{l:'거절됨',c:'red'},
  SAMPLE_APPROVED:{l:'샘플 발송 대기',c:'blue',turn:'brand'},
  SAMPLE_PURCHASED:{l:'샘플 구매 · 발송 대기',c:'blue',turn:'brand'},
  SAMPLE_SHIPPED:{l:'샘플 배송중',c:'blue',turn:'seller'},
  TESTING:{l:'테스트 중',c:'amber',turn:'seller'},
  PASSED:{l:'인플루언서 패스',c:'gray'},
  SCHEDULE_PROPOSED:{l:'일정 승인 대기',c:'amber',turn:'brand'},
  SCHEDULE_CONFIRMED:{l:'일정 확정',c:'green'},
  LIVE:{l:'판매 진행중',c:'live'},
  CLEARING:{l:'교환·환불 기간',c:'amber'},
  SETTLED:{l:'정산 완료',c:'green'}
};
const FLOW = ['SAMPLE_REQUESTED','SAMPLE_APPROVED','SAMPLE_SHIPPED','TESTING','SCHEDULE_PROPOSED','SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED'];
const FLOW_L = ['샘플요청','샘플승인','배송','테스트','일정제안','일정확정','판매 LIVE','환불기간','정산'];
const PG_RATE = 0.019, PLAT_RATE = 0.10, WHT = 0.033, CLEAR_DAYS = 21;
