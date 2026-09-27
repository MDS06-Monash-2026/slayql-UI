# Discovery interviews: guide for the team

The business case says managers wait for data answers, get wrong numbers, and lose knowledge when staff leave. Only the wrong-number problem is measured so far. These interviews check the other two with the people who live them. Aim for **8–12 interviews of 20–30 minutes**, and record what people say, not what we hope they say.

## Who to talk to

Mix the roles. At least two of each of the first three:

- **Managers or owners** who ask for figures (sales, operations, general managers).
- **Finance or accounts staff** who produce the figures, especially anyone using AutoCount, SQL Account or Excel exports.
- **Analysts or IT staff** who receive data requests.
- **Optional:** an AutoCount or SQL Account dealer, who can speak to what many small companies ask for.

Ways to reach them: internship hosts, family businesses, the supervisor's industry contacts, and Monash alumni on LinkedIn.

### Message to send

> Hi [name], I'm a Monash Malaysia final-year student. Our project helps managers get answers from their company's data and know when an answer shouldn't be trusted. Could I ask you about how your team gets business figures today? It takes 20–30 minutes, online or in person, and I won't ask for any company data. Your name and company won't appear in our report unless you say they can.

## Consent (read at the start)

> Thanks for your time. I'll ask about how your team gets and checks business figures. There are no right answers, and you can skip any question or stop at any time. With your permission I'll take notes, and record audio only to check my notes; the recording is deleted after the project. In our report we'll describe you by role and industry only, for example "finance manager at a distributor", unless you tell us we can name you. Is that OK? Can I record?

Note the answer in your notes. If they say no to recording, take notes only.

## Questions

Ask them in order and follow up with "Can you give me an example?" and "What happened next?". Don't show SlayQL until the last section.

**Warm-up (2 min)**
1. What is your role, and roughly how big is the team or company?
2. Which systems hold your business data? (AutoCount, SQL Account, Excel, an ERP, and so on.)

**Waiting (5 min)**

3. Think of the last time you needed a number you couldn't get yourself. What was it, who did you ask, and how long did it take?
4. Roughly how many requests like that happen in a week in your team?
5. Who is "the person who knows the numbers"? What happens when they are on leave?

**Wrong numbers (8 min)**

6. Tell me about the last time a figure in a report or meeting turned out to be wrong. How was it found, and what did it cost: time, money or embarrassment?
7. How do you decide today whether a figure is safe to use?
8. Have two people ever brought different numbers for the same thing, such as sales or revenue? What was the difference?
9. Who decides what "revenue", "active customer" or "overdue" means in your company? Is it written down?

**Trust (5 min)**

10. Have you or your team used ChatGPT or another AI tool with company figures? What happened?
11. Would you use an AI answer that said "I'm not sure, I've sent this to your analyst"? Why or why not?
12. What would make you trust a "confident" label on an AI answer?

**Reaction (5 min; show the demo or screenshots now)**

13. Show "What is our total revenue?", with the two options and their numbers. Ask: "What would you do with this?"
14. Show a Report Studio report with its badges. Ask: "Would this replace anything you do today? What is missing?"
15. What would stop your company using something like this? (Don't list options first; afterwards, probe privacy, cost, AutoCount compatibility and language.)
16. If it worked on your own data, who would pay for it, and roughly what would it be worth to them?

**Close (1 min)**

17. Is there anyone else we should talk to?

## Notes template (one file per interview, `interviews/INT-01.md`, not committed)

```text
ID: INT-01          Date:            Interviewer:
Role and industry:  (e.g. finance manager, FMCG distributor, 40 staff)
Systems:
Consent: notes yes/no · audio yes/no · may name company yes/no

Waiting:        requests per week ___ · typical wait ___ · key person? ___
Wrong numbers:  last incident (their words) ___ · cost ___ · how they check ___
Definitions:    who owns them ___ · written down? ___
AI use and trust:
Reaction to demo:
Barriers (unprompted first):
Willingness to pay (their words, no numbers we suggested):
Best quote (verbatim, with permission):
```

## After the interviews

Put a table in the report with one row per interview (role, industry, system) and one column per problem: waiting, wrong numbers, lost knowledge. Mark each cell **confirmed**, **not an issue** or **not discussed**, and quote where you can.

Report counts ("7 of 10 described a wrong figure reaching a meeting"), never percentages from a convenience sample. Revise section 6.2 of `PROJECT_DIRECTION.md` to match what you heard, including anything that argues against the product.
