<script setup>
import { computed, ref } from "vue";
import { markColors } from "../data/styles.js";
import { EditorMode, useEditorStore } from "../stores/editor.js";
import { useViewportStore } from "../stores/viewport.js";

const editor = useEditorStore();
const viewport = useViewportStore();
const showDrawColor = ref(false);
const collapsed = ref(false);
const simpleMode = ref(false);

const visItems = [
  { key: "grid", label: "网格" },
  { key: "zones", label: "地理区域" },
  { key: "sunCity", label: "太阳城" },
  { key: "strongholds", label: "要塞" },
  { key: "fortresses", label: "堡垒" },
  { key: "engineering", label: "工程站" },
  { key: "userEntities", label: "放置内容" },
  { key: "drawings", label: "绘制图形" },
  { key: "icons", label: "图标" },
];
const rangeItems = [
  { key: "adjacencyRange", label: "接壤范围", tone: "orange" },
  { key: "effectRange", label: "作用范围", tone: "orange" },
];
const drawTools = [
  { mode: EditorMode.DRAW_RECT, label: "矩形" },
  { mode: EditorMode.DRAW_CIRCLE, label: "圆形" },
  { mode: EditorMode.DRAW_LINE, label: "直线" },
  { mode: EditorMode.PENCIL, label: "铅笔" },
];

const zoomText = computed(() => `${Math.round(viewport.cam.scale * 100)}%`);
const rotDeg = computed(() => Math.round(viewport.cam.rotation * 180 / Math.PI));
const tiltDeg = computed(() => Math.round(viewport.cam.tilt * 180 / Math.PI));
const maxTiltDeg = Math.round(viewport.MAX_TILT * 180 / Math.PI);
const textStyle = computed(() => editor.currentTextStyle);
const labelText = computed(() => {
  const a = editor.labelAlpha;
  return a >= 1 ? "名称·显示" : a === 0 ? "名称·隐藏" : `名称·${Math.round(a * 100)}%`;
});
const isMarquee = computed(() => editor.mode === EditorMode.MARQUEE);
const marqueeLabel = computed(() => (isMarquee.value ? "取消框选" : "框选"));
const isMark = computed(() => editor.mode === EditorMode.MARK);

function toggleVis(key) {
  editor.setVisibility(key, !editor.visibility[key]);
}
function setColor(ev) {
  editor.applyTextStyle({ color: ev.target.value });
}
function setBg(ev) {
  editor.applyTextStyle({ bgColor: ev.target.value });
}
function toggleBg() {
  editor.applyTextStyle({ showBg: !textStyle.value.showBg });
}
function bumpSize(delta) {
  editor.applyTextStyle({ size: Math.max(6, Math.min(96, (textStyle.value.size || 12) + delta)) });
}
function toggleFollow() {
  editor.applyTextStyle({ followZoom: !textStyle.value.followZoom });
}
function toggleTool(mode) {
  if (editor.mode === mode) editor.cancelMode();
  else editor.setMode(mode);
}
function toggleMarquee() {
  if (isMarquee.value) {
    editor.clearSelection();
    editor.cancelMode();
  } else {
    editor.setMode(EditorMode.MARQUEE);
  }
}
function zoomBy(factor) {
  viewport.zoomAt(factor, viewport.cam.viewW / 2, viewport.cam.viewH / 2);
}
function onRotate(ev) {
  viewport.setRotation(Number(ev.target.value) * Math.PI / 180);
}
function onTilt(ev) {
  viewport.setTilt(Number(ev.target.value) * Math.PI / 180);
}
function bumpRotate(delta) {
  let v = rotDeg.value + delta;
  if (v > 180) v = 180;
  if (v < -180) v = -180;
  viewport.setRotation(v * Math.PI / 180);
}
function bumpTilt(delta) {
  let v = tiltDeg.value + delta;
  if (v > maxTiltDeg) v = maxTiltDeg;
  if (v < 0) v = 0;
  viewport.setTilt(v * Math.PI / 180);
}
function resetViewAngles() {
  viewport.setRotation(0);
  viewport.setTilt(0);
}
</script>

<template>
  <div class="toolbar" :class="{ collapsed }">
    <div class="tb-head">
      <button
        class="tb-simple"
        :class="{ active: simpleMode }"
        title="简约模式：仅显示常用项（隐藏缩放/旋转/倾斜与范围信息，视角仅留游戏视角）"
        @click="simpleMode = !simpleMode"
      >
        {{ simpleMode ? "简约模式 ✓" : "简约模式" }}
      </button>
      <button class="tb-collapse" @click="collapsed = !collapsed">
        {{ collapsed ? "展开工具栏 ▾" : "收起工具栏 ▴" }}
      </button>
    </div>
    <div v-show="!collapsed" class="tb-body">
      <div class="row">
        <span class="seg-label">显示模式</span>
        <button
          v-for="item in visItems"
          :key="item.key"
          :class="{ active: editor.visibility[item.key] }"
          @click="toggleVis(item.key)"
        >
          {{ item.label }}
        </button>
        <button :class="{ active: editor.labelAlpha > 0 }" @click="editor.cycleLabelMode()">
          {{ labelText }}
        </button>
      </div>
      <div v-show="!simpleMode" class="row">
        <span class="seg-label">范围/信息</span>
        <button
          v-for="item in rangeItems"
          :key="item.key"
          :class="{ active: editor.visibility[item.key], 'tone-orange': item.tone === 'orange' }"
          @click="toggleVis(item.key)"
        >
          {{ item.label }}
        </button>
        <button :class="{ active: editor.showInfo }" @click="editor.toggleInfo()"> 信息显示 </button>
        <button :class="{ active: editor.showRewards }" @click="editor.toggleRewards()"> 奖励显示 </button>
        <button
          class="tone-restrict"
          :class="{ active: editor.rangeRestriction }"
          title="开启后：禁区（废墟/焦土/遗迹/要塞/堡垒/太阳城）不可放置，并启用联盟建筑区域/范围/数量限制"
          @click="editor.toggleRangeRestriction()"
        >
          范围限制
        </button>
      </div>
      <div class="row">
        <span class="seg-label">文字样式</span>
        <span v-if="editor.hasTextSelection" class="sel-hint"> 已框选 </span>
        <label class="ts-field" title="文字颜色（仅用户项目生效）">
          文字
          <input type="color" :value="textStyle.color" @input="setColor">
        </label>
        <button :class="{ active: textStyle.showBg }" title="是否显示文字背景" @click="toggleBg"> 显示背景 </button>
        <label class="ts-field" title="文字框背景色">
          背景
          <input type="color" :value="textStyle.bgColor" @input="setBg">
        </label>
        <span class="ts-size" :class="{ disabled: textStyle.followZoom }">
          <span class="lbl">字号</span>
          <button @click="bumpSize(-1)">－</button>
          <span class="readout">{{ textStyle.size }}</span>
          <button @click="bumpSize(1)">＋</button>
        </span>
        <button :class="{ active: textStyle.followZoom }" title="开启后文字大小自动跟随地图缩放（忽略固定字号）" @click="toggleFollow">
          应用缩放
        </button>
      </div>
      <div class="row">
        <span class="seg-label">编辑工具</span>
        <button class="tool-key" :class="{ active: isMarquee }" style="--tk:#4aa3ff" @click="toggleMarquee">
          {{ marqueeLabel }}
        </button>
        <button class="tool-key" :class="{ active: editor.mode === EditorMode.MOVE }" style="--tk:#4be3a0" @click="toggleTool(EditorMode.MOVE)">
          移动
        </button>
        <div class="color-ctrl">
          <button class="tool-key" :class="{ active: showDrawColor }" style="--tk:#ffb877" @click="showDrawColor = !showDrawColor">
            绘制颜色
          </button>
          <div v-if="showDrawColor" class="color-panel">
            <label>
              边框
              <input type="color" :value="editor.drawStyle.stroke" @input="editor.setDrawStroke($event.target.value)">
            </label>
            <label>
              背景
              <input type="color" :value="editor.drawStyle.fill" @input="editor.setDrawFill($event.target.value)">
            </label>
            <button class="reset" @click="editor.resetDrawStyle()"> 初始化 </button>
          </div>
        </div>
        <div class="divider" />
        <button
          v-for="tool in drawTools"
          :key="tool.mode"
          :class="{ active: editor.mode === tool.mode }"
          @click="toggleTool(tool.mode)"
        >
          {{ tool.label }}
        </button>
        <button :class="{ active: isMark }" @click="editor.toggleMarkMode()"> 标记 </button>
        <div v-if="isMark" class="mark-palette">
          <button
            v-for="item in markColors"
            :key="item.key"
            class="swatch"
            :class="{ active: editor.markColorKey === item.key }"
            :style="{ '--sw': item.color }"
            :title="item.label"
            @click="editor.setMarkColor(item.key)"
          />
        </div>
      </div>
      <div v-show="!simpleMode" class="row view-ctrl">
        <span class="seg-label">缩放</span>
        <button @click="zoomBy(1 / 1.2)">－</button>
        <span class="readout">{{ zoomText }}</span>
        <button @click="zoomBy(1.2)">＋</button>
        <div class="divider" />
        <span class="seg-label">旋转</span>
        <button @click="bumpRotate(-1)">－</button>
        <input class="slider" type="range" min="-180" max="180" step="1" :value="rotDeg" @input="onRotate">
        <button @click="bumpRotate(1)">＋</button>
        <span class="readout">{{ rotDeg }}°</span>
        <div class="divider" />
        <span class="seg-label">倾斜</span>
        <button @click="bumpTilt(-1)">－</button>
        <input class="slider" type="range" min="0" :max="maxTiltDeg" step="1" :value="tiltDeg" @input="onTilt">
        <button @click="bumpTilt(1)">＋</button>
        <span class="readout">{{ tiltDeg }}°</span>
      </div>
      <div class="row view-ctrl">
        <span class="seg-label">视角</span>
        <button class="accent" @click="viewport.applyGameView()">游戏视角</button>
        <button v-show="!simpleMode" @click="resetViewAngles">复位</button>
        <div v-show="!simpleMode" class="divider" />
        <button
          v-show="!simpleMode"
          :class="{ active: !viewport.cam.flipAxes }"
          title="默认已按真实游戏方向反转 X / Y 轴；点击可切回项目原始轴"
          @click="viewport.toggleFlipAxes()"
        >
          反转坐标轴
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/scoped/CanvasToolbar.css"></style>
