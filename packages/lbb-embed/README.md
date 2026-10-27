# @apptaptap/lbb-embed

Embed [Little Black Box](https://littleblackbox.app) surveys and verify LBB webhooks.

```sh
npm install @apptaptap/lbb-embed
```

| Entry | Runs in | What it gives you |
|---|---|---|
| `@apptaptap/lbb-embed` | browser | `register()` (loads the hosted `https://littleblackbox.app/embed/v1/lbb.js` once, which defines `<lbb-survey>`), `mount(el, opts)`, typed `on()` |
| `@apptaptap/lbb-embed/react` | browser (React 17+) | `<LBBSurvey slug token onCompleted onError />` |
| `@apptaptap/lbb-embed/server` | Node 18+ | `createEmbedSession()`, `verifyWebhook()` |
| `dist/lbb-embed.global.js` | `<script>` tag | `window.LBBEmbed` (same API as the browser entry) |

## Server: mint a one-time embed token

```ts
import { createEmbedSession } from '@apptaptap/lbb-embed/server'

const { embedToken } = await createEmbedSession({
  secretKey: process.env.LBB_SECRET_KEY!,      // lbb_sk_live_... (never in a browser)
  survey: 'nps-q4',
  allowedOrigin: 'https://app.example.com',
  externalRef: user.id,
  embeddedData: { plan: user.plan },           // locked: URL params cannot override it
  idempotencyKey: crypto.randomUUID(),         // optional
})
```

## Browser

```tsx
import { LBBSurvey } from '@apptaptap/lbb-embed/react'

<LBBSurvey slug="nps-q4" token={embedToken} onCompleted={(e) => confirmOnServer(e.completion_token)} />
```

or without React:

```ts
import { mount } from '@apptaptap/lbb-embed'
const survey = mount('#survey', { survey: 'nps-q4', token: embedToken })
survey.on('response.completed', (e) => console.log(e.session_id))
```

The token travels in the iframe URL fragment (`#et=`), never the query string. Pass `fetchToken` instead of
`token` to fetch a fresh one on demand (the loader asks once more if the first expired).

Events: `ready`, `resize`, `response.started`, `page.changed`, `response.completed`, `redirect`, `error`, `close`
(each is also a DOM `CustomEvent` named `lbb:<type>` on the host element). The browser is not trusted: confirm a
completion with `GET /v1/responses/{id}/completion` on your server before granting anything.

## Webhooks

```ts
import { verifyWebhook } from '@apptaptap/lbb-embed/server'

app.post('/webhooks/lbb', express.raw({ type: 'application/json' }), (req, res) => {
  const event = verifyWebhook({ payload: req.body, headers: req.headers, secret: process.env.LBB_WEBHOOK_SECRET! })
  if (event.type === 'response.completed') { /* event.response.values ... */ }
  res.sendStatus(204)
})
```

[Standard Webhooks](https://www.standardwebhooks.com): `webhook-id`, `webhook-timestamp`, `webhook-signature`
(`v1,<base64 HMAC-SHA256>`, key = base64 tail of `whsec_...`), 5-minute tolerance, constant-time compare, any of
several signatures. The older `LBB-Signature` header is sent alongside for 90 days; this SDK verifies only the
Standard headers. Pass the RAW body: a re-serialised object will not verify.

MIT licence.
