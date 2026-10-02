# Chrome Web Store reviewer instructions

## Test path 1 — anonymous value

1. Install the submitted ZIP and pin Finfold.
2. Open a normal public article page with at least 20 visible characters.
3. Click Finfold. Confirm that the page title appears and no account is required.
4. Choose one platform and click Generate.
5. Read and accept the first-send disclosure.
6. Confirm that one complete, untruncated result appears and that Copy full post works.
7. Try another anonymous generation and confirm it is rejected before generation.

## Test path 2 — save and paid generation

Before submission, replace the fields below with a dedicated reviewer-only account. Never commit its password or recovery information.

- Reviewer account email: supplied privately in the Chrome Web Store dashboard
- Reviewer account password: supplied privately in the Chrome Web Store dashboard
- Account setup: at least 30 Credits; no production customer data

1. Generate the anonymous result above and click Save this result.
2. Sign in through the Finfold window and approve the extension connection.
3. Confirm the existing result is saved without a second AI generation or Credit charge.
4. Return to the side panel and choose Generate all 4 platforms.
5. Confirm four complete results and a 24-Credit deduction.

## Test path 3 — reply pilot auto-send (private pilot accounts only)

Requires the reviewer account to be allowlisted in `FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS` and to hold Credits.

1. Sign in to the extension, open one of the reviewer's own posts on Xiaohongshu or LinkedIn, and click Finfold.
2. Confirm the panel auto-captures the visible comments locally; picking one fills the comment field (manual paste also works).
3. Confirm the identity and disclosure, generate the reply (3 Credits), edit if desired, then press Confirm & send.
4. Confirm the extension types the reply into that comment's reply box and clicks send — only after the explicit button press.
5. If the reply box cannot be found in the DOM, confirm the panel discloses and sends a single screenshot for visual locating, and falls back to copying the reply if that also fails.

## Reviewer notes

- All page reading and reply sending are user-initiated: nothing is read or sent until the user opens Finfold on that tab, and no reply is typed or sent until the user presses Confirm & send for that specific comment. There is no background scraping, scheduled publishing, or reading of tabs the user did not activate.
- A one-off screenshot may be sent to Finfold's vision model solely to locate the reply box when DOM automation fails; it is used for that single request and never stored.
- Chrome-protected pages, the Chrome Web Store, and restricted PDF viewers intentionally show a readable error state.
- Anonymous generation deliberately stops if the verified free model pool is unavailable; it never falls back to a paid provider.
- Contact: support@finfold.app
