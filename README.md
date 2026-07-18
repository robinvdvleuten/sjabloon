# sjabloon

A tiny, CSP-safe template engine for JavaScript. **~0.8KB min+gzip (~2KB with [xprsn](https://www.npmjs.com/package/xprsn)), one dependency.**

*Sjabloon* is Dutch for "template". It renders text templates with full [xprsn](https://github.com/robinvdvleuten/xprsn) expressions inside every tag, without turning template text into JavaScript. There is no `eval` and no `new Function`, so it runs under a strict Content Security Policy where engines that compile templates to code cannot.

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

Compiles the template and returns a renderer `(values?) => string`. Malformed tags, unclosed blocks, and invalid expressions throw a `SyntaxError` at compile time.

### `render(str, values?, functions?)`

Shorthand for `template(str, functions)(values)`.

## Syntax

| Tag | Meaning |
| --- | --- |
| `{{ expr }}` | Interpolate an expression, HTML-escaped |
| `{{{ expr }}}` | Interpolate without escaping |
| `{{#if expr}} … {{#elif expr}} … {{#else}} … {{/if}}` | Conditional block, with as many `{{#elif}}` links as you need |
| `{{#each expr as item}} … {{/each}}` | Loop over an array or an object's values |
| `{{#each expr as item, key}} … {{/each}}` | Second name binds the index (arrays) or the key (objects) |
| `{{! anything }}` | Comment, removed from output |

Every `expr` is an [xprsn expression](https://github.com/robinvdvleuten/xprsn#syntax): literals, arithmetic, comparisons, `and`/`or`/`not`/`in`, ternaries, property and method access, and functions from the registry you pass in. `null` and `undefined` render as empty strings.

Loop bodies see the loop variable plus everything from the outer scope. A nested loop can reuse an outer name and shadow it for its own body. The engine sets loop variables on a child scope, so your values object comes back exactly as you passed it in.

## Content Security Policy

sjabloon works under `script-src 'self'` with no `unsafe-eval`. Templates parse into a tree of closures that call other closures; xprsn compiles the expressions the same way. The test suite runs under `node --disallow-code-generation-from-strings`, which throws on any string-to-code construct exactly like a strict CSP does.

This is the practical difference from engines like Handlebars (without precompilation) or tempura, which generate a JavaScript function per template and therefore need `unsafe-eval` at runtime. If you can precompile templates at build time, those engines are great and fast. If templates arrive at runtime (user-edited templates, CMS content, email templates) and your CSP is strict, sjabloon fits.

## Safety

- `{{ expr }}` escapes `& < > " '` by default; unescaped output requires the explicit `{{{ }}}` form.
- Expressions inherit all of xprsn's guards: no `__proto__`/`constructor`/`prototype` access, null-prototype hash literals, and functions resolved only from your registry.
- Templates read your values; they cannot assign to them.

## License

MIT © [Robin van der Vleuten](https://robinvdvleuten.nl)
