import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { OUTREACH_STATUSES, OUTREACH_STATUS_LABEL, OUTREACH_TRENDS, dmDraft, isOutreachStatus, outreachFit } from '@sellery/db/admin/outreach-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { addOutreachNote, deleteOutreach, getOutreach, listOutreachEvents, setOutreachStatus, updateOutreachFields } from '$lib/server/outreach';

/**
 * `/outreach/[id]` — 후보 상세: 지표 수정(팔로워 · 참여율 · 추세 · 카테고리 · 여성/20~40/한국 비율 · 담당) · DM 초안(복사 · 재생성 · 수정) · 상태 버튼 · 메모 · 이력.
 */
const UUID_RE = /^[0-9a-f-]{36}$/i;
const numOrNull = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').replace(/[,%\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export const load: PageServerLoad = async (event) => {
  const gate = await requireAdmin(event);
  if (!gate.ok) redirect(303, gate.location);
  const id = event.params.id;
  if (!UUID_RE.test(id)) error(404, { message: '후보를 찾을 수 없습니다' });
  const [row, events] = await Promise.all([getOutreach(id), listOutreachEvents(id)]);
  if (!row) error(404, { message: '후보를 찾을 수 없습니다' });
  const key = event.url.searchParams.get('msg') ?? '';
  const msg = { saved: '저장했어요', status: '상태를 바꿨어요', note: '메모를 남겼어요', draft: 'DM 초안을 다시 만들었어요', err: '처리하지 못했어요' }[key] ?? null;
  return {
    row,
    fit: outreachFit(row),
    events,
    msg,
    listPath: adminPath('/outreach'),
    statuses: OUTREACH_STATUSES.map((k) => ({ value: k, ...OUTREACH_STATUS_LABEL[k] })),
    trends: OUTREACH_TRENDS
  };
};

export const actions: Actions = {
  save: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const trendRaw = String(form.get('trend') ?? '');
    const er = numOrNull(form.get('engagement_rate'));
    const ok = await updateOutreachFields(
      event.params.id,
      {
        name: String(form.get('name') ?? '').trim() || null,
        category: String(form.get('category') ?? '').trim() || null,
        followers: numOrNull(form.get('followers')),
        // 참여율은 퍼센트로 입력받아 소수로 저장
        engagement_rate: er === null ? null : Math.round(er * 100) / 10000,
        trend: trendRaw === 'up' || trendRaw === 'flat' || trendRaw === 'down' ? trendRaw : null,
        audience: { female_pct: numOrNull(form.get('female_pct')), age_20_40_pct: numOrNull(form.get('age_20_40_pct')), kr_pct: numOrNull(form.get('kr_pct')), source: String(form.get('audience_source') ?? '').trim() || null },
        assigned_to: String(form.get('assigned_to') ?? '').trim() || null,
        dm_draft: String(form.get('dm_draft') ?? '').trim() || null
      },
      gate.ctx.user.email ?? null
    );
    redirect(303, `${adminPath(`/outreach/${event.params.id}`)}?msg=${ok ? 'saved' : 'err'}`);
  },
  status: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const st = String(form.get('status') ?? '');
    if (!isOutreachStatus(st)) return fail(400, { error: '상태 값이 올바르지 않아요' });
    const ok = await setOutreachStatus(event.params.id, st, gate.ctx.user.email ?? null);
    redirect(303, `${adminPath(`/outreach/${event.params.id}`)}?msg=${ok ? 'status' : 'err'}`);
  },
  note: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const form = await event.request.formData();
    const ok = await addOutreachNote(event.params.id, String(form.get('body') ?? ''), gate.ctx.user.email ?? null);
    redirect(303, `${adminPath(`/outreach/${event.params.id}`)}?msg=${ok ? 'note' : 'err'}`);
  },
  draft: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    const row = await getOutreach(event.params.id);
    if (!row) return fail(404, { error: '후보를 찾을 수 없습니다' });
    const ok = await updateOutreachFields(event.params.id, { dm_draft: dmDraft(row) }, gate.ctx.user.email ?? null);
    redirect(303, `${adminPath(`/outreach/${event.params.id}`)}?msg=${ok ? 'draft' : 'err'}`);
  },
  remove: async (event) => {
    const gate = await requireAdmin(event);
    if (!gate.ok) redirect(303, gate.location);
    await deleteOutreach(event.params.id);
    redirect(303, adminPath('/outreach'));
  }
};
