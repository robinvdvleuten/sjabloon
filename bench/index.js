// Micro-benchmarks for sjabloon. Run with `npm run bench`.
//
// Zero-dependency harness: warm up to let the JIT settle, then time ~100ms
// batches and report the best ops/sec. `template` (compile) and the renderer
// are measured apart because the design is compile-once, render-many. `sink`
// reads every result so the work cannot be optimized away.
import { template } from '../src/index.js';

let sink = 0;

function bench(name, fn) {
	for (let w = performance.now(); performance.now() - w < 50; ) fn(); // warmup
	let best = 0;
	for (let s = 0; s < 5; s++) {
		let ops = 0, dt, t = performance.now();
		do {
			for (let i = 0; i < 1000; i++) sink += fn() ? 1 : 0;
			ops += 1000;
		} while ((dt = performance.now() - t) < 100);
		const hz = ops / (dt / 1e3);
		if (hz > best) best = hz;
	}
	console.log(name.padEnd(24), Math.round(best).toLocaleString().padStart(14), 'ops/sec');
}

const TPL = '<h1>{{ title }}</h1><ul>{{#each items as it}}<li>{{ it.name }}: {{ it.price }}{{#if not loop.last}}, {{/if}}</li>{{/each}}</ul>';
const rows = n => Array.from({ length: n }, (_, i) => ({ name: 'Item ' + i, price: i * 10 }));
const small = { title: 'Order', items: rows(10) };
const large = { title: 'Order', items: rows(100) };

// Compile (parse) throughput.
bench('compile: template', () => template(TPL));

// Render throughput of an already-compiled template.
const render = template(TPL);
bench('render: 10 items', () => render(small));
bench('render: 100 items', () => render(large));

if (sink < 0) console.log(sink); // retain sink
