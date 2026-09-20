import React from 'react';
import { createRoot } from 'react-dom/client';
import { AiSection, RulesSection, SettingsFeedback, SettingsLoading, SitesSection, useSettings } from '../../lib/settings-ui';
import '../../assets/style.css';

function App() {
  const api = useSettings();
  if (!api.state || !api.settings) return <main><div className="brand"><span className="mark" aria-hidden="true">A</span>AI Adblocker</div><h1>Settings</h1><SettingsLoading error={api.error} /></main>;
  return <main>
    <header><div className="brand"><span className="mark" aria-hidden="true">A</span>AI Adblocker <span className="pill">Preview</span></div><h1>Less ads.<br /><span>More space for you.</span></h1><p className="lead">Your ad protection is running. Fine-tune the details here.</p></header>
    <div className="overview"><div className="protection-summary"><span className="status-dot" aria-hidden="true" /><div><strong>Filter lists active</strong><p>No account. No setup.</p></div></div><span className="muted">{api.state.settings.disabledSites.length ? `${api.state.settings.disabledSites.length} website exceptions` : 'No website exceptions'}</span></div>
    <AiSection api={api} />
    <SettingsFeedback api={api} />
    <RulesSection api={api} />
    <SitesSection api={api} />
    <footer><span>AI Adblocker · No telemetry</span><span>Not available in private windows.</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
