/**
 * Tiny, CSP-safe template engine powered by xprsn expressions.
 * Templates compile to a composition of closures; template text is never
 * turned into JavaScript, so strict CSP is satisfied.
 */
import { compile } from 'xprsn';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);

// What `#each` walks: [value, key] pairs — array indexes or own object keys.
const pairs = lv => Array.isArray(lv) ? lv.map((x, j) => [x, j])
	: lv && typeof lv === 'object' ? Object.keys(lv).map(k => [lv[k], k])
	: [];

// Split into [text, rawL, raw, rawR, tagL, tag, tagR, ...] strides of 7.
// The dash captures hug the braces, so `{{ -price }}` stays a unary minus
// while `{{- price -}}` trims the whitespace touching the tag.
const TAGS = /\{\{\{(-)?\s*([\s\S]*?)\s*(-)?\}\}\}|\{\{(-)?\s*([\s\S]*?)\s*(-)?\}\}/;

// Shared parser state; parsing is synchronous so this is safe.
let toks, i, fns, last, bound, names;

let err = msg => { throw SyntaxError(msg) };

// Compile one expression and collect its free variables, minus the loop
// variables currently in scope — those belong to the template, not the caller.
let cp = s => {
	const e = compile(s, fns);
	for (const n of e.names) bound.has(n) || names.add(n);
	return e;
};

// One `#if`/`#elif` link: parse its branch, then recurse on the chain tail.
let branch = cond => {
	const then = parse(['#elif', '#else', '/if']);
	const els = last.startsWith('#elif ') ? [branch(cp(last.slice(6)))]
		: last === '#else' ? parse(['/if'])
		: [];
	return v => (cond(v) ? then : els).map(n => n(v)).join('');
};

let parse = stops => {
	const nodes = [];
	for (let t; (t = toks[i++]); ) {
		if (t.text != null) {
			nodes.push((s => () => s)(t.text));
		} else if (t.raw != null) {
			nodes.push((e => v => String(e(v) ?? ''))(cp(t.raw)));
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
			const had = [bound.has(name), idx && bound.has(idx)];
			bound.add(name);
			idx && bound.add(idx);
			const body = parse(['#else', '/each']);
			had[0] || bound.delete(name);
			idx && !had[1] && bound.delete(idx);
			const empty = last === '#else' ? parse(['/each']) : [];
			// Child scopes inherit the parent via the prototype chain, so
			// outer variables stay visible inside the loop body.
			nodes.push(v => {
				const ps = pairs(list(v));
				if (!ps.length) return empty.map(n => n(v)).join('');
				return ps.map(([item, key]) => {
					const s = Object.create(v);
					s[name] = item;
					if (idx) s[idx] = key;
					return body.map(n => n(s)).join('');
				}).join('');
			});
		} else if (t.tag[0] === '#' || t.tag[0] === '/') {
			err('Unexpected {{' + t.tag + '}}');
		} else {
			nodes.push((e => v => esc(e(v) ?? ''))(cp(t.tag)));
		}
	}
	stops.length && err('Missing {{' + stops[stops.length - 1] + '}}');
	return nodes;
};

/**
 * Compile a template once, render it many times.
 *
 * The returned renderer exposes `names`: the variables the template reads
 * from your values, deduplicated. Loop variables the template introduces
 * are not included.
 *
 * @param {string} str The template, e.g. `'Hello {{ user.name }}!'`.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {{(values?: Record<string, any>): string, names: string[]}} Renderer for the compiled template.
 * @throws {SyntaxError} On malformed tags, unclosed blocks, or bad expressions.
 */
export function template(str, funcs) {
	fns = funcs;
	bound = new Set();
	names = new Set();
	toks = [];
	const parts = String(str).split(TAGS);
	for (let j = 0; j < parts.length; j += 7) {
		if (parts[j]) toks.push({ text: parts[j] });
		if (j + 1 >= parts.length) break;
		const raw = parts[j + 2] != null;
		const t = raw ? { raw: parts[j + 2] } : { tag: parts[j + 5] };
		t.l = parts[j + (raw ? 1 : 4)] === '-';
		t.r = parts[j + (raw ? 3 : 6)] === '-';
		toks.push(t);
	}
	// `{{-` / `-}}` eat the whitespace touching that side of the tag.
	toks.forEach((t, k) => {
		if (t.l && toks[k - 1]?.text) toks[k - 1].text = toks[k - 1].text.replace(/\s+$/, '');
		if (t.r && toks[k + 1]?.text) toks[k + 1].text = toks[k + 1].text.replace(/^\s+/, '');
	});
	i = 0;
	const nodes = parse([]);
	const f = v => nodes.map(n => n(v || {})).join('');
	// Array.from, not a spread: the bundler's transpile turns `[...set]` into
	// `[].concat(set)`, which wraps the Set instead of unpacking it.
	f.names = Array.from(names);
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
