<script setup>
import { computed, ref, watch } from "vue";
import {
  engineeringBuffs,
  engineeringTypeOrder,
  fortressRewards,
  isRewardList,
  kingcityRewards,
  parseRewardList,
  rewardIconKey,
  rotationCells,
  signClass,
  strongholdRewards,
} from "../data/rewards.js";
import { rewardIcon } from "../utils/icons.js";
import { useEditorStore } from "../stores/editor.js";
import RotationCell from "./RotationCell.vue";
import RotationTableModal from "./RotationTableModal.vue";
import VideoDemoModal from "./VideoDemoModal.vue";

const editor = useEditorStore();
const videos = [
  { label: "行军装扮 · 佛尔工号", src: "./videos/marchSkin.mp4" },
  { label: "城镇装扮 · 城镇展示", src: "./videos/townSkin_town.mp4" },
  { label: "城镇装扮 · 野外展示", src: "./videos/townSkin_wild.mp4" },
];
const showVideo = ref(false);
const catIndex = ref(0);
const tabIndex = ref(0);
const showTable = ref(false);

const current = computed(() => editor.reward);
const kind = computed(() => current.value?.kind || null);
const book = computed(() => (
  kind.value === "fortress" ? fortressRewards
    : kind.value === "stronghold" ? strongholdRewards
      : kind.value === "kingcity" ? kingcityRewards
        : null
));
const category = computed(() => book.value?.categories?.[catIndex.value] || null);
const hasTabs = computed(() => Array.isArray(category.value?.tabs));
const subtab = computed(() => (hasTabs.value ? category.value.tabs[tabIndex.value] : null));
const items = computed(() => (hasTabs.value ? subtab.value?.items || [] : category.value?.items || []));
const note = computed(() => (hasTabs.value ? subtab.value?.note : category.value?.note));
const isSpecial = computed(() => (
  (kind.value === "fortress" || kind.value === "stronghold") && category.value?.key === "special"
));
const rotCells = computed(() => (isSpecial.value ? rotationCells(kind.value, current.value?.num) : []));
const engRows = computed(() => engineeringTypeOrder.map((key) => ({ key, ...engineeringBuffs[key] })));
const engType = computed(() => current.value?.engType || null);
const engLevel = computed(() => current.value?.engLevel || 0);
const panelClass = computed(() => ({
  "is-eng": kind.value === "engineering",
  "is-king": kind.value === "kingcity",
  "is-battle": kind.value === "fortress" || kind.value === "stronghold",
}));

watch(current, () => {
  catIndex.value = 0;
  tabIndex.value = 0;
  showTable.value = false;
});
watch(catIndex, () => {
  tabIndex.value = 0;
});

function iconSrc(label) {
  const key = rewardIconKey(label);
  return key ? rewardIcon(key) : "";
}
function hideBroken(ev) {
  ev.target.style.display = "none";
}
</script>

<template>
  <div
    v-if="current"
    class="reward-panel"
    :class="panelClass"
    @pointerdown.stop
    @mousedown.stop
    @wheel.stop
  >
    <div class="rp-head">
      <span class="rp-title">{{ current.title }}</span>
      <button class="rp-close" @click="editor.clearReward()"> ✕ </button>
    </div>
    <div v-if="kind === 'engineering'" class="rp-body">
      <div class="rp-note">占领增益</div>
      <table class="eng-table">
        <thead>
          <tr>
            <th>建筑名称</th>
            <th>增益属性</th>
            <th :class="{ hl: engLevel === 1 }">Lv.1</th>
            <th :class="{ hl: engLevel === 2 }">Lv.2</th>
            <th :class="{ hl: engLevel === 3 }">Lv.3</th>
            <th :class="{ hl: engLevel === 4 }">Lv.4</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in engRows" :key="row.key" :class="{ 'row-hl': row.key === engType }">
            <td class="name">{{ row.building }}</td>
            <td class="attr" :class="{ 'attr-hl': row.key === engType }">{{ row.attr }}</td>
            <td
              v-for="(lv, i) in row.levels"
              :key="i"
              :class="{ dash: lv === '-', colhl: engLevel === i + 1, cellhl: row.key === engType && engLevel === i + 1 }"
            >
              {{ lv }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="book" class="rp-body">
      <div class="rp-tabs">
        <button
          v-for="(cat, i) in book.categories"
          :key="cat.key"
          class="rp-tab"
          :class="{ active: i === catIndex }"
          @click="catIndex = i"
        >
          {{ cat.name }}
        </button>
      </div>
      <div v-if="hasTabs" class="rp-subtabs">
        <button
          v-for="(tab, i) in category.tabs"
          :key="i"
          class="rp-subtab"
          :class="{ active: i === tabIndex }"
          @click="tabIndex = i"
        >
          {{ tab.name }}
        </button>
      </div>
      <div class="rp-detail">
        <div v-if="note" class="rp-cat-note">{{ note }}</div>
        <div v-if="isSpecial" class="rp-rotation">
          <div class="rp-rot-note"> 该{{ kind === "fortress" ? "堡垒" : "要塞" }}各期轮换奖励（与赛季无关，仅随期数变化） </div>
          <div class="rp-rot-row">
            <div v-for="cell in rotCells" :key="cell.phase" class="rp-rot-cell">
              <div class="rp-rot-phase">第{{ cell.phase }}期</div>
              <RotationCell :cell="cell" />
            </div>
          </div>
          <button class="rp-rot-btn" @click="showTable = true"> 查看总奖励表 </button>
        </div>
        <template v-else>
          <div
            v-for="(item, i) in items"
            :key="i"
            class="rp-item"
            :class="{ 'rp-item-video': item.name === '装扮奖励' }"
            @click="item.name === '装扮奖励' && (showVideo = true)"
          >
            <div class="rp-item-name">
              {{ item.name }}
              <span v-if="item.name === '装扮奖励'" class="rp-video-hint"> ▶ 点击查看实机演示 </span>
            </div>
            <template v-for="(field, fi) in item.fields" :key="fi">
              <div v-if="field[0] === '获取条件'" class="rp-cond">
                <span class="cond-k">{{ field[0] }}</span>
                <span class="cond-v">{{ field[1] }}</span>
              </div>
              <div v-else-if="isRewardList(field[1])" class="rp-field list">
                <div class="fk">{{ field[0] }}</div>
                <div class="rw-list">
                  <div v-for="(rw, ri) in parseRewardList(field[1])" :key="ri" class="rw-row" :class="'rt-' + rw.type">
                    <span class="rw-main">
                      <img v-if="iconSrc(rw.name)" class="rw-icon" :src="iconSrc(rw.name)" alt="" @error="hideBroken">
                      <span class="rw-name">{{ rw.name }}</span>
                    </span>
                    <span v-if="rw.count" class="rw-count">{{ rw.count }}</span>
                  </div>
                </div>
              </div>
              <div v-else class="rp-field kv">
                <span class="fk">{{ field[0] }}</span>
                <span class="fv" :class="signClass(field[1]) ? 'sign-' + signClass(field[1]) : ''">
                  <img v-if="iconSrc(field[0])" class="kv-icon" :src="iconSrc(field[0])" alt="" @error="hideBroken">
                  {{ field[1] }}
                </span>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
    <VideoDemoModal :visible="showVideo" :videos="videos" title="装扮奖励 · 实机演示" @close="showVideo = false" />
    <RotationTableModal :visible="showTable" @close="showTable = false" />
  </div>
</template>

<style scoped src="../styles/scoped/RewardPanel.css"></style>
