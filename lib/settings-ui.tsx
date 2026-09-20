import React, { useEffect, useState } from 'react';
import { rpc, type PublicState } from './ui';
import type { Settings } from './types';

export function useSettings() {
  const [state, setState] = useState<PublicState>();
  const [settings, setSettings] = useState<Settings>();
  const [key, setKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = Boolean(key.trim() || (settings && state && (settings.model !== state.settings.model || settings.aiEnabled !== state.settings.aiEnabled || settings.dailyLimit !== state.settings.dailyLimit)));

  async function load(syncSettings = false) {
    const value = await rpc<PublicState>('state');
    setState(value);
    if (syncSettings) setSettings(value.settings);
  }
  useEffect(() => { void load(true).catch(() => setError('Settings could not be loaded. Please reopen this page.')); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function action(task: () => Promise<unknown>, success: string, syncSettings = false) {
    setBusy(true); setNotice(''); setError('');
    try { await task(); await load(syncSettings); setNotice(success); }
    catch (e) { setError(e instanceof Error ? e.message : 'That did not work. Please try again.'); }
    finally { setBusy(false); }
  }
  return { state, settings, setSettings, key, setKey, notice, error, setError, busy, filter, setFilter, confirmReset, setConfirmReset, dirty, load, action };
}

export type SettingsApi = ReturnType<typeof useSettings>;

export function SettingsLoading({ error }: { error: string }) {
  return <p role={error ? 'alert' : 'status'}>{error || 'Loading settings …'}</p>;
}

export function SettingsFeedback({ api }: { api: SettingsApi }) {
  return <div className="feedback" aria-live="polite">{api.notice && <p className="notice" role="status">{api.notice}</p>}{api.error && <p className="notice error" role="alert">{api.error}</p>}</div>;
}

export function AiSection({ api }: { api: SettingsApi }) {
  const { state, settings } = api;
  if (!state || !settings) return <SettingsLoading error={api.error} />;
  return <section aria-labelledby="ai-title">
    <div className="section-heading"><div><h2 id="ai-title">AI learning</h2><p>Finds additional ad sources and remembers them locally.</p></div><span className={`pill ${state.settings.aiEnabled ? 'active' : ''}`}>{state.settings.aiEnabled ? 'On' : 'Optional'}</span></div>
    <form onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }} onSubmit={e => { e.preventDefault(); void api.action(async () => {
      if (api.key.trim()) { await rpc('key', { key: api.key }); api.setKey(''); }
      await rpc('settings', { settings });
    }, 'Settings saved.', true); }}>
      <fieldset disabled={api.busy}>
        <label>TypeSafe API key<input name="apiKey" type="password" autoComplete="off" spellCheck={false} value={api.key} placeholder={state.hasKey ? 'Saved · new key optional' : 'Enter API key'} onChange={e => { api.setKey(e.target.value); if (!state.hasKey && !e.target.value.trim()) api.setSettings({ ...settings, aiEnabled: false }); }} aria-describedby="key-help" /></label>
        <p id="key-help" className="hint">The key is stored only in this browser. TypeSafe may charge for AI analysis.</p>
        <div className="privacy"><p>When AI learning is enabled, TypeSafe receives visited domains, cleaned resource URLs, and technical details about possible ad elements. No cookies or form input.</p><details><summary>Privacy details</summary><p>Also sent are short ad labels and popup/overlay traits. No full pages, chats, images, or videos. URL parameters are removed; domains and parts of the path remain visible.</p><p>Your API key is never synced or shared with websites. Saved rules keep working without AI.</p></details></div>
        <label className="check"><input name="aiEnabled" type="checkbox" checked={settings.aiEnabled} disabled={!state.hasKey && !api.key.trim()} onChange={e => api.setSettings({ ...settings, aiEnabled: e.target.checked })} /><span>Enable AI learning<small>{state.hasKey || api.key.trim() ? 'Send the data above to TypeSafe.' : 'Enter your API key first.'}</small></span></label>
        <details className="advanced"><summary>Advanced settings</summary><div className="columns"><label>Daily limit for AI calls<input name="dailyLimit" type="number" min="1" max="10000" step="1" required value={settings.dailyLimit || ''} onChange={e => api.setSettings({ ...settings, dailyLimit: Number(e.target.value) })} /></label><label>TypeSafe model<input name="model" value={settings.model} onChange={e => api.setSettings({ ...settings, model: e.target.value })} required pattern="jev-[\w.\-]{1,60}" /></label></div><p className="hint">{state.budget.calls} of {state.settings.dailyLimit} automatic calls today. The daily limit resets at 00:00 UTC.</p>{state.status && <p className="hint" role="status">{state.status}</p>}<div className="actions"><button type="button" className="secondary" disabled={!state.hasKey || api.dirty} onClick={() => void api.action(() => rpc('test'), 'Connection successful.')}>Test connection</button><button type="button" className="text-button danger" disabled={!state.hasKey} onClick={() => void api.action(async () => { await rpc('key', { key: '' }); api.setKey(''); api.setSettings({ ...settings, aiEnabled: false }); }, 'API key deleted. AI learning is off.')}>Delete API key</button></div><p className="hint">The connection test uses your saved settings and one extra API call outside the daily limit.</p></details>
        <div className="save-row"><button type="submit" disabled={!api.dirty}>{api.busy ? 'Saving …' : 'Save changes'}</button><span className="hint">{api.dirty ? 'Unsaved changes' : 'All saved'}</span></div>
      </fieldset>
    </form>
  </section>;
}

export function RulesSection({ api }: { api: SettingsApi }) {
  const { state } = api;
  if (!state) return <SettingsLoading error={api.error} />;
  const rules = state.rules.filter(r => `${r.site} ${r.url}`.toLowerCase().includes(api.filter.toLowerCase()));
  return <section aria-labelledby="rules-title"><div className="section-heading"><div><h2 id="rules-title">Learned rules <span className="count">{state.rules.length}</span></h2><p>Release a source if something is missing on a website.</p></div></div>
    {state.rules.length > 0 && <label>Search rules<input type="search" value={api.filter} onChange={e => api.setFilter(e.target.value)} placeholder="Search website or source" /></label>}
    {!rules.length ? <div className="empty"><strong>{state.rules.length ? 'No matches' : 'Nothing here yet'}</strong><p>{state.rules.length ? 'Try a different search.' : 'New rules appear while you browse with AI learning. Filter lists already protect you.'}</p></div> : <ul className="rules">{rules.map(rule => <li key={rule.id}><div><strong>{rule.site}</strong><code>{rule.url}</code><details className="rule-details"><summary>Rule details</summary><small>{rule.type} · {Math.round(rule.ad * 100)} % ad · {rule.model}</small>{rule.selector && <code>{rule.selector}</code>}</details></div><button className="secondary" disabled={api.busy} aria-label={`Release source on ${rule.site}: ${rule.url}`} onClick={() => void api.action(() => rpc('allow', { id: rule.id }), 'Source released. Please reload the website.')}>Release</button></li>)}</ul>}
    <details className="advanced"><summary>Manage rules</summary><p className="hint">Rules apply per website and its subdomains. Releases apply only to AI rules, not filter lists.</p><div className="actions"><button className="secondary" disabled={api.busy} onClick={() => void api.action(() => Promise.resolve(), 'View refreshed.')}>Refresh</button><button className="text-button danger" disabled={api.busy || !state.rules.length} onClick={() => api.setConfirmReset(true)}>Delete all learned rules</button></div>
      {api.confirmReset && <div className="privacy"><p>Delete all learned rules? Releases are kept.</p><div className="actions"><button disabled={api.busy} onClick={() => void api.action(async () => { await rpc('reset'); api.setConfirmReset(false); }, 'Learned rules deleted.')}>Confirm delete</button><button className="secondary" disabled={api.busy} onClick={() => api.setConfirmReset(false)}>Cancel</button></div></div>}
      <p className="hint">{state.allows.length} released sources.</p><button className="text-button" disabled={api.busy || !state.allows.length} onClick={() => void api.action(() => rpc('clearAllows'), 'Releases removed. These sources can be learned again.')}>Undo releases</button>
    </details>
  </section>;
}

export function SitesSection({ api }: { api: SettingsApi }) {
  const { state } = api;
  if (!state) return <SettingsLoading error={api.error} />;
  return <section aria-labelledby="sites-title"><div className="section-heading"><div><h2 id="sites-title">Website exceptions</h2><p>Protection and AI analysis pause on these websites.</p></div></div>
    {state.settings.disabledSites.length ? <ul className="rules">{state.settings.disabledSites.map(site => <li key={site}><strong>{site}</strong><button className="secondary" disabled={api.busy} aria-label={`Enable protection for ${site}`} onClick={() => void api.action(() => rpc('site', { site, enabled: true }), 'Protection enabled. Please reload the website.')}>Enable protection</button></li>)}</ul> : <p className="hint">No exceptions. You can pause protection per website from the toolbar icon.</p>}
  </section>;
}
