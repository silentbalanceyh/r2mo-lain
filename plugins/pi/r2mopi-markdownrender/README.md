# r2mopi-markdownrender

Pi coding agent extension + theme that ports the report rendering style used by the
**R2MO Codex fork TUI** (`codex-rs/tui/src/markdown_render.rs`, `status_indicator_widget.rs`)
to Pi's interactive transcript.

```bash
pi install npm:r2mopi-markdownrender
```

Then run `/reload`, select the bundled theme once via `/settings` → **Theme** → **mxt**,
and use `/mdstyle` to switch render styles.

---

## What it does

| Element | Effect |
| --- | --- |
| H1 | bold + underline (+ green in ANSI mode) |
| H2 | per-style color; `codex` style adds a `## ✨` marker |
| H3 | per-style color; `codex` style adds `📌` after the built-in `###` prefix |
| H4–H6 | italic in ANSI mode (Codex fork parity) |
| Unordered list | `- 🔸` in `codex` style |
| Task list | stays `[x]` / `[ ]`; the `codex` style colors that marker in ANSI mode |
| Status lines | `✓` green, `✗`/`×` red, `!`/`▲` yellow, `ℹ` cyan, `✦`/`★` purple — coloured in **every** mode, so a failure reads red even in the icons mode |
| Skill links | `skill://…` and `…/SKILL.md` labels in mauve + underline |
| Inline code | classified in ANSI mode: command teal, path peach, skill mauve, URL blue; anything else keeps the theme's `mdCode` |
| Bare URLs | underlined link blue — the fork styles bare URLs too (`web_links.rs`) |
| Working spinner | gold `⠋⠙⠹…` frames (Working row only) |

Status symbols are written at the start of a report line, with or without a list bullet:

```markdown
✓ build passed
! cache refresh needs a second look
i Windows coverage missing
ℹ informational note
✦ additional remark
- ✓ works inside a bullet too
[i] the letter i is only detected in bracketed form
```

## Commands

| Command | Meaning |
| --- | --- |
| `/mdstyle` or `/mdstyle show` | print the current configuration |
| `/mdstyle off` | fully disable (no icons, no colors, no spinner change) |
| `/mdstyle icons` | content-level icons plus the status-symbol colours; no wider ANSI injection (safe default) |
| `/mdstyle ansi` | icons **+ ANSI colors** (experimental, see below) |
| `/mdstyle a` / `b` / `c` | the three palette options from the design sheet |
| `/mdstyle codex` | the landed R2MO Codex fork style (Catppuccin + ✨ 📌 🔸) |
| `/mdstyle headings on \| off` | toggle heading icons/colors |
| `/mdstyle lists on \| off` | toggle list icons and task checkboxes |
| `/mdstyle status on \| off` | toggle status-line coloring (applies in every mode) |
| `/mdstyle working on \| off` | toggle the gold Working spinner |
| `/mdstyle code on \| off` | toggle inline-code classification and bare-URL underlining |
| `/mdstyle reset` | restore defaults |

Configuration persists in `<agent-dir>/r2mopi-markdownrender.json`
(`$PI_CODING_AGENT_DIR` or `~/.pi/agent`).

## Styles

| Style | H2 | H3 | Body of status lines | Icons |
| --- | --- | --- | --- | --- |
| `a` | green `#7ee787` | blue `#67e8f9` | colored | — |
| `b` | blue `#67e8f9` | purple `#d8b4fe` | symbol only | — |
| `c` | purple `#d8b4fe` | plain `#d7dde8` | colored | — |
| `codex` | green `#a6e3a1` | blue `#89b4fa` | symbol only | `## ✨`, `📌`, `🔸`, `[x]` |

`a`/`b`/`c` come from `work/markdown-style-options.html`; `codex` is what actually
landed in the fork.

### Task markers: why `[x]`/`[ ]` and not `☑`/`☐`

The fork hardcodes `☑`/`☐`
(`codex-rs/tui/src/markdown_render/task_lists.rs`). Those two are a trap in a terminal:

- SF Mono and Andale Mono have **no glyph for either** character.
- `☑` is `Extended_Pictographic`, so the missing glyph falls back to Apple Color Emoji
  and is drawn as a **double-width colour emoji**.
- Pi and Codex both measure the marker as **one cell**, so the hanging indent of a task
  item lands one column short — the checkbox and its text no longer line up.

Task items therefore keep the ASCII markers `[x]` / `[ ]`. ASCII always measures and draws
as three cells, in every font and every terminal, and it is exactly what Pi's own Markdown
renderer emits (`pi-tui` `dist/components/markdown.js`). In ANSI mode the marker is
coloured — green when checked, grey when not — without changing its width. The rewrite
branch stays enabled so a task line never also picks up the `🔸` list icon.

Everything else in the `codex` style (✨ `📌` `🔸`) is emoji by design and measures two
cells on both sides, so it stays aligned.

### List icon: the fork's `🔸`

Unordered items render as `- 🔸` (SMALL ORANGE DIAMOND, U+1F538), exactly like the fork.
The same diamond also exists one size up, `🔶` (LARGE ORANGE DIAMOND, U+1F536): both are
East Asian Wide, both measure and draw as two cells, and both come from the same emoji
font, so swapping them is purely cosmetic and never moves the indent. `🔹`/`🔷` are the
small/large blue pair. `◆` (U+25C6) is the narrow one-cell alternative, but it comes from
the monospace font instead of the emoji font, so it reads as a small diamond again.

## Theme

`themes/mxt.json` is a full 56-token Pi theme (built from the built-in `dark` theme, so
every token is present) with an `mxt*` variable palette:

- `mdHeading` green, `mdLink` blue, `mdCode` the fork's inline-code blue `#63a8f8`
  (`CHATGPT_BLUE_200`), `mdCodeBlock` teal, `mdQuote` green
- Catppuccin-style `syntax*` colors
- `accent` = `mxtSky`, Pi's shared UI accent (selectors, loaders, the compaction
  spinner, read/grep/find path colours)
- `todoHeading` = the fork's plan-heading green `#87ff5f` (`rgb_color((135, 255, 95))`,
  `history_cell/plans.rs`) — a custom token that only `rpiv-todo`'s overlay heading reads,
  so the few bright-green characters stay that way while nothing else follows them; see
  *Plan and todo colours* below
- `success`/`error`/`warning` aligned with the `✓ ! ✗` symbol colors
- `toolSuccessBg`/`toolErrorBg` (`#1e2a22`/`#3a1c22`) tint a settled tool call green or red without recolouring its text — Pi only paints the *text* of a failed call red in some renderers (`edit`/`write` previews, `[invalid arg]`), so the background is what makes every failure visible
- `export` backgrounds tuned for HTML export

Because only one `mdHeading` token exists, the theme alone cannot color heading levels
differently — that needs the ANSI layer.

### Plan and todo colours

The fork's **Updated Plan** cell hardcodes exactly one colour and takes the rest from its
palette: the heading `• 🧬 Updated Plan · n/m complete` is `rgb_color((135, 255, 95))` —
bright green, bold — completed steps are `dim` plus struck through, in-progress steps use
`accent_color()` (the fork's `UI_ACCENT = CHATGPT_BLUE_200`, a blue), and pending steps are
`dim`.

Pi's todo list (`rpiv-todo`) draws itself, so its colours come from theme tokens:

| Element | Token | Value here |
| --- | --- | --- |
| Overlay heading `● Todos (n/m)` | `todoHeading` (custom) | bright green `#87ff5f` — the fork's plan-heading colour |
| Task name in the call cell, and every other `accent` consumer | `accent` | sky `#89dceb` |
| Completed row `✓` and the `✓` result cell | `success` | `#4ade80` |
| In-progress row `◐` | `warning` | `#facc15` |
| Pending row `○`, connectors `├─`/`└─` | `dim` | `#6c7086` |

Pi has a single `accent` used as a foreground colour in roughly 176 sites — every
selector, the loaders, the compaction spinner, the read/grep/find path colours. Pointing it
at the plan-heading green (the first cut of this theme did exactly that) turns all of them
bright green: the spinner stops being sky blue and every tool line reads green. The fork
separates the two, and so does this theme, with the split made in two places:

```jsonc
// themes/mxt.json
"accent": "mxtSky",             // fan-out: selectors, spinner, paths, links
"todoHeading": "mxtPlanGreen",  // the fork's plan-heading green, custom token
```

and one line in `rpiv-todo` (`todo-overlay.ts:125`): the heading reads `todoHeading` when
the active theme defines it and falls back to `accent` for stock themes (`theme.fg()` throws
`Unknown theme color` for a token a theme does not define, so the probe is wrapped).
Because `todoHeading` is a custom token, this split needs that local one-line patch — the
theme alone cannot separate the two, since `rpiv-todo` reads `accent` directly. The patch is
idempotent and lives in the `pi-env-doctor` skill (`scripts/patch-rpiv-todo.js`); re-run it
after `pi update --extensions`. Without the patch the heading simply follows `accent` (sky).

Verified on 2026-09-24 with a raw pty capture of a session holding todos: `● Todos (1/3)`
is the only element painted `#87ff5f`, while the tool lines, the status line, the version
line and the borders are `#89dceb`.

### Inline code, commands, paths and links

The fork paints every backticked span one colour: the inline-raw syntax scope, falling back
to `accent_color()` (`CHATGPT_BLUE_200` = `#63a8f8`). It singles out only two things —
skill links (mauve, underlined) and bare URLs (`web_links.rs`, link style) — so a command, a
path and a skill name are never told apart. A third case, file citations, only exists for
the fork's own `codex-file-citation{…}` marker protocol.

This package sets the base colour to the fork's `#63a8f8` through the `mdCode` token, so
backticked spans look like the fork out of the box, and then lets the ANSI layer read what
each span actually holds:

| Span | Detected by | Colour |
| --- | --- | --- |
| skill | `mxt-…`, `/mxt-…`, `$mxt-…`, `SKILL.md`, `skill://` | mauve `#cba6f7` |
| URL | `http://` or `https://` | link blue `#89b4fa`, underlined |
| command | first word is a shell command (`mxt`, `git`, `npm`, `node`, `cargo`, …) | teal `#94e2d5` |
| path | `/usr/local`, `./src/x.js`, `~/.pi/agent`, `docs/command/task.md`, `a/b.rs:12`, or a bare name with a file extension | peach `#fab387` |
| anything else | — | the theme's `mdCode` |

`/mdstyle code off` disables the layer. Command and path detection is a heuristic on the
span text, so a code-looking word can land in the neighbouring colour; the reset button is
the theme's `mdCode`.

## The ANSI layer and its limits

Pi renders assistant Markdown itself, so content-level icons are the only thing a
theme can never provide. Everything else here is achieved by injecting ANSI escapes
into the Markdown source **before Pi parses it** (via `registerMarkdownTransformer`).
Pi's TUI keeps width math ANSI-aware, so wrapping and padding stay correct — verified
against `@earendil-works/pi-tui`'s `Markdown` component.

Known gaps (honest list):

| Item | Status |
| --- | --- |
| Compaction spinner color | colored by the theme's `accent` (now `mxtSky`, matching the fork's separate light blue); **not** by this extension. Pi's `setWorkingIndicator()` only affects the streaming Working row. |
| Compaction/retry message **text** color | hardcoded in Pi (`theme.fg("muted", …)`), cannot be overridden |
| Table border characters (`━`/`─` vs Pi's `└─┴─┘`) | Pi renders tables itself; not reachable |
| List icons vs wrapped continuation lines | the icon lives in the item text, so Pi indents continuation lines to `-` width (2 columns narrower) |
| Task marker glyphs vs the fork | the fork uses `☑`/`☐`; this package keeps ASCII `[x]`/`[ ]` because those two glyphs are missing from SF Mono and Andale Mono, which forces a double-width emoji fallback (see above) |
| Copy / HTML export | injected escapes may appear in copied text and `/export` output. `/mdstyle status off` removes the symbol colours; `/mdstyle off` removes everything |
| Future Pi releases | if Pi ever strips ANSI from transformed Markdown, the ANSI layer degrades — the icons layer keeps working |
| Inline-code classification | the span text is the only input, so `and/or` can read as a path: it becomes peach instead of the theme's `mdCode` |

Use `/mdstyle icons` if any of that matters; the theme still applies.

## Development

```bash
# try it without installing
pi -e ./plugins/pi/r2mopi-markdownrender

# check what would be published
npm pack --dry-run

# publish — versions are owned by the family scripts (see ../README.md)
cd ../../plugins/pi && ./npm-login.sh && ./npm-publish.sh
```

## License

MIT
