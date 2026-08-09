import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.APP_CONFIG ?? {};
const configured =
  config.SUPABASE_URL?.startsWith("https://") &&
  !config.SUPABASE_URL.includes("YOUR_") &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_ANON_KEY.includes("YOUR_");

const $ = (selector) => document.querySelector(selector);
const elements = {
  setup: $("#setup-panel"),
  auth: $("#auth-panel"),
  app: $("#app"),
  signOut: $("#sign-out"),
  loginForm: $("#login-form"),
  password: $("#password"),
  resetPassword: $("#reset-password"),
  authMessage: $("#auth-message"),
  passwordPanel: $("#password-panel"),
  passwordForm: $("#password-form"),
  newPassword: $("#new-password"),
  confirmPassword: $("#confirm-password"),
  passwordMessage: $("#password-message"),
  recordForm: $("#record-form"),
  formMessage: $("#form-message"),
  occurredAt: $("#occurred-at"),
  medicine: $("#medicine"),
  medicineField: $("#medicine-field"),
  doseField: $("#dose-field"),
  doseAmount: $("#dose-amount"),
  doseUnit: $("#dose-unit"),
  frequency: $("#frequency"),
  frequencyField: $("#frequency-field"),
  bowelMovement: $("#bowel-movement"),
  bowelMovementField: $("#bowel-movement-field"),
  urineAmount: $("#urine-amount"),
  urineAmountField: $("#urine-amount-field"),
  note: $("#note"),
  saveButton: $("#save-button"),
  syncState: $("#sync-state"),
  records: $("#records"),
  empty: $("#empty-state"),
  refresh: $("#refresh"),
  pagination: $("#pagination"),
  previousPage: $("#previous-page"),
  nextPage: $("#next-page"),
  pageStatus: $("#page-status"),
};

const PAGE_SIZE = 10;
const CHICAGO_TIME_ZONE = "America/Chicago";

const typeMeta = {
  inhaled: { label: "吸入药", icon: "吸", className: "inhaled" },
  oral: { label: "口服药", icon: "服", className: "oral" },
  behavior: { label: "小宝行为", icon: "记", className: "behavior" },
  brushing: { label: "刷牙", icon: "牙", className: "brushing" },
  elimination: { label: "排泄", icon: "排", className: "elimination" },
};

const frequencyOptions = {
  inhaled: ["每天1次", "每天2次", "每天3次", "每天4次"],
  oral: ["每天1次", "隔天1次", "每3天1次"],
};

const allowedUserIds = new Set([
  "f95b14d7-4881-4433-8442-a401831544e6",
  "45d59985-1e2c-424c-841a-18857c9a21a8",
]);

const authLinkType = new URLSearchParams(location.hash.slice(1)).get("type");
let passwordRecovery = authLinkType === "recovery" || authLinkType === "invite";

$("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function show(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function selectedType() {
  return new FormData(elements.recordForm).get("type");
}

function chicagoDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function frequencyFor(type, dateKey) {
  if (!frequencyOptions[type]) return null;
  if (type === "inhaled") return dateKey <= "2026-07-30" ? "每天2次" : "每天3次";
  return dateKey <= "2026-08-02" ? "隔天1次" : "每3天1次";
}

function updateFrequencyPreview() {
  const type = selectedType();
  const dateKey = elements.occurredAt.value.slice(0, 10);
  const options = frequencyOptions[type] ?? [];
  elements.frequency.replaceChildren(
    ...options.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }),
  );
  elements.frequency.value = frequencyFor(type, dateKey) ?? options[0] ?? "";
}

function applyTypeDefaults(type) {
  const isMedication = type === "inhaled" || type === "oral";
  const isElimination = type === "elimination";
  show(elements.medicineField, isMedication);
  show(elements.doseField, isMedication);
  show(elements.frequencyField, isMedication);
  show(elements.bowelMovementField, isElimination);
  show(elements.urineAmountField, isElimination);
  elements.medicine.required = isMedication;
  elements.doseAmount.required = isMedication;
  elements.frequency.required = isMedication;
  elements.bowelMovement.required = isElimination;
  elements.urineAmount.required = isElimination;

  if (type === "inhaled") {
    elements.medicine.value = "Fluticasone";
    elements.doseAmount.value = "110";
    elements.doseUnit.value = "mcg";
  } else if (type === "oral") {
    elements.medicine.value = "Prednisolone";
    elements.doseAmount.value = "2.5";
    elements.doseUnit.value = "mg";
  } else {
    elements.medicine.value = "";
    elements.doseAmount.value = "";
  }
  updateFrequencyPreview();
}

elements.occurredAt.value = localDateTimeValue();
elements.recordForm?.addEventListener("change", (event) => {
  if (event.target.name === "type") applyTypeDefaults(event.target.value);
  if (event.target.name === "occurred_at") updateFrequencyPreview();
});
updateFrequencyPreview();

if (!configured) {
  show(elements.setup, true);
} else {
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
  let allRecords = [];
  let currentPage = 1;

  async function renderSession(session) {
    if (session && !allowedUserIds.has(session.user.id)) {
      await supabase.auth.signOut();
      show(elements.auth, true);
      show(elements.app, false);
      show(elements.signOut, false);
      setMessage(elements.authMessage, "这个账号没有访问权限。", true);
      return;
    }

    const signedIn = Boolean(session);
    const settingPassword = signedIn && passwordRecovery;
    show(elements.auth, !signedIn);
    show(elements.passwordPanel, settingPassword);
    show(elements.app, signedIn && !settingPassword);
    show(elements.signOut, signedIn && !settingPassword);
    if (signedIn && !settingPassword) await loadRecords();
  }

  async function loadRecords() {
    elements.syncState.textContent = "同步中…";
    const [recentResult, todayResult, allTimeInhaledResult, allTimeOralResult] = await Promise.all([
      supabase
        .from("medication_records")
        .select("id, occurred_at, type, medicine, dose_amount, dose_unit, frequency, bowel_movement, urine_amount, note")
        .order("occurred_at", { ascending: false }),
      supabase
        .from("medication_records")
        .select("type")
        .gte("occurred_at", startOfTodayIso()),
      supabase
        .from("medication_records")
        .select("*", { count: "exact", head: true })
        .eq("type", "inhaled"),
      supabase
        .from("medication_records")
        .select("*", { count: "exact", head: true })
        .eq("type", "oral"),
    ]);

    const error =
      recentResult.error ??
      todayResult.error ??
      allTimeInhaledResult.error ??
      allTimeOralResult.error;
    if (error) {
      elements.syncState.textContent = "同步失败";
      setMessage(elements.formMessage, `读取失败：${error.message}`, true);
      return;
    }

    allRecords = recentResult.data ?? [];
    renderRecordsPage();
    renderTotals(
      todayResult.data ?? [],
      allTimeInhaledResult.count ?? 0,
      allTimeOralResult.count ?? 0,
    );
    renderOralReminder(allRecords);
    elements.syncState.textContent = "已同步";
  }

  function renderTotals(rows, allTimeInhaled, allTimeOral) {
    const counts = rows.reduce((result, row) => {
      result[row.type] = (result[row.type] ?? 0) + 1;
      return result;
    }, { inhaled: 0, oral: 0, behavior: 0, brushing: 0, elimination: 0 });
    $("#medicine-total").textContent = counts.inhaled + counts.oral;
    $("#inhaled-total").textContent = counts.inhaled;
    $("#oral-total").textContent = counts.oral;
    $("#behavior-total").textContent = counts.behavior;
    $("#all-time-inhaled-total").textContent = allTimeInhaled;
    $("#all-time-oral-total").textContent = allTimeOral;
  }

  function addCalendarDays(dateKey, days) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const result = new Date(Date.UTC(year, month - 1, day + days));
    return result.toISOString().slice(0, 10);
  }

  function formatDateKey(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(
      new Date(Date.UTC(year, month - 1, day, 12)),
    );
  }

  function oralIntervalDays(frequency) {
    if (frequency === "每天1次") return 1;
    if (frequency === "隔天1次") return 2;
    if (frequency === "每3天1次") return 3;
    return null;
  }

  function renderOralReminder(rows) {
    const card = $("#oral-reminder-card");
    const title = $("#oral-reminder");
    const detail = $("#oral-reminder-detail");
    const latestOral = rows.find((row) => row.type === "oral");

    if (!latestOral) {
      card.dataset.status = "neutral";
      title.textContent = "暂无服药计划";
      detail.textContent = "记录一次口服药后，这里会自动计算提醒";
      return;
    }

    const todayKey = chicagoDateKey(new Date());
    const lastDoseKey = chicagoDateKey(new Date(latestOral.occurred_at));
    const frequency = latestOral.frequency ?? frequencyFor("oral", lastDoseKey);
    const intervalDays = oralIntervalDays(frequency);

    if (lastDoseKey === todayKey) {
      card.dataset.status = "complete";
      title.textContent = "今日已服";
      detail.textContent = `当前频率：${frequency}`;
      return;
    }

    if (!intervalDays) {
      card.dataset.status = "neutral";
      title.textContent = "请确认今日安排";
      detail.textContent = `当前频率：${frequency}`;
      return;
    }

    const nextDoseKey = addCalendarDays(lastDoseKey, intervalDays);
    if (todayKey >= nextDoseKey) {
      card.dataset.status = "due";
      title.textContent = "今天需要口服药";
      detail.textContent = `当前频率：${frequency} · 上次 ${formatDateKey(lastDoseKey)}`;
    } else {
      card.dataset.status = "upcoming";
      title.textContent = "今天不需要口服药";
      detail.textContent = `当前频率：${frequency} · 下次预计 ${formatDateKey(nextDoseKey)}`;
    }
  }

  function dailyOccurrenceNumbers(rows) {
    const counts = new Map();
    const occurrenceById = new Map();
    const chronologicalRows = [...rows].sort(
      (left, right) => new Date(left.occurred_at) - new Date(right.occurred_at),
    );

    for (const row of chronologicalRows) {
      const dateKey = chicagoDateKey(new Date(row.occurred_at));
      const groupKey = `${dateKey}:${row.type}`;
      const occurrence = (counts.get(groupKey) ?? 0) + 1;
      counts.set(groupKey, occurrence);
      occurrenceById.set(row.id, occurrence);
    }
    return occurrenceById;
  }

  function renderRecordsPage() {
    const totalPages = Math.max(1, Math.ceil(allRecords.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = allRecords.slice(start, start + PAGE_SIZE);
    renderRecords(pageRows, dailyOccurrenceNumbers(allRecords));

    show(elements.pagination, allRecords.length > PAGE_SIZE);
    elements.pageStatus.textContent = `第 ${currentPage} / ${totalPages} 页`;
    elements.previousPage.disabled = currentPage === 1;
    elements.nextPage.disabled = currentPage === totalPages;
  }

  function renderRecords(rows, occurrenceById) {
    elements.records.replaceChildren();
    show(elements.empty, rows.length === 0);

    for (const row of rows) {
      const fragment = $("#record-template").content.cloneNode(true);
      const meta = typeMeta[row.type];
      const article = fragment.querySelector("article");
      const icon = fragment.querySelector(".record-icon");
      const title = fragment.querySelector(".record-title");
      const time = fragment.querySelector("time");
      const dose = fragment.querySelector(".record-dose");
      const note = fragment.querySelector(".record-note");
      const deleteButton = fragment.querySelector(".delete-button");

      article.dataset.type = meta.className;
      icon.textContent = meta.icon;
      title.textContent = meta.label;
      const eventDate = new Date(row.occurred_at);
      time.dateTime = row.occurred_at;
      time.textContent = new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(eventDate);

      const occurrence = occurrenceById.get(row.id);
      if (row.type === "behavior") {
        dose.textContent = `当天第 ${occurrence} 条行为记录`;
      } else if (row.type === "brushing") {
        dose.textContent = `当天第 ${occurrence} 次刷牙`;
      } else if (row.type === "elimination") {
        const bowelText = row.bowel_movement ? "有" : "没有";
        dose.textContent = `当天第 ${occurrence} 次 · 大便：${bowelText} · 小便：${row.urine_amount}次`;
      } else {
        const dateKey = chicagoDateKey(eventDate);
        const frequency = row.frequency ?? frequencyFor(row.type, dateKey);
        dose.textContent = `当天第 ${occurrence} 次 · 频率：${frequency}`;
      }
      note.textContent = row.note ?? "";
      show(note, Boolean(row.note));

      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("确定删除这条记录吗？")) return;
        deleteButton.disabled = true;
        const { error } = await supabase.from("medication_records").delete().eq("id", row.id);
        if (error) {
          setMessage(elements.formMessage, `删除失败：${error.message}`, true);
          deleteButton.disabled = false;
        } else {
          await loadRecords();
        }
      });

      elements.records.append(fragment);
    }
  }

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.loginForm);
    const email = formData.get("email");
    const password = formData.get("password");
    setMessage(elements.authMessage, "正在登录…");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setMessage(
      elements.authMessage,
      error ? "登录失败，请检查邮箱和密码。" : "登录成功。",
      Boolean(error),
    );
  });

  elements.resetPassword.addEventListener("click", async () => {
    const email = $("#email").value.trim();
    if (!email || !$("#email").checkValidity()) {
      setMessage(elements.authMessage, "请先填写正确的邮箱地址。", true);
      $("#email").focus();
      return;
    }

    elements.resetPassword.disabled = true;
    setMessage(elements.authMessage, "正在发送密码设置邮件…");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${location.pathname}`,
    });
    elements.resetPassword.disabled = false;
    setMessage(
      elements.authMessage,
      error ? `发送失败：${error.message}` : "密码设置邮件已发送，请检查邮箱。",
      Boolean(error),
    );
  });

  elements.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (elements.newPassword.value !== elements.confirmPassword.value) {
      setMessage(elements.passwordMessage, "两次输入的密码不一致。", true);
      return;
    }

    setMessage(elements.passwordMessage, "正在保存…");
    const { error } = await supabase.auth.updateUser({ password: elements.newPassword.value });
    if (error) {
      setMessage(elements.passwordMessage, `保存失败：${error.message}`, true);
      return;
    }

    passwordRecovery = false;
    history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    elements.passwordForm.reset();
    const { data } = await supabase.auth.getSession();
    await renderSession(data.session);
    setMessage(elements.formMessage, "密码已设置。以后可以直接使用邮箱和密码登录。");
  });

  elements.recordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = selectedType();
    const isMedication = type === "inhaled" || type === "oral";
    const isElimination = type === "elimination";
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = "保存中…";
    setMessage(elements.formMessage, "");

    const payload = {
      occurred_at: new Date(elements.occurredAt.value).toISOString(),
      type,
      medicine: isMedication ? elements.medicine.value.trim() : null,
      dose_amount: isMedication ? Number(elements.doseAmount.value) : null,
      dose_unit: isMedication ? elements.doseUnit.value : null,
      frequency: isMedication ? elements.frequency.value : null,
      bowel_movement: isElimination ? elements.bowelMovement.value === "true" : null,
      urine_amount: isElimination ? Number(elements.urineAmount.value) : null,
      note: elements.note.value.trim() || null,
    };
    const { error } = await supabase.from("medication_records").insert(payload);

    elements.saveButton.disabled = false;
    elements.saveButton.textContent = "保存记录";
    if (error) {
      setMessage(elements.formMessage, `保存失败：${error.message}`, true);
      return;
    }

    elements.note.value = "";
    elements.bowelMovement.value = "false";
    elements.urineAmount.value = "1";
    elements.occurredAt.value = localDateTimeValue();
    updateFrequencyPreview();
    setMessage(elements.formMessage, "已保存");
    currentPage = 1;
    await loadRecords();
  });

  elements.refresh.addEventListener("click", loadRecords);
  elements.previousPage.addEventListener("click", () => {
    if (currentPage === 1) return;
    currentPage -= 1;
    renderRecordsPage();
  });
  elements.nextPage.addEventListener("click", () => {
    if (currentPage * PAGE_SIZE >= allRecords.length) return;
    currentPage += 1;
    renderRecordsPage();
  });
  elements.signOut.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") passwordRecovery = true;
    window.setTimeout(() => renderSession(session), 0);
  });
  const { data } = await supabase.auth.getSession();
  await renderSession(data.session);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
