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

test('elif chains', t => {
	const tpl = '{{#if n > 10}}big{{#elif n > 5}}mid{{#elif n > 0}}small{{#else}}none{{/if}}';
	t.equal(render(tpl, { n: 20 }), 'big');
	t.equal(render(tpl, { n: 7 }), 'mid');
	t.equal(render(tpl, { n: 2 }), 'small');
	t.equal(render(tpl, { n: 0 }), 'none');
	t.equal(render('{{#if a}}x{{#elif b}}y{{/if}}', { b: true }), 'y', 'elif without else');
	t.equal(render('{{#if a}}x{{#elif b}}y{{/if}}', {}), '', 'no branch matches');
	t.equal(render('{{#if a}}{{#if b}}1{{#elif c}}2{{/if}}{{#elif d}}3{{/if}}', { a: true, c: true }), '2', 'nested');
	t.end();
});

test('each blocks', t => {
	t.equal(render('{{#each items as it}}[{{ it }}]{{/each}}', { items: [1, 2, 3] }), '[1][2][3]');
	t.equal(render('{{#each items as it, i }}{{ i }}:{{ it }} {{/each}}', { items: ['a', 'b'] }), '0:a 1:b ');
	t.equal(render('{{#each items as it}}{{ it.name }}{{/each}}', { items: [{ name: 'x' }] }), 'x');
	t.equal(render('{{#each items as it}}never{{/each}}', { items: [] }), '');
	t.end();
});

test('each iterates objects as value, key', t => {
	t.equal(
		render('{{#each prices as price, sku}}{{ sku }}={{ price }};{{/each}}', { prices: { a1: 4, b2: 9 } }),
		'a1=4;b2=9;'
	);
	t.equal(render('{{#each obj as val}}{{ val }} {{/each}}', { obj: { x: 1, y: 2 } }), '1 2 ', 'key binding is optional');
	t.equal(render('[{{#each list as it}}x{{/each}}]', { list: null }), '[]', 'nullish iterates zero times');
	t.equal(render('[{{#each list as it}}x{{/each}}]', { list: 'nope' }), '[]', 'non-iterable iterates zero times');
	t.end();
});

test('each with else renders the empty branch', t => {
	const tpl = '{{#each items as it}}<li>{{ it }}</li>{{#else}}<li>{{ emptyMsg }}</li>{{/each}}';
	t.equal(render(tpl, { items: ['a'], emptyMsg: 'none' }), '<li>a</li>');
	t.equal(render(tpl, { items: [], emptyMsg: 'none' }), '<li>none</li>', 'empty array');
	t.equal(render(tpl, { emptyMsg: 'none' }), '<li>none</li>', 'missing list');
	t.equal(render('{{#each o as v}}{{ v }}{{#else}}empty{{/each}}', { o: {} }), 'empty', 'empty object');
	t.equal(render('{{#each xs as x}}{{ x }}{{/each}}', { xs: [] }), '', 'no else stays empty');
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

test('whitespace trimming', t => {
	t.equal(render('a  {{- "x" }}  b'), 'ax  b', 'left trim only');
	t.equal(render('a  {{ "x" -}}  b'), 'a  xb', 'right trim only');
	t.equal(render('a\n\t{{- "x" -}}\n\tb'), 'axb', 'both sides, across newlines');
	t.equal(render('a {{{- html -}}} b', { html: '<i>' }), 'a<i>b', 'raw tags trim too');
	t.equal(render('<ul>\n{{#each xs as x -}}\n<li>{{ x }}</li>\n{{-/each}}\n</ul>', { xs: [1, 2] }),
		'<ul>\n<li>1</li><li>2</li>\n</ul>', 'block and closing tags trim their own sides');
	t.equal(render('{{ -n }}', { n: 5 }), '-5', 'space before a unary minus is not a trim marker');
	t.equal(render('a  {{ "x" }}  b'), 'a  x  b', 'no dashes, no trimming');
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
