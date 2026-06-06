import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  base: "./", // relative paths for assets so they load correctly on GitHub Pages
  optimizeDeps: {
    include: ["peerjs"],
  },
});
