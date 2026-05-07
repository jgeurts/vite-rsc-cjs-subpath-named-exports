# Control: plain Vite + identical deps

Same `react`, `react-dom`, `@liveblocks/react`, `react-redux`,
`@reduxjs/toolkit` versions as the parent reproduction, but without
`@vitejs/plugin-rsc`. Plain Vite + `@vitejs/plugin-react` only.

## Run

```sh
npm install
rm -rf node_modules/.vite
npm run dev
# open http://localhost:5173/
```

Expected: renders `Count: 0 · Liveblocks: ready` with no console errors.

This is the control: it isolates the bug to `@vitejs/plugin-rsc`'s
multi-environment optimizer cache management. With a single environment,
Vite emits one consistent `?v=` hash and every dependency module
references the same React instance.
