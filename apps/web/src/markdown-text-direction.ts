interface HtmlNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}

const TEXT_BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "summary"]);
const PROSE_BLOCKS = new Set([...TEXT_BLOCKS, "li", "blockquote", "th", "td", "details"]);

/** Let the browser resolve prose direction, excluding code from its first-strong scan. */
export function rehypeTextDirection() {
  return (tree: HtmlNode) => {
    const visit = (node: HtmlNode, prose?: { hasTextBlock: boolean }) => {
      if (node.type === "element") {
        node.properties ??= {};
        // An authored direction owns its subtree. Nested auto blocks would also
        // be skipped by the browser when it scans their parent's direction.
        if (node.properties.dir != null) return;
        if (node.tagName === "code" || node.tagName === "pre" || node.tagName === "table") {
          node.properties.dir = "ltr";
          if (node.tagName !== "table") return;
          prose = undefined;
        } else if (node.tagName === "ul" || node.tagName === "ol") {
          prose = undefined;
        } else if (PROSE_BLOCKS.has(node.tagName ?? "")) {
          const textBlock = TEXT_BLOCKS.has(node.tagName ?? "");
          // Keep the first block in its container's scan; later blocks resolve independently.
          // The summary's separate trigger must not determine the details body's gutter.
          if (!prose || !textBlock || prose.hasTextBlock || node.tagName === "summary") {
            node.properties.dir = "auto";
            prose = { hasTextBlock: false };
          }
        }
      }
      // Images, neutral text, and isolated code cannot establish prose direction.
      // Letters and direction marks end the scan; symbol-only blocks may need bidi data.
      if (
        node.type === "text" &&
        prose &&
        /[\p{L}\p{Nl}\u061c\u200e\u200f]/u.test(node.value ?? "")
      ) {
        prose.hasTextBlock = true;
      }
      node.children?.forEach((child) => visit(child, prose));
    };
    visit(tree);
  };
}
