import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Could not find element #app");
}

const app = mount(App, {
  target,
});

export default app;
