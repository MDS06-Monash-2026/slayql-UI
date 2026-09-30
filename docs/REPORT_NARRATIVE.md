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
| 0 (default prior) | 33.9% | 0.39 |
| 20 | 9.3% | 0.29 |
| 40 | 1.6% | 0.22 |
| 80 | 0% | 0.18 |
| 267 | 0% | 0.11 |

Learning only from hand-offs, which is the realistic case because analysts mainly see what SlayQL escalates, reaches 10.3% after 40 reviews and 0% after 80.

This is the product's clearest differentiator: the tools we compared ship curated verified queries but do not recalibrate automatically from review decisions.

### 5.4 A Malaysian distributor set (AutoCount-style)

22 questions a distributor's finance team would ask of an AutoCount-style database: invoices and invoice lines, items and item groups, debtors and areas, sales agents, credit notes, receipts and knock-offs, e-invoice status. Three are in Bahasa Malaysia; three cannot be answered from the data; three depend on an unstated definition. The data is invented and the questions are team-written. Candidates were generated on OpenTK (`deepseek-v4.1-flash`, k = 3). Source: `backend/eval/results/distributor.json`, built by `backend/eval/datasets/build_distributor_set.py`.

| | Plain pipeline (B0) | Trust layer at c = 4 | Trust layer at c = 1 |
| --- | --- | --- | --- |
| Wrong answers stated as fact | 45.5% | 0% | 0% |
| Answered immediately | 100% | 40.9% | 77.3% |
| Right answers withheld (false alarms) | — | 25.0% | 8.3% |

Every infeasible question (delivery drivers, stock balance, and customer satisfaction asked in Malay) was handed off, and every definition question was clarified or handed off.

The set exposed six real weaknesses, each now fixed and covered by tests:

- yes/no flags written in the wrong coding (`Cancelled = 'Y'` on a column that holds `'T'`/`'F'`), which excluded nothing;
- customer and supplier questions that did not reach tables named `Debtor` and `Creditor`;
- a refusal returned as SQL that read no table;
- `EXISTS` conditions that never referred to the invoice being tested;
- item-group questions ("invoices that include rice") whose join path was not retrieved;
- the model admitting in a SQL comment that it could not apply a filter, and answering anyway.

The admission check matched 8 of 5,357 previously generated queries across all three sets, and all 8 were genuine admissions.

The false alarms at c = 4 have one main cause. When the other attempts are excluded for a mistake and only the repaired query remains, there is nothing to cross-check it against, so confidence stays at 75%, just below the 80% threshold. This is deliberate caution on a new data source; the review queue (section 5.3) is how each source earns more coverage.

### 5.5 What approved definitions, a data profile and a person add

Measured on 30 September on the 22 distributor questions. SQL was generated by `gpt-5.6-luna` on OpenTK (k = 3), at the default setting c = 4. In one test call OpenTK labelled a Luna response `gpt-5.6-terra`, so it may route between sibling models. Each row is a single run on 22 questions, so a difference of one question (4.5 points) is within noise. Sources: `backend/eval/results/distributor-luna.json`, `distributor-pack-luna.json` and `distributor-profile-luna.json`.

| Run | Plain AI: wrong stated as fact | SlayQL answers | SlayQL: wrong stated as fact | Right answers held back |
| --- | --- | --- | --- | --- |
| Baseline | 40.9% | 59.1% | 0% | 23.1% |
| AutoCount starter pack approved | 22.7% | **86.4%** | 4.5% | **0%** |
| Data profile (codes and date ranges) | 31.8% | 81.8% | 4.5% | 6.7% |

Both additions let SlayQL answer far more of the questions and hold back fewer right answers. Both also cut the plain model's own mistakes.

The one wrong answer in both runs is the same question: "How many invoices were issued in the last 30 days of data?" The answer key counts cancelled invoices, since they were issued, and gives 33. Once the model saw an approved "sales excludes cancelled invoices" rule, or the `Cancelled` column's values, it left them out of the count too and gave 32. An approved definition can spread beyond its own term; whether cancelled invoices count as "issued" is itself a definition question. The answer key was not changed after seeing this result.

**With a person in the loop.** Clarify and hand-off questions still need an answer. `backend/eval/human_loop.py` gives them to a second model, `gpt-6.1-sol`, in two separate roles:
- **The person who asked** picks a clarify option. They know what they meant: a plain sentence describing the intended answer, never the SQL.
- **The analyst** reviews a hand-off with the schema, SlayQL's SQL and findings, and read-only SQL access, and never sees the answer key.

Everything is still scored against the answer key. Sources: `results/human-loop-*.json`.

| Set | No person: correct | With simulated person: correct | Wrong answers shown | Needed a person |
| --- | --- | --- | --- | --- |
| Trap set (52) | 73.1% | **98.1%** | 1.9% | 26.9% |
| Distributor, no definitions (22) | 59.1% | 86.4% | 13.6% | 40.9% |
| Distributor, starter pack (22) | 81.8% | **95.5%** | 4.5% | **13.6%** |

- **Clarify choices work.** The simulated user was run once for every valid meaning of each ambiguous trap question. For all 15 (question, meaning) pairs it picked the option giving the meaning it intended.
- **The analyst is not infallible.**
  - On the trap set, it replaced SlayQL's correct "last month", measured from where the data ends, with the calendar month before today. The data has no orders in that month, so the answer became 0.
  - On the distributor set without definitions, it answered all three "sales" questions as invoices minus credit notes. That is a sensible fifth meaning the answer key does not include (it accepts four), so they score as wrong.

  Even a capable reviewer adds another meaning of "sales". With the starter pack approved, those questions were answered consistently and a person was needed on 13.6% of questions instead of 40.9%.

### 5.6 A validator bug the evaluation exposed

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
6. The distributor set is small (22 questions), team-written and on invented data. The starter-pack, data-profile and person-in-the-loop results are single runs, and the person is simulated by a model, not observed.
7. The SQL Server connector is tested up to the network layer, not against a live AutoCount server. There is no Firebird connector for SQL Account; its data can be exported and uploaded.

## 8. Suggested slide order (10 minutes)

1. The Monday meeting: three plausible revenue figures (section 3).
2. "AI is often wrong, and you can't tell when": 45.89% on Spider 2.0-Lite; right answers generated but not chosen.
3. What SlayQL does: four outcomes, with one live example.
4. Results on business questions: 26.9% → 0%.
5. Honest results on BIRD: the dial between coverage and risk.
6. It learns from your analyst: 33.9% → 1.6% after 40 reviews, 0% after 80.
7. Report Studio: a checked management report in about 30 seconds.
8. Malaysia: AutoCount-style distributor questions 45.5% → 0% wrong answers stated as fact; Bahasa Malaysia; PDPA.
9. Trust or Bust (live).
10. Limits and next steps: pilot, interviews, external questions.
