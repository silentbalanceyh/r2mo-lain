/**
 * r2mopi-markdownrender — Markdown report rendering for the Pi coding agent.
 *
 * Ports the report style used by the R2MO Codex fork TUI to Pi's transcript:
 *   - heading levels (H1 green + underline, H2 green/blue/purple, H3 blue/purple/plain)
 *   - heading icons (## ✨ / ### 📌) and unordered list icons (- 🔸)
 *   - status lines (✓ ! i ℹ ✦) with symbol/body coloring
 *   - skill links (skill://…, SKILL.md) in mauve
 *   - gold spinner for the streaming "Working" row
 *
 * Layers
 *   icons : content-level markers only (icons, no colors) — safe
 *   ansi  : icons + raw ANSI colors injected into the Markdown source (experimental)
 *
 * Pi renders assistant Markdown itself, so per-level heading colors and italics are
 * only reachable by injecting ANSI escapes into the source before parsing. Pi's TUI
 * keeps width math ANSI-aware, so layout stays correct.
 */

/* ------------------------------------------------------- Pi extension API */

/**
 * Structural view of the parts of Pi's extension API this package touches.
 *
 * The authoritative types live in `@earendil-works/pi-coding-agent`, which Pi
 * supplies at runtime (see `peerDependencies`). Declaring the few members we use
 * keeps this file self-contained: the package ships no node_modules and needs no
 * build step, and a consumer's editor still resolves the real types on its side.
 */
type MessageType = "user" | "assistant" | "assistant-thinking";

interface MarkdownTransformContext {
    messageType: MessageType;
    isStreaming: boolean;
    availableWidth: number;
}

interface WorkingIndicatorOptions {
    frames: string[];
    intervalMs: number;
}

interface ExtensionUi {
    notify(message: string, level?: "info" | "warning" | "error"): void;
    setWorkingIndicator(options?: WorkingIndicatorOptions): void;
}

interface ExtensionContext {
    readonly hasUI: boolean;
    readonly mode: string;
    readonly ui: ExtensionUi;
}

interface CommandCompletion {
    value: string;
    label: string;
}

interface CommandOptions {
    description?: string;
    getArgumentCompletions?: (prefix: string) => CommandCompletion[];
    handler: (args: string, context: ExtensionContext) => Promise<void> | void;
}

interface ExtensionApi {
    registerMarkdownTransformer(
        transformer: (
            markdown: string,
            context: MarkdownTransformContext,
        ) => string,
    ): void;
    on(
        event: string,
        handler: (event: unknown, context: ExtensionContext) => void,
    ): void;
    registerCommand(name: string, options: CommandOptions): void;
}

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/* ------------------------------------------------------------------ config */

type Mode = "off" | "icons" | "ansi";
type StyleName = "a" | "b" | "c" | "codex";

interface Config {
    mode: Mode;
    style: StyleName;
    /** apply heading icons / heading colors */
    headings: boolean;
    /** apply unordered list icons and task checkboxes */
    lists: boolean;
    /** apply status-line (✓ ! ℹ ✦) colors */
    status: boolean;
    /** recolor the streaming "Working" spinner */
    working: boolean;
    /** colour inline code by content type and give bare URLs a link affordance */
    code: boolean;
}

const DEFAULTS: Config = {
    mode: "icons",
    style: "codex",
    headings: true,
    lists: true,
    status: true,
    working: true,
    code: true,
};

function agentDir(): string {
    const fromEnv = process.env.PI_CODING_AGENT_DIR?.trim();
    return fromEnv && fromEnv.length > 0
        ? fromEnv
        : join(homedir(), ".pi", "agent");
}

function configPath(): string {
    return join(agentDir(), "r2mopi-markdownrender.json");
}

function loadConfig(): Config {
    try {
        const raw = readFileSync(configPath(), "utf8");
        const parsed = JSON.parse(raw) as Partial<Config>;
        const merged = { ...DEFAULTS, ...parsed };
        if (!["off", "icons", "ansi"].includes(merged.mode))
            merged.mode = DEFAULTS.mode;
        if (!["a", "b", "c", "codex"].includes(merged.style))
            merged.style = DEFAULTS.style;
        return merged;
    } catch {
        return { ...DEFAULTS };
    }
}

function saveConfig(config: Config): void {
    const file = configPath();
    try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    } catch {
        // Persisting is best effort; the in-memory config still applies.
    }
}

/* --------------------------------------------------------------- ansi bits */

const RESET_FG = "\u001b[39m";
const RESET_BOLD = "\u001b[22m";
const RESET_ITALIC = "\u001b[23m";
const RESET_UNDERLINE = "\u001b[24m";

function hexToRgb(hex: string): [number, number, number] | null {
    const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(
        hex,
    );
    if (!match) return null;
    return [
        Number.parseInt(match[1], 16),
        Number.parseInt(match[2], 16),
        Number.parseInt(match[3], 16),
    ];
}

function fg(hex: string, text: string): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return text;
    return `\u001b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${RESET_FG}`;
}

const bold = (text: string): string => `\u001b[1m${text}${RESET_BOLD}`;
const italic = (text: string): string => `\u001b[3m${text}${RESET_ITALIC}`;
const underline = (text: string): string =>
    `\u001b[4m${text}${RESET_UNDERLINE}`;

/* --------------------------------------------------------------- style set */

interface StyleDef {
    /** icon prepended to H2 / H3 headings ("" = none) */
    h2Icon: string;
    h3Icon: string;
    h2Color: string;
    h3Color: string;
    /** H1 color; empty string = leave it to the theme */
    h1Color: string;
    /** color the body text of status lines too, not just the symbol */
    colorBody: boolean;
    /** re-add the literal "## " marker: Pi hides it for H1/H2, Codex keeps it */
    hashPrefix: boolean;
    /** unordered list icon ("" = keep "- ") */
    listIcon: string;
    /** rewrite [x]/[ ] task markers to the style's marker pair (see the codex note) */
    taskIcons: boolean;
    /** icon of the task marker states */ taskChecked: string;
    taskUnchecked: string;
}

const STYLES: Record<StyleName, StyleDef> = {
    // A — green H2 / blue H3, colored body   (markdown-style-options.html · A)
    a: {
        h2Icon: "",
        h3Icon: "",
        h1Color: "#7ee787",
        h2Color: "#7ee787",
        h3Color: "#67e8f9",
        colorBody: true,
        hashPrefix: false,
        listIcon: "",
        taskIcons: false,
        taskChecked: "[x]",
        taskUnchecked: "[ ]",
    },
    // B — blue H2 / purple H3, symbols only   (markdown-style-options.html · B)
    b: {
        h2Icon: "",
        h3Icon: "",
        h1Color: "#7ee787",
        h2Color: "#67e8f9",
        h3Color: "#d8b4fe",
        colorBody: false,
        hashPrefix: false,
        listIcon: "",
        taskIcons: false,
        taskChecked: "[x]",
        taskUnchecked: "[ ]",
    },
    // C — purple H2 / plain H3, colored body  (markdown-style-options.html · C)
    c: {
        h2Icon: "",
        h3Icon: "",
        h1Color: "#7ee787",
        h2Color: "#d8b4fe",
        h3Color: "#d7dde8",
        colorBody: true,
        hashPrefix: false,
        listIcon: "",
        taskIcons: false,
        taskChecked: "[x]",
        taskUnchecked: "[ ]",
    },
    // codex — the landed R2MO Codex fork style (Catppuccin + icons)
    //
    // Task markers stay the literal "[x]"/"[ ]" instead of the fork's "☑"/"☐". Those
    // two are a trap in a terminal: SF Mono and Andale Mono have no glyph for either, and
    // "☑" is Extended_Pictographic, so the terminal falls back to Apple Color Emoji and
    // draws a double-width colour emoji while Pi measures the marker as one cell — a task
    // item's hanging indent then lands one column short. ASCII measures and draws as
    // three cells in every font, and it is what Pi's own Markdown renderer emits too. The
    // branch stays enabled so a task line never also picks up the list icon.
    //
    // The list icon stays the fork's 🔸 (SMALL ORANGE DIAMOND, U+1F538) rather than the
    // larger 🔶 (LARGE ORANGE DIAMOND, U+1F536); both measure two cells, so switching is
    // purely cosmetic. See the README for the blue (🔹/🔷) and one-cell (◆) alternatives.
    codex: {
        h2Icon: "✨",
        h3Icon: "📌",
        h1Color: "#a6e3a1",
        h2Color: "#a6e3a1",
        h3Color: "#89b4fa",
        colorBody: false,
        hashPrefix: true,
        listIcon: "🔸",
        taskIcons: true,
        taskChecked: "[x]",
        taskUnchecked: "[ ]",
    },
};

/** status symbols → color. Letter-like entries are matched in bracketed form only. */
const SYMBOL_COLORS: Record<string, string> = {
    "✓": "#4ade80",
    "✗": "#f87171",
    "×": "#f87171",
    "!": "#facc15",
    "▲": "#facc15",
    ℹ: "#67e8f9",
    "✦": "#d8b4fe",
    "★": "#d8b4fe",
};

const BRACKETED_SYMBOLS: Record<string, string> = {
    "[i]": "#facc15",
    "(i)": "#facc15",
    "[!]": "#facc15",
    "[✓]": "#4ade80",
    "[✗]": "#f87171",
};

const SKILL_LINK_COLOR = "#cba6f7";
const LINK_COLOR = "#89b4fa";
const WORKING_COLOR = "#d4af37";

/**
 * Inline-code paints for the ANSI layer, keyed by what the span actually holds.
 *
 * The fork paints every backticked span one colour — the inline-raw syntax scope,
 * falling back to `accent_color()` (`CHATGPT_BLUE_200`, #63a8f8) — and singles out only
 * skill links (mauve) and bare URLs (link style). These four stay in the same family but
 * let a path, a command and a skill name read apart. The base colour of an unclassified
 * span stays the theme's `mdCode`.
 */
const CODE_COLORS = {
    command: "#94e2d5",
    path: "#fab387",
    skill: SKILL_LINK_COLOR,
    url: LINK_COLOR,
};

/** First word of a shell line — enough to tell `npm run build` from `src/executor`. */
const COMMAND_WORDS = new Set([
    "awk",
    "bash",
    "brew",
    "bun",
    "cargo",
    "cat",
    "cd",
    "chmod",
    "chown",
    "cmake",
    "cp",
    "curl",
    "deno",
    "diff",
    "docker",
    "du",
    "find",
    "git",
    "go",
    "grep",
    "head",
    "helm",
    "java",
    "jq",
    "kill",
    "kubectl",
    "lain",
    "ln",
    "ls",
    "make",
    "mkdir",
    "mvn",
    "mxt",
    "node",
    "npm",
    "npx",
    "oc",
    "openssl",
    "patch",
    "pip",
    "pip3",
    "pnpm",
    "ps",
    "python",
    "python3",
    "rg",
    "rm",
    "rsync",
    "scp",
    "sed",
    "sh",
    "sort",
    "ssh",
    "sudo",
    "systemctl",
    "tail",
    "tar",
    "tee",
    "terraform",
    "touch",
    "unzip",
    "wc",
    "which",
    "xargs",
    "yarn",
    "zsh",
]);

/** File-ish tail, for spans that carry no slash at all (`AGENTS.md`, `bundle/diff`). */
const FILE_EXTENSION =
    /\.(?:md|markdown|json|jsonc|js|mjs|cjs|jsx|ts|tsx|sh|bash|zsh|py|rs|go|java|kt|kts|cs|c|cc|cpp|h|hpp|yml|yaml|toml|ini|cfg|conf|txt|log|html|htm|css|scss|less|xml|svg|sql|lock|diff|patch|env|tar|tgz|gz|zip)$/i;

/** `/usr/local/bin`, `./src/x.js`, `~/.pi/agent`, `docs/command/task.md`, `a/b.rs:12`. */
const PATH_SHAPE = /^(?:~|\.{1,2})?\/(?:[\w.@+-]+\/?)+$/;
const RELATIVE_PATH_SHAPE = /^[\w.@+-]+(?:\/[\w.@+-]+)+$/;

function isPathLike(text: string): boolean {
    // `src/a.ts:12:4` — a citation suffix is still the same path.
    const body = text.replace(/:\d+(?::\d+)?$/, "");
    if (/\s/.test(body) || body.length === 0) return false;
    if (PATH_SHAPE.test(body) || RELATIVE_PATH_SHAPE.test(body)) return true;
    return !body.includes("/") && FILE_EXTENSION.test(body);
}

/** Classify one backticked span; `null` keeps the theme's plain `mdCode` colour. */
function classifyInlineCode(raw: string): string | null {
    const text = raw.trim();
    if (text.length === 0) return null;
    const first = text.split(/\s+/)[0].replace(/^\$/, "");
    if (/^(?:\/|@)?mxt-[a-z0-9-]+$/i.test(first)) return CODE_COLORS.skill;
    if (/skill:\/\//i.test(text) || /SKILL\.md/i.test(text))
        return CODE_COLORS.skill;
    if (/^https?:\/\//i.test(text)) return CODE_COLORS.url;
    if (COMMAND_WORDS.has(first)) return CODE_COLORS.command;
    if (isPathLike(text)) return CODE_COLORS.path;
    return null;
}

/**
 * Paint a backticked span by what it holds. The codespan text is handed to Pi's own
 * `theme.code`, so an injected escape overrides that colour for the span and the
 * trailing reset is absorbed by the renderer's own reset.
 */
function highlightInlineCode(line: string): string {
    return line.replace(/`([^`\n]+)`/g, (whole: string, inner: string) => {
        const color = classifyInlineCode(inner);
        return color ? `\`${fg(color, inner)}\`` : whole;
    });
}

/** Bare URLs — the fork styles these as links (`web_links.rs`); Pi leaves them plain. */
function highlightBareUrls(line: string): string {
    return line.replace(
        /https?:\/\/[^\s<>()[\]`]+/g,
        (url: string, offset: number) => {
            // A Markdown link destination is already styled by Pi; `](` precedes it.
            if (line.slice(Math.max(0, offset - 2), offset).endsWith("]("))
                return url;
            return underline(fg(LINK_COLOR, url));
        },
    );
}

/* ----------------------------------------------------------- line rewrite */

/**
 * Colour one status line. Unlike the rest of the colour work this runs in every mode:
 * a red `✗` is what makes a report readable at a glance, it touches a handful of glyphs,
 * and `status` already names that behaviour — so the icons mode keeps it and stays free
 * of the wider injection.
 */
function rewriteStatusLine(
    indent: string,
    symbol: string,
    gap: string,
    body: string,
    def: StyleDef,
): string | null {
    const color = SYMBOL_COLORS[symbol] ?? BRACKETED_SYMBOLS[symbol];
    if (!color) return null;
    const paintedSymbol = fg(color, symbol);
    const paintedBody =
        def.colorBody && body.length > 0 ? fg(color, body) : body;
    return `${indent}${paintedSymbol}${gap}${paintedBody}`;
}

function rewriteCore(line: string, def: StyleDef, config: Config): string {
    // Never touch a line we already painted (idempotent across re-renders).
    if (line.includes("\u001b[")) return line;

    const ansi = config.mode === "ansi";

    /* 1) headings ------------------------------------------------------- */
    const heading = /^(#{1,6})(\s+)(\S.*)$/.exec(line);
    if (heading) {
        const level = heading[1].length;
        const marks = heading[1];
        const gap = heading[2];
        let rest = heading[3];

        if (config.headings) {
            if (level === 2) {
                if (def.h2Icon && !rest.startsWith(def.h2Icon))
                    rest = `${def.h2Icon} ${rest}`;
                // Pi hides the "## " marker for H1/H2; the Codex style keeps it.
                if (def.hashPrefix && !rest.startsWith("## "))
                    rest = `## ${rest}`;
            } else if (
                level === 3 &&
                def.h3Icon &&
                !rest.startsWith(def.h3Icon)
            ) {
                rest = `${def.h3Icon} ${rest}`;
            }
        }

        if (!ansi || !config.headings) return `${marks}${gap}${rest}`;

        if (level === 1) {
            const painted = def.h1Color ? fg(def.h1Color, rest) : rest;
            return `${marks}${gap}${bold(underline(painted))}`;
        }
        if (level === 2) return `${marks}${gap}${bold(fg(def.h2Color, rest))}`;
        if (level === 3) return `${marks}${gap}${bold(fg(def.h3Color, rest))}`;
        // H4-H6 mirror the Codex fork: italic.
        return `${marks}${gap}${italic(rest)}`;
    }

    /* 2) status lines --------------------------------------------------- */
    if (config.status) {
        const status = /^(\s*(?:[-*+]\s+)?)(\S)(\s+)(\S.*)$/.exec(line);
        if (status) {
            const painted = rewriteStatusLine(
                status[1],
                status[2],
                status[3],
                status[4],
                def,
            );
            if (painted) return painted;
        }
    }

    /* 3) task markers --------------------------------------------------- */
    if (config.lists && def.taskIcons) {
        const task = /^(\s*(?:[-*+]\s+)?)\[([xX ])\]\s+(\S.*)$/.exec(line);
        if (task) {
            const icon = task[2] === " " ? def.taskUnchecked : def.taskChecked;
            const color = task[2] === " " ? "#8e97a8" : "#4ade80";
            const painted = ansi ? fg(color, icon) : icon;
            return `${task[1]}${painted} ${task[3]}`;
        }
    }

    /* 4) list icons ----------------------------------------------------- */
    if (config.lists && def.listIcon) {
        const item = /^(\s*)([-*+])(\s+)(\S.*)$/.exec(line);
        if (item) return `${item[1]}- ${def.listIcon} ${item[4]}`;
    }

    /* 5) skill links ---------------------------------------------------- */
    if (ansi) {
        const link = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(line);
        if (link) {
            const url = link[2];
            let decoded = url;
            try {
                decoded = decodeURIComponent(url);
            } catch {
                decoded = url;
            }
            const isSkill =
                url.toLowerCase().startsWith("skill://") ||
                /SKILL\.md$/i.test(decoded);
            if (isSkill) {
                const label = fg(SKILL_LINK_COLOR, underline(link[1]));
                return line.replace(link[0], `[${label}](${url})`);
            }
        }
    }

    return line;
}

/**
 * Rewrite one line: the structural steps first, then the Codex highlight layer on top
 * of whatever they produced. The steps must stay separate from the highlight layer —
 * every structural step returns early (a list item must not be re-marked as a list), so
 * an inline-code pass glued into one of them would never see the other line shapes.
 */
function rewriteLine(line: string, def: StyleDef, config: Config): string {
    if (line.includes("\u001b[")) return line;
    const painted = rewriteCore(line, def, config);
    if (config.mode !== "ansi" || !config.code) return painted;
    return highlightBareUrls(highlightInlineCode(painted));
}

function transform(text: string, def: StyleDef, config: Config): string {
    if (config.mode === "off") return text;
    const out: string[] = [];
    let inFence = false;
    let fenceMarker = "";

    for (const line of text.split("\n")) {
        const fence = /^\s*(```+|~~~+)/.exec(line);
        if (fence) {
            const marker = fence[1][0];
            if (!inFence) {
                inFence = true;
                fenceMarker = marker;
            } else if (marker === fenceMarker) {
                inFence = false;
                fenceMarker = "";
            }
            out.push(line);
            continue;
        }
        // Code blocks, indented blocks and tables keep their original text.
        if (inFence || /^\s{4,}\S/.test(line) || /^\s*\|/.test(line)) {
            out.push(line);
            continue;
        }
        out.push(rewriteLine(line, def, config));
    }

    return out.join("\n");
}

/* ---------------------------------------------------------------- working */

function workingFrames(): string[] {
    return ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"].map((frame) =>
        fg(WORKING_COLOR, frame),
    );
}

/* ------------------------------------------------------------------ entry */

export default function markdownRender(pi: ExtensionApi): void {
    let config = loadConfig();
    const styleDef = (): StyleDef => STYLES[config.style];

    pi.registerMarkdownTransformer((markdown, context) => {
        try {
            // Only decorate assistant output; leave user prompts and thinking alone.
            if (context.messageType !== "assistant") return markdown;
            return transform(markdown, styleDef(), config);
        } catch {
            return markdown;
        }
    });

    const applyWorking = (ctx: {
        hasUI: boolean;
        mode: string;
        ui: {
            setWorkingIndicator(options?: {
                frames?: string[];
                intervalMs?: number;
            }): void;
        };
    }): void => {
        if (!ctx.hasUI || ctx.mode !== "tui") return;
        try {
            if (config.mode === "ansi" && config.working) {
                ctx.ui.setWorkingIndicator({
                    frames: workingFrames(),
                    intervalMs: 80,
                });
            } else {
                ctx.ui.setWorkingIndicator();
            }
        } catch {
            // Working spinner is cosmetic; never break a session over it.
        }
    };

    pi.on("session_start", (_event, ctx) => {
        applyWorking(ctx);
    });

    const describe = (): string => {
        const mode =
            config.mode === "off"
                ? "off"
                : `${config.mode}${config.mode === "ansi" ? " (ANSI, experimental)" : ""}`;
        return [
            `mode=${mode} style=${config.style}`,
            `headings=${config.headings ? "on" : "off"} lists=${config.lists ? "on" : "off"} status=${config.status ? "on" : "off"} working=${config.working ? "on" : "off"} code=${config.code ? "on" : "off"}`,
            `config=${configPath()}`,
        ].join("\n");
    };

    pi.registerCommand("mdstyle", {
        description:
            "Markdown report style (r2mopi): /mdstyle off|icons|ansi, /mdstyle a|b|c|codex, /mdstyle <toggles> on|off, /mdstyle show",
        getArgumentCompletions: (prefix) => {
            const items = [
                "off",
                "icons",
                "ansi",
                "a",
                "b",
                "c",
                "codex",
                "headings on",
                "headings off",
                "lists on",
                "lists off",
                "status on",
                "status off",
                "working on",
                "working off",
                "code on",
                "code off",
                "show",
                "reset",
            ];
            return items
                .filter((item) => item.startsWith(prefix))
                .map((item) => ({
                    value: item,
                    label: item,
                }));
        },
        handler: async (args: string, ctx: ExtensionContext) => {
            const tokens = args
                .trim()
                .split(/\s+/)
                .filter((token) => token.length > 0);
            const head = (tokens[0] ?? "show").toLowerCase();

            if (head === "show" || head === "") {
                ctx.ui.notify(`r2mopi markdownrender\n${describe()}`, "info");
                return;
            }
            if (head === "reset") {
                config = { ...DEFAULTS };
                saveConfig(config);
                applyWorking(ctx);
                ctx.ui.notify(
                    `r2mopi markdownrender: reset to defaults\n${describe()}`,
                    "info",
                );
                return;
            }
            if (
                head === "off" ||
                head === "icons" ||
                head === "ansi" ||
                head === "on"
            ) {
                config.mode = head === "on" ? "icons" : (head as Mode);
                saveConfig(config);
                applyWorking(ctx);
                ctx.ui.notify(`r2mopi markdownrender: ${describe()}`, "info");
                return;
            }
            if (head === "ansi" && tokens[1] === "off") {
                config.mode = "icons";
            }
            if (["a", "b", "c", "codex"].includes(head)) {
                config.style = head as StyleName;
                saveConfig(config);
                ctx.ui.notify(`r2mopi markdownrender: ${describe()}`, "info");
                return;
            }
            if (
                ["headings", "lists", "status", "working", "code"].includes(
                    head,
                )
            ) {
                const value = (tokens[1] ?? "on").toLowerCase() !== "off";
                config[
                    head as "headings" | "lists" | "status" | "working" | "code"
                ] = value;
                saveConfig(config);
                applyWorking(ctx);
                ctx.ui.notify(`r2mopi markdownrender: ${describe()}`, "info");
                return;
            }

            ctx.ui.notify(
                `r2mopi markdownrender: unknown option "${head}"\n${describe()}`,
                "warning",
            );
        },
    });
}
