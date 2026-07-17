import test from 'tape';
import { template } from '../src/index.js';

test('unclosed blocks', t => {
	t.throws(() => template('{{#if ok}}yes'), /Missing \{\{\/if\}\}/);
	t.throws(() => template('{{#each items as it}}x'), /Missing \{\{\/each\}\}/);
	t.end();
});

test('stray closers and unknown blocks', t => {
	t.throws(() => template('{{/if}}'), /Unexpected \{\{\/if\}\}/);
	t.throws(() => template('{{#if a}}{{/each}}{{/if}}'), SyntaxError);
	t.throws(() => template('{{#unknown}}x{{/unknown}}'), SyntaxError);
	t.end();
});

test('malformed each', t => {
	t.throws(() => template('{{#each items}}x{{/each}}'), /Bad \{\{#each items\}\}/);
	t.end();
});

test('bad expressions fail at template time', t => {
	t.throws(() => template('{{ 1 + }}'), SyntaxError);
	t.throws(() => template('{{ nope(1) }}'), /nope is not a function/);
	t.throws(() => template('{{#if 1 + }}x{{/if}}'), SyntaxError);
	t.end();
});
