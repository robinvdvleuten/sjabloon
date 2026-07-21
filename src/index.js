/**
 * Tiny, CSP-safe template engine powered by xprsn expressions.
 * Templates compile to a composition of closures; template text is never
 * turned into JavaScript, so strict CSP is satisfied.
 */
import { compile } from 'xprsn';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
const BLOCKED = /^(?:__proto__|constructor|prototype)$/;

// What `#each` walks: [value, key] pairs — array indexes or own object keys.
const pairs = lv => Array.isArray(lv) ? lv.map((x, j) => [x, j])
	: lv && typeof lv === 'object' ? Object.keys(lv).map(k => [lv[k], k])
	: [];

// Split into [text, rawL, raw, rawR, tagL, tag, tagR, ...] strides of 7.
// The dash captures hug the braces, so `{{ -price }}` stays a unary minus
// while `{{- price -}}` trims the whitespace touching the tag.
const TAGS = /\{\{\{(-)?([\s\S]*?)(-)?\}\}\}|\{\{(-)?([\s\S]*?)(-)?\}\}/;

// Shared parser state; parsing is synchronous so this is safe.
// `nms` collects free variables, `fnms` the registry functions called.
let toks, i, fns, last, bound, nms, fnms;

let err = msg => { throw SyntaxError(msg) };

// Render a list of nodes against a scope.
let run = (nodes, v) => nodes.map(n => n(v)).join('');

// A leaf interpolation node: compile `src`, render nullish as '', apply `wrap`
// (`esc` for `{{ }}`, `String` for the raw `{{{ }}}` form).
let interp = (src, wrap) => (e => v => wrap(e(v) ?? ''))(cp(src));

// Bind `names` for a block body; returns a restore that unbinds only the names
// this block introduced, leaving an outer scope's bindings in place.
let scope = (...names) => {
	const fresh = names.filter(n => n && !bound.has(n));
	fresh.forEach(n => bound.add(n));
	return () => fresh.forEach(n => bound.delete(n));
};

// Compile one expression and collect its free variables (minus the loop
// variables currently in scope, which belong to the template) and the registry
// functions it calls.
let cp = s => {
	const e = compile(s, fns);
	for (const n of e.names) bound.has(n) || nms.add(n);
	for (const fn of e.functions) fnms.add(fn);
	return e;
};

// One `#if`/`#elif` link: parse its branch, then recurse on the chain tail.
let branch = cond => {
	const then = parse(['#elif', '#else', '/if']);
	const els = last.startsWith('#elif ') ? [branch(cp(last.slice(6)))]
		: last === '#else' ? parse(['/if'])
		: [];
	return v => run(cond(v) ? then : els, v);
};

let parse = stops => {
	const nodes = [];
	for (let t; (t = toks[i++]); ) {
		if (t.text != null) {
			nodes.push((s => () => s)(t.text));
		} else if (t.raw != null) {
			nodes.push(interp(t.raw, String));
		} else if (stops.includes(t.tag.split(' ')[0])) {
			last = t.tag;
			return nodes;
		} else if (t.tag[0] === '!') {
			// comment
		} else if (t.tag.startsWith('#if ')) {
			nodes.push(branch(cp(t.tag.slice(4))));
		} else if (t.tag.startsWith('#each ')) {
			const m = /^#each ([\s\S]+) as (\w+)(?:\s*,\s*(\w+))?$/.exec(t.tag) || err('Bad {{' + t.tag + '}}');
			const list = cp(m[1]), name = m[2], idx = m[3];
			if (BLOCKED.test(name) || idx && BLOCKED.test(idx)) err('Bad {{' + t.tag + '}}');
			// `name`, `idx`, and `loop` are engine-bound inside the body, so
			// exclude them from names there and restore outer bindings after.
			const restore = scope(name, idx, 'loop');
			const body = parse(['#else', '/each']);
			restore();
			const empty = last === '#else' ? parse(['/each']) : [];
			// Child scopes inherit the parent via the prototype chain, so outer
			// variables stay visible inside the loop body. `@` re-points to the
			// current item at each level, `$` (root) rides the chain, and `loop`
			// carries the iteration metadata (index/first/last/length).
			nodes.push(v => {
				const ps = pairs(list(v));
				if (!ps.length) return run(empty, v);
				return ps.map(([item, key], j) => {
					const s = Object.create(v);
					s[name] = item;
					if (idx) s[idx] = key;
					s['@'] = item;
					s.loop = { index: j + 1, index0: j, first: !j, last: j === ps.length - 1, length: ps.length };
					return run(body, s);
				}).join('');
			});
		} else if (t.tag[0] === '#' || t.tag[0] === '/') {
			err('Unexpected {{' + t.tag + '}}');
		} else {
			nodes.push(interp(t.tag, esc));
		}
	}
	stops.length && err('Missing {{' + stops[stops.length - 1] + '}}');
	return nodes;
};

/**
 * Compile a template once, render it many times.
 *
 * The returned renderer exposes `names`: the variables the template reads
 * from your values, deduplicated. Loop variables the template introduces are
 * not included. It also exposes `functions`: the registry functions the
 * template calls, deduplicated.
 *
 * Two anchors are always in scope: `$` is the root values, and `@` is the
 * current `#each` item (the root outside any loop). They let a nested loop
 * reach the root (`$.company`) or the current item (`@.total`) explicitly,
 * past any shadowing. Neither counts as a `name`.
 *
 * An embedder with its own scope model can override the anchors per render by
 * passing `{ root, item }` as the renderer's second argument: `$` becomes
 * `root` and `@` becomes `item` (two distinct objects). Omit `item` to leave
 * `@` unbound, so reading `@.x` throws through xprsn's guard.
 *
 * @param {string} str The template, e.g. `'Hello {{ user.name }}!'`.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {{(values?: Record<string, any>, scope?: { root?: any, item?: any }): string, names: string[], functions: string[]}} Renderer for the compiled template.
 * @throws {SyntaxError} On malformed tags, unclosed blocks, or bad expressions.
 */
export function template(str, funcs) {
	fns = funcs;
	// `$` (root) and `@` (current item) are engine-bound anchors, always in
	// scope, so they never count as caller-supplied `names`.
	bound = new Set(['$', '@']);
	nms = new Set();
	fnms = new Set();
	toks = [];
	const parts = String(str).split(TAGS);
	for (let j = 0; j < parts.length; j += 7) {
		if (parts[j]) toks.push({ text: parts[j] });
		if (j + 1 >= parts.length) break;
		const raw = parts[j + 2] != null;
		const t = raw ? { raw: parts[j + 2].trim() } : { tag: parts[j + 5].trim() };
		t.l = parts[j + (raw ? 1 : 4)] === '-';
		t.r = parts[j + (raw ? 3 : 6)] === '-';
		toks.push(t);
	}
	// `{{-` / `-}}` eat the whitespace touching that side of the tag.
	toks.forEach((t, k) => {
		if (t.l && toks[k - 1]?.text) toks[k - 1].text = toks[k - 1].text.trimEnd();
		if (t.r && toks[k + 1]?.text) toks[k + 1].text = toks[k + 1].text.trimStart();
	});
	i = 0;
	const nodes = parse([]);
	// Wrap the values in a root scope carrying the anchors, without mutating
	// what the caller passed: by default `$` and `@` both point at the root.
	// An embedder can override the anchors with a `{ root, item }` second arg:
	// `$` = root, `@` = item (distinct objects). Omitting `item` leaves `@`
	// unbound, so `@.x` throws through xprsn's guard — a group-header band that
	// has no current row wants exactly that.
	const f = (v, o) => {
		v = v || {};
		const r = Object.create(v);
		r['$'] = o ? o.root : v;
		if (!o) r['@'] = v;
		else if ('item' in o) r['@'] = o.item;
		return run(nodes, r);
	};
	// Array.from, not a spread: the bundler's transpile turns `[...set]` into
	// `[].concat(set)`, which wraps the Set instead of unpacking it.
	f.names = Array.from(nms);
	f.functions = Array.from(fnms);
	return f;
}

/**
 * Compile and render a template in one go.
 *
 * @param {string} str The template to render.
 * @param {Record<string, any>} [values] Variables available to the template.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {string} The rendered output.
 */
export function render(str, values, funcs) {
	return template(str, funcs)(values);
}
