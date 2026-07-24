import assert from 'node:assert/strict';
import test from 'node:test';
import { template, render } from '../src/index.js';

const notOk = (value, message) => assert.ok(!value, message);

test('interpolation', () => {
	assert.strictEqual(render('Hello {{ name }}!', { name: 'Robin' }), 'Hello Robin!');
	assert.strictEqual(render('{{ a + b }}', { a: 1, b: 2 }), '3');
	assert.strictEqual(render('{{ user.name.toUpperCase() }}', { user: { name: 'robin' } }), 'ROBIN');
	assert.strictEqual(render('{{ "static" }}'), 'static');
	assert.strictEqual(render('no tags at all'), 'no tags at all');
	assert.strictEqual(render(''), '');
});

test('null and undefined render empty', () => {
	assert.strictEqual(render('[{{ missing }}]', {}), '[]');
	assert.strictEqual(render('[{{ a }}]', { a: null }), '[]');
	assert.strictEqual(render('[{{{ missing }}}]', {}), '[]');
});

test('escaping', () => {
	assert.strictEqual(render('{{ evil }}', { evil: '<b>&"\'</b>' }), '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
	assert.strictEqual(render('{{{ html }}}', { html: '<b>bold</b>' }), '<b>bold</b>', 'triple braces render raw');
});

test('if blocks', () => {
	assert.strictEqual(render('{{#if ok}}yes{{/if}}', { ok: true }), 'yes');
	assert.strictEqual(render('{{#if ok}}yes{{/if}}', { ok: false }), '');
	assert.strictEqual(render('{{#if ok}}yes{{#else}}no{{/if}}', { ok: false }), 'no');
	assert.strictEqual(render('{{#if n > 3 and n < 10}}mid{{/if}}', { n: 5 }), 'mid');
	assert.strictEqual(render('{{#if a}}{{#if b}}both{{/if}}{{#else}}not a{{/if}}', { a: true, b: true }), 'both', 'nested if');
});

test('elif chains', () => {
	const tpl = '{{#if n > 10}}big{{#elif n > 5}}mid{{#elif n > 0}}small{{#else}}none{{/if}}';
	assert.strictEqual(render(tpl, { n: 20 }), 'big');
	assert.strictEqual(render(tpl, { n: 7 }), 'mid');
	assert.strictEqual(render(tpl, { n: 2 }), 'small');
	assert.strictEqual(render(tpl, { n: 0 }), 'none');
	assert.strictEqual(render('{{#if a}}x{{#elif b}}y{{/if}}', { b: true }), 'y', 'elif without else');
	assert.strictEqual(render('{{#if a}}x{{#elif b}}y{{/if}}', {}), '', 'no branch matches');
	assert.strictEqual(render('{{#if a}}{{#if b}}1{{#elif c}}2{{/if}}{{#elif d}}3{{/if}}', { a: true, c: true }), '2', 'nested');
});

test('each blocks', () => {
	assert.strictEqual(render('{{#each items as it}}[{{ it }}]{{/each}}', { items: [1, 2, 3] }), '[1][2][3]');
	assert.strictEqual(render('{{#each items as it, i }}{{ i }}:{{ it }} {{/each}}', { items: ['a', 'b'] }), '0:a 1:b ');
	assert.strictEqual(render('{{#each items as it}}{{ it.name }}{{/each}}', { items: [{ name: 'x' }] }), 'x');
	assert.strictEqual(render('{{#each items as it}}never{{/each}}', { items: [] }), '');

	const sparse = Array(3);
	sparse[1] = 'x';
	assert.strictEqual(
		render('{{#each items as it, i}}{{ i }}:{{ it }}:{{ loop.index }}/{{ loop.length }}{{/each}}', { items: sparse }),
		'1:x:2/3',
		'sparse indexes and loop positions are preserved'
	);
});

test('each iterates objects as value, key', () => {
	assert.strictEqual(
		render('{{#each prices as price, sku}}{{ sku }}={{ price }};{{/each}}', { prices: { a1: 4, b2: 9 } }),
		'a1=4;b2=9;'
	);
	assert.strictEqual(render('{{#each obj as val}}{{ val }} {{/each}}', { obj: { x: 1, y: 2 } }), '1 2 ', 'key binding is optional');
	assert.strictEqual(render('[{{#each list as it}}x{{/each}}]', { list: null }), '[]', 'nullish iterates zero times');
	assert.strictEqual(render('[{{#each list as it}}x{{/each}}]', { list: 'nope' }), '[]', 'non-iterable iterates zero times');
});

test('each with else renders the empty branch', () => {
	const tpl = '{{#each items as it}}<li>{{ it }}</li>{{#else}}<li>{{ emptyMsg }}</li>{{/each}}';
	assert.strictEqual(render(tpl, { items: ['a'], emptyMsg: 'none' }), '<li>a</li>');
	assert.strictEqual(render(tpl, { items: [], emptyMsg: 'none' }), '<li>none</li>', 'empty array');
	assert.strictEqual(render(tpl, { emptyMsg: 'none' }), '<li>none</li>', 'missing list');
	assert.strictEqual(render('{{#each o as v}}{{ v }}{{#else}}empty{{/each}}', { o: {} }), 'empty', 'empty object');
	assert.strictEqual(render('{{#each xs as x}}{{ x }}{{/each}}', { xs: [] }), '', 'no else stays empty');
});

test('each scopes inherit outer variables', () => {
	assert.strictEqual(
		render('{{#each items as it}}{{ prefix }}{{ it }} {{/each}}', { items: [1, 2], prefix: '#' }),
		'#1 #2 '
	);
	assert.strictEqual(
		render('{{#each rows as row}}{{#each row as cell}}{{ cell }},{{/each}};{{/each}}', { rows: [[1, 2], [3]] }),
		'1,2,;3,;',
		'nested each shadows correctly'
	);
});

test('$ (root) and @ (current item) scope anchors', () => {
	assert.strictEqual(
		render('{{#each rows as r}}{{ $.company }}:{{ @.n }};{{/each}}', { company: 'ACME', rows: [{ n: 1 }, { n: 2 }] }),
		'ACME:1;ACME:2;',
		'$ reaches the root inside a loop, @ is the current item'
	);
	assert.strictEqual(
		render('{{#each items as company}}{{ company }}={{ $.company }} {{/each}}', { company: 'ROOT', items: ['a', 'b'] }),
		'a=ROOT b=ROOT ',
		'$ is immune to shadowing by a loop variable of the same name'
	);
	assert.strictEqual(
		render('{{#each rows as row}}{{#each row as cell}}{{ @ }}{{/each}}|{{/each}}', { rows: [['x', 'y'], ['z']] }),
		'xy|z|',
		'@ re-points to the innermost item in nested loops'
	);
	assert.strictEqual(render('{{ $.title }}/{{ @.title }}', { title: 'T' }), 'T/T', 'both anchors point at the values at the root');
	assert.throws(() => render('{{ $.constructor }}', {}), TypeError, 'anchors still route through the xprsn guard');
});

test('#each exposes loop metadata', () => {
	assert.strictEqual(
		render('{{#each xs as x}}{{ x }}{{#if not loop.last}}, {{/if}}{{/each}}', { xs: ['a', 'b', 'c'] }),
		'a, b, c',
		'loop.last drives a separator'
	);
	assert.strictEqual(
		render('{{#each xs as x}}{{ loop.index }}/{{ loop.length }}:{{ x }} {{/each}}', { xs: ['a', 'b'] }),
		'1/2:a 2/2:b ',
		'1-based index and length'
	);
	assert.strictEqual(
		render('{{#each xs as x}}{{#if loop.first}}[{{/if}}{{ x }}{{#if loop.last}}]{{/if}}{{/each}}', { xs: [1, 2, 3] }),
		'[123]',
		'first and last'
	);
	assert.strictEqual(
		render('{{#each o as v}}{{ loop.index0 }}={{ v }};{{/each}}', { o: { a: 10, b: 20 } }),
		'0=10;1=20;',
		'index0 over object entries'
	);
	assert.strictEqual(
		render('{{#each rows as r}}{{#each r as c}}{{ loop.index }}{{/each}}|{{/each}}', { rows: [['x', 'y'], ['z']] }),
		'12|1|',
		'nested loops get independent metadata'
	);
});

test('loop is a name only outside a loop', () => {
	assert.deepStrictEqual(template('{{#each xs as x}}{{ loop.index }}{{/each}}').names, ['xs'], 'engine-bound inside a loop');
	assert.deepStrictEqual(template('{{ loop }}').names, ['loop'], 'an ordinary name outside a loop');
});

test('anchors are not reported as names and do not mutate values', () => {
	assert.deepStrictEqual(template('{{ $.a }}{{#each xs as x}}{{ @.b }}{{/each}}').names, ['xs'], '$ and @ are excluded from names');
	const values = { title: 'T', rows: [{ n: 1 }] };
	render('{{ $.title }}{{#each rows as r}}{{ @.n }}{{/each}}', values);
	notOk('$' in values, '$ is not written to the values object');
	notOk('@' in values, '@ is not written to the values object');
	assert.deepStrictEqual(values, { title: 'T', rows: [{ n: 1 }] }, 'values come back unchanged');
});

test('{ root, item } overrides the $ and @ anchors', () => {
	assert.strictEqual(
		template('{{ $.a }}/{{ @.a }}')({}, { root: { a: 'R' }, item: { a: 'I' } }),
		'R/I',
		'$ and @ point at distinct injected objects'
	);
	assert.strictEqual(
		template('{{ $.y }}')({}, { root: { y: 'Z' } }),
		'Z',
		'$ resolves against the injected root'
	);
	assert.throws(
		() => template('{{ @.x }}')({}, { root: {} }),
		TypeError,
		'omitting item leaves @ unbound, so @.x throws'
	);
	assert.strictEqual(
		template('{{#each $.rows as r}}{{ @.n }};{{/each}}')({}, { root: { rows: [{ n: 1 }, { n: 2 }] } }),
		'1;2;',
		'#each re-points @ to the current item, not the injected root'
	);
});

test('{ root, item } render does not mutate the passed objects', () => {
	const values = {}, root = { title: 'T' }, item = { n: 1 };
	template('{{ $.title }}/{{ @.n }}')(values, { root, item });
	notOk('$' in values, '$ is not written to the values object');
	notOk('@' in values, '@ is not written to the values object');
	assert.deepStrictEqual(root, { title: 'T' }, 'root comes back unchanged');
	assert.deepStrictEqual(item, { n: 1 }, 'item comes back unchanged');
});

test('whitespace trimming', () => {
	assert.strictEqual(render('a  {{- "x" }}  b'), 'ax  b', 'left trim only');
	assert.strictEqual(render('a  {{ "x" -}}  b'), 'a  xb', 'right trim only');
	assert.strictEqual(render('a\n\t{{- "x" -}}\n\tb'), 'axb', 'both sides, across newlines');
	assert.strictEqual(render('a {{{- html -}}} b', { html: '<i>' }), 'a<i>b', 'raw tags trim too');
	assert.strictEqual(render('<ul>\n{{#each xs as x -}}\n<li>{{ x }}</li>\n{{-/each}}\n</ul>', { xs: [1, 2] }),
		'<ul>\n<li>1</li><li>2</li>\n</ul>', 'block and closing tags trim their own sides');
	assert.strictEqual(render('a {{ "x" -}}{{ "y" }} z'), 'a xy z', 'right trim does not cross an adjacent tag');
	assert.strictEqual(render('a  {{- unclosed'), 'a  {{- unclosed', 'an unclosed tag does not trim');
	assert.strictEqual(render('{{ -n }}', { n: 5 }), '-5', 'space before a unary minus is not a trim marker');
	assert.strictEqual(render('a  {{ "x" }}  b'), 'a  x  b', 'no dashes, no trimming');
});

test('comments', () => {
	assert.strictEqual(render('a{{! this disappears }}b'), 'ab');
});

test('custom functions', () => {
	const funcs = { fmt: n => '€' + n.toFixed(2) };
	assert.strictEqual(render('{{ fmt(price) }}', { price: 4.5 }, funcs), '€4.50');
	assert.strictEqual(render('{{#if gt(a, b)}}bigger{{/if}}', { a: 2, b: 1 }, { gt: (a, b) => a > b }), 'bigger');
});

test('compile once, render many', () => {
	const greet = template('Hi {{ name }}');
	assert.strictEqual(greet({ name: 'A' }), 'Hi A');
	assert.strictEqual(greet({ name: 'B' }), 'Hi B');
	assert.strictEqual(greet(), 'Hi ', 'values argument is optional');
});

test('compiled templates expose their names', () => {
	assert.deepStrictEqual(template('{{ a }} and {{ b.c }}').names, ['a', 'b']);
	assert.deepStrictEqual(
		template('{{ title }}{{#each items as it, i}}{{ i }}:{{ it.name }} vs {{ other }}{{/each}}').names,
		['title', 'items', 'other'],
		'loop variables are excluded'
	);
	assert.deepStrictEqual(
		template('{{ x }}{{#each xs as x}}{{ x }}{{/each}}{{ y }}').names,
		['x', 'xs', 'y'],
		'a name used free outside the loop still counts'
	);
	assert.deepStrictEqual(
		template('{{#each xs as it}}{{ it }}{{#else}}{{ fallback }}{{/each}}').names,
		['xs', 'fallback'],
		'the empty branch is outside the loop scope'
	);
	assert.deepStrictEqual(template('{{#if f(n)}}x{{/if}}', { f: v => v }).names, ['n'], 'functions are not names');
	assert.deepStrictEqual(template('static only').names, []);
});

test('compiled templates expose their functions', () => {
	const fns = { fmt: n => n, sum: xs => xs, upper: s => s };
	assert.deepStrictEqual(template('{{ fmt(price) }}', fns).functions, ['fmt']);
	assert.deepStrictEqual(
		template('{{ fmt(a) }}{{#if sum(xs) > 0}}{{ fmt(b) }}{{/if}}', fns).functions,
		['fmt', 'sum'],
		'collected across tags and blocks, deduplicated'
	);
	assert.deepStrictEqual(template('{{ name.toUpperCase() }}').functions, [], 'methods are not registry functions');
	assert.deepStrictEqual(template('{{ a }} and {{ b }}').functions, [], 'no calls, no functions');
});

test('full template', () => {
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
	assert.strictEqual(out, '<h1>Robin</h1><ul><li>Koffie: 16 (2x)</li><li>Thee: 3</li></ul><p>€4.95</p>');
});

test('withRaw() returns the rendered string plus pre-escape values in render order', () => {
	const tpl = template('{{ fmt(total) }}', { fmt: n => '$' + n.toFixed(2) });
	const { text, raws } = tpl.withRaw({ total: 1000 });
	assert.strictEqual(text, '$1000.00');
	assert.deepStrictEqual(raws, ['$1000.00'], 'the dominant single-interpolation case is raws[0]');

	const both = template('{{ html }}/{{{ html }}}').withRaw({ html: '<b>' });
	assert.strictEqual(both.text, '&lt;b&gt;/<b>');
	assert.deepStrictEqual(both.raws, ['<b>', '<b>'], 'pre-escape for {{ }} and {{{ }}} alike');

	const typed = template('{{ n }}{{ d }}{{ o }}').withRaw({ n: 1000, d: null, o: { a: 1 } }).raws;
	assert.strictEqual(typed[0], 1000, 'numbers stay numbers');
	assert.strictEqual(typed[1], null, 'nullish is captured as-is, not the empty string it renders as');
	assert.deepStrictEqual(typed[2], { a: 1 }, 'objects pass through untouched');
});

test('withRaw() follows blocks: per iteration, taken branches only, never block expressions', () => {
	assert.deepStrictEqual(
		template('{{#each items as it}}{{ it * 2 }}{{/each}}').withRaw({ items: [1, 2, 3] }).raws,
		[2, 4, 6],
		'loop bodies push once per iteration; the collection itself is not captured'
	);
	assert.deepStrictEqual(
		template('{{#if ok}}{{ a }}{{#else}}{{ b }}{{/if}}').withRaw({ ok: true, a: 'A', b: 'B' }).raws,
		['A'],
		'untaken branches push nothing; the condition is not captured'
	);
	assert.deepStrictEqual(
		template('{{#each items as it}}{{ it }}{{#else}}{{ fallback }}{{/each}}').withRaw({ items: [], fallback: 'none' }).raws,
		['none'],
		'the #each else branch captures when it renders'
	);
});

test('withRaw() is per call and safe across re-entrancy', () => {
	const tpl = template('{{ a }}');
	const first = tpl.withRaw({ a: 1 });
	tpl({ a: 2 });
	const second = tpl.withRaw({ a: 3 });
	assert.deepStrictEqual(first.raws, [1], 'a plain render between calls does not leak anywhere');
	assert.deepStrictEqual(second.raws, [3], 'every withRaw() call fills a fresh array');

	const inner = template('{{ x }}');
	const innerResults = [];
	const funcs = {
		plain: v => inner({ x: v * 10 }),
		collecting: v => { const r = inner.withRaw({ x: v * 10 }); innerResults.push(r.raws); return r.text; },
		throwing: () => { try { inner.withRaw({}); } catch { } return 'ok'; },
	};
	const outer = template('{{ plain(a) }}{{ collecting(a) }}{{ throwing() }}{{ a }}', funcs).withRaw({ a: 7 });
	assert.strictEqual(outer.text, '7070ok7');
	assert.deepStrictEqual(outer.raws, ['70', '70', 'ok', 7], 'inner renders never pollute the outer collector');
	assert.deepStrictEqual(innerResults, [[70]], 'an inner withRaw() call only sees its own render, throwing included');
});

test('withRaw() composes with the scope anchors', () => {
	const plain = template('{{ $.a }}/{{ @.a }}').withRaw({ a: 'V' });
	assert.strictEqual(plain.text, 'V/V', 'no scope arg keeps the default anchors');
	assert.deepStrictEqual(plain.raws, ['V', 'V']);

	const anchored = template('{{ $.a }}{{ @.n }}').withRaw({}, { root: { a: 'R' }, item: { n: 1 } });
	assert.strictEqual(anchored.text, 'R1', 'withRaw() rides along with a { root, item } override');
	assert.deepStrictEqual(anchored.raws, ['R', 1]);
});
