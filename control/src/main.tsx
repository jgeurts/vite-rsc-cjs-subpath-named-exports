import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { LiveblocksProvider, useClient } from "@liveblocks/react";
import React from "react";

const counterSlice = createSlice({
  name: "counter",
  initialState: { value: 0 },
  reducers: {
    increment: (s) => {
      s.value += 1;
    },
  },
});

const store = configureStore({ reducer: counterSlice.reducer });

function CounterDisplay() {
  const value = useSelector((s: { value: number }) => s.value);
  return <span>Count: {value}</span>;
}

function LiveblocksStatus() {
  const client = useClient();
  return <span> · Liveblocks: {client ? "ready" : "no client"}</span>;
}

function App() {
  return (
    <LiveblocksProvider publicApiKey="pk_test_repro_only">
      <Provider store={store}>
        <CounterDisplay />
        <LiveblocksStatus />
      </Provider>
    </LiveblocksProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
