# Murder at Veridian Isle

An interactive, evidence-driven murder mystery for the browser — a *Glass Onion*–style
whodunit set on a tech billionaire's private island. You play an outside detective,
mysteriously invited to Augustus Crane's birthday. By midnight, a guest is dead, and you
have until the dawn ferry to name the killer.

No images, no placeholder art, no AI slop — the entire experience is built from
typography, CSS, and writing.

## Play it

It's a static site with **no build step and no dependencies**. Either:

```bash
# Option A — just open it
open index.html        # macOS  (use your file explorer on Windows/Linux)

# Option B — serve it locally (recommended; avoids any file:// quirks)
python3 -m http.server 8000
# then visit http://localhost:8000
```

Your progress saves automatically in the browser (localStorage), so you can refresh or
come back later.

## How the game works

| Phase | What you do |
|-------|-------------|
| **Investigate** | Five locations, each played a *different* way — search a crime scene, reconstruct a timeline, crack a keycard logic puzzle, read hidden documents, and interrogate suspects. |
| **Collect** | Every clue files itself into your **Notebook**, grouped by type (physical, digital, document, testimony, timeline). |
| **Deduce** | On the **Deduction board**, back each suspect's Means / Motive / Opportunity with a clue you actually found. Everyone has a motive — only the killer has all three. |
| **Accuse** | Name the killer, the method, and the single decisive piece of evidence. Get all three right to close the case. |

The five scenes deliberately use five different interaction styles, and clues come in
contradicting vs. corroborating flavours, so progression never feels repetitive.

## The team

| Member | Role | Responsibility |
|--------|------|----------------|
| **Kian** | Coder | Game engine, state, scene interactions, deduction logic, save system |
| **Andrew** | Designer | Dark-ocean palette, typography, layout, mood |
| **Vivaan** | Rule Maker | Means/motive/opportunity logic, the deduction matrix, win conditions |
| **Charlie** | Writer | Victim, suspects, every clue, dialogue, and the twist |

(Also shown in-game on the **Team** page.)

## Project structure

```
index.html        App shell, top navigation, atmosphere layers
css/styles.css    All styling — the noir island look
js/data.js        ALL story content & deduction logic (easy to edit, no engine code)
js/app.js         The engine — routing, state, the five scene interactions, board, accusation
```

To tune the mystery, edit `js/data.js`:
- `suspects`, `evidence`, `scenes` — the cast, the clues, and the playable locations
- `matrix` — the means/motive/opportunity truth table (the rule-maker's domain)
- `solution` / `accusation` — who did it, how, and the proof required

A self-check that the puzzle is solvable (exactly one suspect guilty, every clue
reachable) is included in the commit history and can be re-run against `js/data.js`.
