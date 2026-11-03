<script setup>
defineProps({ problems: { type: Array, required: true }, active: { type: Number, default: -1 } });
defineEmits(["jump", "fix"]);

const tone = { error: "spelling", warning: "grammar", info: "style" };
</script>

<template>
  <aside class="panel" aria-label="Problems">
    <header>
      <h2>Problems</h2>
      <span class="mute">{{ problems.length }} in this document</span>
    </header>
    <ul v-if="problems.length">
      <li v-for="(p, i) in problems" :key="`${p.from}-${p.to}-${p.kind}`">
        <button type="button" class="item" @click="$emit('jump', p)">
          <span class="head">
            <span class="dot" :class="tone[p.severity]"></span>
            <span class="kind">{{ p.kind }}</span>
            <code>{{ p.problem }}</code>
          </span>
          <span class="msg">{{ p.message }}</span>
        </button>
        <div v-if="p.fixes.length" class="fixes">
          <button type="button" class="fix" @click="$emit('fix', p, 0)">{{ p.fixes[0] }}</button>
          <span v-if="p.fixes.length > 1" class="mute">+{{ p.fixes.length - 1 }} more</span>
        </div>
      </li>
    </ul>
    <p v-else class="empty mute">No problems found.</p>
  </aside>
</template>

<style scoped>
.panel {
  width: 340px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--line);
  overflow: auto;
}
header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px;
}
h2 {
  margin: 0;
  font-size: 15px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
li {
  padding: 8px 10px 10px;
  border-radius: 8px;
}
li:hover {
  background: var(--raised);
}
.item {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.spelling {
  background: var(--c-spelling);
}
.dot.grammar {
  background: var(--c-grammar);
}
.dot.style {
  background: var(--c-style);
}
.kind {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute);
}
code {
  font-family: var(--font-mono);
  font-size: 13px;
}
.msg {
  display: block;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
}
.fixes {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
}
.fix {
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
  font-size: 12px;
}
.fix:hover {
  border-color: var(--accent);
}
.mute {
  color: var(--mute);
  font-size: 12px;
}
.empty {
  padding: 0 16px;
}
</style>
