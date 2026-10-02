# ADR-001: Single-user tenancy for Finfold 1.0

- Status: Accepted
- Date: 2026-08-01
- Decision owner: Finfold

## Context

Finfold is marketed to founders and small teams, but the current product does
not implement shared membership, tenant roles, or collaborative ownership.
Every authenticated product record is already anchored to a Supabase user ID.
Introducing a `workspace_id` label without a real membership model would make
authorization and observability look stronger than they are.

## Decision

For Finfold 1.0, one authenticated Supabase user is one tenant.

- `auth.users.id` is the tenant identity.
- User-owned tables use `user_id` as the ownership column. A profile row whose
  primary key is the Supabase user ID may use `id = userId` instead.
- Browser-facing API handlers that use the service-role client must derive the
  caller from the authenticated server session and include that identity in
  every user-owned read, update, and delete query.
- UUIDs supplied by a client are locators, never authorization. A query for a
  client-supplied kit, output, order, token, report, or generation run must also
  include the authenticated owner condition and return `404` when it does not
  match.
- Inserts and upserts must set `user_id` from the authenticated session or a
  previously owner-scoped server record, never from request JSON.
- Service-only cron, webhook, reconciliation, and founder-evidence endpoints
  are explicit administrative exceptions. They require their own secret or
  administrator gate and must derive downstream user IDs from trusted database
  rows or verified provider metadata.
- Public kit sharing remains an explicit projection through a share record and
  does not grant collaborative write access to the underlying tenant data.
- Structured logs keep `user_id`; `workspace_id` remains absent. `user_id` must
  not be copied into a fictional workspace field.

## Product boundary

Finfold 1.0 will not expose:

- member invitations;
- Owner/Admin/Editor/Viewer roles;
- shared Brand Memory editing;
- shared billing ownership; or
- cross-user content review or publishing permissions.

References to “small teams” describe the target customer, not a multi-user
authorization promise.

## Consequences

- Authorization remains simple and auditable for the 1.0 release.
- A user cannot read, mutate, delete, or bill against another user's UUID even
  when a route uses a service-role Supabase client that bypasses RLS.
- True team collaboration requires a replacement ADR, `workspaces` and
  `workspace_members`, a role matrix, ownership backfill, revised RLS, and an
  explicit decision about whether billing and Credits belong to an account or
  a workspace.

## Verification

The production-readiness tenant-boundary tests exercise cross-user UUIDs for
content kits, outputs, performance writes, Brand Memory, QR-code billing
orders, MCP tokens, and generation runs. Source-policy assertions also guard
the corresponding owner filters and the absence of a synthesized
`workspace_id`.
