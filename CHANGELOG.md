# Changelog

All notable changes to the AppTapTap SDKs. Versions follow semver; every package starts at 0.1.0.

## 0.1.0 (unreleased)

### @apptaptap/flux-embed
- Browser entry: `register()` loads the hosted `https://flux.events/embed/v1/flux.js` once (defines `<flux-event>`
  and `window.FluxEmbed`); `mount(el, { eventId, token | fetchToken | tokenUrl, accent, radius, font, prefill })`;
  typed `on()` for `ready`, `resize`, `registration.created`, `checkout.required`, `error`, `close`.
- `/react`: `<FluxEvent eventId token onRegistration onCheckout onError />`.
- `/server`: `createEmbedSession({ secretKey, eventId, ... })`, `verifyWebhook()` with typed
  `registration.created`, `registration.cancelled`, `checkin.created`, `order.paid`, `event.updated` payloads.
- Script-tag build `dist/flux-embed.global.js` → `window.FluxEmbedSDK`.

### @apptaptap/lbb-embed
- Browser entry: `register()` loads the hosted `https://littleblackbox.app/embed/v1/lbb.js` once (defines
  `<lbb-survey>` and `window.LBB`); `mount(el, { survey, token | fetchToken | tokenUrl, mode, theme, ... })`; typed `on()`.
- `/react`: `<LBBSurvey slug token onCompleted onError />`.
- `/server`: `createEmbedSession({ secretKey, survey, allowedOrigin, ... })`, `verifyWebhook()` with typed
  `response.completed` / `response.partial` / `response.recorded` / `survey.published` payloads.
- Script-tag build `dist/lbb-embed.global.js` → `window.LBBEmbed`.

### AppTapTapSDK (Swift, iOS 16+ / macOS 13+)
- `FluxKit`: `FluxClient(secretKey:)` (`createEmbedSession`, `events`, `event(id:)`, `register` with
  `.paymentRequired(checkoutURL:)`, `registrationCompletion`), `FluxEmbedView`.
- `LBBKit`: `LBBClient(apiKey:)` (`createEmbedSession`, `surveys`, `survey(slug:)`, `responseCompletion`), `LBBEmbedView`.
- `AppTapTapCore`: `WebhookVerifier` (CryptoKit, constant-time), `APIClient`, `APIError`, `EmbedWebView`.

### Shared
- Standard Webhooks verification: `whsec_` base64 key (raw-bytes fallback as LBB's server), 5-minute tolerance,
  several `v1,` signatures, constant-time compare. Test vectors in `vectors/webhooks.json`, shared by both languages.
