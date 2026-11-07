<script setup>
import { computed, ref } from "vue";
import { describeConflict, summaryRows } from "../lib/conflict.ts";
import { useModalDialog } from "../lib/useModalDialog.ts";

// Keep or Overwrite for the open draft (docs/sync.md, "The Keep or Overwrite dialog"). A modal with no way out except a choice: no close
// button, Escape is stopped (the cancel event), and a click on the backdrop does nothing. Keep is focused and primary; Overwrite is the danger one.
const props = defineProps({
  model: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  note: { type: String, default: "" },
});
const emit = defineEmits(["choose"]);
const dialog = ref(null);
const text = computed(() => describeConflict(props.model));
const rows = computed(() => summaryRows(props.model));

useModalDialog(dialog);
</script>

<template>
  <dialog ref="dialog" class="choice-dialog conflict-dialog" role="alertdialog" aria-labelledby="conflict-title" aria-describedby="conflict-summary conflict-footer" :aria-busy="busy" @cancel.prevent>
    <h2 id="conflict-title">{{ text.title }}</h2>
    <table id="conflict-summary" class="summary" aria-label="The versions">
      <tbody>
        <tr v-for="r in rows" :key="r.kind" :class="{ tint: r.tint }">
          <td class="dot-cell"><span class="dot" :class="r.kind" aria-hidden="true"></span></td>
          <th scope="row"><span class="name">{{ r.label }}</span></th>
          <td class="when">{{ r.when }}</td>
        </tr>
      </tbody>
    </table>
    <p v-if="note" class="note" role="status">{{ note }}</p>
    <div class="actions">
      <button type="button" class="danger" :disabled="busy" :title="text.overwriteTitle" aria-describedby="conflict-overwrite-desc" @click="emit('choose', 'overwrite')">
        {{ text.overwriteLabel }}
      </button>
      <button type="button" class="primary" autofocus :disabled="busy" :title="text.keepTitle" aria-describedby="conflict-keep-desc" @click="emit('choose', 'keep')">
        {{ text.keepLabel }}
      </button>
    </div>
    <p id="conflict-footer" class="foot">{{ text.footer }}</p>
    <span id="conflict-overwrite-desc" class="sr-only">{{ text.overwriteTitle }}</span>
    <span id="conflict-keep-desc" class="sr-only">{{ text.keepTitle }}</span>
  </dialog>
</template>
