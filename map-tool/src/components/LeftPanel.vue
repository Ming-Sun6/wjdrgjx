<script setup>
import { computed, ref } from "vue";
import { catalog } from "../data/catalog.js";
import { catalogStyles } from "../data/styles.js";
import { EditorMode, useEditorStore } from "../stores/editor.js";
import { unitIcon } from "../utils/icons.js";

const emit = defineEmits(["close"]);
const editor = useEditorStore();
const collapsed = ref(false);
const activeKey = computed(() => (editor.mode === EditorMode.PLACE ? editor.activeEntityKey : null));

function hideBroken(ev) {
  ev.target.style.display = "none";
}

function pickItem(item) {
  if (activeKey.value === item.key) editor.cancelMode();
  else {
    editor.enterPlaceMode(item.key);
    emit("close");
  }
}

function sizeText(item) {
  return `${item.size.width}×${item.size.height}`;
}

function swatch(styleKey) {
  return catalogStyles[styleKey]?.stroke || "#888";
}
</script>

<template>
  <aside class="left-panel" :class="{ collapsed }">
    <button class="rail" title="展开内容选择" @click="collapsed = false"> 内容 </button>
    <div class="panel-body">
      <div class="panel-head">
        内容选择
        <button class="collapse-btn" title="收起面板" @click="collapsed = true"> ‹ </button>
        <button class="drawer-close" aria-label="关闭" @click="$emit('close')"> × </button>
      </div>
      <div v-if="activeKey" class="hint"> 放置模式进行中，右键画布可退出 </div>
      <div v-else class="hint">点击项目进入放置模式</div>
      <div class="scroll-y groups">
        <section v-for="group in catalog" :key="group.key" class="group">
          <header class="group-title">
            <i class="swatch" :style="{ background: swatch(group.styleKey) }" />
            {{ group.title }}
          </header>
          <ul class="items">
            <li
              v-for="item in group.items"
              :key="item.key"
              class="item"
              :class="{ active: activeKey === item.key }"
              @click="pickItem(item)"
            >
              <img class="item-icon" :src="unitIcon(item.key)" alt="" @error="hideBroken">
              <span class="item-name">{{ item.title }}</span>
              <span class="item-size">{{ sizeText(item) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </aside>
</template>

<style scoped src="../styles/scoped/LeftPanel.css"></style>
