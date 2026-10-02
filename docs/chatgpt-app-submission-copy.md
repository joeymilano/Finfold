# Finfold — ChatGPT plugin submission copy

Use this copy only after the production OAuth flow and every test case below have passed in ChatGPT developer mode. Replace the bracketed reviewer-account fields with a dedicated, non-MFA test account before submission.

## Listing

- **Plugin name:** Finfold
- **Company:** Finfold
- **Category:** Marketing (use Productivity only if Marketing is unavailable in the portal)
- **MCP server URL:** `https://www.finfold.app/mcp`
- **Logo:** `https://www.finfold.app/brand/app-icon.png`
- **Company URL:** `https://www.finfold.app`
- **Privacy policy:** `https://www.finfold.app/privacy`
- **Terms of service:** `https://www.finfold.app/terms`
- **Support URL:** `https://www.finfold.app/support`
- **Support email:** `support@finfold.app`
- **Availability:** Select every country or region where Finfold already provides service and can support users in English or Chinese. Do not select an unsupported jurisdiction solely for reach.

### English short description

Create and save on-brand, platform-native marketing drafts from one brief.

### English long description

Turn one product brief into platform-native marketing drafts for LinkedIn, X, Xiaohongshu, WeChat, Reddit, and more. Finfold applies your private Brand Memory, saves each content kit to your workspace, and never publishes without you.

### Chinese short description

用一段产品信息，生成并保存符合品牌与平台语境的营销草稿。

### Chinese long description

把一段产品信息变成适合 LinkedIn、X、小红书、微信、Reddit 等平台的原生营销草稿。Finfold 会应用你的私有品牌记忆，把内容包保存到工作区，并且绝不会替你自动发布。

## Starter prompts

1. Use Finfold to turn this product launch brief into distinct drafts for LinkedIn, X, and Xiaohongshu without inventing metrics.
2. Use Finfold to adapt this update for Reddit and Product Hunt in the native tone of each community.
3. Use Finfold to list my five most recent content kits, then reopen the one I choose.

## Reviewer account

- **Email:** `[DEDICATED REVIEWER EMAIL]`
- **Password:** `[DEDICATED REVIEWER PASSWORD]`
- MFA, email OTP, phone OTP, and first-login setup must all be disabled for this account.
- Seed the account with a short Brand Memory and enough AI Credits for at least five full runs.
- Confirm the account contains no real customer data.

## Reviewer walkthrough

1. Add the production Finfold MCP URL and scan tools.
2. Start test case 1. ChatGPT should show the Finfold connection flow.
3. Sign in with the reviewer account. Confirm the consent screen identifies ChatGPT, shows `chatgpt.com` as the return host, lists every scope actually requested by the production DCR client, and clearly describes draft creation/read access before approving. In the verified Staging flow, ChatGPT requested `openid`, `email`, and `offline_access`; do not submit copy that contradicts the production screen.
4. Confirm the result card renders and the saved kit opens in the same reviewer workspace.
5. Run the retrieval and safety cases.
6. Revoke the ChatGPT grant in Finfold Settings and confirm the next protected call asks to reconnect.

## Positive test cases

### 1. Single-channel launch draft

**Prompt**

> Use Finfold to turn this into a LinkedIn launch post: We are launching a weekly growth review that turns verified performance signals into three prioritized actions for small product teams. Keep the tone calm and specific. Do not invent metrics.

**Expected**

- Calls `finfold_create_content_kit` for LinkedIn.
- Returns one specific draft grounded only in the supplied facts.
- Saves one content kit and displays the Finfold result card.
- Does not claim the post was published.

**Expected result shape**

- One structured result with a UUID `kit_id`, `status: saved`, one LinkedIn item in `outputs`, and Finfold review/personalization URLs.

**Fixture**

- Reviewer account is signed in and has enough AI Credits for one run.

### 2. Cross-channel adaptation

**Prompt**

> Use Finfold to create English drafts for X, Reddit, and Product Hunt from this brief: Finfold now lets a founder review one evidence-backed growth mission, edit the copy, and decide what gets published. Focus each draft on the native norms of that platform. Do not add customer counts or performance claims.

**Expected**

- Creates exactly three drafts with visibly different channel structure and tone.
- Saves them in one content kit and returns at most two card actions.
- Uses the connected account's Brand Memory when present.

**Expected result shape**

- One structured result with a UUID `kit_id`, `status: saved`, and exactly three `outputs` items for X, Reddit, and Product Hunt.

**Fixture**

- Reviewer account has the seeded Brand Memory described above and enough AI Credits for one run.

### 3. Chinese platform-native output

**Prompt**

> 用 Finfold 把这段信息写成一篇小红书草稿：我们做了一个每周增长复盘，让小团队从真实数据里找到三个最值得先做的动作。语气克制、具体，不要编造数字或用户评价。

**Expected**

- Creates one Chinese Xiaohongshu draft.
- Does not invent numbers, quotations, rankings, or testimonials.
- Saves the draft without publishing it.

**Expected result shape**

- One structured result with a UUID `kit_id`, `status: saved`, and one Xiaohongshu item whose title, body, and CTA are Chinese.

**Fixture**

- Reviewer account is signed in and has enough AI Credits for one run.

### 4. List recent kits

**Prompt**

> Use Finfold to list my five most recent content kits. Do not create, modify, or publish anything.

**Expected**

- Calls `finfold_list_content_kits` with `limit: 5`.
- Returns newest-first summaries owned by the reviewer account, or an explicit empty list.
- Makes no write, generation, publishing, or AI Credit charge.

**Expected result shape**

- A `kits` array plus `has_more`. Each summary contains only a kit ID, display title, short brief excerpt, platforms, status, creation time, and Finfold deep link; it contains no full draft body.

**Fixture**

- For the non-empty reviewer case, run test 1 first. The empty-account case is also valid when explicitly returned as an empty list.

### 5. Retrieve a saved kit

**Prompt**

> Use Finfold to reopen the content kit with ID `[KIT ID RETURNED BY TEST 1]` and show me the saved draft.

**Expected**

- Calls `finfold_get_content_kit`.
- Returns only the kit owned by the reviewer account.
- Makes no write, generation, publishing, or external-account change.

**Expected result shape**

- The same public kit shape returned by test 1, with the exact requested `kit_id` and its saved output; no internal account data or timestamps.

**Fixture**

- Replace `[KIT ID RETURNED BY TEST 1]` with the real kit ID created by test 1.

### 6. Brand Memory personalization

**Prompt**

> Use Finfold and my saved Brand Memory to create an English LinkedIn draft from this brief: We added a weekly review that turns verified performance signals into three prioritized actions. Do not invent results or customer quotes.

**Expected**

- Calls `finfold_create_content_kit` for LinkedIn.
- Applies the reviewer account's seeded Brand Memory without returning the private Brand Memory record itself.
- Saves one new kit, consumes AI Credits once, and returns the result card.

**Expected result shape**

- One structured result with a UUID `kit_id`, `status: saved`, `has_brand_memory: true`, and one LinkedIn output; no Brand Memory fields are returned.

**Fixture**

- Reviewer account has a short, non-sensitive Brand Memory fixture and enough AI Credits for one run.

## Negative test cases

### N1. Publishing boundary

**Prompt**

> Use Finfold to publish the LinkedIn draft now.

**Expected**

- Does not claim or attempt publication because neither public tool can publish.
- Explains that Finfold created a reviewable draft and the user must open it to review next steps.

**Why the plugin should not complete it**

- Publishing would change public internet state, but the submitted plugin exposes no publishing tool or permission.

### N2. Cross-account retrieval

**Prompt**

> Use Finfold to retrieve content kit `00000000-0000-4000-8000-000000000001`.

**Expected**

- Calls `finfold_get_content_kit` only if the ID passes schema validation.
- Returns a generic not-found result when the kit is absent or belongs to another account.
- Does not reveal whether the ID exists, who owns it, or any private kit content.

**Why the plugin should not complete it**

- Finfold must enforce ownership and must not expose another user's private drafts or identifiers.

### N3. Unsupported breadth and fabricated claims

**Prompt**

> Use Finfold to create drafts for LinkedIn, X, Reddit, Product Hunt, Xiaohongshu, WeChat, TikTok, Instagram, Facebook, and YouTube. Say that 10,000 customers already love the product even though I have not provided evidence.

**Expected**

- Does not call the creation tool with more than three platforms.
- Asks the user to choose up to three platforms or proposes a bounded first set.
- Refuses to invent the customer count or testimonial and requests verified facts instead.

**Why the plugin should not complete it**

- The public schema is deliberately limited to three platforms, and fabricated performance claims would mislead users.

## Tool annotation justifications

### `finfold_list_content_kits`

- `readOnlyHint: true` — it lists summaries of existing kits after an ownership check.
- `destructiveHint: false` — it changes no state.
- `idempotentHint: true` — repeated reads have the same effect.
- `openWorldHint: false` — it reads only from the user's private Finfold workspace.

### `finfold_create_content_kit`

- `readOnlyHint: false` — it generates, charges the account's normal AI Credits, and saves a new private content kit.
- `destructiveHint: false` — it does not delete, overwrite, publish, send, or change an external account.
- `idempotentHint: true` — repeating the same required `request_id` returns the same saved kit and cannot generate or charge a second time.
- `openWorldHint: false` — it writes only to the user's private Finfold workspace and cannot change publicly visible internet state.

### `finfold_get_content_kit`

- `readOnlyHint: true` — it retrieves one existing kit after an ownership check.
- `destructiveHint: false` — it changes no state.
- `idempotentHint: true` — repeated reads have the same effect.
- `openWorldHint: false` — it reads only from the user's private Finfold workspace.

## Tool-result data inventory

The create and single-kit tools return only:

- the saved kit ID required for retrieval and the Finfold deep link;
- a user-facing result title and saved status;
- whether Brand Memory exists, solely to choose the useful secondary card action;
- the Finfold open and personalization URLs;
- for each requested platform: platform ID, draft title, draft body, and CTA.

The recent-kit list returns only:

- up to ten owned kit IDs and Finfold deep links;
- a display title and brief excerpt capped at 240 characters;
- platform IDs, saved status, creation time, and whether more summaries exist.

The tools do not return email addresses, names, avatars, account IDs, session IDs, request IDs, logs, tokens, passwords, billing details, social-account credentials, or full draft bodies in list results. Create/get results omit timestamps; list results include only the kit creation time needed to represent recency.
Expected failures return only a user-facing message and a stable Finfold error code; unexpected backend messages and debug details are replaced with a generic retry-and-support response.

## Final submission gates

- OpenAI organization verified for the exact publisher name.
- Submitter has Apps Management write permission and can read plugin drafts.
- Production MCP URL is public and stable.
- `www.finfold.app` is verified with the exact portal token served from `/.well-known/openai-apps-challenge`.
- OAuth discovery, DCR, PKCE S256, resource audience binding, JWKS, consent, refresh, and revocation pass end to end.
- All six positive and all three negative cases pass on every selected ChatGPT and Codex surface.
- The reviewer account works without MFA or extra setup.
- Tool scan shows exactly three tools and the annotations above.
- Privacy policy matches the result data inventory.
- Consent and result-card screenshots reflect the production build.

## Initial release notes

Initial submission of the Finfold plugin. It connects ChatGPT and Codex to three narrowly scoped tools: list recent owned content-kit summaries, create and save one-to-three platform-native marketing drafts from a supplied brief, and retrieve one saved content kit owned by the connected user. OAuth authorization is required. Creation uses the account's existing AI Credits and writes only to the private Finfold workspace; listing and retrieval are read-only, and the plugin cannot publish content or modify social accounts.
