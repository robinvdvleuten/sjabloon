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
