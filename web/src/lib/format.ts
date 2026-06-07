export function fmtPln(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' '); // non-breaking space
  return amount < 0 ? `−${formatted} PLN` : `${formatted} PLN`;
}

export function fmtCurrency(originalAmount: number, originalCurrency: string, amountPln: number): string {
  if (originalCurrency === 'PLN') return fmtPln(amountPln);
  const orig = originalAmount.toFixed(2);
  return `${orig} ${originalCurrency} (${fmtPln(amountPln)})`;
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}
