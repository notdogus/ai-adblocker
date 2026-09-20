# Development

Node.js 22.12+ and npm are required. Install dependencies with `npm ci`.

```sh
npm run dev                  # Chrome
npm run dev:firefox          # Firefox
npm run typecheck
npm test
npm run build                # Both browsers
npx playwright install chromium
npm run test:browser         # Offline tests for both browsers and players
npm run zip                  # Verify browser packages and source archive
```

Firefox tests need Firefox and `zip`. Geckodriver downloads automatically;
`FIREFOX_BINARY` selects a custom Firefox installation.
`TEST_BROWSER=chromium` or `TEST_BROWSER=firefox` limits tests to one browser.
Tests use disposable profiles and replace the AI transport only in the test
driver. The extension ships no mocked provider.

## Optional model tests

```sh
npm run test:live                  # Controlled local browser fixture with real AI
npm run test:players:model         # Controlled player fixture with real AI
npx tsx tests/browser/model-live.ts # Small classification smoke corpus
```

These tests need `TYPESAFE_API_KEY` in the process environment and consume
API calls. Never put a key in a `WXT_*` or `VITE_*` variable. Do not publish
environment files or test output. Results go to the ignored `test-results/`
folder and guarantee nothing about other websites.

For your own website checks, `npm run test:players:live` accepts a
newline-separated list of full HTTP(S) URLs in `LIVE_TEST_URLS`.
Without this variable, no websites are opened. With a key, the total budget
is twelve automatic AI calls. `LIVE_EMBEDDED_ONLY=1` limits player selection
to embedded frames.

## Update filters

```sh
npm run filters:update
npm run build
```

Snapshots, checksums, and provenance live in `filters/`. Builds never fetch
lists. Review changes and `filters/build-report.json` before publishing.
Unsupported filters are listed there; license notices are preserved.

Package verification needs Python 3 and checks archives for credentials,
private test artifacts, and required licenses. Permanent regular
Firefox installation additionally requires signing by Mozilla.
