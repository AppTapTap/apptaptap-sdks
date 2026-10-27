# @apptaptap/flux-embed

Embed [Flux](https://flux.events) event registration and verify Flux webhooks.

```sh
npm install @apptaptap/flux-embed
```

| Entry | Runs in | What it gives you |
|---|---|---|
| `@apptaptap/flux-embed` | browser | `register()` (loads the hosted `https://flux.events/embed/v1/flux.js` once, which defines `<flux-event>`), `mount(el, opts)`, typed `on()` |
| `@apptaptap/flux-embed/react` | browser (React 17+) | `<FluxEvent eventId token onRegistration onCheckout onError />` |
| `@apptaptap/flux-embed/server` | Node 18+ | `createEmbedSession()`, `verifyWebhook()` |
| `dist/flux-embed.global.js` | `<script>` tag | `window.FluxEmbed` (same API as the browser entry) |

## Server: mint a one-time embed token

```ts
import { createEmbedSession } from '@apptaptap/flux-embed/server'

const { embedToken } = await createEmbedSession({
  secretKey: process.env.FLUX_SECRET_KEY!,     // flux_sk_live_... (never in a browser)
  event: eventId,
  allowedOrigin: 'https://app.example.com',
  externalRef: user.id,
  embeddedData: { name: user.name, email: user.email },
  locked: ['email'],
  idempotencyKey: crypto.randomUUID(),         // optional
})
```

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

Events: `ready`, `resize`, `registration.created`, `checkout.required` (a priced ticket: send the buyer to
`checkout_url`, or pass `followCheckout`), `redirect`, `error`, `close`; each is also a DOM `CustomEvent`
named `flux:<type>` on the host element. The token travels in the iframe URL fragment, never the query string.
The browser is not trusted: confirm with `GET /api/flux/v1/registrations/{id}/completion?token=...` on your server.

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
