# sjabloon

A tiny, CSP-safe template engine for JavaScript. **~1.8KB min+gzip (~3.6KB with [xprsn](https://www.npmjs.com/package/xprsn)), one dependency.**

[![NPM version](https://img.shields.io/npm/v/sjabloon.svg)](https://www.npmjs.com/package/sjabloon)
[![Build Status](https://github.com/getquario/sjabloon/actions/workflows/test.yml/badge.svg)](https://github.com/getquario/sjabloon/actions/workflows/test.yml)
[![NPM downloads](https://img.shields.io/npm/dm/sjabloon.svg)](https://www.npmjs.com/package/sjabloon)
[![Apache-2.0 license](https://img.shields.io/github/license/getquario/sjabloon.svg)](https://github.com/getquario/sjabloon/blob/main/LICENSE)

<a href="https://webstronauts.com?utm_source=github&utm_medium=readme&utm_campaign=sjabloon">
	<picture>
		<img src="https://webstronauts.com/images/sponsored-by.svg" alt="Sponsored by The Webstronauts" width="200" height="65">
	</picture>
</a>

*Sjabloon* is Dutch for "template". It renders text templates with full [xprsn](https://github.com/getquario/xprsn) expressions inside every tag, without turning template text into JavaScript. There is no `eval` and no `new Function`, so it runs under a strict Content Security Policy where engines that compile templates to code cannot.

```js
import { template, render } from 'sjabloon';

// Compile once, render many times:
const greet = template('Hello {{ user.name.toUpperCase() }}!');
greet({ user: { name: 'Robin' } }); // => 'Hello ROBIN!'

// Blocks, expressions, and custom functions:
render(
  `<ul>{{#each items as it, i}}
    <li>{{ i + 1 }}. {{ it.name }}: {{ fmt(it.price * it.qty) }}</li>
  {{/each}}</ul>
  {{#if total >= 100 and "vip" in user.roles}}Free shipping!{{#else}}Shipping: {{ fmt(5) }}{{/if}}`,
  { items: [{ name: 'Koffie', price: 8, qty: 2 }], total: 120, user: { roles: ['vip'] } },
  { fmt: n => '€' + n.toFixed(2) }
);
```

## API

### `template(str, functions?)`

Compiles the template and returns a renderer `(values?, scope?) => string`. Malformed tags, unclosed blocks, and invalid expressions throw a `SyntaxError` at compile time.

The anchors `$` (root) and `@` (current `{{#each}}` item) work as [described below](#syntax) with no extra arguments — at the root, before any loop, both point at `values`. If you're embedding sjabloon under an engine with its own scope model, pass `{ root, item }` as the second argument to seed the two root anchors from distinct objects: `$` becomes `root` and `@` becomes `item`. Omit `item` and `@` stays unbound at the root, so reading `@.x` throws where there is no current item. Either way, `{{#each}}` still re-points `@` to the current item inside its body.

```js
const tpl = template('{{ $.report }} — {{ @.row }}');
tpl(base, { root: reportRoot, item: currentRow }); // $ = reportRoot, @ = currentRow
tpl(base, { root: reportRoot });                   // no item → @.x throws
```

The renderer also carries `names` (every variable the template reads from your values, loop variables excluded) and `functions` (the registry functions it calls, methods excluded), both deduplicated. Check a stored template against your data model and its allowed functions before you render it, or fetch only the fields it needs.

```js
const tpl = template('{{ fmt(title) }}{{#each items as it}}{{ it.name }}{{/each}}', { fmt: s => s });
tpl.names;     // => ['title', 'items']
tpl.functions; // => ['fmt']
```

### `render(str, values?, functions?)`

Shorthand for `template(str, functions)(values)`.

### Error diagnostics

Sjabloon errors keep their native `SyntaxError` or `TypeError` class and expose:

- `code`: a stable `SJABLOON_*` parser category or the original `XPRSN_*` expression category;
- `start`: a zero-based offset in the original template;
- `end`: the exclusive template offset;
- `blocks`: a frozen, outermost-first array of `{ type, start, end }` opener spans.

Parser codes are `SJABLOON_EACH_SYNTAX`, `SJABLOON_BLOCKED_BINDING`, `SJABLOON_UNEXPECTED_TAG`, `SJABLOON_UNKNOWN_BLOCK`, `SJABLOON_UNCLOSED_BLOCK`, and `SJABLOON_TOO_DEEP` (block nesting past 256 levels, located at the opener that crossed the cap). A missing closer uses an empty span at the end of the template. Expression offsets refer to the original template, so surrounding braces, whitespace, and trim markers contribute to their absolute position.

Unauthenticated errors thrown by registered functions, getters, methods, or value coercion hooks are host errors. Sjabloon passes them through unchanged and does not attach template diagnostic fields.

Use `isDiagnostic(error)` when a host needs to distinguish those errors. It returns `true` only for errors produced or translated by the same sjabloon module instance. Copying a documented `code`, `start`, `end`, and `blocks` onto another error does not authenticate it. A diagnostic from another installed copy or module instance also returns `false`.

## Syntax

| Tag | Meaning |
| --- | --- |
| `{{ expr }}` | Interpolate an expression, HTML-escaped |
| `{{{ expr }}}` | Interpolate without escaping |
| `{{#if expr}} … {{#elif expr}} … {{#else}} … {{/if}}` | Conditional block, with as many `{{#elif}}` links as you need |
| `{{#each expr as item}} … {{/each}}` | Loop over an array or an object's values |
| `{{#each expr as item, key}} … {{/each}}` | Second name binds the index (arrays) or the key (objects) |
| `{{#each expr as item}} … {{#else}} … {{/each}}` | The `{{#else}}` branch renders when the collection is empty or missing |
| `{{ loop.last }}` (inside `{{#each}}`) | Iteration metadata: `index` (1-based), `index0`, `first`, `last`, `length` |
| `{{! anything }}` | Comment, removed from output |
| `{{- expr -}}` | A dash hugging either brace trims the whitespace on that side, newlines included; works on every tag form |

Every `expr` is an [xprsn expression](https://github.com/getquario/xprsn#syntax): literals, arithmetic, string concatenation with `~` (`{{ first ~ " " ~ last }}`), comparisons, `and`/`or`/`not`/`in`, ternaries, property and method access, and functions from the registry you pass in. `null` and `undefined` render as empty strings.

A loop body sees its loop variable plus the outer scope; reusing an outer name shadows it only inside that body. The engine keeps loop variables on a child scope, so the values you pass are never mutated.

Inside `{{#each}}`, a `loop` object holds the iteration state: `index` (1-based), `index0`, `first`, `last`, and `length`. Use `loop.last` for separators and trailing borders, or `loop.index` with `loop.length` for "row X of Y". Each nested loop gets its own.

```js
render('{{#each xs as x}}{{ x }}{{#if not loop.last}}, {{/if}}{{/each}}', { xs: ['a', 'b', 'c'] });
// => 'a, b, c'
```

Two anchors are always in scope: `$` is the root values and `@` is the current `{{#each}}` item (the root outside a loop). They let a nested body name the level it means instead of leaning on shadowing: `$.company` reaches the top, and `@.total` is whatever the innermost loop sits on.

```js
render(
  '{{#each regions as company}}{{ company }} of {{ $.company }}: {{#each rows as r}}{{ @.n }} {{/each}}{{/each}}',
  { company: 'ACME', regions: ['North', 'South'], rows: [{ n: 1 }, { n: 2 }] }
);
// => 'North of ACME: 1 2 South of ACME: 1 2 '
```

Here the loop variable `company` shadows the root's for a bare name, but `$.company` still returns `'ACME'`. Anchors never count as `names`, and a blocked key through one (`$.constructor`) throws like anywhere else.

## Content Security Policy

sjabloon works under `script-src 'self'` with no `unsafe-eval`. Templates parse into a tree of closures that call other closures; xprsn compiles the expressions the same way. The test suite runs under `node --disallow-code-generation-from-strings`, which throws on any string-to-code construct exactly like a strict CSP does.

That runtime CSP support costs some render speed. Handlebars and tempura generate specialized JavaScript, so their compiled renderers are faster but runtime compilation requires `unsafe-eval`. Build-time precompilation avoids that restriction when templates are known in advance. If templates arrive at runtime (user-edited templates, CMS content, email templates) and your CSP is strict, sjabloon fits. See the [comparison benchmarks](bench/comparison/) for cold-compile and hot-render comparisons.

## Safety

- `{{ expr }}` escapes `& < > " '` by default; unescaped output requires the explicit `{{{ }}}` form.
- Expressions inherit all of xprsn's guards: no `__proto__`/`constructor`/`prototype` access, null-prototype hash literals, and functions resolved only from your registry.
- Templates read your values; they cannot assign to them.
- Registered functions are host-provided capabilities, not a sandbox boundary. Only register helpers that template authors are allowed to invoke; likewise, treat explicit raw output as trusted HTML.

## Environments

Node.js 22 and newer are supported through the ESM and CommonJS builds. Browser use is supported through a standards-based ESM bundler in environments supporting ES2024. Direct `<script>` globals and UMD builds are not provided.

## License

Copyright 2026 Robin van der Vleuten

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
