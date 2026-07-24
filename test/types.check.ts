import {
	isDiagnostic,
	template,
	type SjabloonBlock,
	type SjabloonDiagnostic,
	type SjabloonErrorCode,
} from 'sjabloon';

const render = template('{{ user.name }}');
const output: string = render({ user: { name: 'Robin' } });
const names: string[] = render.names;

const collected: { text: string; raws: unknown[] } = render.withRaw({ user: { name: 'Robin' } });
const anchored: { text: string; raws: unknown[] } = render.withRaw({}, { root: { user: { name: 'R' } }, item: {} });
void [collected, anchored];

try {
	render();
} catch (error: unknown) {
	if (isDiagnostic(error)) {
		const diagnostic: SjabloonDiagnostic = error;
		const code: SjabloonErrorCode = diagnostic.code;
		const start: number = diagnostic.start;
		const end: number = diagnostic.end;
		const blocks: readonly SjabloonBlock[] = diagnostic.blocks;
		const type: 'if' | 'each' | undefined = blocks[0]?.type;
		void [code, start, end, type];

		// @ts-expect-error diagnostic positions are readonly
		diagnostic.start = 1;

		// @ts-expect-error diagnostic block context is readonly
		blocks.push({ type: 'if', start: 0, end: 1 });
	}
}

void [output, names];
