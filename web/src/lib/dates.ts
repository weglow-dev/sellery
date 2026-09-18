/**
 * 날짜 유틸 — 전부 Asia/Seoul 고정 (ux-spec §1.6 · app-plan §10.0). 소유: C.
 *
 * 입력은 'YYYY-MM-DD'(date 컬럼) 또는 ISO 타임스탬프. 타임스탬프는 KST 달력일로 먼저 접는다.
 * 달력일 연산은 UTC 자정 기준 epoch 로 하므로 DST·로컬 시간대의 영향을 받지 않는다.
 */

const KST = "Asia/Seoul";
const DAY_MS = 86_400_000;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Date → KST 달력일 'YYYY-MM-DD' (en-CA 로케일이 ISO 순서를 준다) */
function kstYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * 'YYYY-MM-DD' | ISO → 'YYYY-MM-DD' (KST). 앞이 날짜 형식이고 시각이 없으면 그대로,
 * 시각이 있으면(타임스탬프) KST 로 접는다. 형식이 어긋나면 null.
 */
export function toKstYmd(iso: string): string | null {
  if (typeof iso !== "string") return null;
  const m = YMD_RE.exec(iso);
  if (!m) return null;
  if (iso.length === 10) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return m[0];
  return kstYmd(new Date(t));
}

/** 'YYYY-MM-DD' → UTC 자정 epoch (달력일 산술용). 형식이 어긋나면 NaN. */
function ymdEpoch(ymd: string | null): number {
  if (!ymd) return NaN;
  const m = YMD_RE.exec(ymd);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 오늘 (KST) → 'YYYY-MM-DD' */
export function kstToday(): string {
  return kstYmd(new Date());
}

/** 'YYYY-MM-DD' | ISO → 'M/D' (예: '9/15', 0 채움 없음). 기간은 호출자가 en dash '–' 로 잇는다. 형식이 어긋나면 '—'. */
export function md(iso: string): string {
  const ymd = toKstYmd(iso);
  const m = ymd ? YMD_RE.exec(ymd) : null;
  if (!m) return "—";
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** 'YYYY-MM-DD' + n일 → 'YYYY-MM-DD' (KST 달력일 기준) */
export function addDays(iso: string, n: number): string {
  const base = ymdEpoch(toKstYmd(iso));
  if (Number.isNaN(base)) return iso;
  return new Date(base + Math.trunc(n) * DAY_MS).toISOString().slice(0, 10);
}

/** b − a 를 달력일 수로 (KST). a='2026-09-15', b='2026-09-17' → 2. 형식이 어긋나면 NaN. */
export function daysBetween(a: string, b: string): number {
  const ta = ymdEpoch(toKstYmd(a));
  const tb = ymdEpoch(toKstYmd(b));
  if (Number.isNaN(ta) || Number.isNaN(tb)) return NaN;
  return Math.round((tb - ta) / DAY_MS);
}
