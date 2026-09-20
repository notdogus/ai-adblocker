# Architecture

WXT creates two Manifest V3 builds from shared TypeScript. React is used only for
the options page and toolbar popup. Blocking never waits for a cloud inference.

## Request pipeline

1. Bundled DNR rules block known advertising before a request is sent.
2. Chrome compiles learned rules into persistent dynamic DNR rules using exact,
   case-sensitive URL filters, resource types and `topDomains` (Chrome 145+).
3. Firefox evaluates the same learned records through `webRequestBlocking`.
   `frameAncestors` identifies the top-level publisher even inside third-party
   frames. An event-page wake waits only for local storage/rule initialization.
   Unknown frame scope is not guessed.
4. Unknown observable resources enter a bounded background queue. DOM observations
   can enrich a pending network observation with advertising labels and markers.
   Resources already blocked by the browser are suppressed from this queue.
5. Sanitized candidates go to the `DecisionProvider` interface. Its sole current
   implementation is TypeSafe's `/v1/systemone` HTTP endpoint. Noul values are
   probabilities, not a separate confidence score. The resolved model is retained.
6. Code applies the two thresholds and persists only narrowly scoped rules.
   Content scripts hide already loaded resource elements matching those rules.

## Player behavior pipeline

Two document-start scripts run in every permitted frame, including inherited-origin
blank/srcdoc frames. The isolated script obtains publisher scope, settings and
learned rules from the background. The page-world script has no extension APIs or
credentials and remains passive until that context arrives.

A trusted pointer/keyboard gesture identifies playback intent from media geometry
and player controls. An unrelated `window.open` during that gesture returns null
without creating a window, including initially blank/tiny windows. Explicit links
and labeled sharing/login actions stay allowed. Synthetic new-tab anchor clicks
are guarded too. Acquiring a fresh same-origin iframe's window/document installs
the same guard synchronously, before an ad script can borrow its clean `open`.
Blank windows preallocated without a recent trusted interaction are also
blocked, even before the player DOM exists. Explicit sharing/login intent has a
five-second grace period; other gestures last 1.2 seconds. A directly observed empty click shield is disarmed locally, so denying
its popup does not leave the next play click trapped behind the shield.

At the popup boundary, a local stack is matched to the nearest known external
script. Only its URL and bounded boolean evidence cross to the isolated script;
it validates observed script membership, then the background sanitizes again.
Raw stacks, destinations and page text never reach Jev. This bridge is untrusted
page data: it cannot change settings or access secrets. A hostile page can tamper
with its own hooks/DOM; this is not a tamper-proof JavaScript sandbox.

Jev judges two different candidates: the popup **side effect** and the **entire
script resource**. Restricted popup/overlay actions require ad >= 0.85 and
essential <= 0.10, with additional local intent/structure guards and reversible
application. This threshold reflects their lower impact, not a measured global
false-positive guarantee. Only the latter can become a network block, with the existing
ad >= 0.95 / essential <= 0.10 thresholds. A popup rule suppresses future calls
from that exact script on the publisher while leaving its playback functions
running. Evidence advances through bounded stages: URL metadata, overlay geometry,
then an observed popup or intercepted playback click. Each resource is evaluated
at most once per stage; a stronger observation can upgrade a previous uncertain
judgment. Weaker observations cannot replace stronger pending evidence. Observed
side effects get priority over geometry and ordinary resources; budget, cooldown
and rule limits remain shared with ordinary learning. A new shield from an already
observed caller still reaches local protection, without repeating that caller's
model evaluation.

Overlay discovery is bounded to media-adjacent elements and hit-tested player
geometry. It excludes actual media, controls, subtitles and containers containing
them. Rules use a restricted single-element selector (optionally one positional
child), publisher scope and frame origin. Geometry/structure are rechecked before
hiding. Releases use the selector as part of identity. Detached elements are
released, recycled media containers are restored, and website bypass restores
hidden elements and delegates native popup calls. Popup/overlay rule types are
never compiled to DNR resource blocks.

YouTube is a small protocol adapter, not a blanket CDN block: only separate
`playerAds`, `adPlacements`, and `adSlots` arrays in recognized player responses are
removed. It handles the initial response global, JSON parsing, fetch and XHR, plus
an available skip button during explicit `ad-showing` state. Media URLs, captions,
content duration and playback rate are untouched. Unknown schemas and advertising
stitched into media bytes remain unsupported. Hooks do not wait for inference.

Classifying an observed advertising-only loader prevents its downstream chain.
Timing alone never proves a script is disposable. Exact resource queries remain
significant, and URLs containing DNR filter operators (`*`, `|`, `^`) do not become
network rules. Existing version-1 storage remains compatible through optional
selector fields and additional rule types.

## State and permissions

Versioned settings, rules, releases and the UTC daily budget use
`browser.storage.local`. Writes are serialized. Chrome content-script access to
this storage is restricted. Keys use separate extension-origin IndexedDB, accessed
only by background code. Options receive a `hasKey` boolean, never the saved key.
The settings RPC authenticates both extension ID and the exact options/popup URL;
content scripts can submit candidates and obtain only their filtering context.

HTTP(S) host permissions support observation, cross-origin frames and direct
TypeSafe fetches. `webNavigation` tracks top-level navigation; `webRequest` observes
metadata only. Firefox adds `webRequestBlocking` for local enforcement. No debugger
permission, browser history API, remotely hosted executable code, or request-body
access is used. DNR site bypass rules allow the main document and descendants;
content scripts and the AI queue independently honor the same exclusion.

Settings/key changes, releases and resets invalidate in-flight model results.
Provider failure pauses new inference for 60 seconds without automatic retry
loops. Pending observations are memory-only and can be lost when a background
context is stopped; later navigation observes them again. Learned rules and budgets
persist. At 2,000 rules, learning stops with a visible status instead of silently
evicting rules. The eight-second provider deadline cannot delay page loading.

## Filter build

`scripts/build-filters.ts` checks the committed snapshot hashes, extracts supported
CSS selectors, and feeds network filters to `@adguard/dnr-converter`. A build-only
adapter provides the converter's expected regex-validation callback using the same
RE2 memory limit as its Node CLI. Rules with equivalent conditions and hostname-only
URL patterns become `requestDomains` groups. Priorities preserve relative ordering;
the user website bypass has higher priority than static and learned rules.

Only block/allow actions are shipped. CSS exceptions remain scoped to the frame's
own hostname. Extended/procedural selectors and scriptlets are not executed.
`filters/build-report.json` records conversion exclusions rather than silently
claiming complete EasyList syntax support. Conversion output must fit the portable
30,000 static-rule and 1,000-regex limits.

## Testing boundaries

Vitest tests pure policy, privacy, API parsing and filter semantics. Browser tests
install the actual builds, mock the provider transport in the background global,
and assert origin-server request counters. Firefox is driven through Geckodriver;
its privileged test flag opens internal extension pages only in a disposable test
profile. It is not an extension requirement or production permission.
