# Privacy

AI Adblocker has no operator backend and sends no telemetry.

Without AI learning enabled, the extension does not contact TypeSafe. Filter
snapshots are bundled; updating them is a developer action. Website traffic still
goes to the original websites for resources that are not blocked.

When you save a key and explicitly enable AI learning, the extension sends bounded
candidate metadata to `https://api.typesafe.ai/v1/systemone` using your key:

- The top-level website hostname and sanitized resource URL (origin and path).
- Resource and element types, bounded class/ID markers and explicit advertising
  labels attached to that element.
- Bounded boolean observations: player gesture, initially blank popup, unrelated
  destination, overlay geometry and presence of media/controls. Raw stacks and
  popup destinations stay on-device and are never sent to TypeSafe.
- The fixed classification questions and selected model ID.

Query strings and fragments are omitted; credentials, recognizable email addresses,
long identifiers and numeric tokens are removed from transmitted URL paths/text.
This is data minimization, not a guarantee that every personal detail in a URL or
element attribute can be recognized. Hostnames and ordinary path segments remain
visible to TypeSafe. The extension never reads form values, chat text, full DOM
text, cookies, request bodies, audio, screenshots or video for inference.

A page-world hook observes popup calls and resolves their nearest known script
from a local call stack. The YouTube adapter removes separate ad-slot fields from
recognized player responses locally. Those responses, media URLs, and stream
bytes are never submitted to the model. The page hook receives no API key or
extension privileges.

The API key is stored in extension-origin IndexedDB and read by the background
context. It is not encrypted with a separate user password; anyone with access to
your browser profile/device can potentially recover locally stored credentials.
It is never returned to content scripts, included in diagnostics, or synchronized
to other browsers. TypeSafe receives it only as the authorization header. Fetch
redirects are rejected to avoid forwarding authorization elsewhere.

Learned rules retain exact original resource URLs **locally**, including query
strings, so blocking does not accidentally merge different resources. They also
retain the publisher hostname, resource type, model version, decision values and
creation time. Overlay rules additionally retain a restricted element selector and
frame origin. Popup rules identify the caller script; they do not block its other
functions. The UI shows sanitized URLs. A local attacker with access to the
browser profile can read these records. No export or cloud rule sharing is present.

Delete the key in settings to disable future automatic inference. Existing learned
rules continue to work. Reset learned rules and remove releases separately in
settings. Website exclusions prevent both filtering and AI analysis after reload.
Private browsing is not supported. Uninstalling the extension removes its local
extension storage through the browser's normal uninstall behavior.

Your direct use of TypeSafe is also subject to
[TypeSafe's own data-handling terms](https://docs.typesafe.ai/models#data-handling).
The project does not claim zero retention on behalf of that provider.
