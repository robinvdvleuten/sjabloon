import type { XprsnErrorCode } from 'xprsn';

export type SjabloonErrorCode =
    | XprsnErrorCode
    | 'SJABLOON_EACH_SYNTAX'
    | 'SJABLOON_BLOCKED_BINDING'
    | 'SJABLOON_UNEXPECTED_TAG'
    | 'SJABLOON_UNKNOWN_BLOCK'
    | 'SJABLOON_UNCLOSED_BLOCK';

export interface SjabloonBlock {
    readonly type: 'if' | 'each';
    readonly start: number;
    readonly end: number;
}

export interface SjabloonDiagnostic extends Error {
    readonly code: SjabloonErrorCode;
    readonly start: number;
    readonly end: number;
    readonly blocks: readonly SjabloonBlock[];
}

/**
 * Check whether an error was produced or translated by this sjabloon module instance.
 */
export function isDiagnostic(error: unknown): error is SjabloonDiagnostic;

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
 * The renderer also exposes `withRaw(values, scope)`: one render, both channels.
 * It returns `{ text, raws }` — the rendered string plus each interpolation's
 * pre-escape, pre-stringify value (`{{ }}` and `{{{ }}}` alike, nullish
 * included), in render order: loop bodies push once per iteration, untaken
 * branches push nothing. Block expressions (`#if` conditions, `#each`
 * collections) are never captured.
 *
 * @param {string} str The template, e.g. `'Hello {{ user.name }}!'`.
 * @param {Record<string, Function>} [funcs] Functions callable inside expressions.
 * @returns {{(values?: Record<string, any>, scope?: { root?: any, item?: any }): string, withRaw: (values?: Record<string, any>, scope?: { root?: any, item?: any }) => { text: string, raws: unknown[] }, names: string[], functions: string[]}} Renderer for the compiled template.
 * @throws {SyntaxError} On malformed tags, unclosed blocks, or bad expressions.
 */
export function template(str: string, funcs?: Record<string, Function>): {
    (values?: Record<string, any>, scope?: {
        root?: any;
        item?: any;
    }): string;
    withRaw(values?: Record<string, any>, scope?: {
        root?: any;
        item?: any;
    }): {
        text: string;
        raws: unknown[];
    };
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
