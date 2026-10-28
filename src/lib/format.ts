/** JJJJ-MM-TT → TT.MM.JJ wie in GAPTEQ; leer bleibt leer */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

/** JJJJ-MM-TT → TT.MM.JJJJ */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
