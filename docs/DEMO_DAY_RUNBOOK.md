# Demo-day runbook: Trust or Bust and the live demo

For whoever hosts the session. Written 27 September 2026 and tested locally that day: 50 simulated phones went through all 11 rounds with no errors. Rehearse once on the real venue network with real phones.

## Before the day

1. **Deploy and check the site.** Open `/api/v1/health` on the live site. It must say `"status": "healthy"` and `"backend_database": "postgres"`.
2. **Load test the live site** the evening before, when nobody is using it. It creates one game session and a few test votes:
   ```bash
   python -m backend.eval.arena_load_test --base https://<your-site> --players 50
   ```
   Pass condition: `errors: 0`, and state reaching every phone in under 1 s at p95. Add `--stump 1` to include one real model call.
3. **Reset the demo definition.** The definition round approves a "revenue" definition on the demo database. Before the audience session, retire any earlier "revenue" definition in `/definitions` so the round starts from "needs your input".
4. **Credits.** The host account needs credits for the stump round and the re-ask; about 30 is plenty.
5. **Print the QR code** large, and bring a mobile hotspot as a network fallback.

## Screens

| Device | Page |
| --- | --- |
| Projector laptop | `/arena/screen?code=XXXXX` |
| Host phone or laptop | `/arena/host` (create the game here; it shows the code) |
| Audience phones | Scan the QR code, or open `/play` and type the code |

## Script (about 12 minutes)

| Round | Host says | Host does | Watch for |
| --- | --- | --- | --- |
| Lobby (1 min) | "Scan the code. Tick the box only if you're happy for your anonymous answers to be used in our study." | Wait for joins | Player count on the big screen |
| A/B poll (1 min) | "Which tool would you give your sales manager?" | Next, then reveal | Tool B numbers come from the business test set |
| Board-pack cards (4 × 1 min) | "Would you put this number in the board pack?" | Next, wait for votes, Reveal | Half the room sees SlayQL's evidence and half doesn't; that is the experiment |
| Penalty (1.5 min) | "Pick a decision your business makes with a number. How much worse is a wrong number than a right one?" | Next | See the note below about high penalties |
| Stump SlayQL (2 min) | "Try to make SlayQL confidently wrong. Three questions each." | Approve good questions to the screen; mark a confident mistake if one happens (+5 points) | Answers take 10–40 s |
| Agree what revenue means (1.5 min) | "Three definitions, three different totals. Vote." | Approve the winner, then Re-ask | The re-ask shows "Checks passed" with "Approved definition" |
| Results (1 min) | "Here is how well you spotted wrong numbers, with and without evidence." | Next | Small live sample: say "indicative" |
| Exit poll (30 s) | "Three quick questions before you go." | Export the study CSV from the host page | Only consenting players are exported |

### Known behaviours to explain, not fix

- **A high room penalty means SlayQL answers nothing on its own.** At a median penalty of 8 or more, the threshold is 89% or higher. The default confidence model tops out at 88% until a data source has approved definitions or learned from reviews. The penalty and stump rounds will then show hand-offs. Say: "That is the point. For commission, you'd rather it checked with your analyst. Once your analyst has reviewed some answers or approved definitions, it earns the right to answer." The definition round still works, because an approved definition raises confidence to about 96%.
- **Stump questions about things the data does not contain** (satisfaction scores, salespeople) are handed off. If SlayQL ever answers one confidently, mark it as a confident mistake: that honesty is part of the pitch.
- **One board-pack card is a genuine SlayQL miss** ("How many customers have placed at least one order?", which counts orders instead of customers). The evidence group sees "checks passed" on a wrong answer. This measures over-reliance; don't apologise for it, explain it on the results screen.

## If something goes wrong

| Problem | Do this |
| --- | --- |
| Venue Wi-Fi blocks phones | Switch the laptop to the hotspot; the join URL stays the same |
| Model provider slow or down | Skip the stump round. Every other round needs no model call except the re-ask; skip that too and describe it |
| Big screen stops updating | Refresh the screen page; state is kept on the server |
| Game lost (server restarted) | Create a new game from `/arena/host`; phones re-join with the new code |
| Anything else | Play the recorded walkthrough (record one at the final rehearsal) |

## Live product demo (5 minutes, after the game)

1. `/demo`: ask "What is our total revenue?". It asks which figure you mean and shows both numbers.
2. Choose "Completed orders only", then approve it as a definition in `/definitions`.
3. Ask again in Bahasa Malaysia: "Berapa jumlah jualan kita?". It answers confidently, citing the approved definition.
4. Database Lab → Report Studio: build "How is revenue trending, and which customer segments and products drive it?". Point out the badge on every figure, the key highlights with numbers in bold, and "Refresh (free)".
5. Review queue: show a hand-off arriving with its evidence, confirm it, and point out the "What SlayQL has learned" panel.
