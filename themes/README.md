# `themes/` — HT-32 S6 · the one address for a colour, per theme

**These files are not new colours. They are `tokens.css` §3's four instrument skins MOVED here**
(R70.282: *"two colour files is two addresses"* — so the skins live in exactly one place, and
`tokens.css` stops declaring them). `tokens.css` keeps what is genuinely shared: §1 the `--ht-*`
source palette, §2 the legacy name mapping, §5/§6/§7 the state and scrollbar defaults.

| file | theme | descends from | offered in the picker |
|---|---|---|---|
| `classic.css` | **Classic** — today's look | `tokens.css` §4 `[data-simple]` | yes |
| `graphite.css` | **Graphite** — near-black, cool greys | §3 `carbon` | yes | *(default until paste 179)*
| `midnight.css` | **Midnight** — deep navy, cyan | §3 `blueprint` | yes |
| `paper.css` | **Paper** — light, warm greys, ink | §3 `statement` | yes |
| `terminal.css` | Terminal — black, phosphor amber | §3 `terminal` | **no — kept, never deleted (R70.138)** |
| `slate.css` | **Slate** — near-black, cool grey ramp, one cold accent | Graphite, sharpened (179 S6) | yes · **default** since 179 · the dark half of Follow system |
| `ember.css` | **Ember** — warm charcoal, one copper accent | new (179 S6) | yes |
| `linen.css` | **Linen** — off-white paper, ink, one blue accent, muted states | Paper, sharpened (179 S6) | yes · the light half of Follow system |
| `mono.css` | **Mono** — no hue: accent and states differ by lightness and a glyph | new (179 S6) | yes |

## Three things a later wire must not undo

1. **The accent is never red.** `tokens.css` §1: *"RED IS STATE ONLY — it is `--bad` and the overdue
   tint, and it is not decoration."* `carbon` (#FF3B41) and `statement` (#B0161C) both spent the
   accent on red; Graphite and Paper do not.
2. **Load order is load-bearing.** `:root[data-theme="x"]`, `:root[data-simple]` and
   `:root[data-skin="y"]` all have the SAME specificity (0,2,0), so the later file wins. `classic.css`
   is linked FIRST precisely because it carries `[data-simple]` — the attribute the app sets on every
   simple-view load — and every other theme must be able to beat it. Re-order the `<link>`s and the
   picker silently stops working in the simple view.
3. **The legacy `data-skin` values still resolve.** Each file names its old skin selector beside the
   new one, so a preference saved before HT-32 keeps working without a migration and without a second
   declaration of the same colour.

`tools/contrast_ht32.py` re-measures every text/background pair in **all five** themes and fails the
wire under 4.5:1. **Measured 2026-09-23: 270 pairs, 0 FAIL.** Terminal was going to be excluded by
name — an unoffered historical skin held to a floor it was never designed for would have forced a
change nobody could see — but it was measured first and it passes, so there is no exemption to
write. The script reads `themes/*.css` rather than a copy of their values, for the reason
`contrast_ht25.py` gives for reading `tokens.css`: *"so this can never drift from what ships"*.

## Paste 179 — the four schemes

Each is ONE accent hue, ONE neutral ramp, exactly TWO state colours (`--good` / `--bad`; `late` and `at risk` are the accent) and one colour per group member (`--m1`..`--m4`, which every theme now carries). No gradients, no glows. `tools/contrast_ht32.py` holds the member colours to the text floor too: **9 themes, 630 pairs, 0 under 4.5:1**, measured 2026-09-23. The picker lists the four new first, then Classic · Graphite · Midnight · Paper; Terminal stays hidden; nothing was removed (R70.138).
