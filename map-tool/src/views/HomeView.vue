<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { USER_COLORS, WIKI_HOME, useUserStore } from "../stores/user.js";

const router = useRouter();
const user = useUserStore();

const projects = [
  {
    key: "map-editor",
    title: "地图编辑",
    desc: "《无尽冬日》全能地图绘制：放置建筑资源、框选绘制、快速跳转与统计导出。",
    ready: true,
  },
  {
    key: "multi-editor",
    title: "多人编辑",
    desc: "与队友共同编辑同一张地图（功能开发中）。首次进入需设置用户名与喜好颜色。",
    ready: true,
  },
];

const showSetup = ref(false);
const username = ref("");
const color = ref(USER_COLORS[0].value);
const colors = USER_COLORS;

function openProject(item) {
  if (!item.ready) return;
  if (item.key === "map-editor") {
    user.multiplayer = false;
    router.push("/editor");
    return;
  }
  if (item.key === "multi-editor") {
    if (user.hasProfile) enterMulti();
    else {
      username.value = user.identity.username || "";
      color.value = user.identity.color || USER_COLORS[0].value;
      showSetup.value = true;
    }
  }
}

function confirmSetup() {
  if (!username.value.trim()) return;
  user.saveProfile({ username: username.value, color: color.value });
  showSetup.value = false;
  enterMulti();
}

function enterMulti() {
  user.multiplayer = true;
  router.push({ path: "/editor", query: { mode: "multi" } });
}
</script>

<template>
  <div class="home">
    <a class="exit-wiki" :href="WIKI_HOME">← 返回 百科首页</a>
    <header class="home-head">
      <h1>无尽冬日 · 地图编辑器</h1>
    </header>
    <div class="project-grid">
      <button
        v-for="item in projects"
        :key="item.key"
        class="project-card"
        :class="{ disabled: !item.ready }"
        @click="openProject(item)"
      >
        <div class="card-title">{{ item.title }}</div>
        <div class="card-desc">{{ item.desc }}</div>
      </button>
    </div>
    <div v-if="showSetup" class="setup-mask" @click.self="showSetup = false">
      <div class="setup-box">
        <div class="setup-title">创建用户资料</div>
        <div class="setup-hint"> 进入多人编辑前，请设置您的用户名与喜好颜色。 </div>
        <label class="setup-label">用户名</label>
        <input
          v-model="username"
          class="setup-input"
          type="text"
          maxlength="16"
          placeholder="请输入用户名"
          @keyup.enter="confirmSetup"
        >
        <label class="setup-label">喜好颜色</label>
        <div class="color-row">
          <button
            v-for="item in colors"
            :key="item.key"
            class="color-dot"
            :class="{ active: color === item.value }"
            :style="{ background: item.value }"
            :title="item.name"
            @click="color = item.value"
          />
        </div>
        <div class="setup-actions">
          <button @click="showSetup = false">取消</button>
          <button class="primary" :disabled="!username.trim()" @click="confirmSetup"> 进入多人编辑 </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="../styles/scoped/HomeView.css"></style>
