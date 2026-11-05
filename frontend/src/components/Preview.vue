<script setup>
// The rendered markdown, read-only. marked only parses (to tokens); the tokens are turned into Vue elements here, so no HTML string
// is ever built or inserted (no v-html, see docs/security.md): text from a draft can only ever become text nodes. Raw HTML in the
// markdown is shown as plain text, images as their alt text, and links as links that do not navigate (a click would take the
// whole window away from the editor).
import { marked } from "marked";
import { computed, h, nextTick, ref, watch } from "vue";
import CodeBlock from "./CodeBlock.vue";

const props = defineProps({
  source: { type: String, default: "" },
  // How far down the editor is scrolled, 0 to 1; the preview follows it when `follow` is set.
  scroll: { type: Number, default: 0 },
  follow: { type: Boolean, default: false },
});

const root = ref(null); // the scrolling element
const tokens = computed(() => marked.lexer(props.source, { gfm: true }));

// A link is only shown as one for these schemes; anything else (javascript:, data:, relative paths) is plain text.
const SAFE_LINK = /^(https?:|mailto:)/i;

function inline(list = []) {
  return list.map((t, i) => {
    const key = i;
    switch (t.type) {
      case "strong":
        return h("strong", { key }, inline(t.tokens));
      case "em":
        return h("em", { key }, inline(t.tokens));
      case "del":
        return h("del", { key }, inline(t.tokens));
      case "codespan":
        return h("code", { key }, t.text);
      case "br":
        return h("br", { key });
      case "link":
        return SAFE_LINK.test(t.href)
          ? h("a", { key, class: "md-link", title: t.href, role: "link", tabindex: 0 }, inline(t.tokens))
          : h("span", { key }, inline(t.tokens));
      case "image":
        return h("span", { key, class: "md-image" }, t.text ? `[image: ${t.text}]` : "[image]");
      case "escape":
      case "text":
        return t.tokens?.length ? inline(t.tokens) : t.text;
      default: // html and anything else: the source text
        return t.raw ?? "";
    }
  });
}

function cell(c, tag, i) {
  return h(tag, { key: i, style: c.align ? { textAlign: c.align } : undefined }, inline(c.tokens));
}

function blocks(list = []) {
  return list.flatMap((t, i) => {
    const key = i;
    switch (t.type) {
      case "space":
      case "def":
      case "checkbox": // the "[ ] " of a task; the list item draws the box itself
        return [];
      case "heading":
        return [h(`h${t.depth}`, { key }, inline(t.tokens))];
      case "paragraph":
        return [h("p", { key }, inline(t.tokens))];
      case "text": // a line of a tight list item
        return [h("p", { key, class: "tight" }, t.tokens?.length ? inline(t.tokens) : t.text)];
      case "code":
        return [h(CodeBlock, { key, code: t.text, info: t.lang ?? "" })];
      case "blockquote":
        return [h("blockquote", { key }, blocks(t.tokens))];
      case "hr":
        return [h("hr", { key })];
      case "list":
        return [
          h(
            t.ordered ? "ol" : "ul",
            { key, start: t.ordered && t.start !== 1 ? t.start : undefined, class: t.items.some((it) => it.task) ? "tasks" : undefined },
            t.items.map((it, j) =>
              h("li", { key: j, class: it.task ? "task" : undefined }, [
                it.task ? h("input", { type: "checkbox", checked: !!it.checked, disabled: true, "aria-label": it.checked ? "Done" : "Not done" }) : null,
                h("div", blocks(it.tokens)),
              ]),
            ),
          ),
        ];
      case "table":
        return [
          h("table", { key }, [
            h("thead", h("tr", t.header.map((c, j) => cell(c, "th", j)))),
            h("tbody", t.rows.map((r, j) => h("tr", { key: j }, r.map((c, k) => cell(c, "td", k))))),
          ]),
        ];
      default: // html: shown as text
        return [h("p", { key }, t.raw ?? "")];
    }
  });
}

const Rendered = () => h("div", { class: "md" }, blocks(tokens.value));

function applyScroll() {
  const el = root.value;
  if (!el || !props.follow) return;
  el.scrollTop = props.scroll * (el.scrollHeight - el.clientHeight);
}
watch(() => [props.scroll, props.follow], applyScroll);
// The text grows after an edit, so keep following once it has been drawn.
watch(tokens, () => nextTick(applyScroll));
</script>

<template>
  <section class="preview" :class="{ compact: follow }" aria-label="Preview">
    <header v-if="follow" class="head">
      <span>Preview</span>
      <span class="note">Scrolls with the editor</span>
    </header>
    <div ref="root" class="scroller">
      <Rendered v-if="source.trim()" />
      <p v-else class="empty">Nothing to preview yet.</p>
    </div>
  </section>
</template>
