<script setup>
import { computed } from "vue";
import { catalog } from "../data/catalog.js";
import { catalogStyles } from "../data/styles.js";
import { EditorMode, useEditorStore } from "../stores/editor.js";
import { useViewportStore } from "../stores/viewport.js";

const editor = useEditorStore();
const viewport = useViewportStore();

const modeLabels = {
  [EditorMode.IDLE]: "浏览",
  [EditorMode.PLACE]: "放置",
  [EditorMode.MOVE]: "移动",
  [EditorMode.MARQUEE]: "框选",
  [EditorMode.DRAW_RECT]: "绘制矩形",
  [EditorMode.DRAW_CIRCLE]: "绘制圆形",
  [EditorMode.DRAW_LINE]: "绘制直线",
  [EditorMode.PENCIL]: "铅笔绘画",
};

const categoryTitles = {};
for (const group of catalog) categoryTitles[group.key] = group.title;

const coordText = computed(() => {
  const c = editor.cursor;
  if (!c) return "—";
  return editor.coordMode === "precise"
    ? `(${c.wx.toFixed(2)}, ${c.wy.toFixed(2)})`
    : `(${c.cx}, ${c.cy})`;
});
const coordModeLabel = computed(() => (editor.coordMode === "precise" ? "精确" : "方格"));
const chips = computed(() => {
  const by = editor.stats.byCategory;
  return Object.keys(by).map((key) => ({
    key,
    title: categoryTitles[key] || key,
    count: by[key],
    color: catalogStyles[key]?.stroke || "#888",
  }));
});
</script>

<template>
  <footer class="bottombar">
    <div class="group">
      <span class="tag">模式</span>
      <b>{{ modeLabels[editor.mode] }}</b>
    </div>
    <div class="group">
      <button class="tag toggle" :title="'切换坐标模式（当前：' + coordModeLabel + '）'" @click="editor.toggleCoordMode()">
        坐标·{{ coordModeLabel }}
      </button>
      <b class="num">{{ coordText }}</b>
    </div>
    <div class="group">
      <span class="tag">缩放</span>
      <b class="num">{{ Math.round(viewport.cam.scale * 100) }}%</b>
    </div>
    <div class="divider" />
    <div class="group">
      <span class="tag">放置总数</span>
      <b class="num">{{ editor.stats.totalPlaced }}</b>
    </div>
    <div v-if="chips.length" class="group stats">
      <span v-for="chip in chips" :key="chip.key" class="chip">
        <i :style="{ background: chip.color }" /> {{ chip.title }} {{ chip.count }}
      </span>
    </div>
    <div class="group">
      <span class="tag">绘制图形</span>
      <b class="num">{{ editor.stats.totalDrawings }}</b>
    </div>
    <div class="group">
      <span class="tag">预设实体</span>
      <b class="num">{{ editor.stats.presetCount }}</b>
    </div>
    <div class="spacer" />
    <div class="credit">4265区 Max联盟 浅酌清月 开发</div>
  </footer>
</template>

<style scoped src="../styles/scoped/BottomBar.css"></style>
