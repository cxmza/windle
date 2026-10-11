import { z } from 'zod';

// Every schema module in this package imports `z` from here, never from 'zod' directly.
//
// zod 4 builds a JIT fast path for object schemas when it can compile code: at schema construction it probes
// `new Function('')` once. Browser apps (app, oauth) run under a CSP without 'unsafe-eval', so that probe is caught
// by zod but still fires a CSP violation (console + report) on every page load. In a browser we switch the JIT off
// before any schema exists; the api (Node, no CSP) keeps it.
if ('document' in globalThis) z.config({ jitless: true });

export { z };
