# `@vitejs/plugin-rsc` cold-load `Invalid hook call`

Minimal reproduction: a cold dev start of a `@vitejs/plugin-rsc` app
crashes the first browser load with `Invalid hook call` /
`Cannot read properties of null (reading 'useMemo')` when a
`'use client'` library calls a React hook synchronously in a Provider.

The dev server emits the optimized React deps **at different `?v=`
hashes per chunk** (`react.js?v=AAA`, `@liveblocks_react.js?v=BBB`,
`react-dom_client.js?v=CCC`). The browser ends up with two distinct
React module records — the renderer sets the dispatcher on its bundled
React, but the `'use client'` library calls `useMemo` against the other
React, where `React.H` is null.

## Versions

```
node:                   v24.10.0
vite:                   8.0.10
@vitejs/plugin-rsc:     0.5.26
react / react-dom:      19.2.6
```

## Reproduce

Locally:

```sh
npm install
rm -rf node_modules/.vite   # ensure cold optimizer cache
npm run dev
# open http://localhost:5173/ in a browser
```

Or on StackBlitz:
[stackblitz.com/github/jgeurts/vite-rsc-cjs-subpath-named-exports](https://stackblitz.com/github/jgeurts/vite-rsc-cjs-subpath-named-exports).
Watch the StackBlitz terminal for the smoking gun:

```
[vite] (client) ✨ new dependencies optimized: @liveblocks/react, @reduxjs/toolkit, react-redux
[vite] (client) ✨ optimized dependencies changed. reloading
```

That second-pass optimization is exactly the lazy-discovery race
that drifts `?v=` hashes. WebContainer's hard reload often masks the
visual `Invalid hook call`, so locally is more reliable for
observing the browser-side crash.

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

## Root cause

`@vitejs/plugin-rsc` configures three Vite environments (`client`,
`ssr`, `rsc`). The `client` environment's `optimizeDeps.include` only
lists `react-dom/client` and one React Server DOM entry — not `react`,
`react/jsx-runtime`, or any of the React-peer packages crawled by
`crawlFrameworkPkgs`. The client optimizer therefore discovers them
lazily, re-runs as new boundaries are walked, and changes the `?v=`
hash on chunks that have already been served. The browser holds onto
stale chunk URLs and fetches the new ones too, ending up with two
distinct React module records.

The SSR and RSC environments don't hit this because their
`optimizeDeps.include` already lists `react`, `react-dom`,
`react/jsx-runtime`, and `react/jsx-dev-runtime`.

## Control: plain Vite is fine

Same dependencies, same code, but no `@vitejs/plugin-rsc` (just plain
Vite + `@vitejs/plugin-react`) works without errors. See
[`./control/`](./control) for a side-by-side. With a single
environment, the optimizer emits a consistent `?v=` hash for every
chunk.

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

## Workaround

Add the React-peer packages to the `client` environment's
`optimizeDeps.include` in your own `vite.config.ts`:

```ts
environments: {
  client: {
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@liveblocks/react',
        'react-redux',
      ],
    },
  },
},
```

## Fix

Filed upstream:

- Issue: [vitejs/vite-plugin-react#1213](https://github.com/vitejs/vite-plugin-react/issues/1213)
- PR: [vitejs/vite-plugin-react#1214](https://github.com/vitejs/vite-plugin-react/pull/1214)

The PR mirrors the SSR/RSC env's `optimizeDeps.include` for the client
env and pre-includes the React-peer packages found by
`crawlFrameworkPkgs`, removing the lazy-discovery race.
