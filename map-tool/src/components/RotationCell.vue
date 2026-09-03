<script setup>
import { computed, ref } from "vue";
import { rotationIcon } from "../utils/icons.js";

const props = defineProps({
  cell: { type: Object, required: true },
});

const el = ref(null);
const imgOk = ref(false);
const hovering = ref(false);
const pinned = ref(false);
const tipStyle = ref({});
const src = computed(() => rotationIcon(props.cell.index));
const showTip = computed(() => hovering.value || pinned.value);

function placeTip() {
  const node = el.value;
  if (!node) return;
  const box = node.getBoundingClientRect();
  const left = box.left + box.width / 2;
  const above = box.top > 120;
  tipStyle.value = {
    left: left + "px",
    top: (above ? box.top - 8 : box.bottom + 8) + "px",
    transform: above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
  };
}

function onEnter() {
  placeTip();
  hovering.value = true;
}
function onLeave() {
  hovering.value = false;
}
function togglePin() {
  pinned.value = !pinned.value;
  if (pinned.value) placeTip();
}
</script>

<template>
  <div class="rc-root">
    <div
      ref="el"
      class="rc"
      :class="{ pinned }"
      @mouseenter="onEnter"
      @mouseleave="onLeave"
      @click="togglePin"
    >
      <span class="rc-short">{{ cell.short }}</span>
      <img
        v-show="imgOk"
        class="rc-img"
        :src="src"
        alt=""
        loading="lazy"
        @load="imgOk = true"
        @error="imgOk = false"
      >
    </div>
    <Teleport to="body">
      <div v-if="showTip" class="rc-tip" :style="tipStyle">{{ cell.full }}</div>
    </Teleport>
  </div>
</template>

<style scoped src="../styles/scoped/RotationCell.css"></style>
