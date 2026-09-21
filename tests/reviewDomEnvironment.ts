import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  MouseEvent: dom.window.MouseEvent,
  Event: dom.window.Event,
  self: dom.window,
  IS_REACT_ACT_ENVIRONMENT: true,
});
