import assert from 'node:assert/strict';
import test from 'node:test';
import { isDiagnostic, template } from '../src/index.js';

let caught = fn => {
	try {
		fn();
	} catch (e) {
		return e;
	}
	assert.fail('expected an error');
};

let check = (e, code, start, end, blocks = []) => {
	assert.ok(e instanceof SyntaxError || e instanceof TypeError);
	assert.equal(e.code, code);
	assert.equal(e.start, start);
	assert.equal(e.end, end);
	assert.equal(isDiagnostic(e), true);
	assert.deepStrictEqual(e.blocks, blocks);
	assert.equal(Object.isFrozen(e.blocks), true);
	for (const block of e.blocks) assert.equal(Object.isFrozen(block), true);
	return true;
};

test('xprsn compile diagnostics use absolute interpolation spans', () => {
	let src = 'before {{- 1 + -}} after';
	let e = caught(() => template(src));
	check(e, 'XPRSN_SYNTAX', src.indexOf('+') + 1, src.indexOf('+') + 1);

	src = 'before {{{ 1 + }}} after';
	e = caught(() => template(src));
	check(e, 'XPRSN_SYNTAX', src.indexOf('+') + 1, src.indexOf('+') + 1);
});

test('block expressions retain absolute spans and opener context', () => {
	let src = '{{#if 1 +}}x{{/if}}';
	let e = caught(() => template(src));
	check(e, 'XPRSN_SYNTAX', src.indexOf('}}'), src.indexOf('}}'), [
		{ type: 'if', start: 0, end: 11 },
	]);

	src = '{{#if false}}x{{#elif nope()}}y{{/if}}';
	e = caught(() => template(src));
	check(e, 'XPRSN_UNKNOWN_FUNCTION', src.indexOf('nope'), src.indexOf('nope') + 4, [
		{ type: 'if', start: 0, end: 13 },
	]);

	src = '{{#each 1 + as x}}x{{/each}}';
	e = caught(() => template(src));
	check(e, 'XPRSN_SYNTAX', src.indexOf(' as'), src.indexOf(' as'), [
		{ type: 'each', start: 0, end: 18 },
	]);
});

test('runtime xprsn diagnostics retain nested block context', () => {
	const src = '{{#if ok}}{{#each rows as r}}{{ r.missing.value }}{{/each}}{{/if}}';
	const e = caught(() => template(src)({ ok: true, rows: [{}] }));
	const start = src.indexOf('value');
	check(e, 'XPRSN_NULL_BASE', start, start + 5, [
		{ type: 'if', start: 0, end: 10 },
		{ type: 'each', start: 10, end: 29 },
	]);
});

test('repeated tags use their own retained offsets', () => {
	const src = '{{ next().value }}|{{ next().value }}';
	let n = 0;
	const f = template(src, { next: () => ++n === 1 ? { value: 'ok' } : null });
	const e = caught(() => f());
	const start = src.lastIndexOf('value');
	check(e, 'XPRSN_NULL_BASE', start, start + 5);
});

test('native parser errors expose stable codes and spans', () => {
	let src = '{{#each items}}x{{/each}}';
	check(caught(() => template(src)), 'SJABLOON_EACH_SYNTAX', 0, 15, [
		{ type: 'each', start: 0, end: 15 },
	]);

	src = '{{#each xs as constructor}}x{{/each}}';
	check(caught(() => template(src)), 'SJABLOON_BLOCKED_BINDING', 14, 25, [
		{ type: 'each', start: 0, end: 27 },
	]);

	src = '{{/if}}';
	check(caught(() => template(src)), 'SJABLOON_UNEXPECTED_TAG', 0, src.length);

	src = '{{#unknown}}x{{/unknown}}';
	check(caught(() => template(src)), 'SJABLOON_UNKNOWN_BLOCK', 0, 12);

	src = '{{#if ok}}yes';
	check(caught(() => template(src)), 'SJABLOON_UNCLOSED_BLOCK', src.length, src.length, [
		{ type: 'if', start: 0, end: 10 },
	]);
});

test('malformed branch controls fail inside their block', () => {
	for (const tag of ['#elif', '#else nope', '/if nope']) {
		const src = '{{#if ok}}x{{' + tag + '}}y{{/if}}';
		const start = src.indexOf('{{', 2);
		check(caught(() => template(src)), 'SJABLOON_UNEXPECTED_TAG', start, start + tag.length + 4, [
			{ type: 'if', start: 0, end: 10 },
		]);
	}
});

test('each else stays in block context and outside binding scope', () => {
	const src = '{{#each rows as r}}x{{#else}}{{ missing.value }}{{/each}}';
	const f = template(src);
	assert.ok(f.names.includes('missing'));
	const e = caught(() => f({ rows: [] }));
	const start = src.indexOf('value');
	check(e, 'XPRSN_NULL_BASE', start, start + 5, [
		{ type: 'each', start: 0, end: 19 },
	]);
});

test('missing nested closers report EOF with all unmatched openers', () => {
	const src = '{{#if ok}}{{#each rows as r}}x';
	check(caught(() => template(src)), 'SJABLOON_UNCLOSED_BLOCK', src.length, src.length, [
		{ type: 'if', start: 0, end: 10 },
		{ type: 'each', start: 10, end: 29 },
	]);
});

test('host errors and exact metadata spoofs pass through unchanged', () => {
	const host = TypeError('host failed');
	host.code = 'XPRSN_NULL_BASE';
	host.start = 0;
	host.end = 4;
	host.blocks = Object.freeze([]);
	const e = caught(() => template('{{ boom() }}', { boom: () => { throw host } })());
	assert.equal(e, host);
	assert.equal(isDiagnostic(e), false);
	assert.equal(e.start, 0);

	const getter = Error('getter failed');
	const values = { get value() { throw getter } };
	assert.equal(caught(() => template('{{ value }}')(values)), getter);
	assert.equal(isDiagnostic(getter), false);
});

test('unauthenticated expression errors pass through without template context', () => {
	const e = caught(() => template('{{ 1 in null }}')());
	assert.ok(e instanceof TypeError);
	assert.equal(isDiagnostic(e), false);
	assert.equal(Object.hasOwn(e, 'blocks'), false);
});

test('diagnostic context is immutable and independent', () => {
	const one = caught(() => template('{{#if ok}}{{ missing.value }}{{/if}}')({ ok: true }));
	const two = caught(() => template('{{#if ok}}{{ missing.value }}{{/if}}')({ ok: true }));
	assert.notEqual(one.blocks, two.blocks);
	assert.notEqual(one.blocks[0], two.blocks[0]);
	assert.throws(() => { one.blocks = []; }, TypeError);
	assert.throws(() => one.blocks.push({}), TypeError);
	assert.throws(() => { one.blocks[0].start = 2; }, TypeError);
});

test('compiled renderer remains reusable after a runtime diagnostic', () => {
	const f = template('{{ item.value }}');
	const e = caught(() => f({ item: null }));
	assert.equal(isDiagnostic(e), true);
	assert.equal(f({ item: { value: 'ok' } }), 'ok');
});

test('provenance survives later WeakSet prototype replacement', () => {
	const add = WeakSet.prototype.add;
	const has = WeakSet.prototype.has;
	try {
		WeakSet.prototype.add = () => { throw Error('replaced add'); };
		WeakSet.prototype.has = () => true;
		const e = caught(() => template('{{ 1 + }}'));
		assert.equal(isDiagnostic(e), true);
		assert.equal(isDiagnostic(Error('spoof')), false);
	} finally {
		WeakSet.prototype.add = add;
		WeakSet.prototype.has = has;
	}
});

test('bad expressions retain their existing messages and types', () => {
	assert.throws(() => template('{{ 1 + }}'), SyntaxError);
	assert.throws(() => template('{{ nope(1) }}'), /nope is not a function/);
	assert.throws(() => template('{{#if 1 + }}x{{/if}}'), SyntaxError);
});
