# Case study: evaluating a job-matching prompt

This example evaluates an LLM task from a separate project (role-match): grade a job post against one candidate persona using a written rubric, and return a structured report with a tier (Apply, Stretch or Skip).

The persona, rubric, job posts and labelled reports are private, so none of them are in this repo. The suite reads them from a role-match checkout at run time.

```sh
export ROLE_MATCH_DIR=/path/to/role-match      # default: ../role-match
npm run eval -- run job-matcher --provider anthropic --model <model-id> --limit 3   # cheap smoke run first
npm run eval -- run job-matcher --provider anthropic --model <model-id>
```

## The problem

A grading prompt is easy to write and hard to trust. Changing the rubric or the persona can silently shift tiers for dozens of jobs, and a model can return a plausible-looking report that is wrong, ungrounded, or different on every run. Before this harness the only check was reading reports by hand.

## Eval design

- **Task.** The system prompt holds the instructions, persona, rubric and report JSON Schema. The user message is one job post. The model returns one report as JSON.
- **Cases.** One per labelled report in role-match (36 at the time of writing). Input is the job post, `expected` is the labelled tier, and the labelled report's overall score gives a tolerance band (default ±1.0 on the 1-10 scale).
- **Labels.** The labels are earlier model-graded reports that were reviewed and, in places, regraded by hand. They are a reference, not ground truth: a failure can mean the model is wrong or the label is. Treat tier disagreements as prompts to re-read the case.

| Scorer | What it checks | Type |
| --- | --- | --- |
| `jsonSchema` | Output parses and validates against role-match's report schema | deterministic |
| `tierMatch` | Tier equals the labelled tier | deterministic |
| `scoreInRange` | Overall score within the labelled score ± tolerance | deterministic |
| `grounding` | Missing criteria are worded from the job post; gaps and strengths are findable in the post, persona or rubric (word overlap) | deterministic, crude |
| `consistency` | Three runs agree on tier, with overall-score standard deviation at most 0.5 | repeated sampling |

Notes on the choices:

- The report schema uses `oneOf`, `if/then` and patterns that strict structured-output modes reject, so the schema is given to the model in the prompt and enforced after the fact by `jsonSchema`.
- `consistency` runs on one representative case per tier, not all of them. Each extra sample is a full call carrying the persona and rubric.
- `grounding` is word overlap. It catches invention, not subtle misstatement, and it penalises honest paraphrase. It was calibrated by replaying the labelled reports through it (`--dry-run`): a first version that checked gaps and strengths against a single source failed about a third of the labelled reports, because their narrative text mixes post, persona and rubric. Gaps and strengths are therefore checked against all three combined, which is a weaker test than "strengths appear in the persona". Only missing criteria are checked against the post alone.
- No LLM judge is used. Tier, score and schema are all checkable without one, and the judge's limits (see the main README) would add noise.

## Results across rubric versions

The suite name includes a short hash of `rubric.md` (`job-matcher-<hash>`), so every run in `results/history.csv` is tied to the rubric it used. Fill the table from that file after real runs.

| Rubric version | Model | Pass rate | Mean score | Tier match | Notes |
| --- | --- | --- | --- | --- | --- |
| _not yet run_ | | | | | |

How to fill it: `npm run eval -- report results/<file>.json` gives per-scorer detail, and `--compare <older results file>` lists which cases regressed or improved between two runs.

## What changed between versions

The role-match history records these changes. Re-run the suite after each and record the effect here; the effects below are open questions, not findings.

- **Pay anchors tied to the persona's salary tiers.** The rubric's pay scoring was changed to read the tiers from the persona instead of remembered numbers, and every job was regraded. Expected effect: movement in the "Other" dimension and in jobs near a tier boundary.
- **Persona skills added.** Two tools were added to the persona and five jobs were regraded, moving one from Stretch to Apply. Expected effect: a labelled tier flips, so the same model output can switch from pass to fail on `tierMatch` with no model change. This is the main reason the labels and rubric version must be recorded together.

## Limitations

- Labels and rubric change together, so a pass-rate change between rubric versions mixes model behaviour with label changes. Compare within one version first.
- 36 cases is small. One flipped case moves the pass rate by almost 3 points, so do not read much into differences smaller than that.
- Consistency is measured on three cases.
