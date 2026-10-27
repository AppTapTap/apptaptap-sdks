// Fails when a script-tag (IIFE) build exceeds 8 KB min+gz. Run after `npm run build`.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const LIMIT = 8 * 1024
let failed = false
for (const f of ['packages/flux-embed/dist/flux-embed.global.js', 'packages/lbb-embed/dist/lbb-embed.global.js']) {
  const gz = gzipSync(readFileSync(new URL('../' + f, import.meta.url)), { level: 9 }).length
  console.log(`${f}: ${gz} B min+gz (limit ${LIMIT})`)
  if (gz > LIMIT) failed = true
}
process.exit(failed ? 1 : 0)
