# Customer conversations: one-week kit

For the team. It contains the consent note, a 20-minute script, a write-up template, a summary template, and the message asking a lecturer for outside test questions. The longer `INTERVIEW_GUIDE.md` remains the reference; this is the short version for a one-week timeline.

## Before the first conversation

- [ ] **Ask Dr Soon** whether these conversations need ethics approval, or can run as informal feedback (no recordings, anonymised notes). Follow her answer.
- [ ] Decide who leads and who takes notes for each conversation.
- [ ] Have the weekly pack ready to show, either:
  - **live:** log in → AI Database Lab → add the "Malaysian distributor (AutoCount-style)" sample → Report Studio → "Weekly sales and collections (distributor)"; or
  - **offline:** the screenshot `docs/assets/weekly-pack-sample.png`.
- [ ] Use a different price for each conversation, in rotation: RM 99, then 199, then 399, then back to 99.

## Consent note (read aloud or send before the call)

> Thank you for your time. We are final-year students at Monash University Malaysia working on SlayQL, a tool that answers business questions from company data and checks the numbers before showing them. We would like about 20 minutes to hear how your team gets its business figures today.
>
> - Taking part is voluntary, and you can stop at any time or skip any question.
> - We will not record unless you agree. We take written notes.
> - Our notes describe you only by role, industry and state (for example "finance executive, distributor, Selangor"). No names, company names or figures are kept.
> - We will not ask for any company data.
> - We may quote something you say in our project report, without your name, only if you agree at the end.
> - Our supervisor is Dr Soon **[add her email]** if you have any questions about the project.
>
> Is that alright?

## The 20-minute script

**Warm-up (2 min):**
- "What's your role, and what does your company do?"
- "Roughly how many staff, and which accounting system do you use?" (AutoCount? SQL Account? Excel?)

**1. How they get figures today (4 min)**
- "Walk me through how you prepared the last weekly or monthly figures for your manager or owner."
- *Probe:* "How long did that take? Who else was involved? Where did the numbers come from?"

**2. Who they wait on (3 min)**
- "When someone needs a number that isn't in the usual report, what happens?"
- *Probe:* "Is there one person everyone asks? What happens when they're busy or on leave?"

**3. When a number was wrong (4 min):** the most important question.
- "Tell me about a time a number in a report or meeting turned out to be wrong, or people disagreed about it."
- *Probe:* "What caused it (cancelled invoices, tax, different definitions)? What did it cost: time, a bad decision, an awkward meeting?"
- If they can't recall one: "How do you make sure the numbers are right before they're shared?"

**4. Show the weekly pack (3 min).** Show it only now, without selling.
- "This is an example weekly pack built from sample distributor data. Every figure is re-checked before it is sent."
- Then stop talking and ask: "What's useful here? What's missing? What would you not trust?"

**5. Price (2 min)**
- "If a pack like this, plus the ability to ask your own questions, cost **RM [this conversation's price]** a month, would your company pay for it?"
- *Probe:* "Why or why not? Who would decide? What would it need to include?"

**Close (2 min)**
- "Can we quote anything you said, without your name?"
- "Would your company consider trying it on your own data later?"
- "Who else should we talk to?"

**Rules for the interviewer:**
- Ask about **what happened**, not what they would do. "Would you use it?" gets polite yeses; "when did this last happen?" gets evidence.
- Don't pitch before question 4, and don't argue with criticism: write it down, it's the most useful part.
- Let silences run. People add the important detail after a pause.

## Write-up template (fill in the same day)

```
Conversation #:        Date:          Led by:          Notes by:
Role / industry / state:
Staff size (approx):   Accounting system:
Consent to quote: yes / no

1. How figures are prepared today, and time taken:
2. Who they wait on:
3. Wrong or disputed number: what happened, what caused it, what it cost:
4. Reaction to the weekly pack: useful / missing / would not trust:
5. Price asked: RM ___   Answer: yes / no / depends. Reason:
Language preference (English / BM / Mandarin):
Data concerns (overseas AI, PDPA):
Would try on own data: yes / no / maybe
Best quote (exact words):
Surprise (anything we did not expect):
```

## Summary template (day 5, one page)

```
Conversations held: N   (roles and industries)
Average time spent preparing figures: ___ hours/week (range ___–___)
People who described a "one person who knows the numbers": _ of N
People with a real wrong-number story: _ of N   Most common cause: ___
Weekly pack: most useful parts ___; most requested missing ___; trust concerns ___
Price answers: RM 99: _ yes / _ no; RM 199: _ / _; RM 399: _ / _
Language: English _ / BM _ / Mandarin _
Data concerns raised: ___
Would try on own data: _ of N
Three best quotes (with permission):
1.
2.
3.
What surprised us / what we should change in the pitch:
```

Send the summary to update `BUSINESS_MODEL.md`, `PROBLEM_SOLUTION_GAPS.md` and the report.

## Message asking for outside test questions

> Hi **[name]**, for our FYP (SlayQL, which checks AI-written answers to business questions) we need about 10 test questions written by someone outside our team. Could you spare 30–45 minutes?
>
> We would give you the sample database's tables (a Malaysian distributor: invoices, customers, receipts, credit notes, items). You write 10 questions a manager might ask, and the answer you would expect for each (or how you would calculate it). Please include one or two tricky ones: an ambiguous term, a question the data cannot answer, or one in Bahasa Malaysia. We won't see them before running them, and we will report the results as they come out, including failures.
>
> Thank you!

Put the questions and expected answers in the format described in `HELD_OUT_QUESTIONS.md`, then run them blind.
