# SlayQL project direction: the AI analyst that knows when it is wrong

Prepared 24 September 2026 for the SlayQL FYP team. This document replaces the project direction in `FYP_DEMO_STRATEGY.md`, `FYP_KILLER_DEMO_IDEAS.md` and `MALAYSIAN_MARKET_PITCH_STRATEGY.md`. Those documents contain accuracy, pilot and interview figures that have not been measured. `MALAYSIA_MARKET_RESEARCH_AND_PITCH.md`, `MALAYSIAN_MARKET_PITCH_STRATEGY_REVIEW.md` and `REPORTING_PLATFORM_IMPLEMENTATION_PLAN.md` remain the evidence base for the business case.

## 0. Status on 27 September 2026

Measured results, their sources and the report storyline are in [`REPORT_NARRATIVE.md`](REPORT_NARRATIVE.md); the current build state is in [`HANDOFF.md`](HANDOFF.md). In short:

- **Business trap set** (52 questions, re-run 3 October 2026 on the enriched demo data with `gpt-5.6-luna`): wrong answers stated as fact fall from 28.8% of questions to 1.9% (one Bahasa Malaysia question), with 75% answered immediately and no false alarms.
- **BIRD Mini-Dev** (233 held-out questions): at c = 1, from 59.7% to 15.9%, with 42% answered. At the default c = 4, SlayQL answers none, because the model is right on only about 28%.
- **Review-queue learning:** after 40 analyst reviews, confident wrong answers at c = 4 fall from 33.9% to 1.6%, and to 0% after 80.
- **Malaysian distributor set:** on 22 AutoCount-style questions, wrong answers stated as fact fall from 45.5% to 0%.
- **New since the direction was written:** Report Studio rebuilt on checked queries; coverage, filter-value and flag checks; SQL Server connector; Bahasa Malaysia test items; per-workspace learning.
- **Still open:** interviews, external held-out questions, the user study at demo day, and a pilot. Business-value claims about time and money remain hypotheses (section 6.10).

## 1. The direction

SlayQL stops competing on "ask your database in plain English", which Power BI Copilot and other incumbents already offer. Instead it competes on the property that blocks real adoption: **whether a manager can trust the number**.

Every answer passes through a trust layer. The layer runs the question several ways and checks the SQL for the specific mistakes that inflate or distort business figures. It then returns one of four outcomes:

1. a confident answer;
2. an answer with a stated caveat;
3. a clarifying question that shows the concrete alternatives and their numbers;
4. a hand-off to an analyst, with the evidence attached.

At demo day, the audience plays **Trust or Bust** on their phones. They try to spot wrong numbers, set how costly a wrong number would be for their own business, and try to make SlayQL confidently wrong. With ethics approval, their votes also form a small user study.

The project has three deliverables, each measured:

| Deliverable | Evidence produced |
| --- | --- |
| Technical: a verification layer that reduces silent wrong answers | Risk–coverage and reliability results on BIRD Mini-Dev and a business trap set, with ablations |
| Human: a trust display that helps non-experts catch wrong numbers | Detection and false-alarm rates with and without evidence (user study) |
| Business: a pilot-ready definition of value | Share of questions managers can safely answer themselves, and the silent-error rate |

## 2. The pain point and its evidence

### 2.1 AI answers on realistic schemas are often wrong and look the same as right ones

- On Spider 2.0's 632 enterprise workflow tasks, an o1-preview-based agent solved 21.3%. The same approach scored 91.2% on Spider 1.0 and 73.0% on BIRD (Lei et al., 2024).
- SlayQL's own schema-retrieval engine (the C-CaSE research pipeline) solved 251 of 547 Spider 2.0-Lite instances (45.89%), so more than half of its answers were wrong. Nothing in the answer tells the user which ones.
- The weak step is choosing, not finding. On BIRD dev, a correct query was among SlayQL's five candidates for 68.77% of questions, but it selected that query for only 56.19% (193 questions lost to selection), while schema-linking recall was close to 100%. Deciding which answer to trust is the gap this project addresses.
- TrustSQL (Lee et al., 2024) argues that users need to know which questions a model can answer. Without abstention, wrong SQL goes unnoticed and erodes trust. The paper scores reliability with a user-chosen penalty for wrong answers. This project uses that metric (section 5.4).

### 2.2 The problem appears on our own demo data

Each query below runs without error, passes SlayQL's current read-only validation, and returns a plausible number. The measurements come from `backend/data/slayql_demo.sqlite3`.

| Question: "What is total revenue from completed orders?" | Result | Rows summed | Error |
| --- | --- | --- | --- |
| Correct: `SUM(orders.total_amount)` at order grain | 33,589,369.18 | 4,151 orders | — |
| Joined to `order_items` before summing | 124,401,410.44 | 10,669 rows | 3.7× inflated (fan-out) |
| Joined to `shipments` before summing | 41,889,713.16 | 4,548 rows | 1.25× inflated (397 orders have several shipments) |
| All statuses, including 190 cancelled and 195 refunded orders | 37,171,213.39 | 4,597 orders | 1.11× inflated (definition) |

The data ends on 30 September 2026. A question about "last month" asked in December 2026 therefore returns an empty or misleading result unless someone checks data coverage.

The demo database was enriched on 3 October 2026 (420 customers, 56 products and 4,597 orders from January 2024 to September 2026, with growth, seasonality and regional targets). The figures above are measured on that version; earlier drafts quoted the smaller first version (60 customers, 214 orders).

The current pipeline checks safety, schema references and dialect (`backend/app/queries/validator.py`). At medium effort and above it also asks an LLM whether the SQL matches the request (`pipeline.py` lines 1486–1547). Nothing checks join grain, business definitions or data coverage. Only one candidate query is produced, and the final answer carries no confidence.

### 2.3 The business consequence

Letting managers answer their own questions only reduces analyst workload if the answers can be trusted without an analyst checking each one. If every AI answer must be re-checked, the analyst queue does not shrink. If none is checked, wrong figures reach decisions. The value lies in separating the two automatically and showing why.

### 2.4 Evidence the team still needs to collect

Benchmarks establish the error rate, not the business pain. Before the final report, run 8–12 short discovery interviews with people who request or produce business figures: managers, finance staff and analysts, reached through internship hosts, industry contacts or supervisors. Ask:

1. Tell me about the last time a number in a report or meeting turned out to be wrong. How was it found, and what did it cost?
2. Which data questions do you wait on someone else to answer? How long does it take?
3. How do you currently decide whether a figure is safe to use?
4. Would you use an AI answer that said "I'm not sure, an analyst will check this"? What would make you trust a "confident" label?
5. Who owns the definitions of revenue, active customer and overdue balance in your team?

Record quotes with permission. Report them as qualitative evidence, not as market statistics.

## 3. What SlayQL becomes

SlayQL is not a chat interface. Chat over a database is widely available; the chat is the simple front, and the value is the checking behind it and the workflow around it. The product has three parts on top of one invisible layer:

| Part | Used by | What it does |
| --- | --- | --- |
| Chat with trust (the Ask page) | Managers, sales, operations | Ask a question and get an answer with its outcome (section 3.1) and expandable evidence |
| Review queue | Analyst or finance person | Handle escalated and flagged questions, which arrive with their SQL, checks and alternatives; confirm, correct or approve |
| Definitions library | The analyst approves; everyone benefits | Hold the approved meaning of "revenue", "active customer" and "overdue", with the approver and the live version |
| Trust layer, underneath all three | Invisible | Run the checks, candidate consensus and confidence decision (section 3.2); this is where the value lies |

The existing SQL workbench and ER diagram support the analyst in investigating escalated questions. The Report Studio can later show management reports whose KPIs carry trust badges. Section 7.4 gives the full page map.

In a pitch: "Managers ask in a chat. Behind it, every answer is checked, uncertain ones go to your analyst, and approved definitions keep everyone's numbers consistent."

### 3.1 Answer outcomes

| Outcome | When | What the user sees |
| --- | --- | --- |
| Confident | Candidates agree, no blocking finding, and calibrated probability is above the threshold | The number, "checks passed", and expandable evidence |
| Caveat | Confident, but a non-blocking finding exists, such as truncated rows, NULLs excluded, or a period partly outside data coverage | The number with an amber sentence stating the limitation |
| Clarify | Candidates disagree on a definition, or a business term has no approved definition | Concrete options with their numbers, for example "Completed orders only: 33,589,369.18" and "All orders including cancelled and refunded: 37,171,213.39". The chosen option can be saved as a draft definition. |
| Hand-off | Probability is below the threshold, or a blocking finding survives repair | No number presented as fact. The question enters the review queue with its SQL, checks and candidate results, and the user is told it went to an analyst. |

Any outcome can also carry an **Approved definition** marker when an analyst-approved definition or verified query was used.

Use "confident" rather than "verified" for machine judgements. A confident label is a calibrated probability, reported with its measured error rate. It is not a guarantee.

### 3.2 The trust layer (`backend/app/verification/`)

| Check | What it detects | How | Reuses |
| --- | --- | --- | --- |
| Grain | Fan-out: summing or averaging a parent-table column after joining a child table | Use the foreign-key graph to find parent (primary-key) to child (foreign-key) joins beneath an aggregate. Then run a probe query, `SELECT COUNT(*), COUNT(DISTINCT parent.pk)` over the same FROM/JOIN/WHERE, to confirm the duplication and report the multiplier. | `catalog/discovery.py` primary and foreign keys, `agent/rbp.py` graph, sqlglot, `SqlValidator`, `QueryExecutor` |
| Definition | A business term calculated with the wrong filters, or with no agreed definition | Compare the SQL's predicates with the approved definition. Without one, look for an unfiltered status-like column (low-cardinality text, identified from catalog sample values) on the aggregated table, and ask instead of guessing. | Catalog sample values, knowledge store (3.3) |
| Period | Relative dates outside the data, and off-by-one date bounds | Compare date filters with the column's actual minimum and maximum. Flag a date-only upper bound on a datetime text column. | Executor probes |
| Sanity | Results that should not be presented as totals | Empty results, an all-NULL measure, a total computed from a truncated result (`is_truncated`), or unexpected negative values | Execution result |
| Consensus | Unstable interpretations | Generate *k* candidates, then validate and execute each. Compare results as normalised, unordered sets of tuples (BIRD's execution-accuracy comparison) and record the agreement ratio. When candidates disagree, compare their predicates with sqlglot to label each option. | Existing generation call, validator and executor |
| Decision | Whether to answer | Combine the signals into P(correct), using logistic regression calibrated on a held-out split. Answer only if P > c / (1 + c). | Existing LLM semantic validator (one input signal) |

**Where the threshold comes from.** Suppose a wrong answer costs *c* times as much as a correct answer is worth. Answering then has expected value p − c(1 − p), and abstaining has zero. So answer only when p > c / (1 + c). For c = 1 the threshold is 0.5, for c = 4 it is 0.8, and for c = 9 it is 0.9. The same *c* appears in TrustSQL's Reliability Score, so the business setting and the academic metric are the same number.

**Decision order:**

1. A blocking finding goes back into the existing repair loop as `repair_feedback`, for example "aggregate order_items per order before joining". The repaired query is re-verified. If the finding survives the attempt budget, the question is handed off.
2. An ambiguity triggers a clarification.
3. Otherwise compute P(correct). Above the threshold, the answer is confident, or carries a caveat if non-blocking findings exist. Below it, the question is handed off.

```text
question → intent → retrieval (BM25 + RBP + approved definitions) → k candidates
         → validate (sqlglot) → execute
         → verify: grain · definition · period · sanity · consensus
         → blocking finding? → existing repair loop → re-verify
         → decide: confident | caveat | clarify | hand-off
         → answer + evidence            review queue → approved definition ↺ retrieval
```

### 3.3 Approved definitions and verified queries (`backend/app/knowledge/`)

When a user picks a clarification option or an analyst resolves a hand-off, the result can be saved as a draft definition, which a data owner then approves. Approved definitions are:

- added to retrieval context and to the BM25 index;
- enforced by the definition check;
- shown on answers that use them.

This is the business-continuity value the review document identified: the rules for how figures are produced survive staff changes.

### 3.4 Limits to state openly

- The trust layer lowers the silent-error rate. It does not eliminate it.
- Correlated mistakes can make all candidates agree on a wrong answer. Deterministic checks cover known systematic traps; report every confident miss.
- It routes uncertain questions to analysts. It does not replace them.

## 4. Audience experience: Trust or Bust

### 4.1 Setup

- The big screen runs `/arena/screen`, and the host console runs `/arena/host` on a laptop or tablet.
- The audience scans a QR code to open `/play?code=XXXX`. No account is needed; a nickname is optional. If the study is approved, a consent screen comes first.
- The same system supports a 10–15 minute stage presentation and a walk-up booth loop.

### 4.2 Stage version (about 12 minutes)

| Round | Audience does | Screen shows | What it proves | Live LLM? |
| --- | --- | --- | --- | --- |
| 1. Would you put this in the board pack? (3 min) | Vote Trust or Bust with a confidence rating on four answer cards drawn from the trap set. Phones are randomly split: half see the plain answer, half see SlayQL's outcome and evidence. | Live vote bars, then the truth and the detection rate of each group | Whether unaided people can spot wrong numbers, and whether evidence changes that | No, cards are pre-computed |
| 2. What is a wrong number worth to you? (2 min) | Pick a decision their business makes with a number, then set a penalty *c* from 1 to 20 | Median *c* per decision, the resulting threshold, and the Reliability Score of three strategies at that *c*: always answer, SlayQL's threshold, never answer. Per 100 questions, it also shows instant answers, hand-offs and expected wrong numbers. All figures are computed from real evaluation results. | The trade-off is a business setting and matches a published metric | No, computed in the browser from the results JSON |
| 3. Stump SlayQL (4 min) | Ask their own questions about the demo business, tap clarification options, flag answers they think are wrong | A moderated trust wall with outcome counts, and a leaderboard. Confirmed confident misses score +5. | Honest red-teaming of the failure the project claims to reduce | Yes, queued |
| 4. Agree what revenue means (2 min) | Vote between the candidate definitions of revenue and their numbers, then re-ask the question | The host approves the winning definition; every re-asked answer shows the same number with the Approved definition marker | Consistency, the learning loop and knowledge retention | Yes, queued |
| 5. Results (1 min) | — | The benchmark risk–coverage chart and today's live numbers, each with its sample size | The claims are measured | No |

Section 6.9 adds a 30-second "Tool A or Tool B?" opener and a 30-second exit poll, which brings the stage version to about 13 minutes.

**Booth version.** Round 1 becomes a five-card quiz per visitor (about 90 seconds) with a best-spotter leaderboard, followed by the "your company" calculator and the exit poll (section 6.9). Round 3 runs on a second tablet. The screen loops the trust wall and the results.

### 4.3 Why this is more than a gimmick

- The audience experiences the pain instead of being told about it.
- Every Round 1 vote is data for the user study.
- Stump mode rewards finding real failures, and every confirmed confident miss goes into the final report.
- The penalty slider turns business intuition into the evaluation metric.

### 4.4 Study design and ethics

- Randomise each participant to the plain or evidence condition, and randomise card order. Half the cards are wrong.
- Include some real **verifier misses**, where SlayQL was confident and wrong. This measures over-reliance on the trust display, not just its best case.
- Record: anonymous participant ID, condition, item ID, ground truth, vote, confidence and response time. Collect no personal data.
- Report catch rate and false-alarm rate per condition with bootstrap confidence intervals. The sample will be small, so state it.
- **Ethics:** collecting and reporting this as research data needs Monash human research ethics approval (MUHREC). Ask your supervisor this week, because approval takes time. Without approval, run the game for engagement only and do not report the audience data. Separately, run a smaller study once it is approved.

## 5. Evaluation

### 5.1 Research questions

1. **RQ1.** At a fixed coverage, how much do the checks and consensus reduce silent errors compared with the current single-candidate pipeline?
2. **RQ2.** Which error types does each mechanism catch (deterministic checks, consensus, the LLM semantic validator), and at what false-alarm cost?
3. **RQ3.** Is the confidence score calibrated? Which threshold maximises the Reliability Score for a given penalty *c*?
4. **RQ4.** Does showing evidence help non-experts catch wrong numbers without making them distrust correct ones?
5. **RQ5.** How much latency and cost does verification add per question?

### 5.2 Datasets

| Dataset | Size | Use | Notes |
| --- | --- | --- | --- |
| Business trap set (written by the team; 52 items including 12 in Bahasa Malaysia or mixed language, plus external held-out items when collected) | 52 questions on the demo database | Calibration and test (50/50), Round 1 cards | Each item has gold SQL, a trap tag (fan-out, definition, period, ambiguity, infeasible) and an expected outcome (answer, clarify or hand-off). The four queries in section 2.2 are the first items. |
| BIRD Mini-Dev, SQLite | 500 questions | Calibration and test (250/250) | Public, runs locally on the existing SQLite executor, and curated from BIRD dev |
| Spider 2.0-Lite subset | 178 instances | Optional comparison with the earlier AutoLink run | Only if the harness and per-instance outputs behind `run/comparison_report.md` are recovered. They are not in `slayql-UI` or `slayql`, and the run needs warehouse access. |

### 5.3 Configurations

- **B0:** the current pipeline at medium effort. One candidate plus the existing LLM semantic validator. This is the baseline.
- **B1:** B0 plus deterministic checks, with repair.
- **B2:** B0 plus consensus (*k* = 3).
- **B3:** B1 plus B2 plus the calibrated decision. This is the full system.

Generate the *k* candidates once per question and cache them. Every configuration reads from the cache, so ablations are consistent and model costs are paid once.

### 5.4 Metrics

| Metric | Meaning |
| --- | --- |
| Execution accuracy (EX) | Share correct when answering everything |
| Coverage | Share answered as confident or caveat |
| Selective risk | Error rate among answered questions |
| **Silent-error rate** | Wrong answers presented as confident, divided by all questions. This is the headline business metric. |
| Risk–coverage curve and AURC | The full trade-off across thresholds |
| Reliability Score RS(c), c = 1, 4, 9 | TrustSQL's penalty-based score |
| Catch rate by trap type | Recall of the verifier on each error type |
| False-alarm rate | Correct answers that were clarified or handed off |
| Calibration (ECE and reliability diagram) | Whether "80% confident" means 80% correct |
| Clarification quality | On ambiguous items, whether the options include the gold interpretation |
| Latency p50/p95 and tokens per question | Operating cost |

### 5.5 Honesty rules

- Every number on slides, the poster or the landing page is generated from `backend/eval/results/`, with dataset, sample size, date and commit.
- Report failures and confirmed confident misses.
- Set targets after measuring the baseline, and never present targets as results.
- Report the same-model AutoLink comparison on 178 Spider 2.0-Lite questions (40.4% vs 39.9%) as no meaningful difference: 16 questions improved and 15 degraded. Do not present it as a leaderboard win. The headline Spider 2.0-Lite figure is 251/547 (45.89%), out of all 547 questions, not 47.63% out of the 527 that produced a result.

### 5.6 What the evaluation proves, and what it cannot

The trust layer does not make SlayQL write better SQL, so execution accuracy may stay near the baseline. The claim under test is different: **SlayQL can tell its right answers from its wrong ones**, and only questions with known answers can test that. The evaluation establishes:

1. **The warnings are meaningful.** Flagged answers must be mostly the wrong ones. The catch rate and false-alarm rate measure this. Flags that land at random would make the trust layer worthless.
2. **The trust layer caused the improvement.** B0–B3 share the same cached SQL, so any change is due to checking and decision alone. The ablation also shows which component helps.
3. **The cost of caution.** A system that abstains on everything is never wrong and never useful. The risk–coverage curve shows how many instant answers are given up per wrong answer avoided.
4. **"80% sure" means about 80% right.** Calibration is what lets a company set its threshold from its penalty *c*.
5. **It generalises beyond our own examples.** The team writes the trap set, which could favour our checks. BIRD is public, and every figure is reported on held-out halves.
6. **Which errors it catches and misses.** The per-type breakdown becomes the limitations section of the final report.

Each layer of evidence supports only its own claims:

| Evidence | Question it answers |
| --- | --- |
| Evaluation on datasets | Does the mechanism catch wrong answers without flagging too many right ones? |
| User study (Round 1) | Does it help people spot wrong numbers? |
| Company pilot (after the FYP) | Does it help a real business with its real questions? |

### 5.7 Evaluation architecture

An offline harness calls the same code as the live app, in two phases. The expensive AI phase runs once and is cached. The checking and scoring phase can be re-run freely.

```text
datasets (trap set, BIRD Mini-Dev)
  → PHASE 1 generate (paid, once): retrieval → k candidate SQLs → validate → execute
      cached in backend/eval/cache/ by question, model, prompt version and candidate number
  → PHASE 2 evaluate (free, re-runnable): configs B0–B3 read the cache
      → outcome per question → compare with the gold answer
  → PHASE 3 report: metrics.py → backend/eval/results/*.json and charts
      → final report, landing page, audience game
```

1. **Same code, called directly.** The harness imports retrieval, `openrouter_client.generate_sql` (`providers/openrouter_client.py` line 499), the validator, the executor and `verify()`. It bypasses HTTP, login, credits, SSE and `MAX_ACTIVE_RUNS`. This requires the refactor in section 7.2: split `_execute_run` into `build_context()`, `generate_candidates()` and `verify()`, used by both the live pipeline and the harness.
2. **Generate once, evaluate many times.** Every configuration sees identical SQL, AI costs are paid once, and tuning the checks or threshold costs nothing.
3. **BIRD-standard scoring.** Execute the predicted and gold SQL on the same database, and compare the results as unordered sets of rows with floats rounded. Ambiguous and infeasible trap-set items are scored on whether SlayQL chose the expected outcome.
4. **Separate fitting from testing.** Fit the calibration on one half of each dataset and report on the other.
5. **Reproducible and budget-guarded.** Each results file records the commit, model ID, prompt version, dataset version and date. Generation keeps a running cost total, stops at the agreed cap, runs a few questions concurrently with retries, and resumes after interruption.
6. **Same model as the demo.** Generate with the model the live demo uses, so the results describe the system the audience sees.

```text
backend/eval/
  datasets/    download_bird_minidev.py, trap_set.jsonl
  generate.py  phase 1
  evaluate.py  phase 2
  metrics.py   EX, coverage, silent-error rate, risk–coverage, RS(c), ECE
  cache/       phase 1 outputs (git-ignored)
  results/     phase 3 outputs (committed; the source of every published number)
```

If budget or time is short, run the trap set in full and a 200-question BIRD sample. That is weaker evidence, but still evidence.

## 6. Business value, positioning and Malaysian impact

This section is the business case to pitch and to test. Figures about Malaysia come from the sources at the end of this document. Figures about SlayQL come only from measurements in this repository. Everything else is labelled as a hypothesis or a target.

### 6.1 The value in one sentence

**SlayQL lets people get answers from their company's own data without waiting for an analyst, and keeps wrong numbers out of decisions by checking every answer and saying when it is not sure.**

**Tagline:** "SlayQL answers questions from your company's data, and tells you when not to trust the answer." Use "The AI analyst that knows when it's wrong" as the short form for slides and banners, and "Tanya data syarikat anda, dan ketahui jawapan mana yang boleh dipercayai" for Bahasa Malaysia audiences. The tagline does not promise that every answer is right, so the evaluation can support it.

For a business audience, use this comparison. Most AI tools behave like a junior analyst who is always confident. SlayQL behaves like a junior analyst who double-checks the work, shows how the figure was calculated, and says "let me confirm with a senior" when unsure.

### 6.2 The three problems it solves

| Problem | Who feels it | Today's workaround | What SlayQL changes | How it will be measured |
| --- | --- | --- | --- | --- |
| **Waiting.** Routine questions such as "sales by branch last month?" queue behind the one or two people who can query the system. | Owners, sales and operations managers | Ask the accountant or IT person and wait, or go without | Answers immediately when the answer passes its checks | Time to an accepted answer; share of questions answered without an analyst |
| **Wrong numbers.** When people answer their own questions with exports, spreadsheets or AI chat, mistakes such as double counting look exactly like correct figures. | Finance, management, anyone acting on the figure | Trust the figure, or have someone re-check everything | Checks each answer for the errors that distort business figures, and asks or hands off instead of guessing | Silent-error rate; catch rate by error type |
| **Lost knowledge.** What counts as "revenue" or "overdue" lives in one person's head. Two people get two numbers, and reports break when that person leaves. | The whole company, especially when staff change | Informal know-how and spreadsheets with hidden formulas | Approved definitions are saved, shown on each answer and reused by everyone | Definitions approved and reused; time for a second person to reproduce a report |

The benchmarks in section 2 establish the wrong-number problem. The waiting and lost-knowledge problems are plausible, but the section 2.4 interviews must confirm them before they are presented as findings.

### 6.3 Worked example: the Monday sales meeting

The scenario is illustrative. The numbers come from the demo database (section 2.2).

A distributor's sales manager prepares for the weekly meeting and asks: *"Berapa jumlah jualan untuk pesanan yang selesai?"* ("What is total revenue from completed orders?")

| Tool | What the manager receives | What happens next |
| --- | --- | --- |
| Plain AI query tool | One confident number. Depending on how the SQL was written, it could be 33,589,369.18, 37,171,213.39 or 124,401,410.44. | The manager cannot tell which is right. A figure nearly four times too high could set next quarter's targets, commission or stock orders. |
| SlayQL | Either 33,589,369.18 with "checks passed" and the calculation shown, or a question: "Completed orders only (33,589,369.18), or all orders including cancelled and refunded (37,171,213.39)?" | The manager picks the intended meaning. Finance approves it once as the company's definition of revenue, and every later answer uses it. |

The same risks appear in the questions the market research brief proposes for a distributor's weekly pack:

- Overdue receivables (*"Pelanggan mana yang berhutang lebih 90 hari?"*) require netting receipts and credit notes and deciding whether disputed invoices count.
- Slow-moving stock depends on the agreed cost basis.
- Margin depends on how discounts, returns and freight are treated.

Each is a join-grain or definition risk that the trust layer is designed to check. The Bahasa Malaysia phrasing must be tested before it is used (section 6.6).

### 6.4 Why not use another tool instead?

Answering questions in plain language no longer sets a product apart, because several of the tools below already do it. The comparison is about fit for SlayQL's target buyer: a company whose data sits in an ordinary SQL database or accounting system and that has no dedicated data team.

| Alternative | What it does well | Limitation for this buyer | When it is the better choice |
| --- | --- | --- | --- |
| Keep asking the accountant, IT person or analyst | Human judgement and business knowledge | Slow; a bottleneck and a single point of failure; routine questions consume skilled time | Rare, high-stakes analysis, and every question SlayQL hands off |
| Exports and spreadsheets | Flexible and familiar | Manual and error-prone; hidden formulas; the same join and definition mistakes, unchecked | One-off analysis by a skilled user |
| Built-in dashboards in AutoCount or SQL Account | Standard financial and stock reports from the system itself | Answer only the questions the report designer anticipated | When an existing report already answers the question, in which case SlayQL adds little |
| General AI chat with an uploaded spreadsheet | Fast, cheap, no setup | Works on a copy, not live data; no agreed definitions, answer checks or audit trail; uploading customer data raises PDPA cross-border questions (section 6.6) | Personal, non-sensitive, one-off questions |
| Power BI with Copilot | Strong reporting and AI assistance for organisations on Microsoft | Needs suitable paid capacity and a prepared semantic model, which usually means BI specialists | A company that already maintains a Power BI model and has BI staff |
| Snowflake Cortex Analyst, Databricks Genie | Enterprise AI analytics with curated verified queries or "trusted" answers; Genie also runs accuracy benchmarks | Require the vendor's data platform plus a curated semantic model and verified-query set | Large organisations already on those platforms |
| Local AI analytics vendors, for example Neura57 | Advertise local accounting and POS connectors, conversational analytics, reports and alerts | We have not evaluated how they check answers, so any difference must be shown on the same questions before it is claimed | A company that mainly needs connectors and dashboards |
| A BI consultant building dashboards | Tailored, reviewed reports | Setup cost, and a turnaround for every new question | Stable reporting needs that rarely change |

Two conclusions follow:

1. **The large platforms confirm the problem.** Snowflake's verified query repository, and Databricks Genie's trusted assets and benchmarks, exist because unchecked AI answers are not trusted. Both solve it with curated assets inside their own platforms.
2. **SlayQL's position is automatic checking on the database a company already has.** It checks every answer for fan-out, definition and period errors, including questions nobody curated in advance. It abstains when unsure, shows its evidence, and learns approved definitions from the review queue. It needs no data warehouse or semantic model before it is useful, and its reliability is measured and published (section 5).

### 6.5 Where SlayQL stands

**Positioning statement.** For growing Malaysian companies whose managers depend on one or two people for data answers, SlayQL is an AI data assistant that answers questions from the company's own database and tells you when not to trust an answer. Unlike general AI chat tools, it checks every answer for the errors that distort business figures and hands uncertain questions to a person with the evidence attached. Unlike enterprise BI copilots, it needs no data platform or prepared semantic model before it is useful.

| SlayQL is | SlayQL is not |
| --- | --- |
| A question-answering and checking layer over an existing SQL database | A replacement for the accounting system, ERP or data warehouse |
| A way to extend a small team's capacity | A way to remove analysts; it sends them the hard questions |
| Measured: confident answers carry a published error rate | A guarantee that every confident answer is right |
| Read-only | A tool that changes records, makes payments or submits e-invoices |

**Who should not buy it yet:**

- microbusinesses whose accounting software's reports already answer their questions;
- companies with a maintained Power BI or warehouse semantic layer and a BI team;
- companies whose data is not yet in a database SlayQL can connect to (see section 6.6 on AutoCount and SQL Account).

### 6.6 Impact in the Malaysian context

**The businesses it is for.**

- In 2024, Malaysia had 1,086,386 MSMEs, 96.1% of all business establishments. Of these, 70.1% were micro, 28.2% small and 1.6% medium (SME Corp, from DOSM data).
- In 2025, MSMEs produced 39.7% of GDP (RM689.8 billion) and employed 48.7% of the workforce (DOSM).

SlayQL's realistic buyers are among the roughly 324,000 small and medium firms, plus larger companies without a data team. Most micro firms are a weak fit, because their existing software already produces the reports they need (market research brief). These figures describe the economy, not SlayQL's market size: only some of these firms have usable data in a database SlayQL can connect to.

**Why now: e-invoicing is creating structured transaction data.**

- LHDN has phased in e-invoicing by turnover since August 2024.
- The phase for businesses with turnover up to RM5 million began on 1 January 2026, with a relaxation period to 31 December 2027.
- Since 1 September 2026, businesses under RM3 million that meet the criteria are exempt.

Businesses in scope now hold validated, itemised invoice records. That makes more questions answerable, and it also multiplies the risk shown in section 2.2. Invoices, invoice lines, receipts and credit notes form exactly the one-to-many structure that tripled revenue in the demo data. A validated e-invoice also does not mean payment was received, so receivables questions need receipts as well. The rules changed several times in 2025–2026, so check HASiL's current guideline before each pitch.

**Local systems are the real integration path.**

- AutoCount Accounting runs on Microsoft SQL Server, usually the Express edition.
- eStream's SQL Account runs on Firebird. eStream states that more than 320,000 companies use SQL Account and SQL Payroll.
- SlayQL connects to SQLite, PostgreSQL/Supabase, MySQL, Snowflake and, since 27 September 2026, **SQL Server** (read-only, via pymssql, including named instances such as `SERVER\A2006`). The SQL Server connector is tested up to the network layer but **not yet against a live AutoCount server**. There is **no Firebird connector** for SQL Account.
- An AutoCount-style sample (`public/autocount-sample.db`: invoices, lines, credit notes, receipts and e-invoice status, all invented) is in the app's sample list. The trust layer catches its cancelled-invoice flags and invoice-line fan-out.

The first pilot step is to confirm the connector on a real AutoCount database with a read-only login. Firebird follows if a SQL Account pilot needs it. Until then, SQL Account data can be exported and uploaded as SQLite.

A database connection alone is not a maintained connector: the meaning of each table must be mapped and approved for each system edition. KRI's 2026 research with MDEC describes shallow digital adoption and disconnected applications among micro and small enterprises. The integration work, not the AI, is often the hard part.

**Language.** Managers mix English, Bahasa Malaysia and other languages in one question. The grain, period and sanity checks inspect the generated SQL, so they work the same whatever language the question was asked in. Definition matching needs Bahasa Malaysia synonyms on each definition, for example *jualan*, *hasil*, *untung kasar* and *hutang*. Add Bahasa Malaysia items to the trap set, and report their accuracy separately before claiming multilingual support.

**Data protection (PDPA).** The Personal Data Protection (Amendment) Act 2024 came into force in phases during 2025. It requires:

- notifying the Commissioner of a breach within 72 hours;
- appointing a Data Protection Officer, for organisations that process personal data at scale;
- for any transfer of personal data outside Malaysia, a destination offering substantially similar protection (usually shown with a transfer impact assessment), or another permitted basis such as consent, contractual necessity or approved contractual clauses.

Malaysian buyers will ask what leaves their server. The honest answer today is that the following go to Together AI, which runs the selected model outside Malaysia:

- the question and the relevant schema;
- **up to 8 matching database values**, used for grounding (`retrieval.py`, sent at `pipeline.py` line 1324);
- at every effort level above minimal, **up to 25 result rows** for the written answer (`openrouter_client.py` line 193);
- at high and max effort, result profiles for chart planning.

The README's statement that providers receive only "safe result profiles" understates this and must be corrected.

Privacy mode (`PRIVACY_MODE=true`, implemented) does three things:

- it masks columns that look like personal data (names, emails, phone numbers, MyKad numbers) in grounding values and answer rows;
- it records exactly what each run sent;
- it shows that record in the evidence panel.

Report Studio sends table and column names, category examples, date ranges and computed findings, never table rows. In privacy mode, findings about people are not sent.

A self-hosted or in-region model is a future option, not a current capability.

**Responsible AI.** MOSTI's National Guidelines on AI Governance and Ethics (AIGE), published in September 2024, are voluntary and set seven principles. SlayQL's design maps onto six of them. Present this as design alignment, not certification.

| AIGE principle | SlayQL feature |
| --- | --- |
| Reliability, safety and control | Answer checks, calibrated confidence, abstention, read-only execution |
| Transparency | SQL, checks, candidate agreement and definitions shown with each answer; a record of data sent to AI with every answer and report |
| Accountability | Review queue with named approvers, versioned definitions, run history |
| Privacy and security | Encrypted credentials, no stored result rows, privacy mode |
| Inclusiveness | Questions in Bahasa Malaysia and English (to be tested) |
| Pursuit of human benefit and happiness | People make the final call on uncertain answers |

The remaining principle, fairness, applies less directly to aggregate business reporting.

**Cost pressure and staffing.** In CPA Australia's 2025–26 small-business survey, 48.1% of Malaysian respondents said rising costs had a major negative impact, yet 46.8% expected to increase staffing in 2026. In its 2025 technology survey (117 Malaysian responses), 72% of finance and accounting respondents reported no AI-related hiring change or said it was too early to tell. The defensible pitch is therefore extending a small team's capacity, not removing jobs.

### 6.7 Expected impact and how it will be measured

Report the three kinds of value separately, as the pitch review requires.

| Value | Mechanism | Pilot measure | Caution |
| --- | --- | --- | --- |
| Capacity released | Routine questions answered without an analyst | Analyst hours spent on routine requests per week, before and during the pilot | Capacity is not cash unless overtime, contractor work or a hire is actually avoided |
| Risk reduced | Fewer wrong figures reach decisions, and hand-offs arrive with evidence | Silent-error rate on a reviewed sample; analyst minutes per hand-off, with and without evidence | Report avoided errors, not avoided losses, unless a loss is documented |
| Consistency retained | Everyone uses the approved definitions | Definitions approved and reused; whether a second person can reproduce the weekly report | This is the business-continuity value the review identified |

**Pilot design:**

1. Start with one sponsor, one recurring report or meeting, one data-ready source and one finance reviewer.
2. Record the current baseline first.
3. Run 20–30 real questions, including ambiguous and unsupported ones, and have the reviewer mark each answer.
4. Start timing only once data access is ready.
5. End with a continuation decision at a stated price.

Publish no ROI, savings or payback figure before such a pilot.

### 6.8 Business model hypotheses to test

These are hypotheses, not findings.

- **Pricing shape:** a fixed setup fee (connect one system and agree the first 5–10 definitions) plus a monthly subscription with a question allowance. Set the price floor from the measured cost per question (RQ5), hosting and support hours, then test the price with pilot buyers.
- **Channel:** AutoCount and SQL Account appear to be sold and supported largely through dealers, several of whom publish support material for them. A reseller partnership could reach buyers without a direct sales team. Test this with one or two dealers.
- **Expansion:** build one connector and one set of reviewed definitions per accounting system edition. Measure whether the second and fifth customers on the same system need less setup than the first. If not, price the work as a service.
- **Adjacent opportunity, not planned:** e-invoice reconciliation, meaning finding invoices in the accounting system that do not match what was submitted. It is timely while LHDN's e-invoice voluntary disclosure programme runs, until 31 December 2027.

### 6.9 Audience interaction that demonstrates the business value

These moments extend Trust or Bust (section 4), so the audience experiences the business case instead of hearing it. Every number on screen comes from the evaluation results or from the audience's own inputs, and says which.

| Moment | Audience does | Screen shows | Business point | Rule |
| --- | --- | --- | --- | --- |
| Opener: Tool A or Tool B? (30 s) | Choose which tool to give their sales manager. Tool A answers every question instantly. Tool B answers most instantly and sends the rest to an analyst. | The vote split, then each tool's measured error rate and coverage | Reliability is a business choice, not a technical detail | Uses B0 and B3 results; skip this moment until they exist |
| Round 2: What is a wrong number worth to you? | Pick a decision their business makes with a number (set sales targets, pay commission, order stock, report to the bank, quote a customer), then set the penalty *c* | Median *c* per decision, the resulting threshold, and per 100 questions: instant answers, hand-offs, and expected wrong numbers for a plain AI tool versus SlayQL | The same tool can be strict for commission and relaxed for exploration | Computed in the browser from per-question evaluation results |
| Your company calculator (booth, 1 min) | Enter how many questions a week need someone else, and how many minutes each takes that person | Analyst hours released per month, hand-offs still needing a person, and wrong numbers avoided compared with a plain AI tool | Personal relevance | Labelled "your inputs × our measured rates"; shows capacity, never a ringgit saving |
| Round 4: Agree what revenue means | See the three candidate definitions and their numbers, then vote | The winning definition is approved; everyone re-asks and gets the same number with the Approved definition marker | Consistency and knowledge retention | Uses the live pipeline |
| Stump SlayQL: Tanya dalam Bahasa | Ask a question in Bahasa Malaysia or mixed language | The answer, its outcome and the same checks | Local usability; checks are language-independent | Include only if the Bahasa Malaysia trap-set items pass in rehearsal |
| Exit poll (30 s) | Answer three questions: their role; whether their workplace has "the one person who knows the numbers"; the biggest barrier to using SlayQL (privacy, accuracy, cost, compatibility with AutoCount or SQL Account, language, other) | Live results | Live customer discovery | Report as a convenience sample, not market statistics; include it in the ethics application |

Calculator formulas, shown on screen next to the result. Weeks per month are taken as 4.33.

- Questions per month = questions per week × 4.33
- Analyst hours released per month = questions per month × safe self-serve rate × minutes per question ÷ 60
- Hand-offs per month = questions per month × hand-off rate
- Fewer wrong numbers than a plain AI tool, per month = questions per month × (B0 error rate − B3 silent-error rate)

### 6.10 What can be claimed, and when

| When | What can be said |
| --- | --- |
| Today | The errors are real and large on realistic data: up to 3.7 times the correct revenue in the demo database. AI-generated SQL is often wrong on realistic tasks: an o1-preview agent solved 21.3% of Spider 2.0 tasks, and our own engine solved 45.89% of 547 Spider 2.0-Lite instances. |
| Now (measured 27 September 2026; trap set re-run 3 October 2026, `docs/REPORT_NARRATIVE.md`) | Business trap set: wrong answers stated as fact 28.8% → 1.9% of questions, 75% answered immediately, no false alarms. BIRD at c = 1: 59.7% → 15.9%, 42% answered. Learning: 34.8% → 1.6% after 40 analyst reviews. Always state that the trap set is team-written and small. |
| After a pilot with a real company | Capacity released, errors avoided, adoption and willingness to pay. Until then, no ROI, savings or payback figures. |

**Pitch lines by audience:**

- **Owner or CEO:** "Get answers from your data in seconds, and know which ones are safe to act on."
- **Finance:** "Every figure shows how it was calculated and whether it passed the checks. Unclear ones come to you before they reach a meeting."
- **Analyst or IT:** "Fewer routine requests, and the ones that reach you arrive with the SQL, checks and alternatives attached."
- **Examiners:** "We measured how often AI answers about business data are silently wrong. We built a layer that catches the common business errors and abstains when unsure, and we tested whether people spot wrong numbers better with it."

### 6.11 Pitch to a CTO

About two minutes, with a live demo. It says only what is true today.

1. **Open with their pain.** "How many requests for data does your team get a week? 'Sales by branch last month', 'which customers owe us more than 90 days'. Each one pulls someone off real work."
2. **Show the problem.** "The obvious fix is letting managers ask an AI directly. The problem is what happens when it's wrong." Ask the demo database for total revenue from completed orders. The correct answer is 2.16 million. An AI can just as easily return 6.54 million, by counting each order about three times through a join, or 3.24 million, by including cancelled and refunded orders. All three queries run without errors and look like real numbers.
3. **Generalise.** "On realistic enterprise tasks, even strong AI agents get most answers wrong. An o1-preview agent solved 21% of Spider 2.0 tasks. The issue isn't that the AI is sometimes wrong. It's that you can't tell when."
4. **The solution.** "SlayQL answers questions from your own database, and tells you when not to trust the answer." Every answer is checked for double counting, missing filters and dates outside your data. It is generated several ways and the results are compared. SlayQL then answers with the evidence, adds a caveat, asks a clarifying question showing both numbers, or sends the question to your analyst with the work attached. Approved definitions keep everyone's numbers consistent.
5. **The CTO's angle.** "It's read-only, it runs against the database you already have, and it needs no data warehouse or BI model first."
6. **The close.** "We're not asking you to buy anything yet. We're proposing a four-week pilot: one recurring report, 20–30 real questions, and your finance person marking every answer. You'll see how many questions it answered correctly on its own, how many wrong numbers it caught, and how much time your team got back. If the numbers aren't good enough, you walk away."

| CTO question | Honest answer |
| --- | --- |
| How does it connect? | Read-only to PostgreSQL, MySQL, Snowflake, SQL Server or SQLite, with a read-only database user. For AutoCount: "We connect to its SQL Server database with a read-only login; the first pilot step is confirming that on your server." For SQL Account: "No Firebird connector yet; the pilot uses an export." |
| Can it damage our data? | No. It accepts only a single read-only `SELECT`, blocks anything that writes, and runs under a read-only database user. |
| What data leaves our servers? | "The question, the relevant table structure, a few matching values and up to 25 result rows go to an AI provider outside Malaysia. Privacy mode masks names, emails, phone numbers and IC numbers, and every answer shows what it sent." Never say "nothing leaves" or "only metadata". |
| How accurate is it? | "The better question is how often it gives a wrong number while sounding confident. We measure that on public benchmarks, and the pilot measures it on your questions, judged by your finance person." Then: "On business questions like yours, wrong answers stated as fact fell from 27% to 2%, while three quarters were still answered immediately. And it learns: after about 40 of your analyst's reviews it knows how far to trust itself on your data." |
| We already have Power BI or dashboards. | "If they already answer the question, you don't need us. We're for the questions they don't cover, and we work on the database you already have, without a maintained BI model." |
| What's the maintenance burden? | "Your analyst approves definitions and reviews escalated questions. That's the main ongoing work, and it's how the system improves." |

The pitch opens with the buyer's pain, shows the problem before the solution, makes every claim checkable, ends with a low-risk pilot, and states its gaps openly. Being candid about a missing connector makes the rest of the pitch more credible.

## 7. Integrating with the existing application

### 7.1 Keep, change, freeze, archive

| Area | Decision |
| --- | --- |
| Agent pipeline (retrieval, RBP, BM25 grounding, repair loop), sqlglot validator, read-only executor, catalog discovery, SSE | **Keep.** These become the candidate generator and probe runner. |
| Live demo chat, trace timeline, effort selector, chat reports (feedback), saved queries, ER diagram | **Change.** These surface outcomes, evidence and the review queue. |
| Landing page (Hero, BenchmarkSection, AblationSection) | **Change.** Adopt the trust message and use real evaluation results. |
| Report Studio (AI dashboard builder in Database Lab) | **Keep, minimal change.** Now: remove the ten-chart minimum (`MIN_CHARTS` and `ensure_minimum_charts`, `report_agent.py` lines 75 and 113), which keeps charts the reviewer rejected just to meet a count. Also remove "Power BI" from its naming: the UI badge "DeepSeek Power BI Engine" (`AIDashboardBuilder.jsx` line 244) and the functions `generatePowerBIReport` and `editPowerBIReport` (`services/api.js` lines 381 and 385). It is SlayQL's own React/Vega builder with no Microsoft integration, and Power BI is Microsoft's trademark. Use "SlayQL Report Studio", `generateReport` and `editReport`. After the cut line: outcome badges on KPI cards and server-side KPI aggregates. No other new features. |
| `/dashboard` view (`DashboardView.jsx`, `src/components/dashboard/`, `src/lib/api/`) | **Retire.** It runs entirely on mock data from `src/lib/api/query.js`, `database.js` and `history.js`. Redirect `/dashboard` to `/demo`, then delete it. |
| `/onboarding` view (`OnboardingView.jsx`) | **Retire.** It animates a progress bar without calling the API and then opens the mock `/dashboard`. Real connections are made through the Add Connection dialog. |
| Database Health agent | **Freeze and hide** from the main navigation. It keeps working and stays reachable at `/database-lab/health`. |
| Table create/delete, extra connectors, Power BI embedding, voice, email actions, war room, ROI calculator | **Freeze.** Keep working, add nothing. |
| `FYP_DEMO_STRATEGY.md`, `FYP_KILLER_DEMO_IDEAS.md`, `MALAYSIAN_MARKET_PITCH_STRATEGY.md` | **Archive** to `docs/archive/`, with a note that they contain unmeasured figures |

### 7.2 Backend changes

1. **`backend/app/agent/effort.py`.** Add `candidate_count` (minimal 1, low 2, medium 3, high 3, max 5) and `verify` to `ThinkingProfile`. Effort becomes "how much certainty to buy".
2. **`backend/app/verification/` (new).** Add `grain.py`, `definitions.py`, `periods.py`, `sanity.py`, `consensus.py`, `confidence.py` and `verdict.py`, behind one entry point: `async def verify(question, catalog, connection, candidates, definitions, penalty) -> Verification`. Keep this logic out of `pipeline.py`, which is already 1,960 lines.
3. **`backend/app/agent/pipeline.py`:**
   - In the generation loop (line 1269 onwards), produce `candidate_count` candidates. The first follows the existing path; the others run concurrently with prompt or temperature variation.
   - After successful execution (the `break` near line 1604) and before `sql.ready` (line 1618), call `verify()`. Emit `verification.started`, `verification.check`, `verification.consensus` and `verification.decision`.
   - Feed blocking findings into the existing `repair_feedback` path.
   - Add a `verification` object to the success `result_payload` (line 1897).
   - Turn the dead-end `no_query` exits for validation and semantic failures (lines 1482 and 1546) into hand-off outcomes that carry evidence.
   - Factor candidate generation and verification into functions that the evaluation harness can call without SSE.
4. **`backend/app/knowledge/` (new) and `backend/app/control_database.py`.** Add `business_definitions` (term, synonyms, description, SQL filter/expression, owner, version, status, approved_by, approved_at) and `verified_queries`. Include approved definitions in `_retrieval_context` (`pipeline.py` line 796) and in `agent/retrieval.py`.
5. **`backend/app/feedback/store.py` and admin routes (`main.py` lines 1410, 1431, 1444).** Add `wrong_number` and `wrong_definition` to `REPORT_CATEGORIES` (line 12). Also create queue entries for hand-offs. Add an approve action that creates a definition or verified query. Together these form the review queue.
6. **`backend/app/arena/` (new, as an `APIRouter` rather than more code in `main.py`).**
   - `store.py`: sessions, participants, rounds, items and votes.
   - `service.py`: round state machine, randomisation and scoring.
   - Routes: host creates a session; audience joins by code; SSE session stream; vote; stump (enqueue a run under a per-participant quota); host open/close/reveal/advance; CSV export for the study.
   - Participants get an anonymous token, separate from account sessions. Stump runs are charged to the host account's credits through `_consume_openrouter_credit`.
7. **`backend/eval/` (new).** Add `download_bird_minidev.py`, `trap_set.jsonl`, `run_eval.py` (headless, with cached candidates), `metrics.py` and `results/`. Add unit tests that turn the four section 2.2 queries into regression fixtures for the grain, definition and period checks.
8. **`backend/app/config.py`.** Add `ARENA_MAX_STUMP_PER_PARTICIPANT` and `VERIFY_DEFAULT_PENALTY`. Keep `MAX_ACTIVE_RUNS` (line 56) at 5 and queue stump questions, showing each participant their queue position.
9. **Privacy mode, required before any company pilot (section 6.6).**
   - Mask columns that look like personal data (name, email, phone, MyKad) in the grounding values built in `agent/retrieval.py` (line 120) and in the answer rows sent from `providers/openrouter_client.py` (line 193).
   - Record what each run sent to a provider, and return it in the `verification` payload for the evidence panel.
   - Correct the README's privacy statement, which currently says providers receive only "safe result profiles".

### 7.3 Frontend changes

1. **`src/components/trust/` (new).** `TrustBadge.jsx`; `EvidencePanel.jsx`, showing findings, probe numbers, candidate agreement, and a small join-path view that highlights the fan-out edge using `@xyflow/react` as `ERDiagram.jsx` does; and `ClarifyOptions.jsx`.
2. **`src/views/LiveDemoView.jsx`.** Handle the `verification.*` events in `onEvent` (lines 709–855). Render the badge and evidence under each result. Send the chosen clarification as a follow-up turn.
3. **`src/components/demo/SlayQLTraceTimeline.jsx`.** Add a `verification` stage beside `sql_validation` and `semantic_validation` (lines 17–40).
4. **`src/components/demo/ThinkingEffortSelector.jsx`.** Relabel the levels as certainty levels, showing the candidate count for each.
5. **`src/components/demo/ReportModal.jsx`.** Change it to "Flag this number", using the new categories.
6. **New views in `SLUG_TO_VIEW` (`src/App.jsx` line 24).** `ArenaPlayerView.jsx` (`/play`, mobile-first and quick to load), `ArenaScreenView.jsx` (`/arena/screen`) and `ArenaHostView.jsx` (`/arena/host`, including the review queue and definition approval). No frontend screen exists yet for the admin chat-report endpoints, so the host view fills that gap.
7. **`src/services/api.js` and `src/services/sse.js`.** Add the arena and knowledge endpoints.
8. **Landing page.**
   - Rewrite the Hero copy around trust.
   - Have `BenchmarkSection.jsx` and `AblationSection.jsx` read results JSON exported from `backend/eval/results/` instead of `src/mock/mockData.js`.
   - Add a risk–coverage chart and remove the medal styling.
   - Add a "Play Trust or Bust" call to action.
9. **`src/components/workbench/AIDashboardBuilder.jsx`.** Show outcome badges on KPI cards. Compute KPIs with a server-side aggregate query instead of the 200-row preview (line 124). Rename the "DeepSeek Power BI Engine" badge (line 244) and the `generatePowerBIReport` and `editPowerBIReport` functions (section 7.1).
10. **Review queue and Definitions views (new).** Add `ReviewQueueView.jsx` (`/review`) and `DefinitionsView.jsx` (`/definitions`), shown only to analyst and admin roles, with a waiting-count badge on the review queue. The host console reuses their components.
11. **Retire mock views.** Remove `DashboardView.jsx`, `OnboardingView.jsx`, `src/components/dashboard/` and `src/lib/api/`. Redirect `/dashboard` and `/onboarding` to `/demo` in `SLUG_TO_VIEW`.

### 7.4 Final product pages and navigation

Routes build on `SLUG_TO_VIEW` in `src/App.jsx`.

**Public pages**

| Page | Route | Purpose | Status |
| --- | --- | --- | --- |
| Landing | `/` | Tagline, the wrong-revenue example, real evaluation results, links to the demo and the game | Change: trust message; real results instead of mock data |
| Login | `/login` | Sign in to a workspace | Exists |

**Pages for managers**

| Page | Route | Purpose | Status |
| --- | --- | --- | --- |
| Ask (main page) | `/demo` | Chat with the database. Each answer shows its outcome, expandable evidence and clarify buttons. | Change: trust badge, evidence panel, clarify options |
| History | Inside Ask | Past questions and saved answers | Exists |

**Pages for analysts and admins**

| Page | Route | Purpose | Status |
| --- | --- | --- | --- |
| Review queue | `/review` | Escalated and flagged questions with SQL, checks and alternatives attached; confirm, correct or approve | New; the backend flagged-answer endpoints partly exist |
| Definitions | `/definitions` | Approved meanings of business terms, with approver and live version | New |
| SQL Workbench | `/database-lab/workbench` | Investigate an escalated question by hand | Exists |
| Tables and ER diagram | `/database-lab/tables`, `/database-lab/er-diagram` | Understand the schema; the ER diagram also shows the join behind a fan-out warning | Exists |
| Report Studio | `/database-lab/ai-report-studio` | Management reports whose KPIs carry trust badges | Change later: rename away from "Power BI"; add badges |
| Connections and settings | Database Lab, `/profile` | Connect databases, manage the account; later, privacy mode | Exists |

**Event pages (demo day only)**

| Page | Route | Purpose | Status |
| --- | --- | --- | --- |
| Play | `/play` | Audience phone view: join, vote, ask, calculator, exit poll | New |
| Screen | `/arena/screen` | Big screen: QR code, live votes, reveals, trust wall, results | New |
| Host | `/arena/host` | Presenter control: advance rounds, moderate questions, approve definitions live | New |

**Removed or hidden:** `/dashboard` and `/onboarding` are removed, because both run on fake data. `/database-lab/health` is hidden from the navigation but stays reachable.

**Navigation by role**

- A manager sees only **Ask**. That simplicity is intended.
- An analyst or admin sees **Ask · Review queue · Definitions · Database Lab**, with a waiting-count badge on the review queue.
- Event pages stay out of the product navigation and are reached by QR code or link.

In total: 5 new pages (Review queue, Definitions, Play, Screen, Host), 3 changed (Landing, Ask, Report Studio), and 2 removed (`/dashboard`, `/onboarding`).

### 7.5 Payload sketch

The values below are illustrative, except the demo-database numbers, which were measured.

```json
{
  "verification": {
    "outcome": "clarify",
    "probability": 0.41,
    "threshold": 0.8,
    "penalty": 4,
    "findings": [
      {
        "check": "grain",
        "severity": "blocking",
        "resolved_by_repair": true,
        "detail": "orders joined to order_items gives 10,669 rows for 4,151 orders; SUM(orders.total_amount) was 3.7x the order-level total.",
        "probe_sql": "SELECT COUNT(*), COUNT(DISTINCT o.id) FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'completed'"
      }
    ],
    "consensus": {"candidates": 3, "clusters": [{"size": 2, "preview": "33,589,369.18"}, {"size": 1, "preview": "37,171,213.39"}]},
    "clarify_options": [
      {"label": "Completed orders only", "preview": "33,589,369.18", "candidate_id": "cand_a"},
      {"label": "All orders, including cancelled and refunded", "preview": "37,171,213.39", "candidate_id": "cand_c"}
    ],
    "definitions_used": []
  }
}
```

## 8. Plan

The plan assumes about six weeks and four workstreams. Compress it using the cut line if the deadline is sooner, and combine workstreams if the team is smaller.

| Week | Deliverables | Exit criterion |
| --- | --- | --- |
| 0 (first 3 days) | Fix the 14 failing tests and 1 error; archive the superseded docs; retire the mock `/dashboard` and `/onboarding` views; remove the ten-chart minimum; rename the Report Studio away from "Power BI"; correct the README's privacy statement; request ethics guidance; write the first 30 trap-set items; download BIRD Mini-Dev | `pytest` green; baseline B0 runs on the trap set |
| 1–2 | Grain, definition, period and sanity checks; repair integration; verification events and payload; TrustBadge and EvidencePanel | The four section 2.2 traps are caught in the live demo; B1 results on the trap set |
| 2–3 | Consensus, clarification from disagreement, confidence calibration; BIRD Mini-Dev runs for B0–B3 | Risk–coverage, RS(c) and ECE reported on held-out splits |
| 3–4 | Arena: session, join, vote and reveal for pre-computed rounds; big screen; host console; penalty slider | 20 people complete Round 1 and Round 2 on their phones in a rehearsal |
| **Cut line** | *Everything above is the minimum demo. Everything below is desirable.* | |
| 4–5 | Stump mode with queue and moderation; review queue and approved definitions ("Agree what revenue means" round); section 6.9 business moments (opener, calculator, exit poll); privacy mode; landing page with real results; Report Studio KPI badges | Full stage run-through under 15 minutes |
| 5–6 | Load test with about 50 simulated phones; dry runs; offline fallback; approved user study if applicable; final report chapters | Two clean rehearsals; results frozen with commit hashes |

| Workstream | Owns |
| --- | --- |
| Verification | `backend/app/verification/`, pipeline integration, repair feedback |
| Evaluation | `backend/eval/`, datasets, metrics, results chapters |
| Arena and frontend | Player, screen and host views, trust components, landing page |
| Product and study | Interviews, trap-set authoring, ethics, demo script, business case |

## 9. Demo-day runbook

- **Screens:** the big screen laptop runs `/arena/screen`, the host device runs `/arena/host`, and QR codes are printed large.
- **Network:** use the VPS deployment, with a mobile hotspot as backup. As a local fallback, run Docker Compose with the SQLite demo. Pre-computed rounds need no LLM, so Rounds 1, 2 and 5 still work if the model provider fails.
- **Capacity:** stump mode queues behind `MAX_ACTIVE_RUNS`, limits each participant to three questions, and can be switched off from the host console.
- **Moderation:** audience questions appear on the big screen only after host approval, or as outcome counts only.
- **Consent:** show the study consent screen only if ethics approval is in place. Otherwise label the game as engagement only.
- **Budget:** fix the model, set a credit budget on the host account, and check the cost per question from evaluation data beforehand.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Too many correct answers are flagged, so coverage collapses | Report the false-alarm rate; tune the threshold per *c*; present the trade-off rather than a single number |
| Candidates agree on the same wrong answer | Deterministic checks target systematic traps; report consensus-wrong cases as a finding |
| Calibration overfits a small dataset | Use held-out splits and a simple model; report ECE with its sample size |
| Errors in BIRD gold answers | Use the curated Mini-Dev set and manually inspect disagreements |
| LLM latency or outage on the day | Pre-computed rounds, an optional stump mode, and a local fallback |
| Inappropriate audience text on screen | Host moderation before display |
| Ethics approval arrives late | Treat the game as engagement only; run a separate approved study |
| Scope creep | Section 7.1 freeze list and the section 8 cut line |

## 11. Decisions needed this week

1. The deadline and demo format: stage slot length, booth, or both.
2. Whether the audience study goes through MUHREC. Ask the supervisor.
3. Whether to recover the Spider 2.0-Lite harness or rely on BIRD Mini-Dev and the trap set.
4. Whether to keep the current demo database or build a Malaysian distributor dataset. The recommendation is to keep it, because its traps are already real and measured, and localise labels only if time allows.
5. Whether to archive the three superseded documents.
6. Whether to look for a pilot company now. If it uses AutoCount, a SQL Server connector comes into scope; otherwise the pilot uses exported data uploaded as SQLite.

## Sources

- Lei et al. (2024), *Spider 2.0: Evaluating Language Models on Real-World Enterprise Text-to-SQL Workflows*. [arXiv:2411.07763](https://arxiv.org/abs/2411.07763)
- Lee et al. (2024), *TrustSQL: Benchmarking Text-to-SQL Reliability with Penalty-Based Scoring*. [arXiv:2403.15879](https://arxiv.org/abs/2403.15879), [code and data](https://github.com/glee4810/TrustSQL)
- BIRD benchmark and Mini-Dev. [bird-bench.github.io](https://bird-bench.github.io/), [Mini-Dev on Hugging Face](https://huggingface.co/datasets/birdsql/bird_mini_dev), [Mini-Dev repository](https://github.com/bird-bench/mini_dev)
- Wang et al. (2025), *AutoLink*. [arXiv:2511.17190](https://arxiv.org/abs/2511.17190)
- Related work to read on multi-candidate selection: *SIRIUS-SQL: Anchoring Multi-Candidate Text-to-SQL in Execution Feedback*. [arXiv:2606.01246](https://arxiv.org/pdf/2606.01246)

Malaysian context (section 6.6):

- DOSM, *MSMEs Performance 2025* (released 30 July 2026). [dosm.gov.my](https://www.dosm.gov.my/portal-main/release-content/micro-small--medium-enterprises-msmes-performance-2025)
- SME Corp, *Profile of MSMEs 2015–2024*. [smecorp.gov.my](https://smecorp.gov.my/index.php/en/policies/2020-02-11-08-01-24/profile-and-importance-to-the-economy)
- HASiL, *e-Invoice General FAQs*. [hasil.gov.my](https://www.hasil.gov.my/media/0xqitc2t/lhdnm-e-invoice-general-faqs.pdf). On the RM3 million exemption: [VATupdate, 8 September 2026](https://www.vatupdate.com/2026/09/08/malaysia-raises-e-invoice-exemption-threshold-to-myr-3-million/). On the phase timeline: [ClearTax Malaysia](https://www.cleartax.com/my/en/different-phases-implementation-timelines-einvoicing-malaysia). On the voluntary disclosure programme: [EY Malaysia](https://www.ey.com/en_my/technical/tax-alerts/e-invoice-special-voluntary-disclosure-program).
- Personal Data Protection (Amendment) Act 2024. [pdp.gov.my](https://www.pdp.gov.my/ppdpv1/en/akta/personal-data-protection-amendment-act-2024/). *Cross Border Personal Data Transfer Guideline 3/2025*: [PDF](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_CBPDT_EN-1.pdf). Summaries: [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/07/from-legislative-reform-to-practical-guidance-key-amendments-to-malaysias-pdpa-and-the-launch-of-cross-border-transfer-guidelines) and [DLA Piper on breach notification and DPOs](https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/).
- MOSTI, *National Guidelines on AI Governance and Ethics* (2024). [PDF](https://mastic.mosti.gov.my/storage/2024/09/THE-NATIONAL-GUIDELINES-ON-AI-GOVERNANCE-ETHICS.pdf)
- AutoCount on Microsoft SQL Server: [AutoCount Resource Center](https://wiki.autocountsoft.com/wiki/Others:_How_to_install_SQL_Server_Express_manually). SQL Account on Firebird: [eStream wiki](https://wiki.sql.com.my/wiki/Firebird), [eStream Firebird page](https://www.sql.com.my/firebird/).
- CPA Australia, [2025–26 Malaysia small-business summary](https://www.cpaaustralia.com.au/-/media/project/cpa/corporate/documents/tools-and-resources/business-management/small-business-survey/2025-2026-market-summaries/malaysia---full-summary.pdf?rev=11e5d699b17c447695a093ee5bf3c574) and [2025 Business Technology Survey, Malaysia](https://www.cpaaustralia.com.au/-/media/project/cpa/corporate/documents/tools-and-resources/business-management/business-management-research/business-technology-survey-2025-malaysia-summary.pdf?rev=41229f8ee0cb4727a369ad1625edbacc). KRI, [From Survival to Scale](https://www.krinstitute.org/publications/from-survival-to-scale-digital-empowerment-for-malaysias-micro-and-small-enterprises). These are cited in `MALAYSIA_MARKET_RESEARCH_AND_PITCH.md`.

Alternatives (section 6.4):

- Microsoft, [Copilot in Power BI overview](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction)
- Snowflake, [Cortex Analyst verified query repository](https://docs.snowflake.com/en/user-guide/views-semantic/verified-query-repository)
- Databricks, [Genie trusted assets](https://docs.databricks.com/gcp/en/genie/trusted-assets) and [Genie benchmarks](https://docs.databricks.com/gcp/en/genie/benchmarks)
- [AutoCount Cloud Accounting](https://www.autocountsoft.com/pro-cloud-acc.html), [SQL Account BI Dashboard](https://docs.sql.com.my/sqlacc/integration/bi-dashboard), [Neura57](https://neura57.com/)
