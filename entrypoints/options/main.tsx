import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { rpc, type PublicState } from '../../lib/ui';
import type { Settings } from '../../lib/types';
import '../../assets/style.css';

function App() {
  const [state, setState] = useState<PublicState>();
  const [settings, setSettings] = useState<Settings>();
  const [key, setKey] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  async function load() { const value = await rpc<PublicState>('state'); setState(value); setSettings(value.settings); }
  useEffect(() => { void load().catch(error => setNotice(error instanceof Error ? error.message : 'Einstellungen konnten nicht geladen werden.')); }, []);
  async function action(task: () => Promise<unknown>, success: string) {
    setBusy(true); setNotice('');
    try { await task(); await load(); setNotice(success); } catch (e) { setNotice(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  if (!state || !settings) return <main><h1>AI Adblocker</h1><p role="status">{notice || 'Einstellungen werden geladen …'}</p></main>;
  const rules = state.rules.filter(r => `${r.site} ${r.url}`.toLowerCase().includes(filter.toLowerCase()));
  return <main>
    <header><div className="brand"><span className="mark">A</span>AI ADBLOCKER <span className="pill">v0.1</span></div><h1>Weniger Werbung.<br /><span>Mehr von deiner Seite.</span></h1><p className="lead">Bekannte Werbung sofort blockieren. Neue Werbequellen mit Jev erkennen und lokal merken.</p></header>
    <div className="stats"><div><strong>{state.rules.length}</strong><span>Gelernte Regeln</span></div><div><strong>{state.budget.calls} / {settings.dailyLimit}</strong><span>KI-Aufrufe heute · UTC</span></div><div><strong>{settings.aiEnabled ? 'Aktiv' : 'Aus'}</strong><span>KI-Lernen · Filterlisten immer bereit</span></div></div>
    <p className="notice" role="status" aria-live="polite">{notice || state.status || 'EasyList und EasyList Germany schützen auch ohne API-Key.'}</p>
    <section><div className="section-title"><span>01</span><h2>Dein Entscheidungsmodell</h2></div>
      <form onSubmit={e => { e.preventDefault(); void action(() => rpc('settings', { settings }), 'Einstellungen gespeichert.'); }}>
        <div className="columns"><label>Provider<select value="typesafe" disabled><option value="typesafe">TypeSafe</option></select></label><label>Modell<input name="model" value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })} required pattern="jev-[\w.\-]+" /></label></div>
        <label>API-Key<input name="apiKey" type="password" autoComplete="off" spellCheck={false} value={key} placeholder={state.hasKey ? 'Key gespeichert · neuen Key zum Ersetzen eingeben' : 'Deinen TypeSafe API-Key eingeben'} onChange={e => setKey(e.target.value)} /></label>
        <div className="actions"><button type="button" disabled={busy || !key.trim()} onClick={() => void action(async () => { await rpc('key', { key }); setKey(''); }, 'API-Key lokal gespeichert.')}>Key speichern</button><button type="button" className="secondary" disabled={busy || !state.hasKey} onClick={() => void action(() => rpc('test'), 'Verbindung erfolgreich. Ein synthetischer API-Test wurde ausgeführt.')}>Verbindung testen</button><button type="button" className="text-button" disabled={busy || !state.hasKey} onClick={() => void action(() => rpc('key', { key: '' }), 'API-Key gelöscht. KI-Lernen deaktiviert.')}>Key löschen</button></div>
        <p className="hint">Der Key bleibt lokal in diesem Browserprofil. Er wird nicht synchronisiert und nie an Webseiten weitergegeben. Verbindungstests zählen zusätzlich zum automatischen Tagesbudget.</p>
        <div className="privacy"><h3>Was die KI erhält</h3><p>Bereinigte Ressourcen-URLs, Elementmerkmale und kurze Werbehinweise direkt am Kandidaten. Keine Cookies, Formulareingaben, Chatverläufe oder vollständigen Seiten. Die besuchten Domains werden dabei an TypeSafe übermittelt.</p><p>Unbekannte Werbung kann beim ersten Besuch laden. Gelernte Quellen werden bei späteren Besuchen vor dem Laden blockiert.</p></div>
        <label className="check"><input name="aiEnabled" type="checkbox" checked={settings.aiEnabled} onChange={e => setSettings({ ...settings, aiEnabled: e.target.checked })} /><span>KI-Lernen aktivieren und diesen Kontext an TypeSafe senden</span></label>
        <label className="limit">Maximale automatische API-Aufrufe pro Tag<input name="dailyLimit" type="number" min="1" max="10000" value={settings.dailyLimit} onChange={e => setSettings({ ...settings, dailyLimit: Number(e.target.value) })} /></label>
        <button type="submit" disabled={busy}>Einstellungen speichern</button>
      </form>
    </section>
    <section><div className="section-title"><span>02</span><h2>Gelernte Werbequellen</h2></div><p>Regeln gelten für die jeweilige Website und ihre Subdomains. Freigaben verhindern erneutes KI-Blockieren; Filterlisten werden dadurch nicht überschrieben.</p>
      <label>Regeln durchsuchen<input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Website oder Ressource" /></label>
      {!rules.length ? <div className="empty">{state.rules.length ? 'Keine passenden Regeln.' : 'Noch nichts gelernt. Nach dem Aktivieren erkennt Jev neue Werbequellen beim Surfen.'}</div> : <ul className="rules">{rules.map(rule => <li key={rule.id}><div><strong>{rule.site}</strong><code>{rule.url}</code><small>{rule.type} · Werbung {Math.round(rule.ad * 100)} % · {rule.model} · {rule.origin === 'dom' ? 'Element + URL' : 'Netzwerk-Metadaten'}</small></div><button className="secondary" disabled={busy} onClick={() => void action(() => rpc('allow', { id: rule.id }), 'Quelle freigegeben. Seite neu laden, um zuvor blockierte Inhalte abzurufen.')}>Freigeben</button></li>)}</ul>}
      <div className="actions"><button className="secondary" disabled={busy} onClick={() => void action(load, 'Ansicht aktualisiert.')}>Aktualisieren</button><button className="text-button" disabled={busy || !state.rules.length} onClick={() => setConfirmReset(true)}>Gelernte Regeln zurücksetzen</button></div>
      {confirmReset && <div className="privacy"><p>Alle gelernten Regeln löschen? Manuelle Freigaben bleiben erhalten.</p><div className="actions"><button disabled={busy} onClick={() => void action(async () => { await rpc('reset'); setConfirmReset(false); }, 'Gelernte Regeln gelöscht.')}>Regeln löschen</button><button className="secondary" onClick={() => setConfirmReset(false)}>Abbrechen</button></div></div>}
      <p className="hint">{state.allows.length} dauerhaft freigegebene Quellen. <button className="text-button" disabled={busy || !state.allows.length} onClick={() => void action(() => rpc('clearAllows'), 'Freigaben entfernt; diese Quellen können wieder gelernt werden.')}>Freigaben entfernen</button></p>
    </section>
    <section><div className="section-title"><span>03</span><h2>Ausgeschlossene Websites</h2></div><p>Hier sind Filter und KI-Analyse ausgeschaltet. Änderungen benötigen einen Seiten-Neustart, damit blockierte Ressourcen wieder geladen werden.</p>
      {state.settings.disabledSites.length ? <ul className="rules">{state.settings.disabledSites.map(site => <li key={site}><strong>{site}</strong><button className="secondary" disabled={busy} onClick={() => void action(() => rpc('site', { site, enabled: true }), 'Schutz wieder aktiviert. Seite neu laden.')}>Schutz aktivieren</button></li>)}</ul> : <p className="hint">Keine Ausnahmen. Websites lassen sich über das Toolbar-Popup ausschließen.</p>}
    </section><footer>AI Adblocker · GPL-3.0 · Lokal gelernt, lokal gespeichert.<br />Keine Telemetrie. Kein Schutz in privaten Fenstern. Kein Entfernen von Werbung aus dem eigentlichen Videostream.</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
