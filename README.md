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
- Local player intent protection in nested and inherited-origin frames: unexpected
  windows (including blank popunders and synthetic links) are stopped at creation.
  Fresh same-origin iframe windows cannot supply an unguarded `open()` function.
- Jev evaluates popup side effects separately from whole script resources. Shared
  player code stays usable; advertising-only loaders can become network rules.
  Separate overlay elements can become restricted, frame-origin-scoped rules.
- A YouTube adapter removes separate `playerAds`, `adPlacements` and `adSlots`
  from recognized initial/fetch/XHR player responses. A fallback clicks an available
  skip control only during an explicit ad state; it never seeks through content.
- Background-only TypeSafe requests with two independent Noul judgments: ad
  purpose and necessity for real content. Network rules require ad >= 0.95 and
  essential <= 0.10. Restricted popup/overlay actions use ad >= 0.85 with the same
  essential-content veto, plus local intent and structure checks.
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
unclassified. Inline player overlays can be learned as element rules even without their own
network resource. Uncertain classifications remain allowed. Advertising embedded
in the media bytes, new player protocols, early startup races and deliberate
tampering with page-world hooks can still limit protection. Standard browser restrictions and content served entirely from
a site's service-worker cache can limit coverage. Private browsing is disabled.

## Development and tests

```sh
npm run dev                  # Chrome development
npm run dev:firefox          # Firefox MV3 development
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser         # core + player tests, Chromium/Firefox, no real API calls
npm run test:players         # player tests only, including YouTube adapter fixtures
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
npm run test:players:live            # requested player pages; bounded real Jev use
npm run test:archivebate:live         # complete Archivebate flow and keyless revisit
npm run test:players:model           # real Jev player learning, at most five calls
npx tsx tests/browser/model-live.ts   # small labeled Jev smoke corpus
```

Live model tests require `TYPESAFE_API_KEY` in the test process environment and
consume API usage. `test:players:live` uses at most 12 inference calls when a key is present and
records technical metadata only. The live report is an observation, not an
automatic all-ads-gone certification. `test:live` also exercises real browser-to-TypeSafe learning if
that variable is present. Never put a key in a `WXT_*`/`VITE_*` variable or commit
an environment file. Screenshots and live outputs remain in ignored
`test-results/`; they are not automatically published.

`test:archivebate:live` continues the site's entry dialog in a disposable Chromium
profile, clicks the embedded player and asserts advancing video, no new windows
and no remaining empty center shield. It repeats with the key removed, uses at
most 12 real inference calls, and stores only technical metadata. Set `LIVE_MODEL=0`
to test both visits without a key or inference.

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
