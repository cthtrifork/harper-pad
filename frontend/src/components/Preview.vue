<script setup>
// The rendered markdown, read-only. marked only parses (to tokens); the tokens are turned into Vue elements here, so no HTML string
// is ever built or inserted (no v-html, see docs/security.md): text from a draft can only ever become text nodes. Raw HTML in the
// markdown is shown as plain text, images as their alt text, and links as links that do not navigate (a click would take the
// whole window away from the editor).
import { marked } from "marked";
import { computed, h, nextTick, ref, watch } from "vue";

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
        return [h("pre", { key }, [h("code", t.text)])];
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

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  background: var(--sunken);
}
.head {
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  color: var(--mute);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.note {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}
.scroller {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 56px 24px 48px;
}
.compact .scroller {
  padding: 28px 40px 48px;
}
.empty {
  color: var(--mute);
}
.md {
  max-width: 720px;
  margin: 0 auto;
  font: 19px / 1.75 var(--font-doc);
  /* A new version of the text fades in softly instead of snapping. */
  animation: md-in 0.18s var(--ease);
}
.compact .md {
  max-width: none;
  margin: 0;
  font-size: 17px;
  line-height: 1.7;
}
@keyframes md-in {
  from {
    opacity: 0.4;
  }
}
.md :deep(h1),
.md :deep(h2),
.md :deep(h3),
.md :deep(h4),
.md :deep(h5),
.md :deep(h6) {
  margin: 1.2em 0 0.4em;
  line-height: 1.25;
  font-weight: 600;
}
.md :deep(h1) {
  margin-top: 0;
  font-size: 34px;
}
.compact .md :deep(h1) {
  font-size: 28px;
}
.md :deep(h2) {
  font-size: 1.4em;
}
.md :deep(h3) {
  font-size: 1.2em;
}
.md :deep(p) {
  margin: 0 0 0.9em;
}
.md :deep(p.tight) {
  margin: 0;
}
.md :deep(code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--selected);
  font: 0.85em var(--font-mono);
}
.md :deep(pre) {
  padding: 12px 14px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--raised);
}
.md :deep(pre code) {
  padding: 0;
  background: none;
}
.md :deep(blockquote) {
  margin: 0 0 0.9em;
  padding-left: 16px;
  border-left: 3px solid var(--line);
  color: var(--mute);
}
.md :deep(hr) {
  border: 0;
  border-top: 1px solid var(--line);
}
.md :deep(ul),
.md :deep(ol) {
  margin: 0 0 0.9em;
  padding-left: 1.6em;
}
.md :deep(ul.tasks) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 0;
  list-style: none;
}
.md :deep(li.task) {
  display: flex;
  gap: 14px;
  align-items: center;
  transition: color 0.2s var(--ease);
}
.compact .md :deep(li.task) {
  gap: 12px;
}
/* The task box: an outline that fills with the accent and draws its tick when the task is done. */
.md :deep(li.task input) {
  position: relative;
  width: 20px;
  height: 20px;
  flex: none;
  margin: 0;
  border: 1.5px solid var(--mute);
  border-radius: 4px;
  appearance: none;
  transition:
    background-color 0.15s var(--ease),
    border-color 0.15s var(--ease);
}
.compact .md :deep(li.task input) {
  width: 18px;
  height: 18px;
}
.md :deep(li.task input::after) {
  content: "";
  position: absolute;
  left: 5px;
  top: 1px;
  width: 6px;
  height: 11px;
  border: solid var(--on-accent);
  border-width: 0 2px 2px 0;
  opacity: 0;
  transform: rotate(45deg) scale(0.4);
  transition:
    opacity 0.15s var(--ease),
    transform 0.15s var(--ease);
}
.md :deep(li.task input:checked) {
  border-color: var(--accent);
  background: var(--accent);
}
.md :deep(li.task input:checked::after) {
  opacity: 1;
  transform: rotate(45deg) scale(1);
}
.md :deep(li.task:has(input:checked)) {
  color: var(--mute);
  text-decoration: line-through;
}
.md :deep(.md-link) {
  color: var(--c-style);
  text-decoration: underline;
}
.md :deep(.md-image) {
  color: var(--mute);
}
.md :deep(table) {
  margin-bottom: 0.9em;
  border-collapse: collapse;
  font-size: 0.9em;
}
.md :deep(th),
.md :deep(td) {
  padding: 4px 10px;
  border: 1px solid var(--line);
}
</style>
