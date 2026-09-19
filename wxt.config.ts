import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  zip: {
    includeSources: ['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'assets/**', 'docs/**', 'entrypoints/**', 'filters/**', 'lib/**', 'package*.json', 'public/**', 'scripts/**', 'tsconfig.json', 'wxt.config.ts'],
    excludeSources: ['test-results/**', '.local/**', '.env*', '**/*.log'],
  },
  manifest: ({ browser }) => ({
    name: 'AI Adblocker',
    description: 'Block ads before they load. Learn new ad sources locally with TypeSafe Jev.',
    incognito: 'not_allowed',
    permissions: ['storage', 'webRequest', 'webNavigation', ...(browser === 'firefox' ? ['webRequestBlocking'] : []), 'declarativeNetRequest'],
    host_permissions: ['http://*/*', 'https://*/*'],
    ...(browser === 'chrome' ? { minimum_chrome_version: '145' } : {
      browser_specific_settings: { gecko: { id: 'ai-adblocker@notdogus.github.io', strict_min_version: '140.0', data_collection_permissions: { required: ['none'], optional: ['websiteContent', 'browsingActivity'] } } },
    }),
    declarative_net_request: { rule_resources: [{ id: 'ads', enabled: true, path: 'rules/ads.json' }] },
    action: { default_title: 'AI Adblocker' },
  }),
});
