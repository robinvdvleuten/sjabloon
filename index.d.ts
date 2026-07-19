/**
 * Compile a template once, render it many times.
 *
 * The returned renderer exposes `names`: the variables the template reads
 * from your values, deduplicated. Loop variables the template introduces are
 * not included. It also exposes `functions`: the registry functions the
 * template calls, deduplicated.
 *
 * @param {string} str The template, e.g. `'Hello {{ user.name }}!'`.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {{(values?: Record<string, any>): string, names: string[], functions: string[]}} Renderer for the compiled template.
 * @throws {SyntaxError} On malformed tags, unclosed blocks, or bad expressions.
 */
export function template(str: string, funcs?: Record<string, Function>): {
    (values?: Record<string, any>): string;
    names: string[];
    functions: string[];
};
/**
 * Compile and render a template in one go.
 *
 * @param {string} str The template to render.
 * @param {Record<string, any>} [values] Variables available to the template.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {string} The rendered output.
 */
export function render(str: string, values?: Record<string, any>, funcs?: Record<string, Function>): string;
