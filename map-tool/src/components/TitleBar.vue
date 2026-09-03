<script setup>
import { computed, nextTick, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { WIKI_HOME, useUserStore } from "../stores/user.js";
import { useEditorStore } from "../stores/editor.js";
import { useViewportStore } from "../stores/viewport.js";
import { exportImage } from "../render/export-image.js";

const router = useRouter();
const route = useRoute();
const editor = useEditorStore();
const viewport = useViewportStore();
const user = useUserStore();
const importInput = ref(null);
const hasCache = computed(() => !!editor.cacheSavedAt);
const cacheLabel = computed(() => (editor.cacheSavedAt ? new Date(editor.cacheSavedAt).toLocaleString() : ""));
const isMulti = computed(() => route.query.mode === "multi" || user.multiplayer);
const showCollab = ref(false);
const showLeave = ref(false);
const hasContent = computed(() => editor.userEntities.length > 0 || editor.drawings.length > 0 || editor.markers.length > 0);
const showClear = ref(false);
const exporting = ref(false);
const showMobileExportHint = ref(false);
const showExportChoose = ref(false);
const hasEditBounds = computed(() => !!editor.editBounds);

function goHome() {
  router.push("/");
}

function leaveWiki() {
  window.location.href = WIKI_HOME;
}

function askLeaveWiki() {
  if (hasContent.value) {
    showLeave.value = true;
    return;
  }
  leaveWiki();
}

function resetView() {
  viewport.reset();
}

function confirmClear() {
  editor.clearUserContent();
  showClear.value = false;
}

function downloadJSON() {
  const json = editor.exportJSON();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `endless-winter-map-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyJSON() {
  try {
    await navigator.clipboard.writeText(editor.exportJSON());
    editor.flash("已复制到剪贴板");
  } catch {
    editor.flash("复制失败，请使用导出文件");
  }
}

async function runExport(task) {
  if (exporting.value) return;
  exporting.value = true;
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    await task();
  } catch {
    editor.flash("导出失败，请重试");
  } finally {
    exporting.value = false;
  }
}

function isMobile() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
}

function openExport() {
  if (isMobile()) {
    showMobileExportHint.value = true;
    return;
  }
  showExportChoose.value = true;
}

function doExport(region, view) {
  if (isMobile()) {
    showMobileExportHint.value = true;
    return;
  }
  const bounds = region === "edit" ? editor.editBounds : null;
  if (region === "edit" && !bounds) {
    editor.flash("暂无可导出的编辑内容");
    return;
  }
  showExportChoose.value = false;
  runExport(() => exportImage(editor.userEntities, editor.drawings, editor.markers, {
    view,
    region,
    bounds,
    flipAxes: viewport.cam.flipAxes,
    visibility: { ...editor.visibility },
    textStyle: { ...editor.textStyle },
    labelAlpha: editor.labelAlpha,
    showIcons: editor.visibility.icons,
    violationIds: editor.violationIds,
  }));
}

function downloadJSONFromHint() {
  downloadJSON();
  showMobileExportHint.value = false;
}

function pickImport() {
  importInput.value?.click();
}

function onImport(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => editor.importJSON(String(reader.result));
  reader.onerror = () => editor.flash("文件读取失败");
  reader.readAsText(file);
  ev.target.value = "";
}
</script>

<template>
  <header class="titlebar">
    <div class="left">
      <button class="ghost exit-wiki" @click="askLeaveWiki"> ← 返回 百科首页 </button>
      <button class="ghost" @click="goHome">← 项目选择</button>
      <span class="logo">无尽冬日 · 地图编辑</span>
      <span v-if="isMulti" class="multi-badge">多人</span>
    </div>
    <div class="right">
      <button v-if="isMulti" @click="showCollab = true"> 合作列表 </button>
      <button @click="resetView">重置视图</button>
      <button @click="showClear = true">清空内容</button>
      <div class="divider" />
      <button title="将当前内容缓存到本地浏览器，刷新后仍可加载" @click="editor.saveCache()"> 缓存 </button>
      <button
        :disabled="!hasCache"
        :title="hasCache ? '加载本地缓存' + (cacheLabel ? '（' + cacheLabel + '）' : '') : '本地暂无缓存'"
        @click="editor.loadCache()"
      >
        加载
      </button>
      <div class="divider" />
      <input
        ref="importInput"
        type="file"
        accept="application/json,.json"
        class="hidden-file"
        @change="onImport"
      >
      <button @click="pickImport">导入 JSON</button>
      <button @click="copyJSON">复制 JSON</button>
      <button @click="openExport">导出图片</button>
      <button class="primary" @click="downloadJSON">导出 JSON</button>
    </div>

    <div v-if="showExportChoose" class="modal-mask" @click.self="showExportChoose = false">
      <div class="modal-box export-choose">
        <div class="modal-title">导出图片</div>
        <div class="modal-text"> 选择导出区域与视角。图片会应用你当前的显示设置（所见即所得）； “编辑区”仅导出你放置/绘制的整体区域，因范围更小而更高清。 </div>
        <div class="export-grid">
          <button @click="doExport('full', 'flat')"> 全图·初始视角 </button>
          <button @click="doExport('full', 'game')"> 全图·游戏视角 </button>
          <button :disabled="!hasEditBounds" :title="hasEditBounds ? '' : '暂无可导出的编辑内容'" @click="doExport('edit', 'flat')"> 编辑区·初始视角 </button>
          <button :disabled="!hasEditBounds" :title="hasEditBounds ? '' : '暂无可导出的编辑内容'" @click="doExport('edit', 'game')"> 编辑区·游戏视角 </button>
        </div>
        <div class="modal-actions">
          <button @click="showExportChoose = false">取消</button>
        </div>
      </div>
    </div>

    <div v-if="showLeave" class="modal-mask" @click.self="showLeave = false">
      <div class="modal-box">
        <div class="modal-title">返回 百科首页</div>
        <div class="modal-text">
          离开将关闭地图编辑器，当前未缓存的编辑内容会丢失。 <br>
          如需保留，请先取消并点击顶栏「缓存」（或 Ctrl + S）。
        </div>
        <div class="modal-actions">
          <button @click="showLeave = false">取消</button>
          <button class="primary" @click="leaveWiki"> 确定离开 </button>
        </div>
      </div>
    </div>

    <div v-if="showClear" class="modal-mask" @click.self="showClear = false">
      <div class="modal-box">
        <div class="modal-title">清空内容</div>
        <div class="modal-text"> 确定清空所有用户放置内容与绘制图形吗？此操作不可撤销。 </div>
        <div class="modal-actions">
          <button @click="showClear = false">取消</button>
          <button class="danger" @click="confirmClear">确定清空</button>
        </div>
      </div>
    </div>

    <div v-if="showMobileExportHint" class="modal-mask" @click.self="showMobileExportHint = false">
      <div class="modal-box">
        <div class="modal-title">图片导出提示</div>
        <div class="modal-text">
          高清地图图片体积过大，手机端生成会导致卡顿甚至浏览器闪退，且清晰度受限、无法放大查看。 <br>
          建议移步 <strong>电脑版</strong> 导出清晰大图。 <br>
          可先在此下载 <strong>JSON 数据文件</strong> ，在电脑上通过顶栏「导入 JSON」载入后再导出图片。
        </div>
        <div class="modal-actions">
          <button @click="showMobileExportHint = false">取消</button>
          <button class="primary" @click="downloadJSONFromHint"> 下载 JSON 数据 </button>
        </div>
      </div>
    </div>

    <div v-if="exporting" class="modal-mask export-mask">
      <div class="export-box">
        <div class="spinner" />
        <div class="export-text">导出中，请稍候…</div>
        <div class="export-hint">正在渲染高清地图，期间请勿操作</div>
      </div>
    </div>

    <div v-if="showCollab" class="modal-mask" @click.self="showCollab = false">
      <div class="modal-box">
        <div class="modal-title">合作列表</div>
        <ul class="collab-list">
          <li class="collab-item">
            <span class="collab-dot" :style="{ background: user.identity.color || '#8794a8' }" />
            <span class="collab-name">{{ user.identity.username || "未命名" }}</span>
            <span class="collab-tag">本人</span>
          </li>
          <li v-for="item in user.collaborators" :key="item.userId" class="collab-item">
            <span class="collab-dot" :style="{ background: item.color }" />
            <span class="collab-name">{{ item.username }}</span>
          </li>
        </ul>
        <div v-if="!user.collaborators.length" class="collab-empty"> 多人实时协作功能开发中。导入队友导出的 JSON 后， 其用户将出现在此列表。 </div>
        <div class="modal-actions">
          <button class="primary" @click="showCollab = false"> 关闭 </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped src="../styles/scoped/TitleBar.css"></style>
