export function nextSocietyCode(codes: string[]) {
  const max = codes.reduce((m, c) => { const n = /^s(\d+)$/.exec(c); return n ? Math.max(m, Number(n[1])) : m; }, 0);
  return `s${max + 1}`;
}
