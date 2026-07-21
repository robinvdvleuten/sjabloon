import { readFileSync } from 'node:fs';
import test from 'tape';
import { render, template } from '../src/index.js';

test('escaping is the default', t => {
	t.equal(render('{{ x }}', { x: '<script>alert(1)</script>' }), '&lt;script&gt;alert(1)&lt;/script&gt;');
	t.end();
});

test('xprsn prototype guards apply inside templates', t => {
	t.throws(() => render('{{ a.constructor }}', { a: {} }), TypeError);
	t.throws(() => render('{{#if a["__proto__"]}}x{{/if}}', { a: {} }), TypeError);
	t.end();
});

test('each scope objects do not leak writes to values', t => {
	const values = { items: [1], name: 'outer' };
	render('{{#each items as name}}{{ name }}{{/each}}', values);
	t.equal(values.name, 'outer', 'loop variable shadowed, parent untouched');
	t.end();
});

test('each rejects unsafe binding names', t => {
	for (const name of ['__proto__', 'constructor', 'prototype']) {
		t.throws(() => template(`{{#each items as ${name}}}x{{/each}}`), SyntaxError, `item ${name}`);
		t.throws(() => template(`{{#each items as item, ${name}}}x{{/each}}`), SyntaxError, `index ${name}`);
	}
	t.end();
});

test('source contains no string-to-code constructs', t => {
	const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
	t.notOk(/\beval\b|\bFunction\s*\(|new\s+Function/.test(src));
	t.end();
});

test('tokenizer resists ReDoS-shaped input', t => {
	const n = 50_000;
	const t0 = Date.now();

	// Open braces + long runs of spaces (no closer) must stay linear.
	t.equal(template('{{' + ' '.repeat(n))({}), '{{' + ' '.repeat(n));
	t.equal(template('{{{' + ' '.repeat(n))({}), '{{{' + ' '.repeat(n));

	// Real tag with heavy inner whitespace still tokenizes.
	t.equal(template('{{' + ' '.repeat(n) + 'x' + ' '.repeat(n) + '}}')({ x: 1 }), '1');

	// Adjacent whitespace + trim dashes must stay linear.
	t.equal(template(' '.repeat(n) + '{{- "x" -}}' + ' '.repeat(n))({}), 'x');

	t.ok(Date.now() - t0 < 500, 'completes quickly');
	t.end();
});
