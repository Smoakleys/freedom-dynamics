// Big-number formatting, idle-game style.

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc'];

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return n < 100 && n !== Math.floor(n) ? n.toFixed(2) : Math.floor(n).toString();
  let tier = Math.floor(Math.log10(n) / 3);
  tier = Math.min(tier, SUFFIXES.length - 1);
  const scaled = n / Math.pow(10, tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return scaled.toFixed(digits) + SUFFIXES[tier];
}

export function fmtMoney(n: number): string {
  return '$' + fmt(n);
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.ceil(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.ceil(sec % 60)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h < 48) return `${h}h ${m}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
