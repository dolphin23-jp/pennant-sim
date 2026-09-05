# OpenAI narrative renderer: personal deployment

GitHub Pages still hosts the game. The optional Cloudflare Worker is the only
component that calls OpenAI. It needs a Cloudflare account, one D1 database and
two secrets. The default frontend does not call any API until enabled/configured.

## Deploy

Use Node 22 or newer on a trusted computer. From the repository root:

```sh
npm ci
npx wrangler login
npx wrangler d1 create pennant-narrative
```

Copy the returned database ID into `worker/wrangler.toml` (`database_id`). It is
an identifier, not a secret. Set `ALLOWED_ORIGIN` to the exact game origin:
`https://dolphin23-jp.github.io` (no path, no trailing slash).

```sh
npx wrangler d1 migrations apply pennant-narrative --remote --config worker/wrangler.toml
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.toml
```

Enter an OpenAI project key in Wrangler's private prompt. Use a dedicated project
in the organization whose sharing/free usage you configured. Do not enter this key
into the game, ChatGPT, a commit, a VITE_ variable or GitHub Pages build settings.

Generate a **different** personal proxy token and its SHA-256 hash locally:

```sh
node --input-type=module -e 'import { randomBytes, createHash } from "node:crypto"; const token = randomBytes(32).toString("base64url"); console.log("Proxy token:", token); console.log("SHA256:", createHash("sha256").update(token).digest("hex"));'
npx wrangler secret put NARRATIVE_TOKEN_SHA256 --config worker/wrangler.toml
```

Keep the token in a password manager; enter only the hash into the second private
Wrangler prompt. Anyone possessing this token can use your limited narrative
endpoint. Replacing its server hash revokes the previous token. This is personal
authentication, not an anonymous public proxy; CORS is additional browser defense.

```sh
npm run worker:check
npx wrangler deploy --config worker/wrangler.toml
```

In the game's news tab, open **AI記事の設定**, enter the Worker HTTPS origin and
the **proxy token**, enable AI articles and apply. Only URL/enabled preference
persist. The token stays in tab memory and must be entered again after reload.
Saved AI articles remain available without credentials or network access.
The browser sends fictional game facts to your Worker and OpenAI when generating.

## Budget and models

Defaults: `gpt-5.4-mini`, 2,000,000 accounted tokens/UTC day. Premium `gpt-5.4`
requires `ENABLE_PREMIUM="true"`; its separate default cap is 200,000. These are
app limits below the owner's displayed 2,500,000 / 250,000 sharing allowance;
they do not verify eligibility, model inclusion, provider reset timing or usage
by other projects. Verify free billing in OpenAI Usage before increasing traffic.
Sharing eligibility is not a substitute for API account access/billing setup.

Daily counters are durable D1 reservations. An atomic SQL statement admits a
request only if existing charges plus conservative UTF-8 input bytes, protocol
margin and maximum output fit the cap. Successful usage replaces the reservation.
Unknown completion keeps its reserved charge; failed keys do not auto-retry.
These controls limit this proxy, not your entire OpenAI organization. They are
not a guarantee of zero OpenAI charges. Set either cap to `0` to stop new calls.
No automatic paid overage or model upgrade exists. The Narrative Director leaves
routine briefs on deterministic templates and spends API tokens on feature/cover
stories (or explicit user expansion). Accepted feature stories use two Responses
calls: a writer and an independent grounded verifier. Both are counted in the same
D1 reservation. Writer output is capped by story depth (up to 7,000 tokens for a
cover); the verifier has a smaller cap. Calls use no tools, no reasoning effort,
and `store:false`. That flag does not disable your organization data-sharing choice.

`GET /status` with the same Bearer proxy token reports accounted (including
reserved) tokens and configuration availability. `/render` is the sole generation
endpoint. Never publish the token in examples, URLs, logs or shell history.
Workers Free/D1 limits can cause errors; the game then uses templates.

## Explicit live evaluation

Set `NARRATIVE_EVAL_URL`, `NARRATIVE_EVAL_TOKEN` and `NARRATIVE_EVAL_CONFIRM=1`
in a private local environment, then run `npm run eval:narrative:live`.
This sends one synthetic championship packet through the authenticated proxy,
validates the output and verifies offline reuse. The world/event key is stable,
so rerunning reuses the backend result. It prints prose, timing and token usage,
never credentials. This is intentionally excluded from CI.

## Editorial scope and expansion

The current renderer is a grounded feature writer, not an unrestricted fiction
writer. Fact Packet v2 supplies primary facts plus sparse older context from the
same players/clubs. The writer may combine multiple cited claims into newspaper
paragraphs and use that history for continuity. High-risk transaction/draft/
injury/development/career relations still remain verbatim when cited.

Structured Outputs alone is never treated as a fact checker. The browser-side
validator first rejects unsupported names/numbers, protected-claim changes and
forbidden pseudo-quotes/psychology. The Worker then sends the candidate article
and exact packet through a second independent verification call. Any unsupported
claim, causal leap, relation swap or future knowledge rejects the generated prose
and falls back to the template. ANALYTICAL output remains disabled until typed
derived claims and rules are introduced.

## Operations and limits

- Cached articles are independent of current model availability. Metadata records
  model alias, prompt/renderer/style/validator versions, time and token usage.
  Model aliases can change upstream; wording is frozen by the saved snapshot.
- No automatic regeneration on deployment/version changes. Compatible older
  snapshots are retained; a fact hash or validator mismatch falls back/generates
  only on a visible request. Manual rewrite increments a revision, keeping history.
- Pending/failed D1 records prevent an uncertain call being silently sent twice.
  A manual rewrite is an explicit new revision and may consume tokens. An upstream
  timeout may still have consumed tokens; exactly-once billing is not promised.
- There is no cloud game-save sync. D1 holds generated prose and request accounting,
  not the simulation. Import/export carries the local world ID and prose archive.
- Browser prose uses optional year sidecars. Broken/missing prose does not invalidate
  canonical save facts; it falls back. Facts retain their existing strict corruption
  behavior. Save commits are serialized per backend/slot to avoid late article writes
  racing game saves. Presentation chunks can grow with deliberately generated articles;
  no full-world prose generation occurs. Existing v4 rehydration remains eager.
- Worker publication and a real API smoke test require the owner's external setup;
  mocked CI success does not establish live credentials or complimentary billing.

## References

- [Responses Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)
- [OpenAI key management](https://developers.openai.com/api/reference/overview)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
