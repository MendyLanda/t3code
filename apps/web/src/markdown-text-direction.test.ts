import { describe, expect, it } from "vite-plus/test";
import { rehypeTextDirection } from "./markdown-text-direction";

function element(tagName: string, children: ReturnType<typeof text>[] = [], dir?: string) {
  return { type: "element", tagName, children, properties: dir ? { dir } : {} };
}
function text(value: string) {
  return { type: "text", value };
}

describe("Markdown text direction", () => {
  it("lets independent prose blocks resolve direction without modifying their text", () => {
    const blocks = [element("p", [text("مرحبا API 123!")]), element("p", [text("English שלום")])];
    const original = blocks.map((block) => block.children);
    rehypeTextDirection()({ type: "root", children: blocks });
    expect(blocks.map((block) => block.properties)).toEqual([{ dir: "auto" }, { dir: "auto" }]);
    expect(blocks.map((block) => block.children)).toEqual(original);
  });

  it("does not hide a loose list or alert's paragraphs from its parent's auto scan", () => {
    const paragraph = element("p", [text("שלום עולם")]);
    const item = { ...element("li"), children: [paragraph] };
    const quoteParagraph = element("p", [text("مرحبا")]);
    const quote = { ...element("blockquote"), children: [quoteParagraph] };
    rehypeTextDirection()({
      type: "root",
      children: [{ ...element("ul"), children: [item] }, quote],
    });
    expect(item.properties).toEqual({ dir: "auto" });
    expect(quote.properties).toEqual({ dir: "auto" });
    expect(paragraph.properties).toEqual({});
    expect(quoteParagraph.properties).toEqual({});
  });

  it.each(["blockquote", "li"])(
    "keeps the first paragraph in a %s's scan and gives later paragraphs their own direction",
    (tagName) => {
      const paragraphs = [
        element("p", [text("English first")]),
        element("p", [text("مرحبا في الفقرة الثانية!")]),
        element("p", [text("שלום בפסקה השלישית!")]),
      ];
      const container = { ...element(tagName), children: paragraphs };
      rehypeTextDirection()({ type: "root", children: [container] });
      expect(container.properties).toEqual({ dir: "auto" });
      expect(paragraphs.map((paragraph) => paragraph.properties)).toEqual([
        {},
        { dir: "auto" },
        { dir: "auto" },
      ]);
    },
  );

  it("resolves a details summary independently without hiding its first body paragraph", () => {
    const summary = element("summary", [text("English summary")]);
    const paragraph = element("p", [text("مرحبا!")]);
    const laterParagraph = element("p", [text("English body")]);
    const details = { ...element("details"), children: [summary, paragraph, laterParagraph] };
    rehypeTextDirection()({ type: "root", children: [details] });
    expect(details.properties).toEqual({ dir: "auto" });
    expect(summary.properties).toEqual({ dir: "auto" });
    expect(paragraph.properties).toEqual({});
    expect(laterParagraph.properties).toEqual({ dir: "auto" });
  });

  it.each(["blockquote", "li", "details"])(
    "keeps a %s's scan open through images, neutral text, and isolated code",
    (tagName) => {
      const image = { ...element("img"), properties: { alt: "English image label" } };
      const imageParagraph = { ...element("p"), children: [image] };
      const neutralParagraph = element("p", [text("123 … 😀")]);
      const code = element("code", [text("npm run build")]);
      const codeParagraph = { ...element("p"), children: [code] };
      const authored = element("span", [text("English override")], "ltr");
      const authoredParagraph = { ...element("p"), children: [authored] };
      const arabic = element("p", [text("مرحبا بالعالم!")]);
      const english = element("p", [text("English next")]);
      const paragraphs = [
        imageParagraph,
        neutralParagraph,
        codeParagraph,
        authoredParagraph,
        arabic,
        english,
      ];
      const container = { ...element(tagName), children: paragraphs };
      rehypeTextDirection()({ type: "root", children: [container] });
      expect(container.properties).toEqual({ dir: "auto" });
      expect(paragraphs.map((paragraph) => paragraph.properties)).toEqual([
        {},
        {},
        {},
        {},
        {},
        { dir: "auto" },
      ]);
      expect(code.properties).toEqual({ dir: "ltr" });
      expect(authored.properties).toEqual({ dir: "ltr" });
    },
  );

  it("lets paragraphs after a heading inside a quote resolve independently", () => {
    const heading = element("h2", [text("English heading")]);
    const paragraph = element("p", [text("مرحبا!")]);
    const quote = { ...element("blockquote"), children: [heading, paragraph] };
    rehypeTextDirection()({ type: "root", children: [quote] });
    expect(heading.properties).toEqual({});
    expect(paragraph.properties).toEqual({ dir: "auto" });
  });

  it("starts a new scan for a nested quote after its parent's first paragraph", () => {
    const parentParagraph = element("p", [text("English parent")]);
    const nestedParagraph = element("p", [text("שלום ילד")]);
    const nested = { ...element("blockquote"), children: [nestedParagraph] };
    const parent = { ...element("blockquote"), children: [parentParagraph, nested] };
    rehypeTextDirection()({ type: "root", children: [parent] });
    expect(parent.properties).toEqual({ dir: "auto" });
    expect(nested.properties).toEqual({ dir: "auto" });
    expect(nestedParagraph.properties).toEqual({});
  });

  it("excludes code and table order while allowing each table cell to resolve direction", () => {
    const code = element("code", [text("npm run build")]);
    const cell = element("td", [text("العربية")]);
    const table = { ...element("table"), children: [{ ...element("tr"), children: [cell] }] };
    const prose = { ...element("p"), children: [code, text(" مرحبا")] };
    rehypeTextDirection()({ type: "root", children: [prose, table] });
    expect(code.properties).toEqual({ dir: "ltr" });
    expect(table.properties).toEqual({ dir: "ltr" });
    expect(cell.properties).toEqual({ dir: "auto" });
    expect(prose.children).toEqual([code, text(" مرحبا")]);
  });

  it("preserves an explicit HTML direction and its inherited subtree", () => {
    const paragraph = element("p", [text("مرحبا")]);
    const authored = { ...element("div", [], "ltr"), children: [paragraph] };
    rehypeTextDirection()({ type: "root", children: [authored] });
    expect(authored.properties).toEqual({ dir: "ltr" });
    expect(paragraph.properties).toEqual({});
  });

  it("preserves authored direction through details, summaries, and code", () => {
    const summary = element("summary", [text("مرحبا")]);
    const code = element("code", [text("שלום")], "rtl");
    const details = { ...element("details"), children: [summary, code] };
    const authored = { ...element("div", [], "ltr"), children: [details] };
    rehypeTextDirection()({ type: "root", children: [authored] });
    expect(details.properties).toEqual({});
    expect(summary.properties).toEqual({});
    expect(code.properties).toEqual({ dir: "rtl" });
  });

  it("lets nested mixed list items resolve independently of the parent item", () => {
    const hebrew = element("li", [text("שלום ילד")]);
    const english = element("li", [text("English child")]);
    const nested = { ...element("ul"), children: [hebrew, english] };
    const parent = { ...element("li"), children: [text("English parent"), nested] };
    rehypeTextDirection()({ type: "root", children: [{ ...element("ul"), children: [parent] }] });
    expect(parent.properties).toEqual({ dir: "auto" });
    expect(hebrew.properties).toEqual({ dir: "auto" });
    expect(english.properties).toEqual({ dir: "auto" });
  });
});
