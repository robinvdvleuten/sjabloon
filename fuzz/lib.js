import { template } from '../src/index.js';

// Malformed templates and bad expressions surface as SyntaxError at compile
// time; anything else from template() is a real finding.
const isCompileErr = e => e instanceof SyntaxError;

// Rendering adds xprsn's runtime guard (TypeError) and, for pathological
// nesting, a stack-overflow RangeError. Everything else is unexpected.
const isRenderErr = e =>
	e instanceof SyntaxError ||
	e instanceof TypeError ||
	(e instanceof RangeError && /stack|Maximum call/i.test(String(e.message)));

export function compileOnly(src) {
	try { template(src); }
	catch (e) { if (!isCompileErr(e)) throw e; }
}

export function renderSafe(src, values, funcs) {
	let render;
	try { render = template(src, funcs); }
	catch (e) { if (!isCompileErr(e)) throw e; return; }
	let out;
	try { out = render(values); }
	catch (e) { if (!isRenderErr(e)) throw e; return; }
	// Differential check: withRaw() must render the same string as a plain call,
	// and a successful plain render must stay successful through it.
	if (render.withRaw(values).text !== out) throw new Error('withRaw() changed the rendered output');
}
