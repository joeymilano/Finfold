# Font Awesome resilience policy

Finfold uses Font Awesome Pro as a design source, but normal development,
continuous integration, production builds, and the running application do not
depend on Font Awesome npm packages, its private registry, Kit service, Pro
CDN, or an active Package Token. Every semantic icon also has a Lucide fallback.

License status: the account owner confirmed `Perpetual License` in Font
Awesome Billing on 2026-08-04. The frozen Font Awesome Pro 7.3.1 snapshot is
therefore approved for continued use after the subscription service ends.

## What happens when a subscription ends

- Existing Finfold deployments keep rendering because icons are bundled SVG
  data, not remotely served Kit or CDN assets.
- Font Awesome shuts off subscription services such as Kits, Pro CDN, private
  npm access, support, and access to newly released versions.
- A perpetual license may continue using the latest Pro version released while
  the subscription was active.
- A limited-use plan may not continue using Pro icons after the subscription
  ends. Confirm the exact billing plan in the Font Awesome account before
  cancellation or non-renewal.

Official references:

- https://fontawesome.com/help
- https://fontawesome.com/license
- https://docs.fontawesome.com/web/setup/packages

## Finfold's failure boundary

Font Awesome packages are used only temporarily to refresh
`components/ui/fontawesome-pro-snapshot.ts`. That generated file contains the
small icon subset actually used by Finfold. The regular dependency graph has
no Font Awesome package at all; the adapter renders the local SVG data itself.

If the local definition is malformed, the adapter automatically renders its
matching Lucide icon. During a broader incident or a license transition, force
the whole App onto Lucide at build time:

```bash
NEXT_PUBLIC_FINFOLD_ICON_PROVIDER=lucide npm run build
```

Use `auto` for the normal Font Awesome-first behavior. Both providers preserve
the same semantic component names and `data-fin-icon` hooks, so feature code
does not change.

Run the following before a release:

```bash
npm run icons:check
```

Refreshing the snapshot is an intentional licensed maintenance operation:

1. Confirm the Font Awesome subscription is active and the creator has a
   covered seat.
2. Temporarily install the exact Pro package versions used by the adapter.
3. Run `npm run icons:snapshot`.
4. Review the generated diff, run `npm run icons:check`, then remove the private
   packages from the normal dependency graph again.
5. Regenerate and review the Lucide map with `npm run icons:fallbacks` whenever
   semantic icon exports are added or removed.

## Repository rules

- Keep this repository private while it contains the licensed Pro snapshot.
- Never publish the snapshot as a reusable icon package or copy it into a
  public/open-source repository.
- Never commit a Package Token. Store it only in local or CI secrets when a
  licensed refresh is being performed.
- If the plan is limited-use rather than perpetual, replace the snapshot with
  Font Awesome Free icons or force Lucide before the subscription end date.
