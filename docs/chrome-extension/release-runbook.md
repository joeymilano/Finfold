# Chrome Extension V1 release runbook

## Private reply pilot

The private unpacked pilot uses the public development key in the extension manifest, with the exact origin `chrome-extension://gebbcemokglolnbocggbefmkjkfkcfhe`. This identity is not a store listing. Reply access is restricted by `FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS`; anonymous generation remains off. Migrations 100 (extension V1) and 101 (reply cache) must be present. Before enabling traffic, verify real account authentication, 3-Credit settlement, same-request replay and failure refund. The store-specific criteria below apply to public distribution.

## Submission blockers

Do not submit or enable traffic until every item is true:

- A Chrome Web Store draft exists and its stable 32-character extension ID is configured as the only production `FINFOLD_EXTENSION_ORIGINS` value.
- `supabase/migrations/100_chrome_extension_v1.sql` has been applied and checked in production.
- `FINFOLD_EXTENSION_AUTH_ENABLED`, `FINFOLD_EXTENSION_PAID_ACTIONS_ENABLED`, and `FINFOLD_EXTENSION_ANONYMOUS_ENABLED` remain false during backend deployment.
- The free-model provider console has been tested at quota exhaustion. It must hard-reject; any automatic pay-as-you-go behavior keeps anonymous generation disabled.
- Qwen free endpoints are explicitly `costClass: "free_pool"`; Qwen workspace, DeepSeek, Letta, and every unlabelled provider remain `paid`.
- A reviewer-only account with at least 30 Credits exists and its credentials are supplied only through the private dashboard field.
- The final ZIP, not only `dist/`, passes `npm run package` and is loaded in a clean Chrome profile for a cold-service-worker test.
- Store text, Privacy Practices answers, in-product disclosure, and actual behavior match.

## Rollout

1. Enable auth only for trusted testers.
2. Enable paid actions after a real 3-Credit and 24-Credit reserve/settle/refund test.
3. Set the anonymous daily limit to 10, then enable anonymous generation.
4. Verify `extension_anonymous_actions` contains no URL, domain, text, or result fields and no free request appears in `extension_model_usage` with `provider_cost_class = 'paid'`.
5. Increase the daily limit only after the free-pool hard stop and zero-paid-provider invariant remain clean.
6. Cap production at 100 anonymous attempts per UTC day.

## Seven-day cost check

Use actual recognized revenue for the paid extension requests in the same seven-day window. Do not substitute list price when refunds or discounts apply.

```sql
select
  count(distinct request_id) as paid_requests,
  sum(credit_cost) as credits_charged,
  sum(coalesce(estimated_cost_usd, 0)) as model_cost_usd
from public.extension_model_usage
where created_at >= now() - interval '7 days'
  and provider_cost_class = 'paid';
```

`gross_margin = (recognized_revenue_usd - model_cost_usd) / recognized_revenue_usd`. Keep paid extension traffic closed when recognized revenue is unavailable or margin is below 70%.

## Automated reply/comment boundary

V1 must not script social websites or send messages. A later release may add a reply assistant only when it stays within the same reviewable-content purpose:

- read a user-opened conversation through an approved platform API;
- generate one candidate reply;
- show account, recipient/thread, and full text;
- require an explicit user confirmation for every send;
- use the platform's official API, scopes, rate limits, opt-out and approval process;
- keep prospecting, unsolicited engagement, bulk comments, and DOM automation prohibited.

X AI auto-replies require prior explicit written approval and X forbids website scripting. LinkedIn Community Management is a vetted API product. Reddit commercial automation may require review or a separate agreement. No general Xiaohongshu social-comment API is assumed; keep it manual unless written platform approval is obtained.
