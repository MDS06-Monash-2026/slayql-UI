# SlayQL: the story for the final report and slides

Written 27 September 2026 for the team, to adapt into the final report, poster and slides. All results below were generated with `deepseek/deepseek-v4-flash` through OpenRouter. On 29 September the app moved to a configurable provider: OpenTK in development (`deepseek-v4.1-flash`, `glm-5.3`), or Together AI (`deepseek-ai/DeepSeek-V4-Flash-0731`, `moonshotai/Kimi-K3`). New evaluation runs use a separate cache for each model; say which provider and model produced any number you quote. Every number here comes from a results file named beside it. Re-run the evaluation before quoting a number if the code has changed since this date.

## 1. The one-paragraph story

We set out to make an AI analyst more accurate on enterprise databases, and found that accuracy was not the bottleneck we could fix. Our schema-linking engine (C-CaSE) answers 45.89% of Spider 2.0-Lite questions correctly, and a correct query is often generated but not chosen. The practical problem for a business is that it cannot tell the right half from the wrong half. So SlayQL checks every answer for the mistakes that distort business figures, compares independently written queries, and decides from a calibrated confidence whether to answer, add a caveat, ask which definition is meant, or hand the question to an analyst. On business questions this cuts wrong answers stated as fact from 26.9% of questions to none, while answering 73% immediately. It also learns from the analyst's review decisions how far it can be trusted on each database.

## 2. How the two repositories fit together

| Part | Repository | Question it answers | Headline result |
| --- | --- | --- | --- |
| Engine: schema linking and SQL generation | `C-CaSE` | Can an agent find the right tables in a large schema and write the SQL? | 251/547 (45.89%) on Spider 2.0-Lite with deepseek-v4-flash |
| Product: trust layer, review queue, reports | `slayql-UI` | Can a business tell which answers to trust? | Silent wrong answers 26.9% → 0% on the business trap set |

The bridge between them is a finding from the engine work.

**The weak step is choosing, not finding.** On BIRD dev (C-CaSE v1.8, 5 candidates per question):

- a correct query was among the candidates for 68.77% of questions;
- the selector picked it for only 56.19%;
- 193 questions were lost at selection;
- table recall was close to 100%, because on small schemas the linker keeps almost everything.

Source: `C-CaSE/run/bird_dev_v18_full/`, and `SLAYQL_PUBLICATION_PLAN_ARR_OCT2026.md` section 2.4.

The same-model comparison with AutoLink on 178 Spider 2.0-Lite questions (40.4% against 39.9%, 16 questions better and 15 worse) shows no meaningful accuracy gain from better linking alone. That is why the product focuses on deciding which answer to trust.

Say this plainly in the report. It is a stronger contribution than a marginal leaderboard gain: a negative result about linking that motivates a measurable design.

## 3. The problem, shown on our own data

On the demo database, "What is total revenue from completed orders?" has one right answer, 2,159,970.05. Three SQL queries that all run without error return:

| Query | Result | Why |
| --- | --- | --- |
| Sum over completed orders | 2,159,970.05 | Correct |
| Joined to order lines first | 6,535,519.28 | Each order counted about 3 times (fan-out) |
| All statuses | 3,241,298.23 | Includes cancelled and refunded orders |

A manager cannot tell these apart. Source: `docs/PROJECT_DIRECTION.md` section 2.2, reproduced by `backend/tests/test_verification.py`.

## 4. What SlayQL does

Every answer passes through the trust layer (`backend/app/verification/`):

| Check | Catches |
| --- | --- |
| Grain | Totals inflated by joins; measured with a probe query (for example "rows repeated 2.4 times") |
| Definition | Business terms computed with the wrong filter, or with no agreed definition (unfiltered cancelled statuses, or AutoCount-style `Cancelled = 'T'` flags) |
| Period | Relative dates past the end of the data; date-only upper bounds on timestamps |
| Filter value | A text filter that matches nothing, or that differs from the data only in letter case |
| Coverage | A query that relabels unrelated data as something the database does not contain (`customer_id AS salesperson_id`), or a "which X" question about something no table represents |
| Entity count | "How many customers" answered by counting order rows; measured with a probe of rows against distinct entities |
| Sanity | Empty or all-NULL results; totals over truncated results |
| Consensus | Independently written queries that disagree |

A logistic confidence score is then compared with the threshold c / (1 + c), where c is how much worse a wrong answer is than a right one. The answer is one of four outcomes: confident, caveat, clarify (showing each reading's number) or hand-off to an analyst.

## 5. Results

### 5.1 Business trap set

52 questions on the demo company: 40 by the team plus 12 in Bahasa Malaysia or mixed language. Model deepseek-v4-flash; the configurations share the same generated SQL. Source: `backend/eval/results/trap.json`.

| Configuration | Answered immediately | Wrong answers stated as fact | Right answers wrongly withheld |
| --- | --- | --- | --- |
| B0: plain pipeline | 94.2% | 26.9% | — |
| B1: deterministic checks | 75.0% | 1.9% | 0% |
| B3: full trust layer | 73.1% | 0% | 0% |

On the 30 held-out questions: 33.3% → 0%, with 66.7% answered and no false alarms. All five questions the data cannot answer (three English, two Malay) are handed off.

By language (all items):

| Language | Questions | Wrong answers stated as fact |
| --- | --- | --- |
| English | 36 | 27.8% → 0% |
| Bahasa Malaysia | 15 | 26.7% → 0% |
| Mixed | 1 | 0% → 0% |

The last miss before 29 September, a Malay question about salespeople whose SQL silently dropped the concept, is now caught by the answer-subject check.

Caveat: the team wrote this set, so it may favour our checks. `backend/eval/datasets/external_items.jsonl` accepts held-out questions written by outsiders, reported separately (see `docs/HELD_OUT_QUESTIONS.md`).

### 5.2 BIRD Mini-Dev (public benchmark)

233 held-out questions on 11 unfamiliar databases, without evidence hints. Source: `backend/eval/results/bird.json`.

| Configuration | Answered | Wrong answers stated as fact | Wrong answers caught | Right answers withheld |
| --- | --- | --- | --- | --- |
| B0: plain pipeline | 88.0% | 59.7% | — | — |
| B1: checks | 77.7% | 48.9% | 18.0% | 0% |
| B3 at c = 1 (answer if ≥ 50% sure) | 42.1% | 15.9% | 74.1% | 7.6% |
| B3 at c = 4 (≥ 80%) | 0% | 0% | — | — |

The plain pipeline is right on only about 28% of these questions. The calibrated confidence never reaches 80%, so at the default setting SlayQL declines everything. On a database where it is usually wrong, that is the correct behaviour. Calibration error (ECE) is 0.08.

**With BIRD's evidence hints** (a sentence of domain knowledge per question, as in the published benchmark setting). Source: `backend/eval/results/bird-evidence.json`.

- The plain pipeline is right on 49.0% of all 500 questions, and 42.9% of the test half.
- At c = 1, the trust layer answers 67.4% of the test half. Wrong answers stated as fact fall from 48.1% to 27.9% of questions, with 10% of right answers withheld.
- At c = 4 it answers none. The calibration was fitted on 267 questions, so treat strict thresholds on this run as noisy. The hints add derived concepts, such as rates and differences, that the checks were not designed around.

### 5.3 It learns from the analyst

Calibration does not transfer between databases. A model fitted on BIRD made the demo hand off almost everything. So each data source starts from a default prior and is refitted from its own review queue: an analyst confirming an answer labels it right, and correcting it labels it wrong.

Simulated on BIRD, reviews come from the fit half and scoring is on the test half, averaged over 20 random orders. Source: `backend/eval/results/learning-bird.json`, produced by `backend/eval/learning_curve.py`.

| Analyst reviews | Wrong answers stated as fact at c = 4 | Calibration error |
| --- | --- | --- |
| 0 (default prior) | 34.8% | 0.39 |
| 20 | 8.7% | 0.29 |
| 40 | 1.6% | 0.22 |
| 80 | 0% | 0.18 |
| 267 | 0% | 0.11 |

Learning only from hand-offs, which is the realistic case because analysts mainly see what SlayQL escalates, reaches 5.6% after 40 reviews and 0% after 80.

This is the product's clearest differentiator: the tools we compared ship curated verified queries but do not recalibrate automatically from review decisions.

### 5.4 A validator bug the evaluation exposed

Re-running BIRD showed that the SQL validator rejected 126 of 443 generated queries (28%) before they ran. It treated CTE names as unknown tables, and it lowercased table names that the catalog stores in their original case. After the fix only 11 are rejected, all for real errors. Every BIRD figure above uses the fixed validator (harness version v2).

This is worth a paragraph in the report: an evaluation harness that exercises the same code as the product catches product bugs.

## 6. The product around the trust layer

- **Report Studio.** A business question becomes a management report. Every KPI and chart is its own query, run on the full data and checked. The written summary may only restate computed findings: sentences with numbers not in the findings, or claims of cause, are removed automatically. Saved reports refresh on new data without AI calls. A typical report costs USD 0.0003–0.001 in AI calls.
- **Review queue and definitions library.** Hand-offs arrive with their SQL and evidence. Approved definitions make every later answer consistent, and each decision recalibrates confidence for that data source.
- **Malaysian integration path.** Read-only SQL Server connector for AutoCount; an AutoCount-style distributor sample (invoices, credit notes, receipts, e-invoice status); privacy mode for PDPA; questions in Bahasa Malaysia.
- **Trust or Bust.** A live audience game that doubles as a small user study. It was load-tested with 50 simulated phones through all 11 rounds with no errors; state reached every phone within 24 ms at the 95th percentile.

## 7. Limitations to state

1. The trap set is small and team-written; external items are pending.
2. The main BIRD results are without evidence hints, which is harder than the published setting. With hints (section 5.2), accuracy rises to 49%, but calibration at strict settings is noisy.
3. Consensus adds little on its own (B2): independently written queries share the same business assumptions, so the deterministic checks do most of the work.
4. The confidence prior tops out at 88% without an approved definition. At a penalty of 9 or more, SlayQL answers nothing until the data source has learned from reviews or has approved definitions.
5. No user study results or company pilot yet. The business value is argued from measured error rates, not from observed time or money saved.
6. The SQL Server connector is tested up to the network layer, not against a live AutoCount server. There is no Firebird connector for SQL Account; its data can be exported and uploaded.

## 8. Suggested slide order (10 minutes)

1. The Monday meeting: three plausible revenue figures (section 3).
2. "AI is often wrong, and you can't tell when": 45.89% on Spider 2.0-Lite; right answers generated but not chosen.
3. What SlayQL does: four outcomes, with one live example.
4. Results on business questions: 26.9% → 0%.
5. Honest results on BIRD: the dial between coverage and risk.
6. It learns from your analyst: 34.8% → 1.6% after 40 reviews, 0% after 80.
7. Report Studio: a checked management report in about 30 seconds.
8. Malaysia: AutoCount, Bahasa Malaysia, PDPA.
9. Trust or Bust (live).
10. Limits and next steps: pilot, interviews, external questions.
