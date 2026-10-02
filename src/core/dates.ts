import type { DateRange } from './types';

const RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRange({ from, to }: DateRange): void {
  for (const d of [from, to]) {
    if (!RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
      throw new Error(`Format tanggal tidak valid: "${d}". Gunakan YYYY-MM-DD.`);
    }
  }
  if (from > to) throw new Error('Tanggal mulai tidak boleh setelah tanggal akhir.');
}

/** Batas query dalam WIB (UTC+7). */
export function wibBounds({ from, to }: DateRange) {
  return { since: `${from}T00:00:00+07:00`, until: `${to}T23:59:59+07:00` };
}

/** Ubah timestamp ISO menjadi kunci tanggal YYYY-MM-DD dalam WIB. */
export function wibDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(iso));
}

export function formatLongDate(dateKey: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`));
}

export function formatPeriod({ from, to }: DateRange): string {
  return from === to ? formatLongDate(from) : `${formatLongDate(from)} – ${formatLongDate(to)}`;
}

/** Format form lembur: 01 Agustus 2026 */
export function formatFormDate(dateKey: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${dateKey}T00:00:00Z`));
}
