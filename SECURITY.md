# Security Policy

## Security considerations

Do not treat sjabloon as a sandbox or HTML sanitizer. It compiles templates to closures and generates no JavaScript source. Its xprsn dependency rejects reads of `__proto__`, `constructor`, and `prototype`, which blocks known routes to the `Function` constructor. These constraints make sjabloon CSP-safe.

sjabloon escapes expression results inside `{{ }}`, but it copies literal template text to the output. A template author can write raw HTML or use `{{{ }}}` to skip escaping. Sanitize rendered HTML from untrusted templates before inserting it into a page.

HTML escaping does not cover every output context. Apply the right encoder or validation when an expression appears in a URL, JavaScript, CSS, or another format with its own syntax.

Anyone who controls a template can read data reachable from the values you provide. The `names` property lists root variables but omits property names, so you cannot use it as a permission check.

Template expressions can call registered functions and methods on values. Such calls may perform I/O, change application state, expose more data, or consume excessive CPU. Nested loops can produce large outputs. sjabloon runs templates in the current process without a timeout.

Before you accept untrusted templates:

- Build a values object for the template. Keep secrets out of its object graph.
- Register pure functions with no access to privileged APIs such as the network, filesystem, or processes.
- Pass a copy of your values, or freeze the whole object graph, if methods must not change application state.
- Sanitize rendered HTML and apply context-specific encoding where needed.
- Set limits for template length, collection sizes, and rendered output. For an execution deadline, use a worker or separate process that you can terminate.

Treat templates as code. Keep user input out of template syntax and pass it through the values object.

## Reporting a vulnerability

Do not open a public GitHub issue for a security vulnerability.

Use [GitHub's private vulnerability form](https://github.com/getquario/sjabloon/security/advisories/new).

Include the affected code, its impact, and steps that reproduce the issue. Tell us whether and how to credit you.

We do not accept AI slop reports.

Keep the report private while we investigate and prepare a fix.
