<script setup>
import { computed } from "vue";
import { ROTATION_PHASES, rotationTable } from "../data/rewards.js";
import RotationCell from "./RotationCell.vue";

defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["close"]);

const phases = computed(() => Array.from({ length: ROTATION_PHASES }, (_, i) => i + 1));

function flatten(rows) {
  const items = [];
  for (const row of rows) {
    items.push({ type: "head", key: "rh" + row.num, title: row.title });
    for (const cell of row.cells) {
      items.push({ type: "cell", key: row.num + "-" + cell.phase, cell });
    }
  }
  return items;
}

const sections = computed(() => [
  { title: "堡垒轮换奖励", items: flatten(rotationTable("fortress")) },
  { title: "要塞轮换奖励", items: flatten(rotationTable("stronghold")) },
]);

function close() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="rt-mask"
      @pointerdown.self="close"
      @mousedown.self="close"
      @wheel.stop
    >
      <div class="rt-modal">
        <div class="rt-head">
          <span class="rt-title">总奖励表 · 期数轮换</span>
          <button class="rt-close" @click="close">✕</button>
        </div>
        <div class="rt-scroll">
          <div v-for="sec in sections" :key="sec.title" class="rt-section">
            <div class="rt-sec-title">{{ sec.title }}</div>
            <div class="rt-grid">
              <div class="rt-corner" />
              <div v-for="n in phases" :key="'h' + n" class="rt-ph"> 第{{ n }}期 </div>
              <div v-for="item in sec.items" :key="item.key" class="rt-item">
                <div v-if="item.type === 'head'" class="rt-rowhead">{{ item.title }}</div>
                <RotationCell v-else :cell="item.cell" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="../styles/scoped/RotationTableModal.css"></style>
