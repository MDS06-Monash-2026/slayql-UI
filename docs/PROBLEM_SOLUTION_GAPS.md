# SlayQL: problem, solution and gaps

One page for the team, supervisor and examiners. It maps every part of the problem statement to what SlayQL does about it, the evidence, and what remains open. Updated 29 September 2026. Numbers come from `backend/eval/results/`, generated with `deepseek/deepseek-v4-flash` through OpenRouter; see `REPORT_NARRATIVE.md` for sources and caveats.

## Problem statement

> Businesses want to ask their own data questions in plain language. AI can now write the SQL, but on real business data it is often wrong, and a wrong answer looks exactly like a right one. Managers must either trust unchecked numbers or have an analyst re-check everything, which removes the benefit. In Malaysia this is sharpened by e-invoicing (more structured, one-to-many invoice data), AutoCount and SQL Account ledgers, mixed-language questions and PDPA rules on data leaving the country.

## Is it a real problem?

| Claim | Evidence | Status |
| --- | --- | --- |
| AI SQL is often wrong on realistic data | Our engine: 251/547 (45.89%) on Spider 2.0-Lite; the plain pipeline is right on about 28% of BIRD Mini-Dev questions without hints and 49% with hints | Measured |
| Wrong answers look right | One revenue question gives 2.16M, 3.24M or 6.54M, and all three queries run without error (demo data) | Measured |
| The weak step is deciding what to trust | BIRD dev: a correct query is generated for 68.77% of questions but chosen for 56.19% | Measured (C-CaSE) |
| Businesses feel this pain | Discovery interviews | **Open**: see `INTERVIEW_GUIDE.md` |

## Problem → solution → evidence → gap

| # | Problem | What SlayQL does | Evidence | Remaining gap |
| --- | --- | --- | --- | --- |
| 1 | **Totals inflated by joins** (orders counted once per line or shipment) | Grain check probes rows against distinct keys and blocks inflated totals | Revenue fan-out caught (337 rows for 134 orders); caught in Report Studio live ("rows repeated 2.4 times") | None known |
| 2 | **Counting rows instead of things** ("how many customers" answered with an order count) | Entity-count check compares rows with distinct entities before answering; `EXISTS` conditions that never refer to the row being tested are blocked | 214 rows vs 60 customers caught; distributor "invoices that include rice" caught; correct forms pass (tests) | None known |
| 3 | **Business terms with no agreed meaning** ("revenue" with or without cancelled orders) | Definition check asks, showing each reading's number; status columns and yes/no flags (AutoCount `Cancelled = 'T'`). Definitions setup finds these terms when data is connected and shows each meaning's total (AutoCount starter pack); "Always use this" turns a clarify choice into the company rule | Trap set: every definition item clarified; AutoCount-style sample caught; starter pack tested in the app | Definitions must be approved by a person; that is by design. With the starter pack, SlayQL answered 86.4% of distributor questions instead of 59.1%, with no right answers held back. An approved rule can spread beyond its term (one invoice count excluded cancelled invoices); such answers now carry a caveat naming the rule |
| 4 | **Dates past the end of the data** ("last month" when data ended months ago) | Period check blocks, and a repair without a model call counts back from the latest data date; the answer states that assumption | Trap period items pass; "last month" answered correctly with the assumption shown | A reader may still have meant the calendar period; the note says how to ask for it |
| 5 | **Filters that match nothing** ('Resolved' vs 'resolved', `Cancelled = 'Y'` on a T/F flag) | Filter-value check blocks case mismatches, misspelt statuses and flag values in the wrong coding; warns on values with no rows | Tests; distributor flag errors caught; SQL Server treated as case-insensitive | None known |
| 6 | **Questions the data cannot answer** ("which salesperson…", "what is our stock balance") | Coverage and answer-subject checks hand off instead of relabelling unrelated data; SQL that reads no table, or whose comments admit it could not do what was asked, is blocked | Trap set: all 5 infeasible items handed off; distributor set: all 3 handed off; admission check matched only genuine admissions (8 of 5,357 queries) | Concepts hidden inside long phrasing may still slip through |
| 7 | **No way to tell right from wrong** | Four outcomes (confident, caveat, clarify, hand-off) from a calibrated confidence and a threshold set by the cost of a wrong answer | Trap set: wrong answers stated as fact 26.9% → 0% of questions, 73% answered immediately, no false alarms. BIRD (c = 1): 59.7% → 15.9%, 7.6% false alarms | On unfamiliar hard databases coverage is low; that is the honest trade-off |
| 8 | **Confidence does not transfer between companies** | Each data source's confidence is refitted from the analyst's review decisions | Learning curve: 33.9% → 1.6% confident wrong answers after 40 reviews, 0% after 80 | Needs real review decisions to learn from. On a new source the default is cautious: 25% of right distributor answers were held back at c = 4 (8.3% at c = 1) |
| 9 | **Everyone waits for the one person who knows the numbers** | Self-service answers; uncertain ones go to the analyst's review queue with evidence, and the answer comes back to the person who asked (in the app, optionally by email). A weekly distributor pack is emailed with checked figures and no AI cost | Built and tested; weekly pack sent as a real email, 10 of 10 figures passed | With a simulated person, 98.1% of trap questions and 95.5% of distributor questions (starter pack) end correct; a person was needed on 26.9% and 13.6%. The simulated analyst can be wrong (it overrode one correct answer). Time saved in a real team is not measured (needs a pilot) |
| 10 | **Knowledge is lost when staff leave** | Definitions library: approved, versioned meanings reused by every answer and report | Built; the audience-approved definition changes later answers live | Not measured with a real team |
| 11 | **Reports built on unchecked or sampled numbers** | Report Studio: every KPI and chart is its own checked query on full data; the summary may only restate computed facts; free refresh | Live on OpenTK: 9/9 figures checked, 0 sentences removed | Export limited to PDF (print) and JSON |
| 12 | **Malaysian systems** | SQL Server connector (AutoCount); AutoCount-style sample; AutoCount vocabulary (debtor, creditor, item group); Bahasa Malaysia questions | Distributor set (22 questions): 45.5% → 0% wrong answers stated as fact; Malay trap items 26.7% → 0%; connector tested to the network layer | Not yet run against a live AutoCount server; **no Firebird connector** (SQL Account uses export) |
| 13 | **PDPA: data leaving Malaysia** | Privacy mode masks personal columns; every answer and report lists what was sent | Built and tested | AI providers are still outside Malaysia |
| 14 | **Who may approve and review** | Password sign-in; owner, analyst and viewer roles per organisation that users cannot grant themselves; the review queue shows only your organisation's items | Tested (API and browser): wrong passwords refused, self-promotion refused, last owner protected, queues separated | Password reset by email is built; there is no single sign-on, and the public demo account is shared by design |

## What is not yet shown

1. **Business pain in users' own words:** interviews (planned).
2. **Use on a real company's data:** no pilot company was available in time; stated as future work with a pilot design (`PROJECT_DIRECTION.md` section 6.7).
3. **Independent test questions:** the trap set is team-written; external items can be added (`HELD_OUT_QUESTIONS.md`).
4. **Time or money saved:** needs a pilot; SlayQL makes no savings claims.
