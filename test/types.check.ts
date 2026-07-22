import {
	isDiagnostic,
	template,
	type Diagnostic,
	type DiagnosticBlock,
} from 'sjabloon';

const render = template('{{ user.name }}');
const output: string = render({ user: { name: 'Robin' } });
const names: string[] = render.names;

try {
	render();
} catch (error: unknown) {
	if (isDiagnostic(error)) {
		const diagnostic: Diagnostic = error;
		const code: string = diagnostic.code;
		const start: number = diagnostic.start;
		const end: number = diagnostic.end;
		const blocks: readonly DiagnosticBlock[] = diagnostic.blocks;
		const type: 'if' | 'each' | undefined = blocks[0]?.type;
		void [code, start, end, type];

		// @ts-expect-error diagnostic block context is readonly
		blocks.push({ type: 'if', start: 0, end: 1 });
	}
}

void [output, names];
