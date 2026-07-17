import test from 'tape';
import { template, render } from '../src/index.js';

test('interpolation', t => {
	t.equal(render('Hello {{ name }}!', { name: 'Robin' }), 'Hello Robin!');
	t.equal(render('{{ a + b }}', { a: 1, b: 2 }), '3');
	t.equal(render('{{ user.name.toUpperCase() }}', { user: { name: 'robin' } }), 'ROBIN');
	t.equal(render('{{ "static" }}'), 'static');
	t.equal(render('no tags at all'), 'no tags at all');
	t.equal(render(''), '');
	t.end();
});

test('null and undefined render empty', t => {
	t.equal(render('[{{ missing }}]', {}), '[]');
	t.equal(render('[{{ a }}]', { a: null }), '[]');
	t.equal(render('[{{{ missing }}}]', {}), '[]');
	t.end();
});

test('escaping', t => {
	t.equal(render('{{ evil }}', { evil: '<b>&"\'</b>' }), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
	t.equal(render('{{{ html }}}', { html: '<b>bold</b>' }), '<b>bold</b>', 'triple braces render raw');
	t.end();
});

test('if blocks', t => {
	t.equal(render('{{#if ok}}yes{{/if}}', { ok: true }), 'yes');
	t.equal(render('{{#if ok}}yes{{/if}}', { ok: false }), '');
	t.equal(render('{{#if ok}}yes{{#else}}no{{/if}}', { ok: false }), 'no');
	t.equal(render('{{#if n > 3 and n < 10}}mid{{/if}}', { n: 5 }), 'mid');
	t.equal(render('{{#if a}}{{#if b}}both{{/if}}{{#else}}not a{{/if}}', { a: true, b: true }), 'both', 'nested if');
	t.end();
});

test('each blocks', t => {
	t.equal(render('{{#each items as it}}[{{ it }}]{{/each}}', { items: [1, 2, 3] }), '[1][2][3]');
	t.equal(render('{{#each items as it, i }}{{ i }}:{{ it }} {{/each}}', { items: ['a', 'b'] }), '0:a 1:b ');
	t.equal(render('{{#each items as it}}{{ it.name }}{{/each}}', { items: [{ name: 'x' }] }), 'x');
	t.equal(render('{{#each items as it}}never{{/each}}', { items: [] }), '');
	t.end();
});

test('each scopes inherit outer variables', t => {
	t.equal(
		render('{{#each items as it}}{{ prefix }}{{ it }} {{/each}}', { items: [1, 2], prefix: '#' }),
		'#1 #2 '
	);
	t.equal(
		render('{{#each rows as row}}{{#each row as cell}}{{ cell }},{{/each}};{{/each}}', { rows: [[1, 2], [3]] }),
		'1,2,;3,;',
		'nested each shadows correctly'
	);
	t.end();
});

test('comments', t => {
	t.equal(render('a{{! this disappears }}b'), 'ab');
	t.end();
});

test('custom functions', t => {
	const funcs = { fmt: n => '€' + n.toFixed(2) };
	t.equal(render('{{ fmt(price) }}', { price: 4.5 }, funcs), '€4.50');
	t.equal(render('{{#if gt(a, b)}}bigger{{/if}}', { a: 2, b: 1 }, { gt: (a, b) => a > b }), 'bigger');
	t.end();
});

test('compile once, render many', t => {
	const greet = template('Hi {{ name }}');
	t.equal(greet({ name: 'A' }), 'Hi A');
	t.equal(greet({ name: 'B' }), 'Hi B');
	t.equal(greet(), 'Hi ', 'values argument is optional');
	t.end();
});

test('full template', t => {
	const out = render(
		'<h1>{{ user.name }}</h1><ul>{{#each items as it}}<li>{{ it.name }}: {{ it.price * it.qty }}{{#if it.qty > 1}} ({{ it.qty }}x){{/if}}</li>{{/each}}</ul>{{#if total >= 100}}<p>Free shipping</p>{{#else}}<p>{{ fmt(shipping) }}</p>{{/if}}',
		{
			user: { name: 'Robin' },
			items: [{ name: 'Koffie', price: 8, qty: 2 }, { name: 'Thee', price: 3, qty: 1 }],
			total: 19,
			shipping: 4.95,
		},
		{ fmt: n => '€' + n.toFixed(2) }
	);
	t.equal(out, '<h1>Robin</h1><ul><li>Koffie: 16 (2x)</li><li>Thee: 3</li></ul><p>€4.95</p>');
	t.end();
});
