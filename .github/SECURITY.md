# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability in Finfold, please do **not** open a public issue.

Email **support@finfold.app** with:

- a description of the issue and its impact,
- steps or a proof of concept to reproduce it,
- the affected version / commit.

We will respond within 7 days. Please do not test against production accounts you do not own.

## Scope Notes

- Never commit real credentials. All keys are injected through environment variables or Worker secrets; `.env.example` must only contain empty values or `REPLACE_WITH` placeholders.
- CI runs gitleaks over the full commit history on every push and pull request.
