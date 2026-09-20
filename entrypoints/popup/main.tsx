import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { rpc } from '../../lib/ui';
import { AiSection, RulesSection, SettingsFeedback, SettingsLoading, SitesSection, useSettings } from '../../lib/settings-ui';
import { enabledFor } from '../../lib/policy';
import { httpUrl } from '../../lib/privacy';
import { domainMatches } from '../../lib/cosmetics';
import '../../assets/style.css';

type Tab = 'protection' | 'ai' | 'rules' | 'sites';

function Popup() {
  const api = useSettings();
  const [tab, setTab] = useState<Tab>('protection');
  const [site, setSite] = useState('');
  const [tabId, setTabId] = useState<number>();
  const [siteError, setSiteError] = useState('');
  const [siteBusy, setSiteBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  useEffect(() => { void (async () => {
    const [current] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!current?.incognito) { setSite(httpUrl(current?.url)?.hostname ?? ''); setTabId(current?.id); }
  })().catch(() => setSiteError('Status unavailable. Please reopen the extension.')); }, []);
  const state = api.state;
  const enabled = Boolean(state && site && enabledFor(site, state));
  const exclusion = state?.settings.disabledSites.find(domain => domainMatches(site, domain));
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'protection', label: 'Protection' },
    { id: 'ai', label: 'AI learning' },
    { id: 'rules', label: 'Rules', badge: state?.rules.length },
    { id: 'sites', label: 'Sites', badge: state?.settings.disabledSites.length },
  ];
  return <main className="popup">
    <div className="brand"><span className="mark" aria-hidden="true">A</span>AI Adblocker</div>
    <div className="tabs" role="tablist" aria-label="Sections">
      {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}{t.badge ? <span className="tab-count">{t.badge}</span> : null}</button>)}
    </div>
    <SettingsFeedback api={api} />
    {tab === 'protection' && <div role="tabpanel">
      <div className={`shield ${enabled ? 'is-active' : ''}`} aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M24 5 9 11v12c0 9 6 15 15 20 9-5 15-11 15-20V11L24 5Z" stroke="currentColor" strokeWidth="2.5" />{enabled ? <path d="m16 24 6 6 11-12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M20 19v12m8-12v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}</svg></div>
      <h1>{!state ? siteError ? 'Status unavailable' : 'Checking protection …' : !site ? 'Not available here' : enabled ? 'Protection on' : 'Protection paused'}</h1>
      <p className="site">{site || 'Open a website in a regular browser window.'}</p>
      {site && state && <><button disabled={siteBusy || api.busy} className={`site-action ${enabled ? 'secondary' : ''}`} onClick={() => {
        setSiteBusy(true); setSiteError('');
        void rpc('site', { site: exclusion ?? site, enabled: !enabled }).then(() => api.load()).then(() => setNeedsReload(true)).catch(() => setSiteError('Change failed. Please try again.')).finally(() => setSiteBusy(false));
      }}>{siteBusy ? 'Changing …' : enabled ? 'Pause for this website' : 'Enable protection'}</button>
      {exclusion && exclusion !== site && <p className="hint">The exception applies to {exclusion} and all subdomains.</p>}
      {needsReload && <div className="reload-note"><p role="status">Reload the page to apply the change.</p><button className="text-button" disabled={siteBusy} onClick={() => {
        if (tabId === undefined) return;
        setSiteBusy(true);
        void browser.tabs.reload(tabId).then(() => window.close()).catch(() => setSiteError('Please reload the website in the browser.')).finally(() => setSiteBusy(false));
      }}>Reload page →</button></div>}
      <div className="popup-status"><span><span className={`status-dot ${enabled ? '' : 'paused'}`} aria-hidden="true" />{enabled ? 'Filter lists protect this website' : 'Protection is off for this website'}</span><span>AI learning {state.settings.aiEnabled ? 'on' : 'off'} · {state.rules.filter(r => domainMatches(site, r.site)).length} learned rules</span></div></>}
      {siteError && <p className="notice error" role="alert">{siteError}</p>}
    </div>}
    {tab === 'ai' && <div role="tabpanel">{api.state && api.settings ? <AiSection api={api} /> : <SettingsLoading error={api.error} />}</div>}
    {tab === 'rules' && <div role="tabpanel">{api.state ? <RulesSection api={api} /> : <SettingsLoading error={api.error} />}</div>}
    {tab === 'sites' && <div role="tabpanel">{api.state ? <SitesSection api={api} /> : <SettingsLoading error={api.error} />}</div>}
    <footer><span>AI Adblocker · No telemetry</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Popup />);
