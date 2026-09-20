# AI Adblocker

**Less ads. More space for you.**

Ad protection for Chrome and Firefox. Known ads are blocked immediately –
no account, no setup. Optionally, AI detects additional ad sources.

- **Ready immediately:** EasyList and EasyList Germany are included.
- **You decide:** Pause protection per website and release learned sources.
- **Stored locally:** Settings and rules stay in your browser. No telemetry.

## Install

The current version is a **local-install preview**.
Requires Node.js 22.12+, npm, and Chrome 145+ or Firefox 140+.

```sh
npm ci
npm run build
```

**Chrome:** Open `chrome://extensions` → enable Developer mode →
**Load unpacked** → select `.output/chrome-mv3`.

**Firefox:** Open `about:debugging#/runtime/this-firefox` →
**Load Temporary Add-on** → select `.output/firefox-mv3/manifest.json`.
Load it again after every browser restart.

Done. Click the toolbar icon for **Protection**, **AI learning**, **Rules**,
and **Sites** tabs – everything in the same window, no extra page.
Pause protection for the current website there, then reload the page.

## Add AI learning · optional

On the **AI learning** tab, enter a TypeSafe API key, enable **AI learning**,
and choose **Save changes**. The daily limit lives under **Advanced settings**.

TypeSafe then receives visited domains, cleaned resource URLs, and technical
traits of possible ads. No cookies, form input, or full pages. TypeSafe may
charge for usage. [More about privacy](docs/PRIVACY.md).

Learned rules keep working with AI turned off. If content is missing on a
website, release its source on the **Rules** tab.

## Good to know

Not every ad can be removed. New sources may stay visible at first; ads baked
into videos and cookie banners are not removed. The extension is unavailable
in private windows.

[Development & tests](docs/DEVELOPMENT.md) · [Technology](docs/ARCHITECTURE.md) ·
[Validation](docs/VALIDATION.md) · [Third-party licenses](THIRD_PARTY_NOTICES.md)

License: [GPL-3.0-only](LICENSE).
