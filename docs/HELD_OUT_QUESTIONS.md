# Held-out test questions from outside the team

The team wrote the business trap set, so it may favour SlayQL's checks. To test that, we ask 2–3 people outside the team (another student, a lecturer, or someone who works with business data) to write about 10 questions each, without seeing SlayQL's checks. SlayQL is then scored on their questions separately.

## Instructions to send to a question writer

> Thank you for helping. Imagine you manage the company in this database and want figures for a meeting. Please write about 10 questions you would genuinely ask, in English or Bahasa Malaysia, and include some that are tricky or ambiguous. For each one, give the correct answer as SQL, or explain the answer and we will write the SQL with you.
>
> The database is an online software company's sales data: customers, orders, order lines, products and categories, payments, shipments, support cases, warehouses, suppliers, employees and teams. Orders have a status (completed, shipped, processing, refunded, cancelled), and orders run from 2 March 2025 to 28 June 2026.
>
> Also include:
> - one or two questions the data cannot answer (the right response is to say so);
> - one or two that could reasonably mean two different things (the right response is to ask which).
>
> Please don't look at SlayQL's code or documentation first.

Share the schema as a table list or the ER diagram screenshot from the Database Lab, not the trap set.

## Adding the questions

Put them in `backend/eval/datasets/external_items.jsonl`, one JSON object per line, in the format of `external_items.example.jsonl`:

| Field | Meaning |
| --- | --- |
| `id` | Must start with `ext-`, for example `ext-amira-03` |
| `author` | Who wrote it (a pseudonym is fine), for example `lecturer-1` |
| `language` | `en`, `ms` or `mixed` |
| `trap` | Best guess: `none`, `fanout`, `definition`, `period`, `infeasible` |
| `expected` | `answer`, `clarify` (two reasonable meanings) or `handoff` (data can't answer) |
| `gold_sql` | Correct SQL for `answer`, or one reading for `clarify`; empty for `handoff` |
| `alternatives` | For `clarify` only: SQL for the other reading or readings |

Then run:

```bash
python -m backend.eval.datasets.build_trap_set      # checks every gold query runs and that clarify readings differ
python -m backend.eval.generate --dataset trap      # generates only the new questions (a few cents)
python -m backend.eval.evaluate --dataset trap      # prints results by author and by language
```

Report the external authors' results as their own line, whatever they show. If SlayQL does worse on them, that is a finding about the trap set, and it belongs in the limitations.
