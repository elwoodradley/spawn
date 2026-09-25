/**
 * Put a theme on the page: write the CSS variables to the root element, mark
 * the appearance, and inject any SVG filters the theme references.
 */
import type { Theme } from "./schema";
import { themeToCssVars } from "./tokens";

export const SVG_FILTER_HOST_ID = "sp-theme-filters";

export function applyTheme(theme: Theme, doc: Document = document): void {
  const root = doc.documentElement;
  const vars = themeToCssVars(theme);
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.dataset.appearance = theme.appearance;
  root.style.colorScheme = theme.appearance;
  injectSvgFilters(theme.filter.svg, doc);
}

function injectSvgFilters(markup: string, doc: Document): void {
  let host: Element | null = doc.getElementById(SVG_FILTER_HOST_ID);
  if (!markup) {
    host?.remove();
    return;
  }
  if (!host) {
    host = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    host.id = SVG_FILTER_HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("width", "0");
    host.setAttribute("height", "0");
    host.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
    doc.body.appendChild(host);
  }
  // Theme files are local data the user chose to load; the markup is SVG
  // filter primitives, which cannot run script.
  host.innerHTML = `<defs>${markup}</defs>`;
}
