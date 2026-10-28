import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ProfileStore } from "./core/profile";
import "./style.css";
const root = createRoot(document.getElementById("root")!);
async function boot() {
  root.render(
    <div className="app">
      <section className="content">
        <h1>Number Sums</h1>
        <p className="tagline">Opening your quiet corner…</p>
      </section>
    </div>,
  );
  const store = new ProfileStore();
  try {
    const profile = await store.open();
    root.render(<App profile={profile} store={store} />);
  } catch (e) {
    root.render(
      <main className="app">
        <section className="content">
          <h1>Number Sums</h1>
          <p className="intro">
            {e instanceof Error ? e.message : "Could not open your save."}
          </p>
          <p className="fine-print">Your existing data has not been deleted.</p>
          <button
            className="primary"
            onClick={() => {
              store.db?.close();
              void boot();
            }}
          >
            Try again
          </button>
        </section>
      </main>,
    );
  }
}
void boot();
