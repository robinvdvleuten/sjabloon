import assert from 'node:assert/strict';
import test from 'node:test';
import { template } from '../src/index.js';

test('unclosed blocks', () => {
	assert.throws(() => template('{{#if ok}}yes'), /Missing \{\{\/if\}\}/);
	assert.throws(() => template('{{#if a}}x{{#elif b}}y'), /Missing \{\{\/if\}\}/);
	assert.throws(() => template('{{#each items as it}}x'), /Missing \{\{\/each\}\}/);
});

test('stray closers and unknown blocks', () => {
	assert.throws(() => template('{{/if}}'), /Unexpected \{\{\/if\}\}/);
	assert.throws(() => template('{{#if a}}{{/each}}{{/if}}'), SyntaxError);
	assert.throws(() => template('{{#unknown}}x{{/unknown}}'), SyntaxError);
});

test('malformed each', () => {
	assert.throws(() => template('{{#each items}}x{{/each}}'), /Bad \{\{#each items\}\}/);
});

test('bad expressions fail at template time', () => {
	assert.throws(() => template('{{ 1 + }}'), SyntaxError);
	assert.throws(() => template('{{ nope(1) }}'), /nope is not a function/);
	assert.throws(() => template('{{#if 1 + }}x{{/if}}'), SyntaxError);
});
