# Validation of v0.1.0

Local acceptance checks on 20 September 2026 (Europe/Berlin), using Chrome for
Testing 153 and Firefox 153.0.4 on macOS with isolated profiles. The declared
minimum browser versions have not been separately exercised. Live websites and
model outputs can change; these observations are not an all-sites guarantee.

## Automated checks

- TypeScript validation and both WXT production builds pass.
- 29 Vitest tests cover URL/text redaction, provider parsing and failures,
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

The Firefox test helper tolerates a specific Marionette disconnect during browser
shutdown and stops Geckodriver; errors during test commands still fail the suite.
Temporary Firefox add-ons are reinstalled into the retained test profile on restart.

## Real TypeSafe learning

A separate controlled fixture uses the actual TypeSafe API from the extension
background. Jev recognizes an unknown advertising loader using its resource and
element context. After removing the API key, the next fixture visit prevents the
learned request at the origin server. No production mock hook is involved.

A 20-case labeled smoke corpus also tests ad resources alongside application,
chat, video and consent resources. No legitimate example crossed the blocking
threshold in the observed run. Some advertising examples remained below 0.95 and
were deliberately allowed; this small corpus does not establish statistical
accuracy or a calibrated false-positive rate. Bundled lists cover many such known
ad sources independently. Network rules keep the 0.95 advertising threshold. The bounded popup/overlay
actions use 0.85 plus the unchanged 0.10 essential-content veto and local
intent/structure guards. These are impact-based policy thresholds, not a claim
of population-level calibration.

Run instructions are in [Development](DEVELOPMENT.md). Raw live reports, screenshots, temporary
profiles and API credentials are excluded from version control and release
packages. GitHub Actions runs only deterministic offline checks and packages both
browsers; live tests are explicit local actions.

## Player protection acceptance checks

The production Chrome and Firefox builds pass dedicated player fixtures with
actual advancing canvas-backed video frames. These tests assert that no new window
is created for direct popups, a tiny blank window later resized/navigated,
synthetic new-tab anchors, or an `open()` function borrowed from a fresh iframe.
Both nested HTTP frames and inherited-origin srcdoc frames are covered. Explicit
player links and labeled sharing controls still create their intended windows.

The fixture distinguishes an advertising-only loader from a shared player bundle.
With deterministic transport, the loader and its downstream request disappear at
the origin server on subsequent visits; the shared bundle still executes. Learned
popup/overlay rules survive restart and key removal. Current-page overlay removal,
manual release, a classless click shield, restoration when that element gains real
media, and site bypass are exercised. No mocks ship in the extension.

A classless player shield is first assessed from geometry and left
alone. Its subsequent popup attempt upgrades that same candidate despite the
earlier assessment and despite a previously observed caller. Exactly one causal
assessment learns the overlay; replacement shields disappear before another click.
The rule survives browser restart and key removal in both Chromium and Firefox.

A separate **real Jev** fixture run consumed two calls and learned a sponsored
player overlay (ad 0.93 / essential 0.04) and a popup side effect (0.94 / 0.05).
The overlay disappeared while the video continued advancing beyond 15 seconds.
The shared player script was not learned as a network block. Reproduce with
`npm run test:players:model`; model scores and accepted rules may change.

The final 20-case live model smoke run blocked no legitimate examples, including
login, share, player controls, captions, errors, consent, posters and next-episode
UI. Some advertising candidates stayed below threshold. This small corpus is
regression evidence, not an accuracy guarantee.

A Chromium browser test feeds the production YouTube adapter controlled initial,
fetch JSON/text and XHR JSON/text player responses. Separate ad slots disappear;
stream URLs, captions and content metadata remain identical. A skip-like button
outside ad state is untouched, a visible skip control inside ad state is clicked,
content time is never advanced by the blocker, and site bypass restores responses.
These are protocol fixtures, not proof of every live YouTube ad format.

## Known coverage limits

The pinned lists yield 5,669 network rules and 27,132 supported cosmetic rules.
The build report includes 1,107 unsupported cosmetic filters, 3,060 converter errors
and three omitted non-block/allow actions. The extension therefore does not promise
full compatibility with every EasyList construct.

Unknown sources may load once or remain uncertain. Rotating URLs require fresh
decisions. Inline ads outside the bounded player overlay detector, inaccessible browser
frames, startup races, hostile page tampering, service-worker-delivered cached
content and advertising embedded in the media bytes can still evade this approach. Mozilla signing and store review are not part of this release.
