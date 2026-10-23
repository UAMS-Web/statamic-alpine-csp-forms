# Decision log

The canonical record of **why** this repository is the way it is: the reasoning and the **rejected alternatives** behind decisions that have closed. It is the guard against silently relitigating a settled decision.

**Consult it before acting.** Before proposing a change, reopening a question, or picking an approach, check here first: the path under consideration may already be a decided-and-recorded one, or an explicitly rejected one. If it is, follow the record (or make the case to revisit it); do not quietly re-decide.

**When a seam closes, record the verdict in both places.** Capture the *what*, *why* and rejected alternatives **here** (the cross-ticket index) **and** in the GitHub issue's `## Decision` section (the per-ticket record), keeping the two in sync. This file does not replace the issue tracker, which stays the system of record for a single ticket's status.

See the [`design-decision-forks`](../.claude/rules/design-decision-forks.md) rule for how a fork is surfaced and driven to resolution before its verdict lands here.

## How to add an entry

Oldest first, one entry per closed decision, so **a new entry is appended to the end of the file**. Keep it terse; the issue carries the depth. Each entry is preceded by exactly one blank line, which `scripts/check-decision-log-order.mjs` enforces along with the date order. The file is marked `merge=union` in `.gitattributes`, so two branches that each append an entry merge without a conflict.

```markdown
## YYYY-MM-DD: <short decision title> (<#issue or area>)

**Decision.** <what was decided, in a sentence or two>

**Why.** <the reasoning that settled it>

**Rejected.** <the alternatives considered, and why each lost>

**Companion.** <link to the GitHub issue holding the full reasoning>
```

---

## 2026-10-14: Started from the add-on template (repository setup)

**Decision.** This repository started from `UAMS-Web/statamic-addon-template`. It carries no synced files (`.agents/`, `.claude/`, `.cursor/`) and no `LICENSE`, and `composer.json` has no `license` field.

**Why.** The shared rules and skills reach a repository by onboarding it to the sync in `UAMS-Web/uams-claude-skills`, not by copying a snapshot that goes stale. The license waits on the general decision from UAMS legal in `UAMS-Web/uams-statamic#3039`.

**Rejected.** Snapshotting the synced files into the template: every new add-on would begin with a stale copy that conflicts with its first sync pull request. Copying a license from an existing add-on: legal has not decided which license applies.

**Companion.** `UAMS-Web/uams-statamic#3039`.

## 2026-10-15: Submit to Packagist, and license under MIT (UAMS-Web/statamic-alpine-csp-forms#6)

**Decision.** The add-on is submitted to Packagist, and its first release is a 0.x pre-release. It is licensed under MIT, with the same `LICENSE` text and holder line as `UAMS-Web/statamic-multisite-forms`, declared in `composer.json` (`"license": "MIT"`), the README and `SubmissionReadinessTest`. The Marketplace is not part of this decision.

**Why.** The site half of `UAMS-Web/uams-statamic#3073` requires the package by name, which needs it on Packagist. MIT matches the license `statamic-multisite-forms` already ships, so the two add-ons are consistent while the general decision from UAMS legal in `UAMS-Web/uams-statamic#3039` is still open.

**Rejected.** Waiting for `UAMS-Web/uams-statamic#3039` before submitting: it blocks the site half with no date. Submitting with no license: the package would be listed with none declared, which leaves hosts without terms to depend on. Choosing a different license from `statamic-multisite-forms`: two add-ons from one organization under different terms, with no decision behind the difference. If `UAMS-Web/uams-statamic#3039` decides differently, both add-ons change together.

**Companion.** `UAMS-Web/statamic-alpine-csp-forms#6`, `UAMS-Web/uams-statamic#3039`.

## 2026-10-22: The ruleset requires one aggregate check, and the drift check is removed (UAMS-Web/uams-claude-skills#301)

**Decision.** `ci.yml` ends in a `CI` job that `needs:` every other job and fails unless each reports `success`. The organization ruleset for this repository requires `CI`, `Attribution footer` and `Closing keywords` and no per-job name. `check-required-checks.yml`, `scripts/check-required-checks.mjs` and its test are removed.

**Why.** The ruleset listed one name per job, so every rename or added job meant editing the ruleset, and the drift check existed only to report when the two lists disagreed. With one aggregate name the lists cannot disagree: a job missing from the `needs:` list of `CI` is the only drift left, and the template in `UAMS-Web/uams-claude-skills` covers that.

**Rejected.** Keeping the drift check beside the aggregate: it would compare a list of three names with job names it no longer has to match. Gating `CI` on a remote-CI variable: this repository is public and runs every job on every pull request.

**Companion.** `UAMS-Web/uams-claude-skills#301`, `#292`, `#169`; `UAMS-Web/statamic-multisite-forms#198`.
