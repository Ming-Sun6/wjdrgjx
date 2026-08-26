(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CalendarGantt = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const DAY = 86400000;
  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!m) throw new Error("BAD_DATE");
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (
      d.getUTCFullYear() !== Number(m[1]) ||
      d.getUTCMonth() !== Number(m[2]) - 1 ||
      d.getUTCDate() !== Number(m[3])
    )
      throw new Error("BAD_DATE");
    return d;
  }
  function formatDate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    return (
      d.getUTCFullYear() +
      "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getUTCDate()).padStart(2, "0")
    );
  }
  function addDays(value, amount) {
    const d = parseDate(value);
    d.setUTCDate(d.getUTCDate() + Number(amount || 0));
    return formatDate(d);
  }
  function compareDates(a, b) {
    return parseDate(a) - parseDate(b);
  }
  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / DAY);
  }
  function startOfIsoWeek(value) {
    const d = parseDate(value);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - day + 1);
    return formatDate(d);
  }
  function getIsoWeek(value) {
    const d = parseDate(value);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const y = d.getUTCFullYear();
    const ys = new Date(Date.UTC(y, 0, 1));
    return { weekYear: y, week: Math.ceil(((d - ys) / DAY + 1) / 7) };
  }
  function monthShift(year, monthIndex, amount) {
    const total = year * 12 + monthIndex + amount;
    return {
      year: Math.floor(total / 12),
      monthIndex: ((total % 12) + 12) % 12,
    };
  }
  function daysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  }
  function getNavigationBounds(today) {
    const d = parseDate(today),
      y = d.getUTCFullYear(),
      mi = d.getUTCMonth(),
      day = d.getUTCDate();
    const date = (year) =>
      year +
      "-" +
      String(mi + 1).padStart(2, "0") +
      "-" +
      String(Math.min(day, daysInMonth(year, mi))).padStart(2, "0");
    return {
      earliestMonth: y - 1 + "-" + String(mi + 1).padStart(2, "0"),
      latestMonth: y + 1 + "-" + String(mi + 1).padStart(2, "0"),
      earliestDate: date(y - 1),
      latestDate: date(y + 1),
    };
  }
  function clipSegment(item, weekStart, weekEnd) {
    if (
      compareDates(item.endDate, weekStart) < 0 ||
      compareDates(item.startDate, weekEnd) > 0
    )
      return null;
    return Object.assign({}, item, {
      clipStart:
        compareDates(item.startDate, weekStart) < 0
          ? weekStart
          : item.startDate,
      clipEnd: compareDates(item.endDate, weekEnd) > 0 ? weekEnd : item.endDate,
      continuesBefore: compareDates(item.startDate, weekStart) < 0,
      continuesAfter: compareDates(item.endDate, weekEnd) > 0,
    });
  }
  function packLanes(items) {
    const ordered = (items || [])
      .slice()
      .sort(
        (a, b) =>
          compareDates(a.startDate, b.startDate) ||
          Number(a.timelinePriority || 0) - Number(b.timelinePriority || 0) ||
          compareDates(a.endDate, b.endDate) ||
          String(a.id).localeCompare(String(b.id)),
      );
    const lanes = [];
    const preferred = new Map();
    const available = (lane, item) =>
      lane.every(
        (other) =>
          compareDates(other.endDate, item.startDate) < 0 ||
          compareDates(item.endDate, other.startDate) < 0,
      );
    ordered.forEach((item) => {
      const key = item.scheduleId || item.itemId || item.originalId || null;
      let lane =
        key && preferred.has(key) && available(preferred.get(key), item)
          ? preferred.get(key)
          : lanes.find((row) => available(row, item));
      if (!lane) {
        lane = [];
        lanes.push(lane);
      }
      lane.push(item);
      if (key && !preferred.has(key)) preferred.set(key, lane);
    });
    return lanes;
  }
  function contrast(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#4b4038";
    const n = parseInt(m[1], 16);
    const r = n >> 16,
      g = (n >> 8) & 255,
      b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 < 145 ? "#fff" : "#3e3028";
  }
  function isoWeekValue(date) {
    const info = getIsoWeek(date);
    return info.weekYear + "-W" + String(info.week).padStart(2, "0");
  }
  function monthRange(month) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    const y = Number(m[1]),
      mi = Number(m[2]) - 1;
    const first = y + "-" + String(mi + 1).padStart(2, "0") + "-01";
    const last =
      y +
      "-" +
      String(mi + 1).padStart(2, "0") +
      "-" +
      String(daysInMonth(y, mi)).padStart(2, "0");
    return {
      from: startOfIsoWeek(first),
      to: addDays(startOfIsoWeek(last), 6),
      first,
      last,
    };
  }
  function weeksInRange(from, to) {
    const out = [];
    for (
      let d = startOfIsoWeek(from);
      compareDates(d, to) <= 0;
      d = addDays(d, 7)
    )
      out.push({ from: d, to: addDays(d, 6) });
    return out;
  }

  function init() {
    if (typeof document === "undefined") return;
    const rootEl = document.getElementById("calendarGanttRoot");
    if (!rootEl) return;
    const params = new URLSearchParams(location.search);
    const embedded = params.get("embed") === "1";
    if (embedded) document.documentElement.classList.add("is-embedded");
    function removeFloatingThemeButton() {
      ["themeToggleBtn", "themeToggle"].forEach((id) => {
        const node = document.getElementById(id);
        if (
          node &&
          (node.classList.contains("wjdr-theme-fab") ||
            node.classList.contains("theme-toggle-btn"))
        )
          node.remove();
      });
    }
    removeFloatingThemeButton();
    const themeObserver = new MutationObserver(removeFloatingThemeButton);
    themeObserver.observe(document.body, { childList: true, subtree: true });
    const today = formatDate(new Date());
    const bounds = getNavigationBounds(today);
    const state = {
      view: "timeline",
      date: startOfIsoWeek(today),
      month: today.slice(0, 7),
      cache: new Map(),
      controller: null,
      schedules: [],
    };
    const els = {
      root: rootEl,
      status: document.getElementById("calendarStatus"),
      label: document.getElementById("calendarRangeLabel"),
      week: document.getElementById("calendarWeekPicker"),
      month: document.getElementById("calendarMonthPicker"),
      prev: document.getElementById("calendarPrev"),
      next: document.getElementById("calendarNext"),
      today: document.getElementById("calendarToday"),
      timelineBtn: document.getElementById("calendarViewTimeline"),
      weekBtn: document.getElementById("calendarViewWeek"),
      monthBtn: document.getElementById("calendarViewMonth"),
      openFull: document.getElementById("calendarOpenFull"),
      notice: document.getElementById("calendarClampNotice"),
      dialog: document.getElementById("calendarDetailDialog"),
      dialogBody: document.getElementById("calendarDialogContent"),
    };
    function openFullCalendar() {
      try {
        window.top.location.href = "/function/calendar.html";
      } catch (_error) {
        window.location.href = "/function/calendar.html";
      }
    }
    let timelinePan = null,
      suppressTimelineClickUntil = 0;
    function endTimelinePan(event) {
      if (!timelinePan) return;
      if (
        event &&
        els.status.hasPointerCapture &&
        els.status.hasPointerCapture(event.pointerId)
      )
        els.status.releasePointerCapture(event.pointerId);
      if (timelinePan.moved) suppressTimelineClickUntil = Date.now() + 250;
      timelinePan = null;
      els.status.classList.remove("is-panning");
    }
    els.status.addEventListener("pointerdown", (event) => {
      if (state.view !== "timeline" || event.button !== 0) return;
      timelinePan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        scrollLeft: els.status.scrollLeft,
        moved: false,
      };
      els.status.setPointerCapture?.(event.pointerId);
    });
    els.status.addEventListener("pointermove", (event) => {
      if (!timelinePan || timelinePan.pointerId !== event.pointerId) return;
      const delta = event.clientX - timelinePan.startX;
      if (Math.abs(delta) > 5) timelinePan.moved = true;
      if (!timelinePan.moved) return;
      event.preventDefault();
      els.status.classList.add("is-panning");
      els.status.scrollLeft = timelinePan.scrollLeft - delta;
    });
    els.status.addEventListener("pointerup", endTimelinePan);
    els.status.addEventListener("pointercancel", endTimelinePan);
    els.status.addEventListener(
      "click",
      (event) => {
        if (Date.now() < suppressTimelineClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
    els.month.min = bounds.earliestMonth;
    els.month.max = bounds.latestMonth;
    els.week.min = isoWeekValue(bounds.earliestDate);
    els.week.max = isoWeekValue(bounds.latestDate);
    function currentRange() {
      if (state.view === "week") {
        const from = startOfIsoWeek(state.date);
        return { from, to: addDays(from, 6) };
      }
      if (state.view === "timeline") {
        const from = startOfIsoWeek(state.date);
        return { from, to: addDays(from, 55) };
      }
      return monthRange(state.month);
    }
    function clampDate(value) {
      if (compareDates(value, bounds.earliestDate) < 0)
        return bounds.earliestDate;
      if (compareDates(value, bounds.latestDate) > 0) return bounds.latestDate;
      return value;
    }
    function notifyClamp() {
      els.notice.textContent = "已调整到最近可查看的日期范围。";
      setTimeout(() => {
        if (els.notice.textContent) els.notice.textContent = "";
      }, 2200);
    }
    function updateControls() {
      const range = currentRange();
      const firstMonth =
        state.view === "month" ? state.month : range.from.slice(0, 7);
      const lastMonth =
        state.view === "month" ? state.month : range.to.slice(0, 7);
      els.prev.disabled =
        state.view === "month"
          ? firstMonth <= bounds.earliestMonth
          : compareDates(range.from, bounds.earliestDate) <= 0;
      els.next.disabled =
        state.view === "month"
          ? lastMonth >= bounds.latestMonth
          : compareDates(range.to, bounds.latestDate) >= 0;
      els.timelineBtn.classList.toggle("active", state.view === "timeline");
      els.weekBtn.classList.toggle("active", state.view === "week");
      els.monthBtn.classList.toggle("active", state.view === "month");
      els.week.hidden = state.view === "month";
      els.month.hidden = state.view !== "month";
      els.week.value = isoWeekValue(state.date);
      els.month.value = state.month;
      if (state.view === "month")
        els.label.textContent = state.month.replace("-", "年") + "月";
      else els.label.textContent = range.from + " 至 " + range.to;
    }
    async function load() {
      updateControls();
      const range = currentRange();
      const key = state.view + ":" + range.from + ":" + range.to;
      if (state.cache.has(key)) {
        state.schedules = state.cache.get(key);
        render();
        return;
      }
      if (state.controller) state.controller.abort();
      state.controller = new AbortController();
      els.root.innerHTML = '<div class="calendar-loading">正在加载日程…</div>';
      try {
        const response = await fetch(
          "/api/calendar/schedules?from=" +
            encodeURIComponent(range.from) +
            "&to=" +
            encodeURIComponent(range.to),
          {
            signal: state.controller.signal,
            headers: { Accept: "application/json" },
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "LOAD_FAILED");
        state.schedules = Array.isArray(data.schedules) ? data.schedules : [];
        state.cache.set(key, state.schedules);
        render();
      } catch (error) {
        if (error && error.name === "AbortError") return;
        els.root.innerHTML = "";
        const box = document.createElement("div");
        box.className = "calendar-error";
        box.textContent = "日程加载失败。";
        const retry = document.createElement("button");
        retry.className = "calendar-btn";
        retry.textContent = "重新加载";
        retry.onclick = load;
        box.appendChild(document.createElement("br"));
        box.appendChild(retry);
        els.root.appendChild(box);
      }
    }
    function detail(data) {
      if (!els.dialog || !els.dialogBody) return;
      els.dialogBody.innerHTML = "";
      const title = document.createElement("h2");
      title.textContent = data.name || "日程详情";
      const meta = document.createElement("div");
      meta.className = "calendar-dialog-meta";
      meta.textContent =
        (data.startDate || data.date || "") +
        (data.endDate && data.endDate !== data.startDate
          ? " 至 " + data.endDate
          : "") +
        (data.description ? "\n" + data.description : "");
      meta.style.whiteSpace = "pre-wrap";
      els.dialogBody.append(title, meta);
      els.dialog.showModal();
    }
    function header(week, monthInfo) {
      const row = document.createElement("div");
      row.className = "calendar-date-header";
      const cat = document.createElement("div");
      cat.className = "calendar-category-head";
      cat.textContent = "活动分类";
      row.appendChild(cat);
      for (let i = 0; i < 7; i++) {
        const date = addDays(week.from, i);
        const d = parseDate(date);
        const cell = document.createElement("div");
        cell.className = "calendar-date-cell";
        if (date === today) cell.classList.add("today");
        if (i >= 5) cell.classList.add("weekend");
        if (monthInfo && date.slice(0, 7) !== monthInfo)
          cell.classList.add("outside");
        const strong = document.createElement("strong");
        strong.textContent = [
          "周一",
          "周二",
          "周三",
          "周四",
          "周五",
          "周六",
          "周日",
        ][i];
        cell.append(
          strong,
          document.createTextNode(
            d.getUTCMonth() + 1 + "月" + d.getUTCDate() + "日",
          ),
        );
        row.appendChild(cell);
      }
      return row;
    }
    function bar(item, week) {
      const clipped = clipSegment(item, week.from, week.to);
      if (!clipped) return null;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "calendar-bar";
      node.style.gridColumn =
        diffDays(week.from, clipped.clipStart) +
        1 +
        " / " +
        (diffDays(week.from, clipped.clipEnd) + 2);
      node.style.background = item.color || "#f7d6b5";
      node.style.color = contrast(item.color);
      node.style.fontWeight = item.fontBold ? "900" : "";
      node.title = item.name || "";
      node.textContent =
        (clipped.continuesBefore ? "接上周 · " : "") +
        (item.name || "未命名") +
        (clipped.continuesAfter ? " · 续下周" : "");
      node.onclick = () => detail(item);
      return node;
    }
    function row(categoryLabel, lane, week, extraClass) {
      const wrap = document.createElement("div");
      wrap.className = "calendar-row " + (extraClass || "");
      const cat = document.createElement("div");
      cat.className = "calendar-category-cell";
      cat.textContent = categoryLabel || "";
      const laneEl = document.createElement("div");
      laneEl.className = "calendar-lane";
      lane.forEach((item) => {
        const b = bar(item, week);
        if (b) laneEl.appendChild(b);
      });
      wrap.append(cat, laneEl);
      return wrap;
    }
    function mergedRows(categoryLabel, lanes, week) {
      const group = document.createElement("div");
      group.className = "calendar-merged-group";
      const cat = document.createElement("div");
      cat.className = "calendar-category-cell";
      cat.textContent = categoryLabel || "";
      const rows = document.createElement("div");
      rows.className = "calendar-merged-rows";
      lanes.forEach((lane) => rows.appendChild(row("", lane, week)));
      group.append(cat, rows);
      return group;
    }
    function renderDaily(schedule, week, categoryName) {
      const frag = document.createDocumentFragment();
      const titleRow = document.createElement("div");
      titleRow.className = "calendar-daily-title-row";
      const cat = document.createElement("div");
      cat.className = "calendar-category-cell";
      cat.textContent = categoryName;
      const title = document.createElement("div");
      title.className = "calendar-daily-title";
      title.style.fontWeight = schedule.fontBold ? "900" : "";
      title.textContent =
        (schedule.firstCardDate &&
        compareDates(schedule.firstCardDate, week.from) < 0
          ? "接上周 · "
          : "") +
        schedule.name +
        (schedule.lastCardDate &&
        compareDates(schedule.lastCardDate, week.to) > 0
          ? " · 续下周"
          : "");
      if (schedule.description) {
        const small = document.createElement("small");
        small.textContent = schedule.description;
        title.appendChild(small);
      }
      titleRow.append(cat, title);
      frag.appendChild(titleRow);
      const content = document.createElement("div");
      content.className = "calendar-daily-content";
      const spacer = document.createElement("div");
      spacer.className = "calendar-daily-spacer";
      content.appendChild(spacer);
      for (let i = 0; i < 7; i++) {
        const date = addDays(week.from, i);
        const stack = document.createElement("div");
        stack.className = "calendar-day-stack";
        (schedule.cards || [])
          .filter((card) => card.date === date)
          .sort(
            (a, b) =>
              (a.sortOrder || 0) - (b.sortOrder || 0) ||
              String(a.id).localeCompare(String(b.id)),
          )
          .forEach((card) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "calendar-day-card";
            button.style.background = card.color || "#f7d6b5";
            button.style.color = contrast(card.color);
            button.style.fontWeight = card.fontBold ? "900" : "";
            button.textContent = card.name || "任务";
            if (card.highlighted) {
              const mark = document.createElement("span");
              mark.className = "highlight";
              mark.textContent = "👍";
              button.appendChild(mark);
            }
            button.onclick = () => detail(card);
            stack.appendChild(button);
          });
        content.appendChild(stack);
      }
      frag.appendChild(content);
      return frag;
    }
    function renderWeek(week, monthInfo) {
      const block = document.createElement("section");
      block.className = "calendar-week-block";
      block.appendChild(header(week, monthInfo));
      const visible = state.schedules.filter((schedule) =>
        schedule.compositeLayout === "daily-list"
          ? (schedule.cards || []).some(
              (card) =>
                compareDates(card.date, week.from) >= 0 &&
                compareDates(card.date, week.to) <= 0,
            )
          : compareDates(schedule.endDate, week.from) >= 0 &&
            compareDates(schedule.startDate, week.to) <= 0,
      );
      const groups = new Map();
      visible.forEach((item) => {
        const key = (item.category && item.category.code) || "regular";
        if (!groups.has(key))
          groups.set(key, {
            category: item.category || { name: "常规", sortOrder: 0 },
            items: [],
          });
        groups.get(key).items.push(item);
      });
      const ordered = [...groups.values()].sort(
        (a, b) =>
          (a.category.sortOrder || 0) - (b.category.sortOrder || 0) ||
          String(a.category.name).localeCompare(String(b.category.name)),
      );
      ordered.forEach((group) => {
        const section = document.createElement("div");
        section.className = "calendar-category-section";
        const ordinary = group.items
          .filter((item) => item.scheduleType !== "composite")
          .map((item) => clipSegment(item, week.from, week.to))
          .filter(Boolean)
          .map((item) =>
            Object.assign({}, item, {
              startDate: item.clipStart,
              endDate: item.clipEnd,
            }),
          );
        const ordinaryLanes = packLanes(ordinary);
        if (ordinaryLanes.length)
          section.appendChild(
            mergedRows(group.category.name, ordinaryLanes, week),
          );
        group.items
          .filter(
            (item) =>
              item.scheduleType === "composite" &&
              item.compositeLayout !== "daily-list",
          )
          .forEach((schedule) => {
            const children = (schedule.items || [])
              .map((item) => clipSegment(item, week.from, week.to))
              .filter(Boolean);
            if (!children.length) return;
            packLanes(children).forEach((lane, index) =>
              section.appendChild(
                row(
                  index === 0 ? group.category.name + "\n" + schedule.name : "",
                  lane,
                  week,
                  "calendar-composite-row",
                ),
              ),
            );
          });
        group.items
          .filter((item) => item.compositeLayout === "daily-list")
          .forEach((schedule) =>
            section.appendChild(
              renderDaily(schedule, week, group.category.name),
            ),
          );
        if (section.childNodes.length) block.appendChild(section);
      });
      return block;
    }
    function timelineBar(item, range) {
      const clipped = clipSegment(item, range.from, range.to);
      if (!clipped) return null;
      const node = document.createElement("button");
      node.type = "button";
      node.className =
        "calendar-bar calendar-timeline-bar" +
        (item.timelineDailyTitle ? " calendar-timeline-daily-title" : "");
      node.style.gridColumn =
        diffDays(range.from, clipped.clipStart) +
        1 +
        " / " +
        (diffDays(range.from, clipped.clipEnd) + 2);
      node.style.background = item.color || "#f7d6b5";
      node.style.color = contrast(item.color);
      node.style.fontWeight = item.fontBold ? "900" : "";
      node.textContent =
        (clipped.continuesBefore ? "← " : "") +
        (item.timelineName || item.name || "未命名") +
        (clipped.continuesAfter ? " →" : "");
      node.title = item.timelineName || item.name || "";
      node.onclick = () => detail(item);
      return node;
    }
    function timelineItems(schedule, range) {
      if (schedule.scheduleType !== "composite")
        return [Object.assign({}, schedule, { timelineName: schedule.name })];
      if (schedule.compositeLayout === "daily-list") {
        const title = Object.assign({}, schedule, {
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          timelineName: schedule.name,
          timelineDailyTitle: true,
          timelinePriority: -1,
          color: "#f4c8ad",
        });
        const cards = (schedule.cards || [])
          .filter(
            (card) =>
              compareDates(card.date, range.from) >= 0 &&
              compareDates(card.date, range.to) <= 0,
          )
          .map((card) =>
            Object.assign({}, card, {
              scheduleId: schedule.scheduleId,
              timelineName: card.name,
              fontBold: schedule.fontBold || card.fontBold,
            }),
          );
        return [title].concat(cards);
      }
      return (schedule.items || [])
        .filter(
          (item) =>
            compareDates(item.endDate, range.from) >= 0 &&
            compareDates(item.startDate, range.to) <= 0,
        )
        .map((item) =>
          Object.assign({}, item, {
            scheduleId: schedule.scheduleId,
            timelineName: schedule.name + " · " + item.name,
            fontBold: schedule.fontBold || item.fontBold,
          }),
        );
    }
    function timelineHeader(range, days) {
      const row = document.createElement("div");
      row.className = "calendar-timeline-header";
      const head = document.createElement("div");
      head.className = "calendar-timeline-category-head";
      head.textContent = "活动分类";
      row.appendChild(head);
      for (let index = 0; index < days; index++) {
        const date = addDays(range.from, index),
          parsed = parseDate(date),
          cell = document.createElement("div");
        cell.className = "calendar-timeline-date";
        if (date === today) cell.classList.add("today");
        if ((parsed.getUTCDay() || 7) >= 6) cell.classList.add("weekend");
        if (parsed.getUTCDate() === 1) cell.classList.add("month-start");
        const weekday = ["日", "一", "二", "三", "四", "五", "六"][
          parsed.getUTCDay()
        ];
        cell.innerHTML =
          "<strong>" +
          String(parsed.getUTCMonth() + 1) +
          "/" +
          String(parsed.getUTCDate()) +
          "</strong><span>周" +
          weekday +
          "</span>";
        row.appendChild(cell);
      }
      return row;
    }
    function renderTimeline(range) {
      const days = diffDays(range.from, range.to) + 1,
        root = document.createElement("section");
      root.className = "calendar-continuous-timeline";
      root.style.setProperty("--timeline-days", String(days));
      root.appendChild(timelineHeader(range, days));
      const groups = new Map();
      state.schedules.forEach((schedule) => {
        const key = (schedule.category && schedule.category.code) || "regular";
        if (!groups.has(key))
          groups.set(key, {
            category: schedule.category || { name: "常规", sortOrder: 0 },
            items: [],
          });
        groups.get(key).items.push(...timelineItems(schedule, range));
      });
      [...groups.values()]
        .sort(
          (a, b) =>
            (a.category.sortOrder || 0) - (b.category.sortOrder || 0) ||
            String(a.category.name).localeCompare(String(b.category.name)),
        )
        .forEach((group) => {
          const lanes = packLanes(group.items);
          if (!lanes.length) return;
          const section = document.createElement("div");
          section.className = "calendar-timeline-category";
          const label = document.createElement("div");
          label.className = "calendar-timeline-category-label";
          label.textContent = group.category.name || "常规";
          const rows = document.createElement("div");
          rows.className = "calendar-timeline-rows";
          lanes.forEach((lane) => {
            const laneEl = document.createElement("div");
            laneEl.className = "calendar-timeline-lane";
            lane.forEach((item) => {
              const node = timelineBar(item, range);
              if (node) laneEl.appendChild(node);
            });
            rows.appendChild(laneEl);
          });
          section.append(label, rows);
          root.appendChild(section);
        });
      return root;
    }
    function render() {
      els.root.innerHTML = "";
      const range = currentRange();
      if (!state.schedules.length) {
        els.root.innerHTML =
          '<div class="calendar-empty">当前范围暂无日程</div>';
        return;
      }
      if (state.view === "timeline") {
        els.root.appendChild(renderTimeline(range));
        return;
      }
      const weeks =
        state.view === "week" ? [range] : weeksInRange(range.from, range.to);
      weeks.forEach((week) =>
        els.root.appendChild(
          renderWeek(week, state.view === "month" ? state.month : null),
        ),
      );
    }
    function shift(direction) {
      if (state.view === "week" || state.view === "timeline") {
        const next = addDays(
          state.date,
          direction * (state.view === "timeline" ? 56 : 7),
        );
        const clamped = clampDate(next);
        if (clamped !== next) notifyClamp();
        state.date = clamped;
        state.month = clamped.slice(0, 7);
      } else {
        const d = parseDate(state.month + "-01");
        const shifted = monthShift(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          direction,
        );
        const value =
          shifted.year + "-" + String(shifted.monthIndex + 1).padStart(2, "0");
        const clamped =
          value < bounds.earliestMonth
            ? bounds.earliestMonth
            : value > bounds.latestMonth
              ? bounds.latestMonth
              : value;
        if (clamped !== value) notifyClamp();
        state.month = clamped;
        state.date = clamped + "-01";
      }
      load();
    }
    els.prev.onclick = () => shift(-1);
    els.next.onclick = () => shift(1);
    els.today.onclick = () => {
      state.date = startOfIsoWeek(today);
      state.month = today.slice(0, 7);
      load();
    };
    els.timelineBtn.onclick = () => {
      state.view = "timeline";
      state.date = startOfIsoWeek(clampDate(state.date));
      load();
    };
    els.weekBtn.onclick = () => {
      state.view = "week";
      state.date = clampDate(state.date);
      load();
    };
    els.monthBtn.onclick = () => {
      state.view = "month";
      state.month = clampDate(state.month + "-01").slice(0, 7);
      load();
    };
    if (els.openFull) els.openFull.onclick = openFullCalendar;
    els.month.onchange = () => {
      const raw = els.month.value;
      if (!raw) return;
      const clamped =
        raw < bounds.earliestMonth
          ? bounds.earliestMonth
          : raw > bounds.latestMonth
            ? bounds.latestMonth
            : raw;
      if (clamped !== raw) notifyClamp();
      state.month = clamped;
      state.date = clamped + "-01";
      load();
    };
    els.week.onchange = () => {
      const match = /^(\d{4})-W(\d{2})$/.exec(els.week.value);
      if (!match) return;
      const jan4 = String(match[1]) + "-01-04";
      const monday = addDays(startOfIsoWeek(jan4), (Number(match[2]) - 1) * 7);
      const clamped = clampDate(monday);
      if (clamped !== monday) notifyClamp();
      state.date = clamped;
      state.month = clamped.slice(0, 7);
      load();
    };
    document
      .querySelector("[data-calendar-dialog-close]")
      ?.addEventListener("click", () => els.dialog.close());
    load();
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", init);
    else init();
  }
  return {
    parseDate,
    formatDate,
    addDays,
    compareDates,
    diffDays,
    startOfIsoWeek,
    getIsoWeek,
    getNavigationBounds,
    clipSegment,
    packLanes,
    monthRange,
    weeksInRange,
    init,
  };
});
