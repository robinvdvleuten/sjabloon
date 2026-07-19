# sjabloon

Tiny, CSP-safe template engine powered by xprsn expressions. Zero-config sibling of xprsn: plain JS + JSDoc, tape, microbundle.

## Commands

- `npm test` — tape suites under `node --disallow-code-generation-from-strings` (strict-CSP simulation).
- `npm run build` — microbundle → `dist/` (ESM/CJS/UMD) + `index.d.ts` from JSDoc. Prints min+gzip sizes.
- Run a single suite: `npx tape test/render.test.js`

## Architecture

The entire implementation is `src/index.js` (~130 lines, one file by design). One regex splits the template into strides of 7 (`text, rawL, raw, rawR, tagL, tag, tagR` — the L/R groups are the `{{-`/`-}}` trim dashes, which must hug the braces so `{{ -price }}` stays a unary minus). A recursive parser turns blocks into closures (`#if`/`#elif` chains recurse via `branch()`), and every expression goes through `cp()`, which wraps xprsn's `compile` and collects free variables. `template(str)` returns a plain `(values) => string` carrying `.names`. No AST, no code generation — same closure-compiler approach as xprsn, one level up.

Parser state (`toks`, `i`, `fns`, `last`) is module-level and shared; parsing is synchronous so this is safe.

`#each` scopes are `Object.create(parent)` with the loop variable set as an own key: xprsn's variable lookup walks the prototype chain, so outer variables stay visible for free, and parent values are never mutated.

## Hard constraints

1. **CSP safety is non-negotiable.** Same rules as xprsn: no string-to-code paths, the suite runs under `--disallow-code-generation-from-strings`, and a test scans the source — don't use the words "eval" or "new Function" even in comments.
2. **Escaping is the default.** `{{ expr }}` must HTML-escape (`& < > " '`); raw output only via explicit `{{{ }}}`. Never flip that default.
3. **All expression evaluation goes through xprsn's public API** (`compile` from the `xprsn` package). Never reimplement or inline expression parsing here — the `get()` security guard lives in xprsn and must stay single-sourced.
4. Size is a soft goal (~0.8KB min+gzip on top of xprsn). Lukeed-style terse code, but never trade escaping, a guard, or a passing test for bytes.

## Semantics to preserve

- `null`/`undefined` interpolate as empty strings (template-friendly, unlike raw xprsn).
- Compile-time `SyntaxError` for malformed/unclosed tags and bad expressions; runtime `TypeError` comes from xprsn's guards.
- Loop variables shadow outer names; nested `#each` shadows correctly.
- `#each` walks `[value, key]` pairs: array indexes or own object keys; the second `as` binding is index-or-key. Nullish/non-iterable collections iterate zero times, and an empty collection renders the `{{#else}}` branch (in parent scope) if present.
- `#if`/`#elif`/`#else` chains; `#elif` requires a space and an expression.
- Whitespace trimming is per side and only when the dash hugs the brace; it eats all adjacent whitespace including newlines.
- `template(...).names` = free variables across all expressions, minus loop-bound names in scope; the else-branch of `#each` is outside the loop scope. `template(...).functions` = the registry functions called across all expressions, deduplicated (both aggregate xprsn's per-expression `names`/`functions` in `cp()`). Use `Array.from` (never a spread) to turn the Sets into arrays — the bundler's transpile breaks Set spreads.

## Conventions

- Tabs for indentation. Tests in `test/*.test.js` (`render`, `errors`, `safety` suites).
- Do not mention Symfony in code, comments, or docs.
- `dist/` is gitignored; `index.d.ts` is generated from JSDoc — edit the JSDoc in `src/index.js`.
