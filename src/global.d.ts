declare module "*.css";
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<any, any, any>;
  export default component;
}

declare module "qrcode" {
  const toCanvas: (canvas: HTMLCanvasElement, text: string, options?: any) => Promise<void>;
  export default { toCanvas };
}

interface Window {
  pdfjsLib?: any;
}
