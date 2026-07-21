import assert from 'node:assert';
import { FuzzedDataProvider } from '@jazzer.js/core';
import { template } from '../src/index.js';

const OPS = ['+','-','*','/','%','==','!=','<','>','<=','>=','and','or','&&','||','??','in'];
const UNARY = ['!','-','not '];
// Names the generator emits; buildValues seeds each of them, so member chains
// like foo.bar resolve to real data instead of undefined noise.
const KEYS = ['a','b','c','foo','bar','val','items'];
const BLOCKED = ['__proto__', 'constructor', 'prototype'];
// Odd-but-valid loop names alongside blocked ones, to drive the #each binding
// path (src/index.js) that sjabloon-lk4 hardened.
const LOOPNAMES = ['it', 'x', 'row', 'loop', '_', 'a', ...BLOCKED];
// Literal text drawn from a safe alphabet only: no & < > " ', so any of those
// chars in the output must have come from an interpolation, never the template.
const SAFE_TEXT = 'abc DEF 123 .-_/\n';
const METHODS = ['trim', 'toUpperCase', 'toLowerCase', 'slice', 'includes', 'indexOf'];

// TOTAL registry — never throws on its own, so the only errors reaching the
// oracle originate in sjabloon/xprsn, keeping every unexpected throw a signal.
const asArr = x => (Array.isArray(x) ? x : []);
const num = x => { try { return Number(x); } catch { return 0; } };
const FUNCS = {
	id: x => x,
	add: (a, b) => num(a) + num(b),
	len: x => (x == null ? 0 : ('' + x).length),
	sum: (arr, f) => asArr(arr).reduce((s, x) => s + num(f(x)), 0),
	map: (arr, f) => asArr(arr).map(f),
};
const PLAIN = ['id', 'add', 'len'];
const REDUCERS = ['sum', 'map'];

function pickKey(data) {
	const pool = data.consumeIntegralInRange(0, 4) === 0 ? BLOCKED : KEYS;
	return pool[data.consumeIntegralInRange(0, pool.length - 1)];
}

function buildExpr(data, depth) {
	if (depth <= 0 || data.remainingBytes < 2) {
		const pick = data.consumeIntegralInRange(0, 3);
		if (pick === 0) return String(data.consumeIntegralInRange(-100, 100));
		if (pick === 1) return data.consumeBoolean() ? 'true' : 'false';
		if (pick === 2) return 'null';
		return KEYS[data.consumeIntegralInRange(0, KEYS.length - 1)];
	}
	const kind = data.consumeIntegralInRange(0, 10);
	if (kind === 0) return String(data.consumeIntegralInRange(-100, 100));
	if (kind === 1) {
		const op = OPS[data.consumeIntegralInRange(0, OPS.length - 1)];
		return `(${buildExpr(data, depth - 1)} ${op} ${buildExpr(data, depth - 1)})`;
	}
	if (kind === 2) {
		const op = UNARY[data.consumeIntegralInRange(0, UNARY.length - 1)];
		return `(${op}${buildExpr(data, depth - 1)})`;
	}
	if (kind === 3) return `(${buildExpr(data, depth - 1)} ? ${buildExpr(data, depth - 1)} : ${buildExpr(data, depth - 1)})`;
	if (kind === 4) return `(${buildExpr(data, depth - 1)} ?: ${buildExpr(data, depth - 1)})`;
	if (kind === 5) {
		const opt = data.consumeBoolean() ? '?.' : '.';
		return `(${buildExpr(data, depth - 1)}${opt}${pickKey(data)})`;
	}
	if (kind === 6) {
		const idx = data.consumeIntegralInRange(0, 4) === 0
			? JSON.stringify(BLOCKED[data.consumeIntegralInRange(0, BLOCKED.length - 1)])
			: buildExpr(data, depth - 1);
		const opt = data.consumeBoolean() ? '?.' : '';
		return `(${buildExpr(data, depth - 1)}${opt}[${idx}])`;
	}
	if (kind === 7) {
		if (data.consumeBoolean()) {
			const r = REDUCERS[data.consumeIntegralInRange(0, REDUCERS.length - 1)];
			const p = KEYS[data.consumeIntegralInRange(0, KEYS.length - 1)];
			return `${r}(${buildExpr(data, depth - 1)}, ${p} => ${buildExpr(data, depth - 1)})`;
		}
		const f = PLAIN[data.consumeIntegralInRange(0, PLAIN.length - 1)];
		return `${f}(${buildExpr(data, depth - 1)}, ${buildExpr(data, depth - 1)})`;
	}
	if (kind === 8) {
		const m = METHODS[data.consumeIntegralInRange(0, METHODS.length - 1)];
		return `(${buildExpr(data, depth - 1)}).${m}()`;
	}
	if (kind === 9) {
		const q = JSON.stringify(data.consumeString(12, 'utf8'));
		return data.consumeBoolean() ? q : "'" + q.slice(1, -1).replace(/'/g, "\\'") + "'";
	}
	const root = data.consumeBoolean() ? '$' : '@';
	return `(${root}.${pickKey(data)})`;
}

function text(data) {
	const n = data.consumeIntegralInRange(0, 4);
	let s = '';
	for (let i = 0; i < n; i++) s += SAFE_TEXT[data.consumeIntegralInRange(0, SAFE_TEXT.length - 1)];
	return s;
}

// Build a grammatical template. `raw` toggles whether {{{ }}} raw interpolation
// may appear: the escaping oracle only runs when it cannot (see fuzz()).
function buildTemplate(data, depth, raw) {
	const n = data.consumeIntegralInRange(1, 4);
	let out = '';
	for (let i = 0; i < n; i++) {
		out += text(data);
		if (depth <= 0 || data.remainingBytes < 2) { out += `{{ ${buildExpr(data, 0)} }}`; continue; }
		const kind = data.consumeIntegralInRange(0, raw ? 5 : 4);
		if (kind === 0) out += `{{ ${buildExpr(data, depth - 1)} }}`;
		else if (kind === 1) out += `{{! ${text(data)} }}`;
		else if (kind === 2) {
			out += `{{#if ${buildExpr(data, depth - 1)}}}${buildTemplate(data, depth - 1, raw)}`;
			if (data.consumeBoolean()) out += `{{#elif ${buildExpr(data, depth - 1)}}}${buildTemplate(data, depth - 1, raw)}`;
			if (data.consumeBoolean()) out += `{{#else}}${buildTemplate(data, depth - 1, raw)}`;
			out += `{{/if}}`;
		} else if (kind === 3) {
			const name = LOOPNAMES[data.consumeIntegralInRange(0, LOOPNAMES.length - 1)];
			const two = data.consumeBoolean();
			const idx = LOOPNAMES[data.consumeIntegralInRange(0, LOOPNAMES.length - 1)];
			out += `{{#each ${buildExpr(data, depth - 1)} as ${name}${two ? ', ' + idx : ''}}}${buildTemplate(data, depth - 1, raw)}`;
			if (data.consumeBoolean()) out += `{{#else}}${buildTemplate(data, depth - 1, raw)}`;
			out += `{{/each}}`;
		} else if (kind === 4) out += `{{ ${buildExpr(data, depth - 1)} }}`;
		else out += `{{{ ${buildExpr(data, depth - 1)} }}}`;
	}
	return out;
}

// Dangerous strings carry <, >, ", ' but deliberately NO &, so in the escaping
// scan every & in the output must originate from an escape sequence.
const DANGER = ['<b>"x"</b>', "</script>'y'", '<img src=x>', '"a" \'b\' <c>'];

function buildValues(data, names) {
	const vals = {};
	for (const n of names) {
		const pick = data.consumeIntegralInRange(0, 6);
		if (pick === 0) vals[n] = null;
		else if (pick === 1) vals[n] = data.consumeBoolean();
		else if (pick === 2) vals[n] = data.consumeIntegralInRange(-100, 100);
		else if (pick === 3) vals[n] = DANGER[data.consumeIntegralInRange(0, DANGER.length - 1)];
		else if (pick === 4) vals[n] = data.consumeString(12, 'utf8');
		else if (pick === 5) vals[n] = { bar: { baz: 1 }, price: 2, qty: 3, val: 's' };
		else vals[n] = Array.from({ length: data.consumeIntegralInRange(1, 3) },
			() => ({ price: data.consumeIntegralInRange(0, 9), qty: data.consumeIntegralInRange(1, 4) }));
	}
	return vals;
}

const isCompileErr = e => e instanceof SyntaxError;
const isRenderErr = e =>
	e instanceof SyntaxError ||
	e instanceof TypeError ||
	(e instanceof RangeError && /stack|Maximum call/i.test(String(e.message)));

// ESCAPING NEVER BYPASSED: in escaped {{ }} output the raw XSS characters must
// never survive, and every & must begin a known entity. Sound because literal
// text uses a safe alphabet and DANGER values contain no & of their own.
const ENTITY = /&(amp|lt|gt|quot|#39);/g;
function assertEscaped(out) {
	if (/[<>]/.test(out)) throw new Error('escaping bypassed: raw < or > in output');
	if (out.replace(ENTITY, '').includes('&')) throw new Error('escaping bypassed: bare & in output');
}

// Fixed escaping battery — the invariant is independent of the fuzzed data, so
// assert it once at load: {{ }} encodes every special char, {{{ }}} stays raw.
(function assertEscapingContract() {
	const v = { s: `&<>"'` };
	assert.strictEqual(template('{{ s }}')(v), '&amp;&lt;&gt;&quot;&#39;');
	assert.strictEqual(template('{{{ s }}}')(v), `&<>"'`);
})();

// Blocked-key reads must throw TypeError through xprsn's guard, across the same
// shapes the parser exposes; hash keys with blocked names must not pollute.
(function assertGuards() {
	const reads = [
		['{{ base.__proto__ }}', { base: {} }],
		['{{ base["constructor"] }}', { base: {} }],
		['{{ base.prototype }}', { base: {} }],
		['{{ $["__proto__"] }}', {}],
	];
	for (const [src, v] of reads) {
		let blocked = false;
		try { template(src)(v); }
		catch (e) { if (!(e instanceof TypeError)) throw e; blocked = true; }
		if (!blocked) throw new Error('blocked-key read escaped the guard: ' + src);
	}
})();

// Prototype canary — defense-in-depth beside jazzer's strong-mode detector.
// Pins the own-key count and identity of core methods to the pristine baseline,
// catching reassignment/deletion the detector's docs say it can miss.
const OP = Object.prototype;
const PROTO_KEYS = Object.getOwnPropertyNames(OP).length;
const PROTO_HAS_OWN = OP.hasOwnProperty;
const PROTO_TO_STRING = OP.toString;
const protoIntact = () =>
	Object.getOwnPropertyNames(OP).length === PROTO_KEYS &&
	OP.hasOwnProperty === PROTO_HAS_OWN &&
	OP.toString === PROTO_TO_STRING;

export function fuzz(data) {
	const provider = new FuzzedDataProvider(data);
	const depth = provider.consumeIntegralInRange(1, 4);
	// When raw interpolation is disallowed, the strict escaping scan applies.
	const raw = provider.consumeBoolean();
	const src = buildTemplate(provider, depth, raw);

	let render;
	try { render = template(src, FUNCS); }
	catch (e) { if (!isCompileErr(e)) throw e; return; }

	const values = buildValues(provider, render.names);
	const snap = JSON.stringify(values);

	let ok = false, first;
	try { first = render(values); ok = true; }
	catch (e) { if (!isRenderErr(e)) throw e; }
	finally {
		// Run on the throwing path too: a pollution/mutation finding outranks
		// any expected render error.
		if (!protoIntact()) throw new Error('Object.prototype polluted');
		if (JSON.stringify(values) !== snap) throw new Error('values mutated');
	}

	if (ok) {
		if (!raw) assertEscaped(first);
		let second;
		try { second = render(values); }
		finally {
			if (!protoIntact()) throw new Error('Object.prototype polluted');
			if (JSON.stringify(values) !== snap) throw new Error('values mutated');
		}
		assert.strictEqual(second, first, 'non-deterministic render');
	}
}
