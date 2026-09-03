<script setup>
import { computed, reactive, ref } from "vue";
import { catalog } from "../data/catalog.js";
import { presetEntities, presetGroups } from "../data/presets.js";
import { markColors } from "../data/styles.js";
import { useEditorStore } from "../stores/editor.js";
import { unitIcon } from "../utils/icons.js";

const emit = defineEmits(["close"]);
const editor = useEditorStore();
const collapsed = ref(false);
const markColorMap = Object.fromEntries(markColors.map((c) => [c.key, c.color]));

function hideBroken(ev) {
  ev.target.style.display = "none";
}

function markerColor(key) {
  return markColorMap[key] || "#3a9bff";
}

function jumpPreset(id) {
  editor.jumpToPreset(id);
  emit("close");
}
function jumpUser(id) {
  editor.jumpToUser(id);
  emit("close");
}
function jumpDrawing(id) {
  editor.jumpToDrawing(id);
  emit("close");
}
function jumpMarker(id) {
  editor.jumpToMarker(id);
  emit("close");
}

const openGroups = reactive({
  zones: true,
  sunCity: false,
  strongholds: true,
  fortresses: false,
  engineering: false,
  eng_1: false,
  eng_2: false,
  eng_3: false,
  eng_4: false,
});
const levelTitles = { 1: "一级", 2: "二级", 3: "三级", 4: "四级" };

const presetTree = computed(() => {
  const groups = {};
  for (const g of presetGroups) {
    groups[g.key] = { key: g.key, title: g.title, items: [], subGroups: null };
  }
  for (const entity of presetEntities) {
    if (entity.group === "engineering") {
      if (!entity.blocking) continue;
      const group = groups.engineering;
      if (!group.subGroups) group.subGroups = {};
      const key = `eng_${entity.level}`;
      if (!group.subGroups[key]) {
        group.subGroups[key] = { key, title: levelTitles[entity.level] || `${entity.level}级`, items: [] };
      }
      group.subGroups[key].items.push({ id: entity.id, title: entity.title });
      continue;
    }
    if (entity.group === "zones" || entity.blocking || entity.id === "sc_relic") {
      groups[entity.group]?.items.push({ id: entity.id, title: entity.title });
    }
  }
  const eng = groups.engineering;
  if (eng.subGroups) {
    eng.subGroups = Object.values(eng.subGroups).sort((a, b) => a.key.localeCompare(b.key));
  }
  return presetGroups.map((g) => groups[g.key]).filter((g) => g.items.length || (g.subGroups && g.subGroups.length));
});

function groupCount(group) {
  return group.subGroups ? group.subGroups.reduce((n, sg) => n + sg.items.length, 0) : group.items.length;
}

const drawTitles = { rect: "矩形", circle: "圆形", line: "直线", pencil: "铅笔" };
const userOpen = reactive(Object.fromEntries(catalog.map((g) => [g.key, true])));

function toggleUser(key) {
  userOpen[key] = !userOpen[key];
}

const userGroups = computed(() => {
  const list = [];
  for (const group of catalog) {
    const items = editor.userEntities.filter((e) => e.category === group.key);
    if (items.length) list.push({ key: group.key, title: group.title, items });
  }
  return list;
});

const violations = computed(() => (
  editor.rangeRestriction ? editor.userEntities.filter((e) => editor.violationIds.has(e.id)) : []
));

function toggleGroup(key) {
  openGroups[key] = !openGroups[key];
}

function isActive(id) {
  return editor.selectionIds.includes(id);
}
</script>

<template>
  <aside class="right-panel" :class="{ collapsed }">
    <button class="rail" title="展开编辑区" @click="collapsed = false"> 编辑 </button>
    <button class="collapse-btn" title="收起面板" @click="collapsed = true"> › </button>
    <button class="drawer-close" aria-label="关闭" @click="$emit('close')"> × </button>
    <div class="panel-body">
      <section class="block preset">
        <header class="block-head">预设内容（只读 · 仅跳转）</header>
        <div class="scroll-y list">
          <div v-for="group in presetTree" :key="group.key" class="tree-group">
            <div class="tree-head" @click="toggleGroup(group.key)">
              <span class="caret">{{ openGroups[group.key] ? "▾" : "▸" }}</span>
              {{ group.title }}
              <span class="count">{{ groupCount(group) }}</span>
            </div>
            <div v-show="openGroups[group.key]">
              <template v-if="group.subGroups">
                <div v-for="sub in group.subGroups" :key="sub.key" class="tree-subgroup">
                  <div class="tree-subhead" @click="toggleGroup(sub.key)">
                    <span class="caret">{{ openGroups[sub.key] ? "▾" : "▸" }}</span>
                    {{ sub.title }}
                    <span class="count">{{ sub.items.length }}</span>
                  </div>
                  <ul v-show="openGroups[sub.key]" class="tree-items">
                    <li v-for="item in sub.items" :key="item.id" @click="jumpPreset(item.id)">{{ item.title }}</li>
                  </ul>
                </div>
              </template>
              <ul v-else class="tree-items">
                <li v-for="item in group.items" :key="item.id" @click="jumpPreset(item.id)">{{ item.title }}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <section class="block user">
        <header class="block-head">
          用户编辑区
          <button v-if="editor.selectionIds.length" class="mini" @click="editor.deleteSelected()"> 删除选中 </button>
        </header>
        <div class="scroll-y list">
          <div class="sub-title"> 放置内容（{{ editor.userEntities.length }}） </div>
          <div v-for="group in userGroups" :key="group.key" class="tree-group">
            <div class="tree-head" @click="toggleUser(group.key)">
              <span class="caret">{{ userOpen[group.key] ? "▾" : "▸" }}</span>
              {{ group.title }}
              <span class="count">{{ group.items.length }}</span>
            </div>
            <ul v-show="userOpen[group.key]" class="user-items">
              <li
                v-for="item in group.items"
                :key="item.id"
                :class="{ active: isActive(item.id) }"
                @click="jumpUser(item.id)"
              >
                <img v-if="editor.visibility.icons" class="li-icon" :src="unitIcon(item.key)" alt="" @error="hideBroken">
                <span class="nm">{{ item.title }}</span>
                <span class="pos"> ({{ item.anchor[0] }},{{ item.anchor[1] }}) </span>
                <button class="del" @click.stop="editor.deleteById(item.id)"> ✕ </button>
              </li>
            </ul>
          </div>
          <div v-if="!editor.userEntities.length" class="empty-hint"> 暂无放置内容 </div>
          <div class="sub-title"> 绘制图形（{{ editor.drawings.length }}） </div>
          <ul class="user-items">
            <li
              v-for="item in editor.drawings"
              :key="item.id"
              :class="{ active: isActive(item.id) }"
              @click="jumpDrawing(item.id)"
            >
              <span class="nm">{{ drawTitles[item.type] || item.type }}</span>
              <button class="del" @click.stop="editor.deleteById(item.id)"> ✕ </button>
            </li>
            <li v-if="!editor.drawings.length" class="empty"> 暂无绘制图形 </li>
          </ul>
          <div class="sub-title"> 位置标记（{{ editor.markers.length }}） </div>
          <ul class="user-items">
            <li
              v-for="item in editor.markers"
              :key="item.id"
              :class="{ active: isActive(item.id) }"
              @click="jumpMarker(item.id)"
            >
              <span class="mk-dot" :style="{ background: markerColor(item.colorKey) }" />
              <span class="nm">标记</span>
              <span class="pos">({{ item.cx }},{{ item.cy }})</span>
              <button class="del" @click.stop="editor.deleteById(item.id)"> ✕ </button>
            </li>
            <li v-if="!editor.markers.length" class="empty"> 暂无位置标记 </li>
          </ul>
          <template v-if="editor.rangeRestriction">
            <div class="sub-title bad-title"> 不合规的内容（{{ violations.length }}） </div>
            <ul class="user-items">
              <li
                v-for="item in violations"
                :key="item.id"
                class="bad"
                :class="{ active: isActive(item.id) }"
                @click="jumpUser(item.id)"
              >
                <img v-if="editor.visibility.icons" class="li-icon" :src="unitIcon(item.key)" alt="" @error="hideBroken">
                <span class="nm">{{ item.title }}</span>
                <span class="pos"> ({{ item.anchor[0] }},{{ item.anchor[1] }}) </span>
                <button class="del" @click.stop="editor.deleteById(item.id)"> ✕ </button>
              </li>
              <li v-if="!violations.length" class="empty"> 暂无不合规内容 </li>
            </ul>
          </template>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped src="../styles/scoped/RightPanel.css"></style>
