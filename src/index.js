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

// Split into [text, raw-tag, tag, text, raw-tag, tag, ...] triplets.
const TAGS = /\{\{\{\s*([\s\S]*?)\s*\}\}\}|\{\{\s*([\s\S]*?)\s*\}\}/;

// Shared parser state; parsing is synchronous so this is safe.
let toks, i, fns, last;

let err = msg => { throw SyntaxError(msg) };

// One `#if`/`#elif` link: parse its branch, then recurse on the chain tail.
let branch = cond => {
	const then = parse(['#elif', '#else', '/if']);
	const els = last.startsWith('#elif ') ? [branch(compile(last.slice(6), fns))]
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
			nodes.push((e => v => String(e(v) ?? ''))(compile(t.raw, fns)));
		} else if (stops.includes(t.tag.split(' ')[0])) {
			last = t.tag;
			return nodes;
		} else if (t.tag[0] === '!') {
			// comment
		} else if (t.tag.startsWith('#if ')) {
			nodes.push(branch(compile(t.tag.slice(4), fns)));
		} else if (t.tag.startsWith('#each ')) {
			const m = /^#each ([\s\S]+) as (\w+)(?:\s*,\s*(\w+))?$/.exec(t.tag) || err('Bad {{' + t.tag + '}}');
			const list = compile(m[1], fns), name = m[2], idx = m[3];
			const body = parse(['/each']);
			// Child scopes inherit the parent via the prototype chain, so
			// outer variables stay visible inside the loop body.
			nodes.push(v => pairs(list(v)).map(([item, key]) => {
				const s = Object.create(v);
				s[name] = item;
				if (idx) s[idx] = key;
				return body.map(n => n(s)).join('');
			}).join(''));
		} else if (t.tag[0] === '#' || t.tag[0] === '/') {
			err('Unexpected {{' + t.tag + '}}');
		} else {
			nodes.push((e => v => esc(e(v) ?? ''))(compile(t.tag, fns)));
		}
	}
	stops.length && err('Missing {{' + stops[stops.length - 1] + '}}');
	return nodes;
};

/**
 * Compile a template once, render it many times.
 *
 * @param {string} str The template, e.g. `'Hello {{ user.name }}!'`.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {(values?: Record<string, any>) => string} Renderer for the compiled template.
 * @throws {SyntaxError} On malformed tags, unclosed blocks, or bad expressions.
 */
export function template(str, funcs) {
	fns = funcs;
	toks = [];
	const parts = String(str).split(TAGS);
	for (let j = 0; j < parts.length; j++) {
		const s = parts[j];
		if (s == null) continue;
		if (j % 3 === 0) s && toks.push({ text: s });
		else if (j % 3 === 1) toks.push({ raw: s });
		else toks.push({ tag: s });
	}
	i = 0;
	const nodes = parse([]);
	return v => nodes.map(n => n(v || {})).join('');
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
