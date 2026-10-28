# AppTapTap SDKs

Embed and integrate [Flux](https://flux.events) (event registration) and
[Little Black Box](https://littleblackbox.app) (surveys) from your web app, your server and your iOS/macOS app.

| Package | For | Install |
|---|---|---|
| [`@apptaptap/flux-embed`](packages/flux-embed) | Flux: browser, React, Node server | `npm i @apptaptap/flux-embed` |
| [`@apptaptap/lbb-embed`](packages/lbb-embed) | Little Black Box: browser, React, Node server | `npm i @apptaptap/lbb-embed` |
| [`AppTapTapSDK`](swift) (`FluxKit`, `LBBKit`) | Swift: iOS 16+, macOS 13+ | Swift Package Manager, this repo, `swift/` |

Both products share one embed protocol: your **server** mints a one-time embed token with a secret key, the
**browser or app** hands it to the hosted runtime (it travels in the iframe URL fragment, never the query string),
the runtime reports events over a private `MessageChannel`, and your server **verifies** the outcome (completion
token, or a signed webhook) before granting anything.

## 5-minute integration: Flux

**1. Server (Node 18+): mint a token**

```ts
import { createEmbedSession } from '@apptaptap/flux-embed/server'

app.post('/api/flux-token', async (req, res) => {
  const { embedToken } = await createEmbedSession({
    secretKey: process.env.FLUX_SECRET_KEY!,        // flux_sk_live_… or flux_sk_test_…
    eventId: 'summer-party',
    allowedOrigin: 'https://app.example.com',
    embeddedData: { name: req.user.name, email: req.user.email },
    locked: ['email'],                               // shown read-only in the embed (name, email, matching custom labels)
    poweredBy: false,                                // hides "Powered by Flux" for this token (default true)
  })
  res.json({ embed_token: embedToken })
})
```

**2. Browser: embed it**

```tsx
import { FluxEvent } from '@apptaptap/flux-embed/react'

<FluxEvent
  eventId="summer-party"
  tokenUrl="/api/flux-token"
  onRegistration={(e) => fetch('/api/confirm', { method: 'POST', body: JSON.stringify(e) })}
  onCheckout={(e) => window.location.assign(e.checkout_url)}
/>
```

No React? `mount('#register', { eventId, token })` from `@apptaptap/flux-embed`, or plain HTML:
`<script src="https://flux.events/embed/v1/flux.js" async></script><flux-event event-id="summer-party" token-url="/api/flux-token"></flux-event>`.

**3. Server: trust only what you verify**

```ts
import { verifyWebhook } from '@apptaptap/flux-embed/server'

app.post('/webhooks/flux', express.raw({ type: 'application/json' }), (req, res) => {
  const event = verifyWebhook({ payload: req.body, headers: req.headers, secret: process.env.FLUX_WEBHOOK_SECRET! })
  if (event.type === 'registration.created') grantAccess(event.data.guest_id)
  res.sendStatus(204)
})
```

Or confirm the browser's `completion_token` with `GET /api/flux/v1/registrations/{registration_id}/completion?token=…`.

**Swift**

```swift
import FluxKit

// On a server you control (never ship a secret key in an app):
let session = try await FluxClient(secretKey: secretKey).createEmbedSession(eventId: "summer-party", allowedOrigin: "https://app.example.com")

// In the app:
FluxEmbedView(eventId: "summer-party", token: session.embedToken, hostOrigin: URL(string: "https://app.example.com")!,
              onRegistration: { r in confirm(r.registrationId, r.completionToken) },
              onCheckout: { c in openURL(c.checkoutURL) })
```

## 5-minute integration: Little Black Box

**1. Server: mint a token**

```ts
import { createEmbedSession } from '@apptaptap/lbb-embed/server'

const { embedToken } = await createEmbedSession({
  secretKey: process.env.LBB_SECRET_KEY!,           // lbb_sk_live_…
  survey: 'nps-q4',
  allowedOrigin: 'https://app.example.com',
  externalRef: user.id,
  embeddedData: { plan: user.plan },                 // locked: URL params cannot override it
})
```

**2. Browser: embed it**

```tsx
import { LBBSurvey } from '@apptaptap/lbb-embed/react'

<LBBSurvey slug="nps-q4" token={embedToken} onCompleted={(e) => confirm(e.session_id, e.completion_token)} />
```

No React? `mount('#survey', { survey: 'nps-q4', token })` from `@apptaptap/lbb-embed`, or the hosted
`<lbb-survey survey="nps-q4" token-url="/api/lbb-token">` element.

**3. Server: verify**

```ts
import { verifyWebhook } from '@apptaptap/lbb-embed/server'

const event = verifyWebhook({ payload: rawBody, headers: req.headers, secret: process.env.LBB_WEBHOOK_SECRET! })
if (event.type === 'response.completed') save(event.response.values)
```

**Swift**

```swift
import LBBKit

let session = try await LBBClient(apiKey: secretKey).createEmbedSession(survey: "nps-q4", allowedOrigin: "https://app.example.com")
LBBEmbedView(slug: "nps-q4", token: session.embedToken, hostOrigin: URL(string: "https://app.example.com")!,
             onCompleted: { c in confirm(c.sessionId, c.completionToken) })

// Webhooks on a Swift server:
let body = try WebhookVerifier(secret: webhookSecret).verify(payload: rawBody, headers: headers)
```

## Webhooks

Both products sign deliveries with [Standard Webhooks](https://www.standardwebhooks.com): `webhook-id`,
`webhook-timestamp`, `webhook-signature: v1,<base64 HMAC-SHA256(key, "<id>.<timestamp>.<body>")>` where the key is
the base64 tail of your `whsec_…` secret. Every verifier here enforces a 5-minute window, accepts any of several
space-separated signatures and compares in constant time. Pass the **raw** body. The legacy headers
(`X-Webhook-Signature`, `LBB-Signature`) are still sent for 90 days; these SDKs verify only the Standard ones.

## Hosts

| | API base | Hosted runtime |
|---|---|---|
| Flux | `https://apptaptap-vapor-backend.fly.dev/api/flux/v1` | `https://flux.events/embed/v1/flux.js` (iframe `/embed/v1/:eventId`, token `#t=`) |
| Little Black Box | `https://api.littleblackbox.app` (paths `/v1/...`) | `https://littleblackbox.app/embed/v1/lbb.js` (iframe `/x/:slug`, token `#et=`) |

Every client takes a `baseUrl` / `baseURL` override for staging.

## Develop

```sh
npm ci && npm test && npm run build && npm run size   # TypeScript packages
swift test --package-path swift                       # Swift package
npm run vectors                                        # regenerate vectors/webhooks.json
```

MIT licence. Copyright AppTapTap.
