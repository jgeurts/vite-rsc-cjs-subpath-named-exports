# `@vitejs/plugin-rsc` cold-load optimizer-cache version mismatch

Minimal reproduction: a cold dev start of a `@vitejs/plugin-rsc` app
crashes the first browser load with `Invalid hook call` /
`Cannot read properties of null (reading 'useMemo')`.

The dev server emits the optimized React deps **at different version
hashes per environment** (`react.js?v=AAA` vs `react-dom_client.js?v=BBB`).
The browser ends up with two distinct React module records — the renderer
sets the dispatcher on its bundled React, but a `'use client'` library
calls `useMemo` against the other React, where `React.H` is null.

## Versions

```
node:                   v24.10.0
vite:                   8.0.10
@vitejs/plugin-rsc:     0.5.25
react / react-dom:      19.2.6
```

## Reproduce

```sh
npm install
rm -rf node_modules/.vite   # ensure cold optimizer cache
npm run dev
# open http://localhost:5173/ in a browser
```

Expected: page renders without console errors.

Actual: page mounts, then the browser console emits two `Invalid hook
call` errors and:

```
TypeError: Cannot read properties of null (reading 'useMemo')
    at exports.useMemo (.../node_modules/.vite/deps/react-XXXX.js?v=AAAAAAAA)
    at useInitial (.../node_modules/.vite/deps/@liveblocks_react.js?v=BBBBBBBB)
    at LiveblocksProvider (.../node_modules/.vite/deps/@liveblocks_react.js?v=BBBBBBBB)
    at react_stack_bottom_frame (.../node_modules/.vite/deps/react-dom_client.js?v=CCCCCCCC)
```

Note that `react.js`, `@liveblocks_react.js`, and `react-dom_client.js`
each carry a **different** `?v=` hash. Vite's optimizer ran multiple
times (once per environment: `client`, `ssr`, `rsc`) and each pass
emitted its own version stamp. References to the older hashes resolve
to a different React module record than the renderer is using.

## Surfaces & related symptoms

The same multi-hash optimizer state surfaces additional failures in
larger apps depending on the dependency graph. The two we've observed:

1. **Invalid hook call** (this minimal repro). React duplication. The
   renderer's React and the `'use client'` library's React are
   different module records.
2. **`The requested module '/@fs/.../node_modules/<pkg>/...?v=...' does
   not provide an export named 'default'`**. Stale optimizer references
   to CJS subpaths with conditional `require()` wrappers
   (`use-sync-external-store/shim/with-selector`,
   `fast-deep-equal/es6/react`, etc.). Esbuild can't statically analyze
   the conditional CJS, so the optimizer emits only a `default` export.
   When chunk A (built at version AAA) imports chunk B's CJS shim by a
   stale path, Vite falls through to serving the raw `node_modules` CJS
   file via `/@fs/`, which the ESM loader rejects on the named-export
   probe.

Both symptoms have the same underlying cause: `@vitejs/plugin-rsc`
sets up three Vite environments (`client`, `ssr`, `rsc`), each with its
own dep optimizer, and the optimizer cache versions do not stay in
sync across environments during a single cold start.

## Control: plain Vite is fine

Same dependencies, same code, but no `@vitejs/plugin-rsc` (just plain
Vite + `@vitejs/plugin-react`) works without errors. See
[`./control/`](./control) for a side-by-side. The optimizer with a
single environment emits a consistent `?v=` hash across all chunks.

## Files

- [`vite.config.ts`](./vite.config.ts): default `@vitejs/plugin-rsc`
  starter config (from `npm create vite@latest -- --template rsc`).
- [`src/client.tsx`](./src/client.tsx): `'use client'` component that
  imports `@liveblocks/react` (which calls `useMemo` from React in its
  `LiveblocksProvider`). This is enough to trip the dispatcher
  mismatch — any `'use client'` library that synchronously calls a
  React hook in a top-level provider will reproduce.
- [`src/framework/entry.{browser,ssr,rsc}.tsx`](./src/framework):
  unchanged from the official `@vitejs/plugin-rsc` starter.

## Why this matters

Frameworks layered on `@vitejs/plugin-rsc` (vinext, vite-plugins-various,
etc.) work around this by manipulating `environments.ssr.resolve.noExternal`
in `configResolved` (e.g. [cloudflare/vinext#1105](https://github.com/cloudflare/vinext/pull/1105)
strips React entries to force the SSR env to load React via Node
externals). That's a band-aid: the underlying optimizer cache state
is still inconsistent, and the workarounds don't cover every
React-peer package or CJS subpath that downstream apps pull in.

The fix probably belongs in `@vitejs/plugin-rsc`'s environment
configuration — either share an optimizer cache where it's safe, pin a
single `?v=` hash across the three environments, or pre-populate
`optimizeDeps.include` so React, react-dom, and React-peer packages
optimize once per cold start instead of three times.
