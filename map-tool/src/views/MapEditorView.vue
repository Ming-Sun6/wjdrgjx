<script setup>
import { onMounted, ref } from "vue";
import TitleBar from "../components/TitleBar.vue";
import LeftPanel from "../components/LeftPanel.vue";
import RightPanel from "../components/RightPanel.vue";
import BottomBar from "../components/BottomBar.vue";
import CanvasToolbar from "../components/CanvasToolbar.vue";
import CanvasStage from "../components/CanvasStage.vue";

const H5_GUIDE_KEY = "ew_h5_gesture_guide_hidden";
const PC_GUIDE_KEY = "ew_pc_shortcut_guide_hidden";

const showH5Guide = ref(false);
const showPcGuide = ref(false);
const hideH5Next = ref(false);
const hidePcNext = ref(false);
const leftOpen = ref(false);
const rightOpen = ref(false);

function isMobile() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
}

onMounted(() => {
  if (isMobile()) {
    if (localStorage.getItem(H5_GUIDE_KEY) !== "1") showH5Guide.value = true;
  } else if (localStorage.getItem(PC_GUIDE_KEY) !== "1") {
    showPcGuide.value = true;
  }
});

function closeH5() {
  if (hideH5Next.value) localStorage.setItem(H5_GUIDE_KEY, "1");
  showH5Guide.value = false;
}
function closePc() {
  if (hidePcNext.value) localStorage.setItem(PC_GUIDE_KEY, "1");
  showPcGuide.value = false;
}
function toggleLeft() {
  leftOpen.value = !leftOpen.value;
  if (leftOpen.value) rightOpen.value = false;
}
function toggleRight() {
  rightOpen.value = !rightOpen.value;
  if (rightOpen.value) leftOpen.value = false;
}
function closeDrawers() {
  leftOpen.value = false;
  rightOpen.value = false;
}
</script>

<template>
  <div class="editor">
    <TitleBar />
    <div class="editor-body">
      <LeftPanel :class="{ 'drawer-open': leftOpen }" @close="leftOpen = false" />
      <main class="stage-wrap">
        <CanvasToolbar />
        <CanvasStage />
      </main>
      <RightPanel :class="{ 'drawer-open': rightOpen }" @close="rightOpen = false" />
      <div
        v-if="leftOpen || rightOpen"
        class="drawer-backdrop"
        @pointerdown.stop
        @click="closeDrawers"
      />
      <button class="mobile-fab fab-left" @pointerdown.stop @click="toggleLeft"> 内容 </button>
      <button class="mobile-fab fab-right" @pointerdown.stop @click="toggleRight"> 编辑 </button>
    </div>
    <BottomBar />
    <div v-if="showH5Guide" class="guide-mask" @click.self="closeH5">
      <div class="guide-box">
        <div class="guide-title">触控操作说明</div>
        <div class="guide-body">
          <div class="guide-sec">
            <div class="guide-h">单指</div>
            <ul>
              <li>放置/绘制模式：点击放置、拖动绘制</li>
              <li>浏览模式：拖动移动地图、双击放大</li>
              <li>点击格子查看信息、长按项目弹出菜单</li>
            </ul>
          </div>
          <div class="guide-sec">
            <div class="guide-h">双指</div>
            <ul>
              <li>开合缩放、同向拖动平移、反向转动旋转（可同时）</li>
            </ul>
          </div>
          <div class="guide-sec">
            <div class="guide-h">三指</div>
            <ul>
              <li>上下滑动：调整地图倾斜角度</li>
            </ul>
          </div>
        </div>
        <label class="guide-check">
          <input v-model="hideH5Next" type="checkbox">
          不再提示
        </label>
        <div class="guide-actions">
          <button class="primary" @click="closeH5"> 开始使用 </button>
        </div>
      </div>
    </div>
    <div v-if="showPcGuide" class="guide-mask" @click.self="closePc">
      <div class="guide-box">
        <div class="guide-title">快捷操作说明</div>
        <div class="guide-body">
          <div class="guide-sec">
            <div class="guide-h">鼠标</div>
            <ul>
              <li><b>中键拖拽</b> ：平移地图（任意模式下均可） </li>
              <li><b>滚轮</b> ：以光标为锤点缩放 </li>
              <li><b>左键拖拽</b> ：浏览态平移；各编辑模式下放置/绘制/框选 </li>
              <li><b>右键</b> ：在自定义内容上弹出菜单；或取消当前模式/选择 </li>
              <li><b>双击</b> 自定义项：直接打开文字编辑 </li>
            </ul>
          </div>
          <div class="guide-sec">
            <div class="guide-h">键盘</div>
            <ul>
              <li><b>按住空格</b> ：临时切换到“移动”，松开恢复 </li>
              <li><b>Ctrl + S</b> ：缓存到本地（刷新不丢） </li>
              <li><b>Delete / Ctrl + D</b> ：删除选中/框选的自定义内容 </li>
              <li><b>Esc</b> ：退出当前模式 / 关闭菜单 </li>
            </ul>
          </div>
        </div>
        <label class="guide-check">
          <input v-model="hidePcNext" type="checkbox">
          不再提示
        </label>
        <div class="guide-actions">
          <button class="primary" @click="closePc"> 开始使用 </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/scoped/MapEditorView.css"></style>
