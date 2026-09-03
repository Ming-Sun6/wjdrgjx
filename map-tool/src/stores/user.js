import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";

const STORAGE_KEY = "ew_user_identity";

export const USER_COLORS = [
  { key: "blue", name: "湖蓝", value: "#4aa3ff" },
  { key: "green", name: "翡翠", value: "#35d0a5" },
  { key: "gold", name: "流金", value: "#e0b24a" },
  { key: "rose", name: "绯红", value: "#e5687d" },
  { key: "violet", name: "紫罗兰", value: "#a679f0" },
  { key: "cyan", name: "青碧", value: "#39c5cf" },
  { key: "orange", name: "暖橙", value: "#f0913a" },
  { key: "slate", name: "石墨", value: "#8794a8" },
];

export const WIKI_HOME = "/";

function createUserId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return "u-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export const useUserStore = defineStore("user", () => {
  const identity = reactive({
    userId: "",
    username: "",
    color: "",
    ip: "",
  });
  const multiplayer = ref(false);
  const collaborators = reactive([]);
  const hasProfile = computed(() => !!identity.username && !!identity.color);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...identity }));
    } catch {
      /* ignore */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          identity.userId = parsed.userId || "";
          identity.username = parsed.username || "";
          identity.color = parsed.color || "";
          identity.ip = parsed.ip || "";
        }
      }
    } catch {
      /* ignore */
    }
    if (!identity.userId) {
      identity.userId = createUserId();
      persist();
    }
    fetchIP();
    return identity;
  }

  function saveProfile({ username, color }) {
    if (!identity.userId) identity.userId = createUserId();
    identity.username = (username || "").trim();
    identity.color = color || USER_COLORS[0].value;
    persist();
    fetchIP();
  }

  async function fetchIP(force = false) {
    if (identity.ip && !force) return identity.ip;
    try {
      const data = await (await fetch("https://api.ipify.org?format=json")).json();
      if (data && data.ip) {
        identity.ip = data.ip;
        persist();
      }
    } catch {
      /* ignore */
    }
    return identity.ip;
  }

  function snapshot() {
    return {
      userId: identity.userId,
      username: identity.username,
      color: identity.color,
      ip: identity.ip,
    };
  }

  function registerCollaborator(user) {
    if (!user || !user.userId || user.userId === identity.userId) return;
    const next = {
      userId: user.userId,
      username: user.username || "(未命名)",
      color: user.color || "#8794a8",
      ip: user.ip || "",
    };
    const idx = collaborators.findIndex((c) => c.userId === next.userId);
    if (idx >= 0) collaborators[idx] = next;
    else collaborators.push(next);
  }

  load();
  return {
    identity,
    multiplayer,
    collaborators,
    hasProfile,
    load,
    saveProfile,
    fetchIP,
    snapshot,
    registerCollaborator,
  };
});
