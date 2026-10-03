# SlayQL business model (one page)

Draft of 30 September 2026. Items marked **[fill in]** come from the customer conversations in `CUSTOMER_CONVERSATIONS.md`. Everything else is measured in this repository or cited. Prices are hypotheses being tested, not agreed prices.

## Customer

- **Who:** growing Malaysian distributors and wholesalers that run AutoCount or SQL Account. They have a finance or accounts person but no data team.
- **Buyer:** the owner/MD or the finance head.
- **Users:** finance, sales and operations managers who need figures every week.
- **Not the first target:** micro-businesses with little structured data, or enterprises that already have Power BI and a data team.

## Problem

1. **Figures are slow.** Managers wait for the one person who can pull the numbers. **[fill in: hours per week spent preparing reports, from conversations]**
2. **Figures can be wrong without anyone noticing.** Examples: sales counted with cancelled invoices, with or without SST, or double-counted through joins. When AI writes the query, it states wrong answers as confidently as right ones. In our tests, a plain AI pipeline stated wrong answers as fact on **28.8%** of business questions and **45.5%** of AutoCount-style questions (`docs/REPORT_NARRATIVE.md`).
3. **People disagree on what a number means.** "Sales" can have several totals, and every new report re-opens the question.

**[fill in: 1–2 anonymised quotes, e.g. "Finance executive, Klang Valley distributor: …"]**

Supporting research: productivity (45%) and working capital (31%) are among Malaysian SMEs' reasons to digitalise ([Visa, 2025](https://www.visa.com.my/about-visa/newsroom/press-releases/over-80-percent-of-malaysian-msmes-embrace-digitalisation-visa-whitepaper-identifies-four-pathways-to-accelerate-expansion.html)). Disconnected applications and weak integration are common ([KRI/MDEC, 2026](https://www.krinstitute.org/publications/from-survival-to-scale-digital-empowerment-for-malaysias-micro-and-small-enterprises)).

## Offer

1. **Weekly checked pack, emailed every Monday.** It covers:
   - sales and collections this week;
   - what customers owe, and what is overdue beyond 90 days;
   - customers with the most overdue;
   - top items, margin by item group, and slow-moving items.

   Every figure is re-run and re-checked on that day's data. Figures that fail a check are held back for the analyst, not shown. It uses **no AI calls**.
2. **Ask follow-up questions** in English or Bahasa Malaysia. Each answer is checked against the data. SlayQL answers, asks which meaning was intended (showing the number for each), or hands the question to the company's analyst.
3. **Setup once:** the company approves what "sales", "collections" and "credit notes" mean (the AutoCount starter pack), so every answer and report uses the same meaning.

## Price (hypotheses to test)

| Plan | Includes | Price to test |
| --- | --- | --- |
| Pack | Weekly checked pack, 1 data source, 3 users | RM 99 / month |
| Team | Pack plus questions, review queue, definitions, 10 users | RM 199 / month |
| Branches | Several data sources or branches, scheduled reports per branch | RM 399 / month |

**[fill in: price answers from conversations. How many said yes to which price, and why?]**

## Cost to serve (measured)

| Item | Cost |
| --- | --- |
| Weekly pack | No AI calls: only database queries on the customer's data |
| A question (three independent candidate queries, then checks) | About **USD 0.001** in AI calls (500 BIRD questions cost USD 0.50) |
| An AI-built report in Report Studio | About **USD 0.0003–0.001** in AI calls; refreshing it is free |
| Hosting | One shared VPS serves many customers |

AI costs are negligible even at RM 99 a month. The real costs are **onboarding** (connecting the database, approving definitions) and **support**, so the business depends on making onboarding fast. The starter pack and suggested definitions exist for this.

## Channels

1. **AutoCount and SQL Account dealers:** they already sell to and support these companies. Offer a referral or reseller share. **[fill in: dealer view, if one was contacted]**
2. **Accounting firms** that serve many SMEs: one firm can bring several clients.
3. **Direct:** SME and industry associations, and word of mouth from pilot customers.

## Why SlayQL instead of the alternatives

| Alternative | Where it falls short for this customer | SlayQL |
| --- | --- | --- |
| AutoCount / SQL Account built-in reports | Only the reports designed in advance | Answers new questions; checked weekly pack |
| Power BI Copilot and other enterprise AI BI | Needs a data team, a prepared data model and enterprise licences | Connects to the existing database; finds ambiguous terms itself |
| ChatGPT with exported spreadsheets | Never checks itself; manual exports; personal data leaves the company | Checks every figure; live read-only connection; discloses what the AI saw |

**What is hard to copy:**
- checking results against the real data;
- confidence that learns from each company's own analyst;
- each customer's approved definitions and review history, which make SlayQL more accurate for that company over time and raise switching costs.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Willingness to pay is unproven | Price tested in conversations; the next step is a paid pilot |
| Company data goes to an overseas AI provider | Privacy mode masks personal columns, and every answer lists what was sent. The weekly pack sends nothing to AI. A Malaysia-hosted model is a later option |
| Not yet run on a real AutoCount database | A read-only pilot with one distributor is the next step (design in `PROJECT_DIRECTION.md`, section 6.7) |
| Big vendors add similar checks | Stay focused on SMEs without data teams, with local integrations and dealers |

## Evidence status

| Claim | Status |
| --- | --- |
| AI answers on business data are often wrong without warning | **Measured:** 28.8% and 45.5% before SlayQL; 1.9% and 0% after, on our test sets |
| SlayQL answers most business questions safely | **Measured:** 75% (trap set) and 86% (distributor, starter pack), with no right answers held back on the distributor set |
| With a person in the loop, most questions end correct | **Measured (simulated person):** 98.1% and 95.5% |
| Malaysian finance staff feel this pain | **[fill in from conversations]** |
| They would pay | **[fill in from conversations]** |
| It works on a real company's data | **Not yet:** the pilot is the next step |

## Next milestones

1. A read-only pilot with one distributor: weekly pack plus 20 real questions, checked by their finance person.
2. Three paying pilot customers.
3. One dealer or accounting-firm partner.
