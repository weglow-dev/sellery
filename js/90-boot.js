/* ============ boot screen (session first load, skin flavor) ============ */
(function boot(){
  try{if(sessionStorage.getItem('slry-boot'))return;sessionStorage.setItem('slry-boot','1');}catch(e){}
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const o=document.createElement('div');o.className='boot';
  o.innerHTML=`<div class="boot-win"><div class="boot-bar">◼ ◼ ◼<span>SELLERY.EXE</span></div><div class="boot-logo">${LOGO_ICON.replace('class="celogo"','class="celogo" width="52" height="60" style="vertical-align:-14px;margin-right:12px"')}SELLERY<span>.</span></div><div class="boot-txt">LOADING INFLUENCER COMMERCE OS…</div><div class="boot-prog"><i></i></div></div>`;
  document.body.appendChild(o);
  setTimeout(()=>o.classList.add('out'),1350);setTimeout(()=>o.remove(),1750);
})();
/* ============ events ============ */
/* 3D 틸트: 상품 누끼가 마우스를 따라 살짝 기울어짐 (+ 그림자 반대 방향 이동) */
(function(){
  const MAX=11;
  function reset(t){t.style.transform='';t.style.filter='';}
  document.addEventListener('mousemove',e=>{
    const host=e.target.closest&&e.target.closest('.ph, .store-hero');
    if(!host){return;}
    const t=host.querySelector('.p3d');if(!t)return;
    const r=host.getBoundingClientRect();
    const dx=((e.clientX-r.left)/r.width-0.5)*2, dy=((e.clientY-r.top)/r.height-0.5)*2;
    t.style.transform=`perspective(700px) rotateX(${(-dy*MAX).toFixed(2)}deg) rotateY(${(dx*MAX).toFixed(2)}deg) translateZ(14px) scale(1.05)`;
    t.style.filter=`drop-shadow(${(-dx*10).toFixed(1)}px ${(10-dy*6).toFixed(1)}px 8px rgba(28,42,20,.22))`;
    host.classList.add('tilting');
  });
  document.addEventListener('mouseout',e=>{
    const host=e.target.closest&&e.target.closest('.ph, .store-hero');
    if(!host||host.contains(e.relatedTarget))return;
    const t=host.querySelector('.p3d');if(t)reset(t);host.classList.remove('tilting');
  });
})();
document.addEventListener('click',e=>{
  if(e.target.classList&&e.target.classList.contains('modal-bg')){closeModal();return;}
  const el=e.target.closest('[data-act]');if(!el)return;
  const fn=ACT[el.dataset.act];if(fn)fn(el.dataset.k,el);
});
document.addEventListener('input',e=>{
  if(e.target&&e.target.id==='npRate'){
    const t=+e.target.value||0;
    const el=document.getElementById('npRateCalc');
    if(el)el.innerHTML=t>10?`→ 플랫폼 <b>10%p</b> + 제안 수수료 <b style="color:var(--red)">${+(t-10).toFixed(1)}%</b> · 등급 보너스 포함 최대 <b>${+(t-10+GRADES[0].bonus).toFixed(1)}%</b> (블랙, 보너스는 플랫폼 부담)`
      :'<span style="color:var(--danger)">총 수수료율은 플랫폼 몫(10%)보다 커야 합니다</span>';
  }
});
document.addEventListener('change',e=>{
  const el=e.target.closest('select[data-act]');if(!el)return;
  const fn=ACT[el.dataset.act];if(fn)fn(el.value,el);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.id==='chatIn'){const b=document.querySelector('[data-act="sendChat"]');if(b)b.click();}
  if(e.key==='Escape')closeModal();
});
render();
