/**
 * SVG from the console goes into the page as markup. Any object's
 * `_repr_svg_` can produce it, not only matplotlib, so strip scripts, event
 * handlers and foreign content before it reaches innerHTML.
 */
import DOMPurify from "dompurify";

export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}
