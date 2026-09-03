<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  visible: { type: Boolean, default: false },
  videos: { type: Array, default: () => [] },
  title: { type: String, default: "实机演示" },
});
const emit = defineEmits(["close"]);
const index = ref(0);

watch(() => props.visible, (v) => {
  if (v) index.value = 0;
});

function close() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="vd-mask"
      @pointerdown.self="close"
      @mousedown.self="close"
      @wheel.stop
    >
      <div class="vd-modal">
        <div class="vd-head">
          <span class="vd-title">{{ title }}</span>
          <button class="vd-close" @click="close">✕</button>
        </div>
        <div class="vd-tabs">
          <button
            v-for="(item, i) in videos"
            :key="i"
            class="vd-tab"
            :class="{ active: i === index }"
            @click="index = i"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="vd-stage">
          <video
            v-if="videos[index]"
            :key="index"
            class="vd-video"
            :src="videos[index].src"
            controls
            autoplay
            playsinline
            preload="metadata"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="../styles/scoped/VideoDemoModal.css"></style>
