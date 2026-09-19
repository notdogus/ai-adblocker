import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { rpc, type PublicState } from '../../lib/ui';
import { enabledFor } from '../../lib/policy';
import { httpUrl } from '../../lib/privacy';
import { domainMatches } from '../../lib/cosmetics';
import '../../assets/style.css';

function Popup() {
  const [state, setState] = useState<PublicState>();
  const [site, setSite] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void (async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.incognito) setSite(httpUrl(tab?.url)?.hostname ?? '');
    setState(await rpc<PublicState>('state'));
  })().catch(() => setError('Status nicht verfügbar.')); }, []);
  const enabled = state && site && enabledFor(site, state);
  const exclusion = state?.settings.disabledSites.find(domain => domainMatches(site, domain));
  return <main className="popup"><div className="brand"><span className="mark">A</span>AI ADBLOCKER</div><h1>{enabled ? 'Schutz aktiv.' : 'Dein Werbeschutz.'}</h1><p className="site">{site || 'Für diese Seite nicht verfügbar'}</p>
    <button disabled={!state || !site || busy} className={enabled ? 'secondary' : ''} onClick={() => { setBusy(true); void rpc('site', { site: exclusion ?? site, enabled: !enabled }).then(async () => { setState(await rpc<PublicState>('state')); setError('Seite neu laden, um die Änderung vollständig anzuwenden.'); }).catch(() => setError('Änderung fehlgeschlagen.')).finally(() => setBusy(false)); }}>{enabled ? 'Für diese Website ausschalten' : exclusion && exclusion !== site ? `Für ${exclusion} einschalten` : 'Für diese Website einschalten'}</button>
    <div className="popup-status"><strong>{state?.rules.filter(r => site === r.site || site.endsWith(`.${r.site}`)).length ?? 0} gelernte Regeln</strong><span>KI-Lernen {state?.settings.aiEnabled ? 'aktiv' : 'aus'} · {state?.budget.calls ?? 0} Aufrufe heute</span></div>
    <p className="hint" role="status">{error || state?.status || 'Filterlisten arbeiten auch ohne KI.'}</p><button className="text-button" onClick={() => void browser.runtime.openOptionsPage()}>Einstellungen & Regeln →</button></main>;
}
createRoot(document.getElementById('root')!).render(<Popup />);
