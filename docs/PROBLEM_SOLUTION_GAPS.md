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
| 2 | **Counting rows instead of things** ("how many customers" answered with an order count) | Entity-count check compares rows with distinct entities before answering | 214 rows vs 60 customers caught; correct forms pass (tests) | None known; this was the arena's deliberate miss, now closed |
| 3 | **Business terms with no agreed meaning** ("revenue" with or without cancelled orders) | Definition check asks, showing each reading's number; status columns and yes/no flags (AutoCount `Cancelled = 'T'`) | Trap set: every definition item clarified; AutoCount-style sample caught | Definitions must be approved by a person; that is by design |
| 4 | **Dates past the end of the data** ("last month" when data ended months ago) | Period check blocks, and repair anchors to the latest data date | Trap period items pass | None known |
| 5 | **Filters that match nothing** ('Resolved' vs 'resolved') | Filter-value check blocks case mismatches, warns on absent values | Tests; SQL Server treated as case-insensitive | None known |
| 6 | **Questions the data cannot answer** ("which salesperson…", "customer satisfaction score") | Coverage and answer-subject checks hand off instead of relabelling unrelated data | Trap set: all 5 infeasible items handed off, in English and Bahasa Malaysia | Concepts hidden inside long phrasing may still slip through |
| 7 | **No way to tell right from wrong** | Four outcomes (confident, caveat, clarify, hand-off) from a calibrated confidence and a threshold set by the cost of a wrong answer | Trap set: wrong answers stated as fact 26.9% → 0% of questions, 73% answered immediately, no false alarms. BIRD (c = 1): 59.7% → 15.9%, 7.6% false alarms | On unfamiliar hard databases coverage is low; that is the honest trade-off |
| 8 | **Confidence does not transfer between companies** | Each data source's confidence is refitted from the analyst's review decisions | Learning curve: 34.8% → 1.6% confident wrong answers after 40 reviews, 0% after 80 | Needs real review decisions to learn from |
| 9 | **Everyone waits for the one person who knows the numbers** | Self-service answers; uncertain ones go to the analyst's review queue with evidence | Built and tested | Time saved not measured (needs a pilot) |
| 10 | **Knowledge is lost when staff leave** | Definitions library: approved, versioned meanings reused by every answer and report | Built; the audience-approved definition changes later answers live | Not measured with a real team |
| 11 | **Reports built on unchecked or sampled numbers** | Report Studio: every KPI and chart is its own checked query on full data; the summary may only restate computed facts; free refresh | Live on OpenTK: 9/9 figures checked, 0 sentences removed | Export limited to PDF (print) and JSON |
| 12 | **Malaysian systems** | SQL Server connector (AutoCount); AutoCount-style sample; Bahasa Malaysia questions | Connector tested to the network layer; Malay items 26.7% → 0% | Not yet run against a live AutoCount server; **no Firebird connector** (SQL Account uses export) |
| 13 | **PDPA: data leaving Malaysia** | Privacy mode masks personal columns; every answer and report lists what was sent | Built and tested | AI providers are still outside Malaysia |
| 14 | **Who may approve and review** | Admin-only approval of definitions and the review queue | Built | Roles are admin or not; no analyst/viewer split or SSO yet |

## What is not yet shown

1. **Business pain in users' own words:** interviews (planned).
2. **Use on a real company's data:** no pilot company was available in time; stated as future work with a pilot design (`PROJECT_DIRECTION.md` section 6.7).
3. **Independent test questions:** the trap set is team-written; external items can be added (`HELD_OUT_QUESTIONS.md`).
4. **Time or money saved:** needs a pilot; SlayQL makes no savings claims.
