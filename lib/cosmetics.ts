export interface CosmeticRule { domains: string[]; selector: string; exception: boolean }
export function domainMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
export function parseCosmetic(line: string): CosmeticRule | undefined {
  const marker = line.includes('#@#') ? '#@#' : '##';
  const position = line.indexOf(marker);
  if (position < 0) return;
  const selector = line.slice(position + marker.length).trim();
  if (!selector || /[{};]|:(?:has-text|contains|matches-css|matches-path|xpath|upward|remove|style|others|if|if-not)\b|\[-(?:abp|ext)-|^\+js\(/.test(selector)) return;
  const domains = line.slice(0, position).split(',').filter(Boolean);
  if (domains.some(d => /[/*]/.test(d))) return;
  return { domains, selector, exception: marker === '#@#' };
}
export function cosmeticApplies(rule: CosmeticRule, host: string): boolean {
  const positive = rule.domains.filter(d => !d.startsWith('~'));
  return !rule.domains.some(d => d.startsWith('~') && domainMatches(host, d.slice(1))) &&
    (!positive.length || positive.some(d => domainMatches(host, d)));
}
export function selectorsFor(rules: CosmeticRule[], host: string): string[] {
  const matching = rules.filter(rule => cosmeticApplies(rule, host));
  const exceptions = new Set(matching.filter(r => r.exception).map(r => r.selector));
  return [...new Set(matching.filter(r => !r.exception && !exceptions.has(r.selector)).map(r => r.selector))];
}
