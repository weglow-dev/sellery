// 세금계산서(0104) — packages/myr-core/src/tax-invoice.ts
import { describe, expect, it } from 'vitest';
import { sellerSettlementsFromJson } from '../seller-settlement';
import { approvalNoText, normalizeApprovalNo, parseTaxInvoiceBody, TAX_INVOICE_GUIDE, TAX_INVOICE_TONE, taxInvoiceFromJson, taxInvoiceMessage } from '../tax-invoice';

const server = {
	needed: true, show: true, total: 20000, supply: 18182, tax: 1818, write_date: '2034-01-31', due_date: '2034-02-10', overdue: false, todo: false,
	status: 'returned', status_label: '다시 제출 필요', accepted: false, approval_no: '203402034100000011111111', return_note: '작성일자 확인', submitted_at: '2034-02-03T01:00:00+00:00',
	checked_at: null, amount_changed: false, can_submit: true
};

describe('파서', () => {
	it('서버 값을 그대로 옮긴다(금액 · 날짜 · 판정을 다시 만들지 않는다)', () => {
		expect(taxInvoiceFromJson(server)).toEqual({
			needed: true, show: true, total: 20000, supply: 18182, tax: 1818, writeDate: '2034-01-31', dueDate: '2034-02-10', overdue: false, todo: false,
			status: 'returned', statusLabel: '다시 제출 필요', accepted: false, approvalNo: '203402034100000011111111', returnNote: '작성일자 확인', submittedAt: '2034-02-03T01:00:00+00:00',
			checkedAt: null, amountChanged: false, canSubmit: true
		});
	});
	it('없거나 모르는 값 — null · 제출 전 · 꺼짐', () => {
		expect(taxInvoiceFromJson(null)).toBeNull();
		const t = taxInvoiceFromJson({ status: 'weird' })!;
		expect([t.status, t.statusLabel, t.canSubmit, t.show, t.total, t.approvalNo, t.accepted]).toEqual(['none', '제출 전', false, false, 0, null, false]);
	});
	it('정산 탭 달마다 invoice(지급 건이 없으면 null)', () => {
		const st = sellerSettlementsFromJson({ months: [{ month: '2034-01', invoice: server, rows: [], total: {} }, { month: '2033-12', invoice: null, rows: [], total: {} }] });
		expect([st.months[0].invoice?.supply, st.months[1].invoice]).toEqual([18182, null]);
	});
});

describe('승인번호 형식(서버 myr_tax_invoice_no 와 같은 규칙)', () => {
	it('하이픈 · 공백을 빼고 소문자 · 앞 8자리 숫자 + 16자리', () => {
		expect(normalizeApprovalNo('20340201-41000000-A1b2C3d4')).toBe('2034020141000000a1b2c3d4');
		expect(normalizeApprovalNo(' 20340201 41000000 12345678 ')).toBe('203402014100000012345678');
		expect(normalizeApprovalNo('20340201-41000000-1234-5678')).toBe('203402014100000012345678');
	});
	it('자릿수 · 앞 8자리 숫자가 아니면 null', () => {
		expect(normalizeApprovalNo('20340201-41000000-1234567')).toBeNull();
		expect(normalizeApprovalNo('2034020a-41000000-12345678')).toBeNull();
		expect(normalizeApprovalNo('')).toBeNull();
	});
	it('보여 줄 때는 8-8-8', () => {
		expect(approvalNoText('2034020141000000a1b2c3d4')).toBe('20340201-41000000-a1b2c3d4');
		expect(approvalNoText('짧음')).toBe('짧음');
	});
});

describe('요청 본문 · 문구', () => {
	it('month YYYY-MM → YYYY-MM-01 · 승인번호는 문자열', () => {
		expect(parseTaxInvoiceBody({ month: '2034-01', approvalNo: '2034…' })).toEqual({ month: '2034-01-01', approvalNo: '2034…' });
		expect(parseTaxInvoiceBody({ month: '2034-13', approvalNo: 'x' })).toBeNull();
		expect(parseTaxInvoiceBody({ month: '2034-01', approvalNo: 1 })).toBeNull();
		expect(parseTaxInvoiceBody({ month: '2034-01', approvalNo: 'x'.repeat(65) })).toBeNull();
		expect(parseTaxInvoiceBody(null)).toBeNull();
	});
	it('거절 코드마다 문구 · 모르는 코드는 기본 문구', () => {
		for (const c of ['BAD_NO', 'DUPLICATE_NO', 'NOT_NEEDED', 'ALREADY_ACCEPTED', 'ALREADY_PAID', 'NOT_FOUND', 'BAD_REQUEST']) expect(taxInvoiceMessage(c)).not.toBe(taxInvoiceMessage('DB_ERROR'));
		expect(taxInvoiceMessage('DB_ERROR')).toContain('저장하지 못했어요');
	});
	it('상태마다 칩 색 · 안내(제출 전 · 다시 제출 필요는 입력 칸이 대신)', () => {
		expect(TAX_INVOICE_TONE).toEqual({ none: 'warn', submitted: 'plan', accepted: 'done', returned: 'hold' });
		expect([TAX_INVOICE_GUIDE.none, TAX_INVOICE_GUIDE.returned]).toEqual(['', '']);
		expect(TAX_INVOICE_GUIDE.submitted).toContain('확인하고 있어요');
	});
});
