import { browser } from 'wxt/browser';
import { readState, updateState, getKey, setKey } from '../lib/storage';
import { CLASSIFIER_VERSION, RESOURCE_TYPES, fingerprint, type Candidate, type ResourceType, type Settings } from '../lib/types';
import { httpUrl, sanitizeCandidate, sanitizedUrl, playerEvidence } from '../lib/privacy';
import { validOverlaySelector } from '../lib/player-policy';
import { blocked, enabledFor, evidenceStrength, known, shouldLearn, topSite } from '../lib/policy';
import { compileRules, supportsExactRule } from '../lib/rules';
import { selectorsFor, type CosmeticRule } from '../lib/cosmetics';
import { TypeSafeProvider } from '../lib/provider';

export default defineBackground(() => {
  const firefox = import.meta.env.FIREFOX;
  const pending = new Map<string, Candidate>();
  const seen = new Map<string, number>();
  const blockedByBrowser = new Set<string>();
  const tabUrls = new Map<number, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let working = false;
  let epoch = 0;
  let cooldown = 0;
  let serialRules = Promise.resolve();
  let cosmetics: Promise<CosmeticRule[]> | undefined;
  const active = new Set<AbortController>();

  function stopLearning() {
    epoch++;
    pending.clear(); seen.clear(); blockedByBrowser.clear();
    for (const controller of active) controller.abort();
  }
  async function synchronize() {
    const operation = serialRules.then(async () => {
      const rules = compileRules(await readState(), firefox);
      const old = await browser.declarativeNetRequest.getDynamicRules();
      await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules: rules });
    });
    serialRules = operation.catch(() => {});
    return operation;
  }
  async function notifyTabs() {
    const tabs = await browser.tabs.query({});
    await Promise.allSettled(tabs.filter(t => t.id !== undefined).map(t => browser.tabs.sendMessage(t.id!, { type: 'refresh' })));
  }
  const ready = (async () => {
    if (!firefox && browser.storage.local.setAccessLevel) await browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    await readState();
    for (const tab of await browser.tabs.query({})) if (tab.id !== undefined && tab.url) tabUrls.set(tab.id, tab.url);
    await synchronize();
  })();
  ready.catch(() => { void updateState(s => { s.status = 'Regeln konnten nicht aktiviert werden. Extension neu laden.'; }); });

  async function enqueue(candidate: Candidate) {
    await ready;
    const state = await readState();
    if (!state.settings.aiEnabled || !enabledFor(candidate.site, state) || known(candidate, state) || (RESOURCE_TYPES.includes(candidate.type as ResourceType) && !supportsExactRule(candidate.url))) return;
    const key = fingerprint(candidate);
    // Geometry alone may be inconclusive. A later intercepted popup supplies
    // new evidence about the same shield; permit only increasing evidence stages.
    const strength = evidenceStrength(candidate);
    if ((seen.get(key) ?? -1) >= strength || blockedByBrowser.has(key) || Date.now() < cooldown) return;
    if (pending.size >= 100 && !pending.has(key)) {
      const disposable = [...pending.entries()].sort(([, a], [, b]) => evidenceStrength(a) - evidenceStrength(b))
        .find(([, c]) => evidenceStrength(c) < strength);
      if (!disposable) return;
      pending.delete(disposable[0]);
    }
    // DOM evidence enriches the same observed request before the next batch.
    const existing = pending.get(key);
    pending.set(key, existing && (candidate.origin === 'network' || evidenceStrength(existing) > strength) ? existing : candidate);
    if (!timer && !working) timer = setTimeout(() => { timer = undefined; void drain(); }, 1500);
  }
  async function drain() {
    if (working || !pending.size) return;
    working = true;
    const generation = epoch;
    const controller = new AbortController();
    active.add(controller);
    try {
      const state = await readState(); const key = await getKey();
      if (!key || !state.settings.aiEnabled || Date.now() < cooldown) { pending.clear(); return; }
      const batch = [...pending.values()].filter(c => enabledFor(c.site, state) && !known(c, state))
        .sort((a, b) => evidenceStrength(b) - evidenceStrength(a)).slice(0, 8);
      if (!batch.length) { pending.clear(); return; }
      for (const candidate of batch) { const id = fingerprint(candidate); pending.delete(id); seen.set(id, evidenceStrength(candidate)); }
      if (seen.size > 5000) seen.clear();
      let reserved = false;
      await updateState(s => {
        const day = new Date().toISOString().slice(0, 10);
        if (s.budget.day !== day) s.budget = { day, calls: 0 };
        if (s.budget.calls < s.settings.dailyLimit) { s.budget.calls++; reserved = true; }
        else s.status = 'Tageslimit erreicht. Gespeicherte Regeln bleiben aktiv.';
      });
      if (!reserved) { pending.clear(); return; }
      const decisions = await new TypeSafeProvider(key, state.settings.model).evaluate(batch.map(sanitizeCandidate), controller.signal);
      if (generation !== epoch) return;
      await updateState(s => {
        if (generation !== epoch || !s.settings.aiEnabled) return;
        s.status = 'Letzte Analyse erfolgreich.';
        for (const decision of decisions) {
          const candidate = batch.find(c => c.id === decision.id);
          if (!candidate || !shouldLearn(decision, candidate.type) || known(candidate, s) || !enabledFor(candidate.site, s)) continue;
          if (s.rules.length >= 2000) { s.status = 'Regellimit erreicht (2.000). Regeln verwalten, um weiterzulernen.'; break; }
          s.rules.push({ id: s.nextRuleId++, site: candidate.site, url: candidate.url, type: candidate.type, origin: candidate.origin,
            ...(candidate.selector ? { selector: candidate.selector } : {}),
            ad: decision.ad, essential: decision.essential, model: decision.model, classifierVersion: CLASSIFIER_VERSION, createdAt: new Date().toISOString() });
        }
      });
      await synchronize();
      await notifyTabs();
    } catch (error) {
      if (generation === epoch) {
        cooldown = Date.now() + 60_000;
        pending.clear();
        await updateState(s => { s.status = error instanceof Error && error.name === 'Error' ? error.message : 'Analyse fehlgeschlagen; vorhandener Schutz bleibt aktiv.'; });
      }
    } finally {
      active.delete(controller); working = false;
      if (pending.size && !timer) timer = setTimeout(() => { timer = undefined; void drain(); }, 1500);
    }
  }

  function candidateFor(details: any, site: string): Candidate | undefined {
    const url = httpUrl(details.url);
    if (!url || details.tabId < 0 || !RESOURCE_TYPES.includes(details.type) || url.hostname === 'api.typesafe.ai') return;
    url.hash = '';
    return { id: crypto.randomUUID(), site, url: url.href, type: details.type as ResourceType, origin: 'network' };
  }
  browser.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId === 0) tabUrls.set(details.tabId, details.url);
  });
  browser.tabs.onRemoved.addListener(id => tabUrls.delete(id));
  browser.webRequest.onErrorOccurred.addListener((details: any) => {
    if (!/BLOCKED_BY_CLIENT|NS_ERROR_(?:ABORT|BLOCKED_BY_POLICY)/.test(details.error ?? '')) return;
    const site = firefox ? topSite(details, tabUrls.get(details.tabId)) : httpUrl(tabUrls.get(details.tabId))?.hostname;
    const candidate = site ? candidateFor(details, site) : undefined;
    if (!candidate) return;
    const key = fingerprint(candidate);
    pending.delete(key); blockedByBrowser.add(key);
    if (blockedByBrowser.size > 5000) blockedByBrowser.clear();
  }, { urls: ['http://*/*', 'https://*/*'] });
  // Register listeners synchronously so Firefox can wake its event page.
  browser.webRequest.onBeforeRequest.addListener((details: any) => {
    const site = firefox ? topSite(details, tabUrls.get(details.tabId)) : httpUrl(tabUrls.get(details.tabId))?.hostname;
    const candidate = site ? candidateFor(details, site) : undefined;
    if (!candidate || details.incognito) return firefox ? {} : undefined;
    if (firefox) return ready.then(async () => {
      const state = await readState();
      if (blocked(candidate, state)) return { cancel: true };
      void enqueue(candidate);
      return {};
    }, () => ({}));
    void enqueue(candidate);
  }, { urls: ['http://*/*', 'https://*/*'] }, firefox ? ['blocking'] : []);

  function trusted(sender: any) {
    return sender.id === browser.runtime.id &&
      [browser.runtime.getURL('/options.html'), browser.runtime.getURL('/popup.html')].some(url => sender.url?.split(/[?#]/)[0] === url);
  }
  async function frameContext(sender: any) {
    if (!sender.tab || sender.tab.incognito) return { enabled: false, selectors: [], rules: [], aiEnabled: false };
    const site = httpUrl(tabUrls.get(sender.tab.id) ?? sender.tab.url)?.hostname;
    const frameHost = (await frameUrl(sender))?.hostname;
    const state = await readState();
    if (!site || !frameHost || !enabledFor(site, state)) return { enabled: false, selectors: [], rules: [], aiEnabled: false };
    cosmetics ??= fetch(browser.runtime.getURL('/rules/cosmetic.json')).then(r => r.json());
    return { enabled: true, aiEnabled: state.settings.aiEnabled, selectors: selectorsFor(await cosmetics, frameHost),
      rules: state.rules.filter(r => blocked({ ...r, id: String(r.id), site }, state)).map(r => ({ url: r.url, type: r.type, selector: r.selector })) };
  }
  async function frameUrl(sender: any): Promise<URL | undefined> {
    const direct = httpUrl(sender.url);
    if (direct) return direct;
    // Inherited-origin about:blank/srcdoc frames also host player code. Resolve
    // their ancestry through the browser, never from a page-provided site value.
    if (sender.tab?.id === undefined || !/^(about:|blob:|data:)/.test(sender.url ?? '')) return;
    const frames = await browser.webNavigation.getAllFrames({ tabId: sender.tab.id });
    let frame = frames?.find(f => f.frameId === sender.frameId);
    for (let depth = 0; frame && depth < 16; depth++) {
      const url = httpUrl(frame.url); if (url) return url;
      frame = frames?.find(f => f.frameId === frame!.parentFrameId);
    }
  }
  browser.runtime.onMessage.addListener((message: any, sender) => {
    return (async () => {
      await ready;
      if (sender.id !== browser.runtime.id || !message || typeof message.type !== 'string') throw new Error('Ungültige Nachricht.');
      if (message.type === 'context') return frameContext(sender);
      if (message.type === 'candidates') {
        if (!sender.tab || sender.tab.incognito || !Array.isArray(message.candidates)) return;
        const site = httpUrl(tabUrls.get(sender.tab.id!) ?? sender.tab.url)?.hostname;
        const frame = await frameUrl(sender);
        if (!site || !frame) return;
        for (const input of message.candidates.slice(0, 60)) {
          const url = httpUrl(input?.url);
          if (!url || ![...RESOURCE_TYPES, 'popup', 'overlay'].includes(input.type)) continue;
          const evidence = playerEvidence(input.evidence);
          if (input.type === 'popup' && evidence?.kind !== 'popup') continue;
          if (input.type === 'overlay' && (!validOverlaySelector(input.selector) || url.href !== `${frame.origin}/` || evidence?.kind !== 'overlay' || !evidence.overlaysPlayer)) continue;
          url.hash = '';
          const candidate: Candidate = { id: crypto.randomUUID(), site, url: url.href, type: input.type, origin: evidence ? 'behavior' : 'dom',
            ...(input.type === 'overlay' ? { selector: input.selector } : {}), ...(evidence ? { evidence } : {}) };
          for (const field of ['tag', 'label', 'marker'] as const) if (typeof input[field] === 'string') candidate[field] = input[field].slice(0, 180);
          await enqueue(candidate);
        }
        return;
      }
      if (!trusted(sender)) throw new Error('Nur Extension-Seiten dürfen Einstellungen ändern.');
      if (message.type === 'state') {
        const state = structuredClone(await readState());
        // Full resource queries are used only by the blocker, not displayed or exported.
        state.rules = state.rules.map(r => ({ ...r, url: sanitizedUrl(r.url) }));
        state.allows = state.allows.map(r => ({ ...r, url: sanitizedUrl(r.url) }));
        if (state.budget.day !== new Date().toISOString().slice(0, 10)) state.budget.calls = 0;
        return { ...state, hasKey: Boolean(await getKey()) };
      }
      if (message.type === 'settings') {
        const input = message.settings as Settings;
        if (!input || input.provider !== 'typesafe' || typeof input.model !== 'string' || !/^jev-[\w.-]{1,60}$/.test(input.model) || typeof input.aiEnabled !== 'boolean' || !Number.isInteger(input.dailyLimit) || input.dailyLimit < 1 || input.dailyLimit > 10000) throw new Error('Ungültige Einstellungen.');
        if (input.aiEnabled && !await getKey()) throw new Error('Zuerst einen API-Key speichern.');
        stopLearning();
        await updateState(s => { s.settings = { ...s.settings, provider: 'typesafe', model: input.model, aiEnabled: input.aiEnabled, dailyLimit: input.dailyLimit }; });
        await notifyTabs(); return;
      }
      if (message.type === 'key') {
        if (typeof message.key !== 'string' || message.key.length > 512 || /[\r\n]/.test(message.key)) throw new Error('Ungültiger Key.');
        stopLearning(); await setKey(message.key.trim());
        if (!message.key.trim()) await updateState(s => { s.settings.aiEnabled = false; });
        await notifyTabs(); return;
      }
      if (message.type === 'test') {
        const key = await getKey(); if (!key) throw new Error('Kein API-Key gespeichert.');
        // Synthetic data only; this explicitly initiated connection check is a paid API call.
        const state = await readState();
        await new TypeSafeProvider(key, state.settings.model).evaluate([{ id: 'connection', site: 'example.com', url: 'https://ads.example.com/banner.js', type: 'script', label: 'Advertising-only banner loader' }]);
        return 'Verbindung erfolgreich.';
      }
      if (message.type === 'site') {
        const site = httpUrl(`https://${message.site}/`)?.hostname;
        if (!site || site !== message.site || typeof message.enabled !== 'boolean') throw new Error('Ungültige Website.');
        stopLearning();
        await updateState(s => { s.settings.disabledSites = s.settings.disabledSites.filter(d => d !== site); if (!message.enabled) s.settings.disabledSites.push(site); });
        await synchronize(); await notifyTabs(); return;
      }
      if (message.type === 'allow') {
        stopLearning();
        await updateState(s => { const rule = s.rules.find(r => r.id === message.id); if (rule) { s.allows.push({ site: rule.site, url: rule.url, type: rule.type, ...(rule.selector ? { selector: rule.selector } : {}) }); s.rules = s.rules.filter(r => r.id !== rule.id); } });
        await synchronize(); await notifyTabs(); return;
      }
      if (message.type === 'reset') {
        stopLearning(); await updateState(s => { s.rules = []; s.status = 'Gelernte Regeln gelöscht. Freigaben bleiben erhalten.'; });
        await synchronize(); await notifyTabs(); return;
      }
      if (message.type === 'clearAllows') { stopLearning(); await updateState(s => { s.allows = []; }); await synchronize(); await notifyTabs(); return; }
      throw new Error('Unbekannte Nachricht.');
    })();
  });
});
