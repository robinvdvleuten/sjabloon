# sjabloon

Tiny, CSP-safe template engine powered by xprsn expressions. Zero-config sibling of xprsn: plain JS + JSDoc, Node test runner, tsdown.

## Commands

- `npm test` — Node's built-in test runner under `--disallow-code-generation-from-strings` (strict-CSP simulation), then `npm run test:types` (a smoke check that `index.d.ts` is usable, in `test/types.check.ts`). Keep this on Node: Bun accepts that V8 flag but does not enforce it.
- `npm run build` — tsdown (rolldown + oxc), configured in `tsdown.config.js` → `dist/` (ESM/CJS targeting ES2024). Type generation is off; `index.d.ts` is hand-written. `xprsn` stays external (a runtime dependency, not bundled).
- `npm run size` — size-limit checks the gzip size of `dist/index.js` and `dist/index.cjs` against the budgets in `package.json`.
- `npm run test:browser` — builds the package and runs the browser bundle in Playwright Chromium under a strict CSP.
- Run a single suite: `node --disallow-code-generation-from-strings --test test/render.test.js`
- `npm run bench` — zero-dependency micro-benchmarks in `bench/`, run against `src/`. Measures template compile and render throughput separately (compile-once, render-many). `bench/` is not in `files`, so it is never published.
- `npm run fuzz` — jazzer.js discovery (60s/target) over `compile`, `render`, `structured` targets in `fuzz/`, run against `src/` under `--disallow-code-generation-from-strings`. `npm run fuzz:regression` replays the committed `fuzz/corpus/*` deterministically (the CI gate); `.fuzz-corpus/` is the private, gitignored discovery corpus. See the `fuzz-testing` skill in `.claude/skills/`. `fuzz/` is not in `files`, so it is never published.

## Architecture

The entire implementation is `src/index.js` (~130 lines, one file by design). One regex splits the template into strides of 7 (`text, rawL, raw, rawR, tagL, tag, tagR` — the L/R groups are the `{{-`/`-}}` trim dashes, which must hug the braces so `{{ -price }}` stays a unary minus). A recursive parser turns blocks into closures (`#if`/`#elif` chains recurse via `branch()`), and every expression goes through `cp()`, which wraps xprsn's `compile` and collects free variables. `template(str)` returns a plain `(values) => string` carrying `.names`. No AST, no code generation — same closure-compiler approach as xprsn, one level up.

Parser state (`toks`, `i`, `fns`, `last`) is module-level and shared; parsing is synchronous so this is safe.

`#each` scopes are `Object.create(parent)` with the loop variable set as an own key: xprsn's variable lookup walks the prototype chain, so outer variables stay visible for free, and parent values are never mutated.

## Hard constraints

1. **CSP safety is non-negotiable.** Same rules as xprsn: no string-to-code paths, the suite runs under `--disallow-code-generation-from-strings`, and a test scans the source — don't use the words "eval" or "new Function" even in comments.
2. **Escaping is the default.** `{{ expr }}` must HTML-escape (`& < > " '`); raw output only via explicit `{{{ }}}`. Never flip that default.
3. **All expression evaluation goes through xprsn's public API** (`compile` from the `xprsn` package). Never reimplement or inline expression parsing here — the `get()` security guard lives in xprsn and must stay single-sourced.
4. Size is a soft goal (~1.1KB min+gzip on top of xprsn). Lukeed-style terse code, but never trade escaping, a guard, or a passing test for bytes.

## Omakase pragmatism

Apply this across the whole project: implementation, API design, tests, documentation, dependencies, and tooling. Prefer cohesive defaults and one obvious path over knobs, abstraction, or infrastructure. Test the guarantee users rely on directly, and add complexity only when concrete pressure justifies it. These preferences never weaken the hard safety constraints.

## Semantics to preserve

- `null`/`undefined` interpolate as empty strings (template-friendly, unlike raw xprsn).
- Compile-time `SyntaxError` for malformed/unclosed tags and bad expressions; runtime `TypeError` comes from xprsn's guards.
- Loop variables shadow outer names; nested `#each` shadows correctly.
- `#each` walks `[value, key]` pairs: array indexes or own object keys; the second `as` binding is index-or-key. Nullish/non-iterable collections iterate zero times, and an empty collection renders the `{{#else}}` branch (in parent scope) if present.
- Two scope anchors are always bound (in the root wrapper, so the caller's values object is never mutated): `$` = root values, `@` = current `#each` item (root outside any loop). Each `#each` re-points `@` on its child scope. Both are pre-seeded into `bound`, so they never appear in `names`. The renderer takes an optional `{ root, item }` second arg that overrides the anchors for embedders: `$` = `root`, `@` = `item` (distinct objects); the `'item' in o` check means omitting `item` leaves `@` unbound (so `@.x` throws), while default (no second arg) keeps `$` = `@` = values. Only reads `root`/`item` — no mutation.
- Inside `#each`, `loop` = `{ index (1-based), index0, first, last, length }` on the child scope. `loop` is bound-scoped like the loop variables (added to `bound` for the body, restored after), so it counts as a name only when used outside a loop. Nested loops each set their own `loop`/`@`.
- `#if`/`#elif`/`#else` chains; `#elif` requires a space and an expression.
- Whitespace trimming is per side and only when the dash hugs the brace; it eats all adjacent whitespace including newlines.
- `template(...).names` = free variables across all expressions, minus loop-bound names in scope; the else-branch of `#each` is outside the loop scope. `template(...).functions` = the registry functions called across all expressions, deduplicated (both aggregate xprsn's per-expression `names`/`functions` in `cp()`). Use `Array.from` (never a spread) to turn the Sets into arrays — the bundler's transpile breaks Set spreads.

## Conventions

- Tabs for indentation. Tests use `node:test`, live in `test/*.test.js`, and run directly against `src/` (no build needed). Use the matching `render`, `errors`, or `safety` suite.
- Do not mention Symfony in code, comments, or docs.
- Runtime support is Node.js 22+ through ESM/CJS and ES2024 browser environments through a standards-based ESM bundler. There is no direct-script global or UMD build.
- Suggested commit messages must follow Conventional Commits and be at most 80 characters.
- `dist/` is gitignored build output. `index.d.ts` is **hand-written** (bundler type generation is off via `dts: false` in `tsdown.config.js`) — keep it in sync with the JSDoc in `src/index.js` by hand. `test/types.check.ts` (run by `npm run test:types`, part of `npm test`) is a smoke check that the declarations are usable.
