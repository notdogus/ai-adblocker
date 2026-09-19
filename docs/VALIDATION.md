# Validation of v0.1.0

Local acceptance checks on 20 September 2026 (Europe/Berlin), using Chrome for
Testing 153 and Firefox 153.0.4 on macOS with isolated profiles. The declared
minimum browser versions have not been separately exercised. Live websites and
model outputs can change; these observations are not an all-sites guarantee.

## Automated checks

- TypeScript validation and both WXT production builds pass.
- 21 Vitest tests cover URL/text redaction, provider parsing and failures,
  decision boundaries, exact URL rules, publisher scope and nested Firefox frame
  ancestry, releases, cosmetic exceptions and equivalent network-rule compaction.
- The production builds pass Chromium/Playwright and Firefox/Selenium tests.
  A local origin server counts actual requests; screenshots are not used as
  evidence that a request was prevented.

The browser fixture loads an unknown advertising script and image alongside
necessary application code, including inside a nested third-party frame. With a
deterministic provider transport substituted by the test driver, two rules are
learned. On the next visit, request counts for the loader, image and the loader's
child request are all **zero**. This remains true after browser restart and with
the provider unavailable. Application code still runs. The same resource on a
different top-level host remains allowed. Manual releases, website bypasses,
budget exhaustion, reset, malformed responses and deleting the key are exercised.
Subdomain releases are also checked against subsequently learned parent-domain rules.
The browser fixture also exposes an explicit pre-roll configuration: with protection
enabled it is disabled before playback, while a website exclusion leaves it unchanged.
Its player-side request counter records zero `/player-ad` requests and one
`/player-stream` request with protection enabled; the inverse is observed for the
excluded site. This verifies cause removal at the player configuration boundary,
not merely hiding a rendered ad.

The Firefox test helper tolerates a specific Marionette disconnect during browser
shutdown and stops Geckodriver; errors during test commands still fail the suite.
Temporary Firefox add-ons are reinstalled into the retained test profile on restart.

## Live website checks

Tested `https://onepiece.tube/` and
`https://onepiece.tube/anime/folge/1178` with AI disabled, so these results measure
the bundled filters independently of learning.

| Check | Chromium | Firefox |
| --- | --- | --- |
| Observed Google Ads, PowerAd, Intergient and Adscale endpoints | Blocked | Blocked |
| Responses from those endpoints with protection enabled | 0 | 0 |
| Visible tested advertisement containers | 0 | 0 |
| Chat iframe still present | Yes | Yes |
| Episode player frames still present | Yes | Yes |
| Actual video playback advances | Yes | Not asserted |

Chromium's unprotected baseline receives advertising responses and displays the
tested ad containers. Protected runs produce browser request-failure events instead
of responses. Firefox uses native extension `webRequest` response/error observers;
Resource Timing entries alone are not interpreted as successful downloads.

In the protected Chromium run, the Ani-Stream player reaches ready state and its
content time advances without a test-side click or `play()` call. The second Hubu
player remains loaded but is not auto-started because it exposes no equivalent
explicit pre-roll configuration in this run. A separate viewport inspection
confirms the visible Ani-Stream player still renders. The site's consent overlay
remains, as requested by the ads-only scope.
Chat loading was checked without posting messages. These checks do not claim a
complete interactive audit of chat, all navigation links, or every possible ad.

## Real TypeSafe learning

A separate controlled fixture uses the actual TypeSafe API from the extension
background. Jev recognizes an unknown advertising loader using its resource and
element context. After removing the API key, the next fixture visit prevents the
learned request at the origin server. No production mock hook is involved.

An eight-case labeled smoke corpus also tests ad resources alongside application,
chat, video and consent resources. No legitimate example crossed the blocking
threshold in the observed run. Some advertising examples remained below 0.95 and
were deliberately allowed; this small corpus does not establish statistical
accuracy or a calibrated false-positive rate. Bundled lists cover many such known
ad sources independently. Keep the conservative thresholds until a larger labeled
evaluation justifies changing them.

Run instructions are in the README. Raw live reports, screenshots, temporary
profiles and API credentials are excluded from version control and release
packages. GitHub Actions runs only deterministic offline checks and packages both
browsers; live tests are explicit local actions.

## Known coverage limits

The pinned lists yield 5,669 network rules and 27,132 supported cosmetic rules.
The build report includes 1,107 unsupported cosmetic filters, 3,060 converter errors
and three omitted non-block/allow actions. The extension therefore does not promise
full compatibility with every EasyList construct.

Unknown sources may load once or remain uncertain. Rotating URLs require fresh
decisions. Inline ads, inaccessible browser frames, service-worker-delivered cached
content and advertising embedded in the actual media stream can evade this v1
approach. Supported players with explicit pre-roll configuration are handled before
initialization; no skip button is clicked and no ad is sought through. Browser
autoplay policy may still require a user gesture. Mozilla signing and store review
are not part of this release.
