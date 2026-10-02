# Human Writing Integration

Finfold applies Human Writing automatically to every content output generated through `generateKitOutputs()`. It has no customer-facing setting or plan gate.

## Source And License

- Upstream inspiration: [KKKKhazix/human-writing](https://github.com/KKKKhazix/human-writing)
- Pinned source version: `1.0.0`, commit `22d20b672680e4c1a34e75aec550ff48d622ca59`
- Upstream license: MIT

Finfold does not execute, bundle, or modify the upstream Python script. It reimplements a small, language-aware subset in TypeScript for the Cloudflare runtime. The source version is stored as `human_writing_version` on newly persisted content kits.

## Runtime Behavior

1. Generation prompts require evidence-grounded, platform-native writing and prohibit literal `**` emphasis markers.
2. All outputs are deterministically normalized before streaming or persistence, so exposed Markdown bold markers are removed even when a rewrite cannot run.
3. A deterministic evaluator scans title, body, and CTA for explicit template phrasing, rhetoric pivots, inflated jargon, and mechanical short-paragraph rhythm.
4. Only outputs that fail those checks receive one rewrite request, using the generation request's model tier and normal provider failover path.
5. The rewrite must return JSON, improve the deterministic score, and pass existing numeric-claim grounding. Invalid, worse, timed-out, or unsupported rewrites fall back to the normalized original output.

The evaluator does not claim to detect whether a human authored text, prove factual accuracy, or guarantee engagement. Existing claim grounding remains responsible for numeric evidence, and platform performance data remains the source of truth for engagement outcomes.

## Language Scope

Chinese checks target common model signposts, rhetorical pivot phrases, and inflated business jargon. English checks target template openings and generic marketing language. Finfold deliberately does not import upstream rules that globally ban colons or dashes because those would damage English text, URLs, code, and platform-native formatting.

## Operations And Measurement

The capability is enabled by default for all Workbench generation. `HUMAN_WRITING_ENABLED=false` is a server-only incident switch that disables the optional rewrite request while retaining deterministic Markdown-marker cleanup.

Generation logs include rewrite attempts, fallbacks, scores, issue categories, model attempts, and the Human Writing version without recording generated text. `usage_events.metadata.humanWritingVersion`, `content_kits.human_writing_version`, quality score version 2, and existing `performance_metrics` support retrospective analysis by platform, goal, persona, and version.

Because the initial rollout is full population rather than an A/B test, observed CTR, saves, comments, or follower changes must be reported as correlations against matched historical baselines, not as a guaranteed causal lift.