# @apptaptap/flux-embed

Embed [Flux](https://flux.events) event registration and verify Flux webhooks.

```sh
npm install @apptaptap/flux-embed
```

| Entry | Runs in | What it gives you |
|---|---|---|
| `@apptaptap/flux-embed` | browser | `register()` (loads the hosted `https://flux.events/embed/v1/flux.js` once, which defines `<flux-event>` and `window.FluxEmbed`), `mount(el, { eventId, token })`, typed `on()` |
| `@apptaptap/flux-embed/react` | browser (React 17+) | `<FluxEvent eventId token onRegistration onCheckout onError />` |
| `@apptaptap/flux-embed/server` | Node 18+ | `createEmbedSession()`, `verifyWebhook()` |
| `dist/flux-embed.global.js` | `<script>` tag | `window.FluxEmbedSDK` (same API as the browser entry; `window.FluxEmbed` belongs to the hosted loader) |

## Server: mint a one-time embed token

```ts
import { createEmbedSession } from '@apptaptap/flux-embed/server'

const { embedToken } = await createEmbedSession({
  secretKey: process.env.FLUX_SECRET_KEY!,     // flux_sk_live_... (never in a browser)
  eventId,
  allowedOrigin: 'https://app.example.com',
  externalRef: user.id,
  embeddedData: { name: user.name, email: user.email },
  locked: ['email'],                           // shown read-only in the embed (name, email, matching custom labels)
  poweredBy: false,                            // hides "Powered by Flux" for this token (default true)
  idempotencyKey: crypto.randomUUID(),         // optional
})
```

Locked fields render read-only in the embed; the server's values win anyway. `allowedOrigin` works inside the Flux
iframe (the frame sends your page's origin as `embed_origin`, from the loader's handshake). `poweredBy` is decided by
the token: the `poweredBy` mount option / `powered-by` attribute is accepted but ignored, and an embed without a token
always shows the link.

## Browser

```tsx
import { FluxEvent } from '@apptaptap/flux-embed/react'

<FluxEvent
  eventId={eventId}
  token={embedToken}
  onRegistration={(e) => confirmOnServer(e.completion_token)}
  onCheckout={(e) => window.location.assign(e.checkout_url)}
/>
```

or without React:

```ts
import { mount } from '@apptaptap/flux-embed'
const flux = mount('#register', { eventId, token: embedToken, accent: '#0E6B52', prefill: { name: 'Ada' } })
flux.on('registration.created', (e) => console.log(e.registration_id))
```

Plain HTML works too: `<flux-event event-id="EVENT" token="flux_et_live_…">` after the hosted
`<script src="https://flux.events/embed/v1/flux.js" async>`.

Events: `ready`, `resize`, `registration.created {registration_id, completion_token, event_id}` (Flux's
`response.completed`), `checkout.required {event_id, tier_id, checkout_url}` (a priced ticket: send the buyer
there, or pass `followCheckout`), `error {code, retryable, message?}`, `close`. Each is also a DOM `CustomEvent`
`flux:<type>` on the host element (plus the aliases `flux:registration` and `flux:checkout`). The token travels in
the iframe URL fragment (`#t=`), never the query string; `fetchToken` / `tokenUrl` get one fresh-token retry.
The browser is not trusted: confirm with `GET /api/flux/v1/registrations/{registration_id}/completion?token=...`
on your server.

## Webhooks

```ts
import { verifyWebhook } from '@apptaptap/flux-embed/server'

app.post('/webhooks/flux', express.raw({ type: 'application/json' }), (req, res) => {
  const event = verifyWebhook({ payload: req.body, headers: req.headers, secret: process.env.FLUX_WEBHOOK_SECRET! })
  if (event.type === 'order.paid' && event.livemode) { /* event.data.amount_cents ... */ }
  res.sendStatus(204)
})
```

Types: `registration.created`, `registration.cancelled`, `checkin.created`, `order.paid`, `event.updated`; body
`{id, type, api_version, livemode, created, data}` with `data.api_key_id` when a key was involved. Standard
Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,<base64 HMAC-SHA256>`, key = base64 tail of
`whsec_...`), 5-minute tolerance, constant-time compare. The legacy `X-Webhook-Signature` header is sent alongside
for 90 days; this SDK verifies only the Standard headers. Pass the RAW body.

MIT licence.
