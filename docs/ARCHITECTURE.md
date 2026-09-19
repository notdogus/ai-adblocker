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

Classifying an observed loader can prevent its entire downstream ad chain. Timing
alone never establishes causality. The extension does not reconstruct JavaScript
call stacks or download scripts for source analysis. The initial rule deliberately
includes the entire observed query: URL rotation can require a new decision.
URLs containing DNR filter operators (`*`, `|`, `^`) are not learned in v1 rather
than being silently broadened.

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
