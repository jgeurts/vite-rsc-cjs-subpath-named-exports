"use client";

// Reproduction: a `'use client'` component that imports a package whose
// transitive dep is a CJS module with a NODE_ENV-conditional `require()`
// wrapper (`use-sync-external-store/shim/with-selector`).
//
// When Vite's optimizer bundles `react-redux`, the optimizer emits an
// import to the conditional-CJS file. In the dev server's SSR runtime
// (where plugin-rsc renders this `'use client'` boundary for the initial
// HTML), the runner fetches that file via Vite's `/@fs/...?v=...` URL.
// Vite serves the raw CJS file without applying esbuild's CJS-to-ESM
// interop; the ESM evaluator then fails the named-export probe with
// `does not provide an export named 'default'`.
//
// The conditional CJS pattern is in
// `node_modules/use-sync-external-store/shim/with-selector.js`:
//   if (process.env.NODE_ENV === 'production')
//     module.exports = require('../cjs/...production.js');
//   else
//     module.exports = require('../cjs/...development.js');
//
// esbuild's CJS-to-ESM analysis can't statically resolve the conditional
// `require()` to find the named exports.

import React from "react";
import { Provider, useSelector } from "react-redux";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { LiveblocksProvider, useClient } from "@liveblocks/react";

function LiveblocksStatus() {
  const client = useClient();
  return <span> · Liveblocks: {client ? "ready" : "no client"}</span>;
}

const counterSlice = createSlice({
  name: "counter",
  initialState: { value: 0 },
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
  },
});

const store = configureStore({ reducer: counterSlice.reducer });

function CounterDisplay() {
  const value = useSelector((state: { value: number }) => state.value);
  return <span>Count: {value}</span>;
}

export function ClientCounter() {
  const [count, setCount] = React.useState(0);

  return (
    <LiveblocksProvider publicApiKey="pk_test_repro_only">
      <Provider store={store}>
        <div>
          <CounterDisplay />
          <LiveblocksStatus />
          <button onClick={() => setCount((count) => count + 1)}>
            Local: {count}
          </button>
        </div>
      </Provider>
    </LiveblocksProvider>
  );
}
