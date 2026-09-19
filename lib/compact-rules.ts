// Group equivalent hostname-only rules without changing paths, exceptions,
// priorities, resource types or first/third-party restrictions.
export function compactRules<T extends { id: number; action: unknown; priority?: number; condition: Record<string, any> }>(rules: T[]): T[] {
  const output: T[] = [];
  const groups = new Map<string, { sample: T; domains: Set<string> }>();
  for (const rule of rules) {
    const match = /^\|\|([a-z0-9.-]+)\^$/.exec(rule.condition.urlFilter ?? '');
    if (!match || rule.condition.requestDomains || rule.condition.isUrlFilterCaseSensitive) { output.push(rule); continue; }
    const { urlFilter: _, ...condition } = rule.condition;
    const key = JSON.stringify({ action: rule.action, priority: rule.priority, condition });
    const group = groups.get(key) ?? { sample: { ...rule, condition }, domains: new Set<string>() };
    group.domains.add(match[1]!); groups.set(key, group);
  }
  for (const { sample, domains } of groups.values()) {
    const values = [...domains].sort();
    for (let offset = 0; offset < values.length; offset += 500) output.push({ ...sample, condition: { ...sample.condition, requestDomains: values.slice(offset, offset + 500) } });
  }
  return output;
}
