import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { META_STATE_COOKIE, META_STATE_MAX_AGE } from '@sellery/db/admin/meta-connect';
import { OUTREACH_STATUSES, OUTREACH_STATUS_LABEL, isOutreachStatus, outreachFit, parseCsvRows, parseHandleList, type OutreachStatus } from '@sellery/db/admin/outreach-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { beginMetaConnect, collectOutreachCandidates, countOutreachByStatus, disconnectMeta, listOutreach, outreachCollectStatus, setOutreachStatus, upsertOutreachCreators } from '$lib/server/outreach';
import { OUTREACH_MSG } from './messages';

/**
 * `/outreach` — 크리에이터 아웃리치 큐 (대표 요청 2026-10-22 · docs/admin-console-plan.md "아웃리치").
 * load: 상태 칩 카운트 · 검색 · 목록(점수순). 액션:
 *   ?/add     핸들 목록(줄·쉼표) → 후보 추가 (지표 없음 · 초안 생성)
 *   ?/import  CSV/TSV 붙여넣기(헤더 포함) → upsert (지표 → 적합 점수)
 *   ?/status  행 상태 변경 (select)
 *   ?/collect 제공사(메타 공식 · Modash) 검색 1페이지 → 대표 조건으로 걸러진 후보 upsert (설정 없으면 안내)
 *   ?/metaConnect    [Instagram 연결] — state 쿠키를 심고 Facebook 로그인 창으로 보낸다 → `./meta/callback` 이 받아 저장(0128)
 *   ?/metaDisconnect 연결 해제(환경변수 토큰이 있으면 그쪽으로 돌아간다)
 * DM 은 자동 발송하지 않는다 — 운영자가 초안을 복사해 @makeyour.recipe 에서 보낸 뒤 "DM 보냄" 으로 바꾼다.
 */
const MSG = OUTREACH_MSG;

function self(url: URL, msg?: string, extra?: string): string {
  const p = new URLSearchParams();
  for (const k of ['status', 'q'] as const) {
    const v = url.searchParams.get(k);
    if (v) p.set(k, v);
  }
  if (msg) p.set('msg', msg);
  if (extra) p.set('detail', extra);
  const qs = p.toString();
  return qs ? `${adminPath('/outreach')}?${qs}` : adminPath('/outreach');
}

export const load: PageServerLoad = async (event) => {
  const gate = await requireAdmin(event);
  if (!gate.ok) redirect(303, gate.location);

  const sRaw = event.url.searchParams.get('status') ?? '';
  const status: OutreachStatus | null = isOutreachStatus(sRaw) ? sRaw : null;
  const q = (event.url.searchParams.get('q') ?? '').trim();
  const [rows, counts, collect] = await Promise.all([listOutreach({ status, q: q || null }), countOutreachByStatus(), outreachCollectStatus()]);
  const cpage = Math.max(0, Number(event.url.searchParams.get('cpage') ?? '0') || 0);
  const cafter = event.url.searchParams.get('cafter') ?? '';
  const base = adminPath('/outreach');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const key = event.url.searchParams.get('msg') ?? '';
  const detail = event.url.searchParams.get('detail');
  const msg = key ? `${MSG[key] ?? ''}${detail ? ` — ${detail}` : ''}` : null;
  // 메타 연결 실패 안내만 경고색 — 나머지 안내는 예전 그대로
  const msgTone: 'ok' | 'danger' = /^meta_(?!connected$|disconnected$)/.test(key) ? 'danger' : 'ok';

  return {
    status,
    q,
    msg,
    msgTone,
    self: base,
    chips: [
      { key: '', label: '전체', n: total, href: q ? `${base}?q=${encodeURIComponent(q)}` : base },
      ...OUTREACH_STATUSES.map((k) => ({ key: k, label: OUTREACH_STATUS_LABEL[k].label, n: counts[k] ?? 0, href: `${base}?status=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}` }))
    ],
    statuses: OUTREACH_STATUSES.map((k) => ({ value: k, label: OUTREACH_STATUS_LABEL[k].label })),
    collect: { provider: collect.provider, configured: collect.configured, nextPage: cpage, nextAfter: cafter },
    meta: collect.meta,
    rows: rows.map((r) => ({ ...r, fit: outreachFit(r), href: `${base}/${r.id}` }))
  };
};

export const actions: Actions = {
  add: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const { handles, bad } = parseHandleList(String(form.get('handles') ?? ''));
    const category = String(form.get('category') ?? '').trim() || null;
    if (!handles.length) return fail(400, { error: `핸들을 찾지 못했어요${bad.length ? ` (형식 밖: ${bad.slice(0, 5).join(', ')})` : ''}` });
    const r = await upsertOutreachCreators(handles.map((h) => ({ handle: h, category })), 'manual', gate.ctx.user.email ?? null);
    redirect(303, self(event.url, 'added', `새 ${r.inserted} · 기존 ${r.updated}${r.failed ? ` · 실패 ${r.failed}` : ''}${bad.length ? ` · 형식 밖 ${bad.length}` : ''}`));
  },
  import: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const parsed = parseCsvRows(String(form.get('csv') ?? ''));
    if (!parsed.rows.length) return fail(400, { error: '가져올 행이 없어요 — 첫 줄에 헤더(핸들 · 팔로워 · 여성 · 20~40대 · 한국 · 추세 · 참여율 · 카테고리)가 있어야 해요' });
    const r = await upsertOutreachCreators(parsed.rows, 'csv', gate.ctx.user.email ?? null);
    redirect(303, self(event.url, 'imported', `새 ${r.inserted} · 갱신 ${r.updated}${r.failed ? ` · 실패 ${r.failed}` : ''}${parsed.skipped ? ` · 핸들 없는 줄 ${parsed.skipped}` : ''}`));
  },
  collect: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const page = Math.max(0, Number(form.get('page') ?? '0') || 0);
    const after = String(form.get('after') ?? '').trim() || null;
    const r = await collectOutreachCandidates({ page, after, actor: gate.ctx.user.email ?? null });
    if (!r.ok) {
      const key = r.code === 'NOT_CONFIGURED' ? 'not_configured' : 'provider_error';
      redirect(303, self(event.url, key, r.error ?? undefined));
    }
    const url = new URL(self(event.url, 'collected', `${r.provider === 'meta' ? '메타 공식' : 'Modash'} · 받음 ${r.found} · 조건 통과 ${r.kept} · 새 ${r.inserted} · 갱신 ${r.updated}${r.failed ? ` · 실패 ${r.failed}` : ''}${r.provider === 'meta' && !r.after ? ' · 마지막 페이지' : ''}${r.mock ? ' · 모의 데이터(앱 검수 전 · 연결 확인용)' : ''}`), 'http://x');
    url.searchParams.set('cpage', String(r.page + 1));
    if (r.after) url.searchParams.set('cafter', r.after);
    else url.searchParams.delete('cafter');
    redirect(303, url.pathname + url.search);
  },
  metaConnect: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const begin = beginMetaConnect();
    if (!begin.ok) redirect(303, self(event.url, 'meta_not_configured'));
    // state 는 HttpOnly 쿠키에만 둔다 — 콜백이 쿼리의 state 와 대조한다(CSRF). SameSite=Lax 라 facebook.com 에서 돌아오는 최상위 이동에 실린다
    event.cookies.set(META_STATE_COOKIE, begin.state, { path: adminPath('/'), httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: META_STATE_MAX_AGE });
    redirect(303, begin.url);
  },
  metaDisconnect: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const ok = await disconnectMeta(gate.ctx.user.email ?? null);
    redirect(303, self(event.url, ok ? 'meta_disconnected' : 'err'));
  },
  status: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const st = String(form.get('status') ?? '');
    if (!id || !isOutreachStatus(st)) return fail(400, { error: MSG.err });
    const ok = await setOutreachStatus(id, st, gate.ctx.user.email ?? null);
    redirect(303, self(event.url, ok ? 'status' : 'err'));
  }
};
