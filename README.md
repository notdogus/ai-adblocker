# AI Adblocker

A Chrome and Firefox extension that blocks advertising requests before they load,
then uses TypeSafe Jev to learn additional ad sources. Bring your own API key.

**v0.1 is a local-install preview.** EasyList and EasyList Germany work immediately,
without an account. AI learning is opt-in and deliberately conservative. An unknown
ad can load on its first visit; subsequent matching requests are blocked locally.
No server, telemetry, or shared browsing history.

## Install locally

Requires Node.js 22.12+ (Node 24 LTS recommended), npm, Chrome 145+ or Firefox 140+.

```sh
npm ci
npm run build
```

- **Chrome:** open `chrome://extensions`, enable Developer mode, choose **Load
  unpacked**, and select `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary
  Add-on**, and select `.output/firefox-mv3/manifest.json`. Temporary add-ons must be
  loaded again after browser restart; ordinary permanent installation requires
  Mozilla signing, which is outside this preview.

Open the extension's settings, save your TypeSafe key, optionally test the
connection, then enable AI learning and save settings. The key is never prefilled
or shipped in the extension. The default model is `jev-1.13.0`.

Use the toolbar popup to pause protection for a website. Reload that page after
changing protection or releasing a source, so its resources can be fetched again.
Settings also show learned rules and allow individual sources to be released.
These releases override AI rules, not the bundled filter lists.

## What it does

- Native request blocking for known ad servers, scripts, frames and creatives.
- CSS filtering for supported advertising selectors, including domain exceptions.
- For supported embedded players, disables the player's explicit pre-roll/ad
  configuration before initialization and attempts a direct content-stream start;
  it never seeks through an ad or clicks a skip control.
- Background-only TypeSafe requests with two independent Noul judgments: ad
  purpose and necessity for real content. Automatic learning requires respectively
  at least 0.95 and at most 0.10.
- Exact URL and resource-type rules scoped to a website and its subdomains.
  Request query strings stay significant. A shared CDN is never automatically
  blocked as a whole.
- Persistent local rules, manual releases, a 2,000-rule ceiling, deduplication,
  batches of up to eight candidates, and a configurable daily API-call budget
  (default 200, reset at UTC midnight).
- Existing rules work without a key, with AI disabled, or during a provider outage.
  A connection test is an extra, explicitly initiated API call outside that budget.

This focuses on advertising. It does not remove cookie banners, add a general
anti-tracking list, rewrite video streams, bypass player restrictions, or guarantee
complete ad removal on every website. Sources with little evidence can remain
unclassified. Pure inline advertising with no identifiable resource is not learned
as a network rule. Standard browser restrictions and content served entirely from
a site's service-worker cache can limit coverage. Player ad suppression only works
where the provider exposes an explicit ad configuration; it does not seek past a
running ad, click a Skip button, or alter content inside the actual stream.
Browser autoplay policy can still require a user gesture. Private browsing is disabled.

## Development and tests

```sh
npm run dev                  # Chrome development
npm run dev:firefox          # Firefox MV3 development
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser         # isolated Chromium + Firefox, no real API calls
npm run zip                 # package both builds
```

Firefox browser tests require Firefox and the `zip` command. Geckodriver is
downloaded automatically; set `FIREFOX_BINARY` for a custom Firefox installation.
Set `TEST_BROWSER=chromium` or `TEST_BROWSER=firefox` to run one suite. The tests
install production builds into disposable profiles and replace only the TypeSafe
transport from the browser test driver; no mock-provider hook is shipped.
Packaging additionally uses Python 3's standard library to reject credentials or
private test artifacts in release archives and check that licenses are included.

```sh
npm run test:live                    # OnePiece-Tube browser checks
npx tsx tests/browser/model-live.ts   # small labeled Jev smoke corpus
```

Live model tests require `TYPESAFE_API_KEY` in the test process environment and
consume API usage. `test:live` also exercises real browser-to-TypeSafe learning if
that variable is present. Never put a key in a `WXT_*`/`VITE_*` variable or commit
an environment file. Screenshots and live outputs remain in ignored
`test-results/`; they are not automatically published.

The offline suite uses server-side request counters to verify that blocking a
learned loader also prevents its child request. It tests nested frames, restart
persistence, offline operation, site isolation, releases and site bypasses.

## Filter updates

Pinned snapshots, checksums and attribution live in `filters/`. Builds never
download a new list implicitly.

```sh
npm run filters:update
npm run build
```

Review the snapshot diff and `filters/build-report.json` before publishing an
update. Supported equivalent hostname rules are grouped without changing their
conditions. Unsupported modifiers, scriptlets and regexes are reported; remote
scripts and redirect resources are not shipped. Static quotas are checked during
the build. Third-party filters retain their original licensing and attribution.

See [architecture](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md),
[validation](docs/VALIDATION.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## License

GPL-3.0-only. See [LICENSE](LICENSE).
