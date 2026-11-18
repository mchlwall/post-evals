# post-evals

A small TypeScript harness for evaluating LLM outputs.

## What it does

Takes a set of test cases, sends each to a model, scores every answer with one or more scorers, and writes the results to JSON and CSV. It can diff a run against an earlier one, render a Markdown report, and fail CI when the pass rate drops.

It runs against Anthropic or a built-in mock provider that needs no keys. Adding another provider means implementing one small interface (`src/providers/types.ts`).

## Status

Everything runs and is tested offline with the mock provider, including the full CLI path and the `basic` example. The real Anthropic path (`src/providers/anthropic.ts`, including structured output for the LLM judge) is written against the SDK docs and unit-tested with a fake client, but it has **not yet been run against the live API**. Treat it as unverified until you do one small run (see Quickstart); a first real run could be `--limit 7` on a cheap model, which reaches the judge case. The `job-matcher` case study has no real results yet.

## Concepts

- **Case**: one input to evaluate, with an optional `expected` answer and free-form `metadata` that scorers read (`EvalCase` in `src/types.ts`).
- **Scorer**: a function `score(output, case)` that returns `{ score (0-1), pass, reason }`. Deterministic ones live in `scorers/`.
- **Suite**: a module that default-exports `defineSuite({ name, casesFile, scorers, ... })`. Cases are data (JSON or YAML); scorers are code. See `examples/basic/`.
- **Run**: one execution of a suite against one provider and model. It produces a `SuiteResult` with a `RunResult` per case (output, every scorer's verdict, pass/fail) and a summary (pass rate, mean score).

A case passes only if the model call succeeded and every scorer that applies to it passed.

## Quickstart

Needs Node 20 or later. The first three steps need no API keys.

```sh
npm install
npm test                                       # unit tests, mock provider
npm run eval -- run basic --dry-run            # run the example suite offline

export ANTHROPIC_API_KEY=...
npm run eval -- run basic --provider anthropic --model claude-sonnet-5-5
npm run eval -- report results/<the-file-it-printed>.json
```

`--dry-run` replays each case's `metadata.mockOutput` through the pipeline. It proves the plumbing works. It says nothing about model quality, and the LLM judge always passes under it.

Other useful flags on `run`: `--limit <n>` (first n cases), `--compare <older results.json>` (per-case regression diff), `--min-pass-rate <0-1>` (exit 1 below it), `--concurrency`. Transient API errors (429, 5xx) are retried by the Anthropic SDK itself; the runner does not add its own retries.

### Write your own suite

1. Put cases in `examples/<name>/cases.json`: `[{ "id": "a", "input": "...", "expected": "...", "metadata": {...} }]`.
2. Add `examples/<name>/suite.ts`:

```ts
import { keywords, length, when, hasMeta } from '../../scorers';
import { defineSuite } from '../../src/suite';

export default defineSuite({
  name: 'my-suite',
  casesFile: 'cases.json',
  scorers: () => [when(hasMeta('keywords'), keywords()), length({ unit: 'words', max: 50 })],
});
```

3. `npm run eval -- run my-suite --dry-run`. Without `metadata.mockOutput` the mock echoes the prompt back, so give each case a `mockOutput` if you want a meaningful dry run.

## Scorers

Scorers are factories returning `{ name, score(output, case) }`. Deterministic ones take defaults as options, and a case can override them through `case.metadata.<key>`, so suites stay plain data. `when(predicate, scorer)` limits a scorer to the cases that configure it.

| Scorer        | Metadata key | Behavior                                                                       |
| ------------- | ------------ | ------------------------------------------------------------------------------ |
| `length`      | `length`     | min/max in chars, words, or estimated tokens (chars / 4).                      |
| `keywords`    | `keywords`   | `present` / `absent` lists; score is the fraction of checks satisfied.         |
| `regex`       | `regex`      | pattern must (or must not) match.                                              |
| `jsonSchema`  | `schema`     | output parses as JSON and validates against the case's JSON Schema (ajv).      |
| `exactMatch`  |              | trimmed output equals `expected`.                                              |
| `fuzzyMatch`  |              | 1 - normalized edit distance vs `expected`; character-level, not semantic.     |
| `llmJudge`    |              | a model scores the output 0-1 against a rubric and gives a rationale.          |
| `consistency` |              | samples the case n times; reports tier agreement and score standard deviation. |

Scorers throw on misconfiguration (no pattern, no `expected`) instead of passing silently. The runner records a throwing scorer as a failed score with the reason `scorer error: ...`.

To add a scorer, implement the `Scorer` interface, export it from `scorers/index.ts`, and add a colocated `*.test.ts`.

### LLM judge limitations

- **Not deterministic.** Claude models reject `temperature`, `top_p` and `top_k`, so the judge cannot be pinned to a low temperature. Output is forced to a JSON schema, but scores still vary run to run. Use `consistency` to measure that noise before trusting small score differences.
- **Judge bias.** Judges tend to favor longer, more confident answers and their own model family's style. The basic example judges with the same model it is testing, which is the weakest setup; use a different judge model where you can.
- **Rubric-bound.** Vague rubrics yield arbitrary scores.
- **Prompt injection.** The output under test is wrapped in tags and the judge is told to treat it as data. That reduces the risk but does not remove it.
- **Calibration.** Scores are not comparable across judge models or rubric versions. Spot-check against human labels.
- **Cost.** One extra model call per case per judge scorer.

### Consistency

`consistency` treats the output already produced as sample 1 and makes `n - 1` extra calls (default `n = 3`), one at a time. It measures agreement, not correctness: a model that is consistently wrong passes.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: typecheck, lint, the unit tests, and the basic example with the mock provider (`--dry-run --min-pass-rate 1`). It uses no secrets, so it is safe for fork PRs and costs nothing.

The `--min-pass-rate` flag is the eval gate: the command exits 1 when the pass rate is below it. The `job-matcher` suite is not run in CI, because its data is private.

Not included, on purpose: a scheduled job that runs the suites against a real model and fails on a pass-rate drop. Add one when you have real runs to track. If you do, size the threshold to the suite: with 9 cases a single flipped case is an 11-point drop.

## Results

Every `run` writes two things to `results/`:

- `<timestamp>-<suite>.json`: the full `SuiteResult`: per-case output, every scorer's score and reason, latency, token usage of the main call, plus provider, model and git SHA. Git-ignored by default.
- `history.csv`: one row per run: `timestamp,suite,provider,model,pass_rate,mean_score,git_sha,cases`. Tracked in git.

Commands:

- `npm run eval -- report results/<file>.json [--out report.md]` renders a Markdown report: a summary table and per-case pass/fail with reasons.
- `npm run eval -- run <suite> ... --compare <older.json>` prints per-case regressions and improvements. A regression is a case that passed in the baseline and does not now.

Things to know when reading results:

- Result JSON contains full model outputs. If your inputs are private, do not commit it. Dry-run files contain your `mockOutput` text.
- `history.csv` records the case count, so a `--limit` smoke run is distinguishable from a full run. Don't compare their pass rates.
- Token usage covers the main model call only, not judge or consistency calls.

## Example: job-matcher

`examples/job-matcher/` evaluates a real prompt (grade a job post against a persona and rubric) against a private labelled golden set, with schema, tier, score-range, grounding and consistency scorers. The data is read from `ROLE_MATCH_DIR` at run time and never copied here. See `examples/job-matcher/README.md` for the case study.

## Layout

```
src/         types, providers (anthropic, mock), runner, results, compare, report, CLI
scorers/     the scorers and their tests
examples/    basic/ (runs offline) and job-matcher/ (private data)
results/     run output (JSON git-ignored; history.csv tracked)
```

## Development

```sh
npm run typecheck && npm run lint && npm test
```
