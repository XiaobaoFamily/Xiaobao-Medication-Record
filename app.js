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
  frequencyDays: $("#frequency-days"),
  frequencyTimes: $("#frequency-times"),
  bowelMovement: $("#bowel-movement"),
  bowelMovementField: $("#bowel-movement-field"),
  urineAmount: $("#urine-amount"),
  urineAmountField: $("#urine-amount-field"),
  note: $("#note"),
  saveButton: $("#save-button"),
  viewSavedRecord: $("#view-saved-record"),
  syncState: $("#sync-state"),
  records: $("#records"),
  empty: $("#empty-state"),
  refresh: $("#refresh"),
  recordFilter: $("#record-filter"),
  pagination: $("#pagination"),
  previousPage: $("#previous-page"),
  nextPage: $("#next-page"),
  pageStatus: $("#page-status"),
  dashboardTab: $("#dashboard-tab"),
  recordTab: $("#record-tab"),
  medicalTab: $("#medical-tab"),
  medicalForm: $("#medical-form"),
  medicalOccurredOn: $("#medical-occurred-on"),
  medicalTitleLabel: $("#medical-title-label"),
  medicalTitle: $("#medical-title"),
  medicalDoseField: $("#medical-dose-field"),
  medicalDose: $("#medical-dose"),
  medicalFrequencyField: $("#medical-frequency-field"),
  medicalFrequencyDays: $("#medical-frequency-days"),
  medicalFrequencyTimes: $("#medical-frequency-times"),
  medicalNote: $("#medical-note"),
  medicalSaveButton: $("#medical-save-button"),
  medicalMessage: $("#medical-message"),
  medicalSyncState: $("#medical-sync-state"),
  medicalTimeline: $("#medical-timeline"),
  medicalEmpty: $("#medical-empty-state"),
  medicalRefresh: $("#medical-refresh"),
};

const PAGE_SIZE = 10;
const CHICAGO_TIME_ZONE = "America/Chicago";
const TAB_STORAGE_KEY = "xiaobao-active-tab";

const typeMeta = {
  inhaled: { label: "吸入药", icon: "吸", className: "inhaled" },
  oral: { label: "口服药", icon: "服", className: "oral" },
  behavior: { label: "小宝行为", icon: "记", className: "behavior" },
  brushing: { label: "刷牙", icon: "牙", className: "brushing" },
  elimination: { label: "排泄", icon: "排", className: "elimination" },
};

const medicalTypeMeta = {
  vaccine: { label: "疫苗", icon: "苗", titleLabel: "疫苗名称", placeholder: "例如：狂犬疫苗" },
  illness: { label: "疾病", icon: "病", titleLabel: "疾病或症状", placeholder: "例如：哮喘" },
  medication_change: { label: "用药调整", icon: "药", titleLabel: "药物名称", placeholder: "例如：Fluticasone" },
};

const medicationDefaults = {
  inhaled: { medicine: "Fluticasone", doseAmount: "110", doseUnit: "mcg", frequency: null },
  oral: { medicine: "Prednisolone", doseAmount: "2.5", doseUnit: "mg", frequency: null },
};
let medicationDefaultsHydrated = false;

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

function setActiveTab(tab, scrollToTop = true) {
  const activeTab = ["dashboard", "record", "medical"].includes(tab) ? tab : "record";
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    show(panel, panel.dataset.tabPanel === activeTab);
  });

  const dashboardActive = activeTab === "dashboard";
  const recordActive = activeTab === "record";
  const medicalActive = activeTab === "medical";
  elements.dashboardTab.classList.toggle("active", dashboardActive);
  elements.dashboardTab.setAttribute("aria-pressed", String(dashboardActive));
  elements.recordTab.classList.toggle("active", recordActive);
  elements.recordTab.setAttribute("aria-pressed", String(recordActive));
  elements.medicalTab.classList.toggle("active", medicalActive);
  elements.medicalTab.setAttribute("aria-pressed", String(medicalActive));

  try {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  } catch {
    // localStorage 不可用时，Tab 仍可在当前页面正常切换。
  }
  if (scrollToTop) window.scrollTo(0, 0);
}

function initialTab() {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) ?? "record";
  } catch {
    return "record";
  }
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function selectedType() {
  return new FormData(elements.recordForm).get("type");
}

function selectedMedicalType() {
  return new FormData(elements.medicalForm).get("medical_type");
}

function applyMedicalType(type) {
  const meta = medicalTypeMeta[type] ?? medicalTypeMeta.vaccine;
  const isMedicationChange = type === "medication_change";
  elements.medicalTitleLabel.textContent = meta.titleLabel;
  elements.medicalTitle.placeholder = meta.placeholder;
  show(elements.medicalDoseField, isMedicationChange);
  show(elements.medicalFrequencyField, isMedicationChange);
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
  if (type !== "inhaled" && type !== "oral") return null;
  if (type === "inhaled") return dateKey <= "2026-07-30" ? "每天2次" : "每天3次";
  return dateKey <= "2026-08-02" ? "每2天1次" : "每3天1次";
}

function validFrequencySchedule(days, times) {
  return Number.isInteger(days) && days >= 1 && Number.isInteger(times) && times >= 1;
}

function parseFrequency(frequency) {
  if (!frequency) return null;
  const dailyMatch = frequency.match(/^每天(\d+)次$/);
  if (dailyMatch) {
    const schedule = { days: 1, times: Number(dailyMatch[1]) };
    return validFrequencySchedule(schedule.days, schedule.times) ? schedule : null;
  }
  if (frequency === "隔天1次") return { days: 2, times: 1 };
  const intervalMatch = frequency.match(/^每(\d+)天(\d+)次$/);
  if (intervalMatch) {
    const schedule = { days: Number(intervalMatch[1]), times: Number(intervalMatch[2]) };
    return validFrequencySchedule(schedule.days, schedule.times) ? schedule : null;
  }
  return null;
}

function formatFrequency(days, times) {
  return days === 1 ? `每天${times}次` : `每${days}天${times}次`;
}

function syncFrequencyValue() {
  const days = Number(elements.frequencyDays.value);
  const times = Number(elements.frequencyTimes.value);
  elements.frequency.value = validFrequencySchedule(days, times)
    ? formatFrequency(days, times)
    : "";
}

function updateFrequencyPreview(preferredFrequency = null) {
  const type = selectedType();
  const dateKey = elements.occurredAt.value.slice(0, 10);
  const selectedFrequency =
    preferredFrequency ?? medicationDefaults[type]?.frequency ?? frequencyFor(type, dateKey);
  const parsed = parseFrequency(selectedFrequency) ?? { days: 1, times: 1 };
  elements.frequencyDays.value = String(parsed.days);
  elements.frequencyTimes.value = String(parsed.times);
  syncFrequencyValue();
}

function updateMedicationDefaults(rows) {
  for (const type of ["inhaled", "oral"]) {
    const latest = rows
      .filter((row) => row.type === type)
      .sort(
        (left, right) =>
          new Date(right.created_at) - new Date(left.created_at) ||
          new Date(right.occurred_at) - new Date(left.occurred_at),
      )[0];
    if (!latest) continue;
    medicationDefaults[type] = {
      medicine: latest.medicine,
      doseAmount: String(latest.dose_amount),
      doseUnit: latest.dose_unit,
      frequency: latest.frequency,
    };
  }
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
  elements.frequencyDays.required = isMedication;
  elements.frequencyTimes.required = isMedication;
  elements.bowelMovement.required = isElimination;
  elements.urineAmount.required = isElimination;

  if (isMedication) {
    const defaults = medicationDefaults[type];
    elements.medicine.value = defaults.medicine;
    elements.doseAmount.value = defaults.doseAmount;
    elements.doseUnit.value = defaults.doseUnit;
    updateFrequencyPreview(defaults.frequency);
  } else {
    elements.medicine.value = "";
    elements.doseAmount.value = "";
    updateFrequencyPreview();
  }
}

elements.occurredAt.value = localDateTimeValue();
elements.medicalOccurredOn.value = chicagoDateKey(new Date());
elements.recordForm?.addEventListener("change", (event) => {
  if (event.target.name === "type") applyTypeDefaults(event.target.value);
  if (event.target.name === "occurred_at") {
    updateFrequencyPreview(elements.frequency.value || medicationDefaults[selectedType()]?.frequency);
  }
});
elements.frequencyDays.addEventListener("input", syncFrequencyValue);
elements.frequencyTimes.addEventListener("input", syncFrequencyValue);
elements.medicalForm.addEventListener("change", (event) => {
  if (event.target.name === "medical_type") applyMedicalType(event.target.value);
});
applyTypeDefaults(selectedType());
applyMedicalType(selectedMedicalType());
setActiveTab(initialTab(), false);
elements.dashboardTab.addEventListener("click", () => setActiveTab("dashboard"));
elements.recordTab.addEventListener("click", () => setActiveTab("record"));
elements.medicalTab.addEventListener("click", () => setActiveTab("medical"));

if (!configured) {
  show(elements.setup, true);
} else {
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });
  let allRecords = [];
  let medicalHistory = [];
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
    if (signedIn && !settingPassword) {
      await Promise.all([loadRecords(), loadMedicalHistory()]);
    }
  }

  async function loadRecords() {
    elements.syncState.textContent = "同步中…";
    const [recentResult, todayResult, allTimeInhaledResult, allTimeOralResult] = await Promise.all([
      supabase
        .from("medication_records")
        .select("id, occurred_at, created_at, type, medicine, dose_amount, dose_unit, frequency, bowel_movement, urine_amount, note")
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
    updateMedicationDefaults(allRecords);
    if (!medicationDefaultsHydrated) {
      applyTypeDefaults(selectedType());
      medicationDefaultsHydrated = true;
    }
    renderRecordsPage();
    renderTotals(
      todayResult.data ?? [],
      allTimeInhaledResult.count ?? 0,
      allTimeOralResult.count ?? 0,
    );
    renderOralReminder(allRecords);
    renderEliminationSummary(allRecords);
    renderBrushingSummary(allRecords);
    elements.syncState.textContent = "已同步";
  }

  function medicalErrorMessage(action, error) {
    const tableMissing =
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /medical_history.*does not exist|could not find.*medical_history|schema cache/i.test(error.message ?? "");
    if (tableMissing) {
      return `${action}失败：请先在 Supabase SQL Editor 运行 supabase/add_medical_history.sql`;
    }
    return `${action}失败：${error.message}`;
  }

  async function loadMedicalHistory() {
    elements.medicalSyncState.textContent = "同步中…";
    const { data, error } = await supabase
      .from("medical_history")
      .select("id, occurred_on, event_type, title, dose, frequency, note, created_at")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      elements.medicalSyncState.textContent = "同步失败";
      setMessage(elements.medicalMessage, medicalErrorMessage("读取", error), true);
      medicalHistory = [];
      renderMedicalTimeline();
      return;
    }

    medicalHistory = data ?? [];
    renderMedicalTimeline();
    elements.medicalSyncState.textContent = "已同步";
  }

  function formatMedicalDate(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  }

  function renderMedicalTimeline() {
    elements.medicalTimeline.replaceChildren();
    show(elements.medicalEmpty, medicalHistory.length === 0);

    for (const row of medicalHistory) {
      const fragment = $("#medical-timeline-template").content.cloneNode(true);
      const meta = medicalTypeMeta[row.event_type] ?? medicalTypeMeta.illness;
      const article = fragment.querySelector("article");
      const marker = fragment.querySelector(".timeline-marker");
      const type = fragment.querySelector(".timeline-type");
      const time = fragment.querySelector("time");
      const title = fragment.querySelector(".timeline-title");
      const details = fragment.querySelector(".timeline-details");
      const note = fragment.querySelector(".timeline-note");
      const deleteButton = fragment.querySelector(".timeline-delete");

      article.dataset.eventType = row.event_type;
      marker.textContent = meta.icon;
      type.textContent = meta.label;
      time.dateTime = row.occurred_on;
      time.textContent = formatMedicalDate(row.occurred_on);
      title.textContent = row.title;

      const detailParts = [];
      if (row.dose) detailParts.push(`新剂量：${row.dose}`);
      if (row.frequency) {
        const schedule = parseFrequency(row.frequency);
        const frequency = schedule
          ? formatFrequency(schedule.days, schedule.times)
          : row.frequency;
        detailParts.push(`新频率：${frequency}`);
      }
      details.textContent = detailParts.join(" · ");
      show(details, detailParts.length > 0);
      note.textContent = row.note ?? "";
      show(note, Boolean(row.note));

      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("确定删除这条医疗记录吗？")) return;
        deleteButton.disabled = true;
        const { error } = await supabase.from("medical_history").delete().eq("id", row.id);
        if (error) {
          setMessage(elements.medicalMessage, medicalErrorMessage("删除", error), true);
          deleteButton.disabled = false;
          return;
        }
        await loadMedicalHistory();
        setMessage(elements.medicalMessage, "已删除");
      });

      elements.medicalTimeline.append(fragment);
    }
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
    const schedule = parseFrequency(frequency);
    const normalizedFrequency = schedule
      ? formatFrequency(schedule.days, schedule.times)
      : frequency;
    const todayOralCount = rows.filter(
      (row) => row.type === "oral" && chicagoDateKey(new Date(row.occurred_at)) === todayKey,
    ).length;

    if (lastDoseKey === todayKey) {
      if (schedule && todayOralCount < schedule.times) {
        card.dataset.status = "due";
        title.textContent = `今天还需口服 ${schedule.times - todayOralCount} 次`;
        detail.textContent = `当前频率：${normalizedFrequency} · 已完成 ${todayOralCount}/${schedule.times} 次`;
      } else {
        card.dataset.status = "complete";
        title.textContent = "今日已完成";
        detail.textContent = `当前频率：${normalizedFrequency}`;
      }
      return;
    }

    if (!schedule) {
      card.dataset.status = "neutral";
      title.textContent = "请确认今日安排";
      detail.textContent = `当前频率：${frequency}`;
      return;
    }

    const nextDoseKey = addCalendarDays(lastDoseKey, schedule.days);
    if (todayKey >= nextDoseKey) {
      card.dataset.status = "due";
      title.textContent = schedule.times === 1 ? "今天需要口服药" : `今天需要口服 ${schedule.times} 次`;
      detail.textContent = `当前频率：${normalizedFrequency} · 上次 ${formatDateKey(lastDoseKey)}`;
    } else {
      card.dataset.status = "upcoming";
      title.textContent = "今天不需要口服药";
      detail.textContent = `当前频率：${normalizedFrequency} · 下次预计 ${formatDateKey(nextDoseKey)}`;
    }
  }

  function formatEventTime(occurredAt) {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: CHICAGO_TIME_ZONE,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(occurredAt));
  }

  function renderEliminationSummary(rows) {
    const lastBowelMovement = rows.find(
      (row) => row.type === "elimination" && row.bowel_movement === true,
    );
    const lastUrination = rows.find(
      (row) => row.type === "elimination" && Number(row.urine_amount) > 0,
    );

    if (lastBowelMovement) {
      $("#last-bowel-movement").textContent = formatEventTime(lastBowelMovement.occurred_at);
      $("#last-bowel-detail").textContent = "最近一次有大便";
    } else {
      $("#last-bowel-movement").textContent = "暂无记录";
      $("#last-bowel-detail").textContent = "还没有记录过大便";
    }

    if (lastUrination) {
      $("#last-urine-amount").textContent = `${lastUrination.urine_amount} 团`;
      $("#last-urine-detail").textContent = formatEventTime(lastUrination.occurred_at);
    } else {
      $("#last-urine-amount").textContent = "暂无记录";
      $("#last-urine-detail").textContent = "还没有记录过小便";
    }
  }

  function calendarDaysBetween(startKey, endKey) {
    const toUtcTime = (dateKey) => {
      const [year, month, day] = dateKey.split("-").map(Number);
      return Date.UTC(year, month - 1, day);
    };
    return Math.floor((toUtcTime(endKey) - toUtcTime(startKey)) / 86_400_000);
  }

  function renderBrushingSummary(rows) {
    const card = $("#brushing-summary-card");
    const lastBrushing = rows.find((row) => row.type === "brushing");
    const todayKey = chicagoDateKey(new Date());
    const thirtyDayStartKey = addCalendarDays(todayKey, -29);
    const brushingCount = rows.filter((row) => {
      if (row.type !== "brushing") return false;
      const dateKey = chicagoDateKey(new Date(row.occurred_at));
      return dateKey >= thirtyDayStartKey && dateKey <= todayKey;
    }).length;

    $("#brushing-30-day-total").textContent = `近 30 天共 ${brushingCount} 次`;
    if (!lastBrushing) {
      card.dataset.status = "neutral";
      $("#last-brushing-time").textContent = "暂无记录";
      return;
    }

    const lastBrushingKey = chicagoDateKey(new Date(lastBrushing.occurred_at));
    const daysSinceBrushing = Math.max(0, calendarDaysBetween(lastBrushingKey, todayKey));
    $("#last-brushing-time").textContent = formatEventTime(lastBrushing.occurred_at);

    if (daysSinceBrushing <= 2) {
      card.dataset.status = "recent";
    } else if (daysSinceBrushing <= 4) {
      card.dataset.status = "warning";
    } else {
      card.dataset.status = "overdue";
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

  function filteredRecords() {
    const type = elements.recordFilter.value;
    return type === "all" ? allRecords : allRecords.filter((row) => row.type === type);
  }

  function renderRecordsPage() {
    const visibleRecords = filteredRecords();
    const totalPages = Math.max(1, Math.ceil(visibleRecords.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = visibleRecords.slice(start, start + PAGE_SIZE);
    elements.empty.textContent =
      elements.recordFilter.value === "all"
        ? "还没有记录。保存第一条事件后，它会出现在这里。"
        : "这个类型还没有记录。";
    renderRecords(pageRows, dailyOccurrenceNumbers(allRecords));

    show(elements.pagination, visibleRecords.length > PAGE_SIZE);
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
        dose.textContent = `当天第 ${occurrence} 次 · 大便：${bowelText} · 小便：${row.urine_amount} 团`;
      } else {
        const dateKey = chicagoDateKey(eventDate);
        const storedFrequency = row.frequency ?? frequencyFor(row.type, dateKey);
        const schedule = parseFrequency(storedFrequency);
        const frequency = schedule
          ? formatFrequency(schedule.days, schedule.times)
          : storedFrequency;
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

  function readMedicalFrequency() {
    const daysText = elements.medicalFrequencyDays.value.trim();
    const timesText = elements.medicalFrequencyTimes.value.trim();
    if (!daysText && !timesText) return { value: null, error: null };
    if (!daysText || !timesText) {
      return { value: null, error: "如需记录新频率，请同时填写天数和次数。" };
    }

    const days = Number(daysText);
    const times = Number(timesText);
    if (!validFrequencySchedule(days, times)) {
      return { value: null, error: "新频率的天数和次数必须是大于 0 的整数。" };
    }
    return { value: formatFrequency(days, times), error: null };
  }

  elements.medicalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const eventType = selectedMedicalType();
    const isMedicationChange = eventType === "medication_change";
    const dose = isMedicationChange ? elements.medicalDose.value.trim() || null : null;
    const frequencyResult = isMedicationChange
      ? readMedicalFrequency()
      : { value: null, error: null };

    if (frequencyResult.error) {
      setMessage(elements.medicalMessage, frequencyResult.error, true);
      return;
    }
    if (isMedicationChange && !dose && !frequencyResult.value) {
      setMessage(elements.medicalMessage, "用药调整至少要填写新剂量或新频率。", true);
      return;
    }

    elements.medicalSaveButton.disabled = true;
    elements.medicalSaveButton.textContent = "保存中…";
    setMessage(elements.medicalMessage, "");

    const payload = {
      occurred_on: elements.medicalOccurredOn.value,
      event_type: eventType,
      title: elements.medicalTitle.value.trim(),
      dose,
      frequency: frequencyResult.value,
      note: elements.medicalNote.value.trim() || null,
    };
    const { error } = await supabase.from("medical_history").insert(payload);

    elements.medicalSaveButton.disabled = false;
    elements.medicalSaveButton.textContent = "保存医疗记录";
    if (error) {
      setMessage(elements.medicalMessage, medicalErrorMessage("保存", error), true);
      return;
    }

    elements.medicalTitle.value = "";
    elements.medicalDose.value = "";
    elements.medicalFrequencyDays.value = "";
    elements.medicalFrequencyTimes.value = "";
    elements.medicalNote.value = "";
    elements.medicalOccurredOn.value = chicagoDateKey(new Date());
    await loadMedicalHistory();
    setMessage(elements.medicalMessage, "已保存到医疗时间轴");
  });

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
    show(elements.viewSavedRecord, false);
    setMessage(elements.formMessage, "");
    if (isMedication) syncFrequencyValue();

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
    if (isMedication) {
      medicationDefaults[type] = {
        medicine: payload.medicine,
        doseAmount: String(payload.dose_amount),
        doseUnit: payload.dose_unit,
        frequency: payload.frequency,
      };
    }
    applyTypeDefaults(type);
    setMessage(elements.formMessage, "已保存");
    currentPage = 1;
    await loadRecords();
    show(elements.viewSavedRecord, true);
  });

  elements.refresh.addEventListener("click", loadRecords);
  elements.medicalRefresh.addEventListener("click", loadMedicalHistory);
  elements.recordFilter.addEventListener("change", () => {
    currentPage = 1;
    renderRecordsPage();
  });
  elements.viewSavedRecord.addEventListener("click", () => {
    elements.recordFilter.value = "all";
    currentPage = 1;
    renderRecordsPage();
    setActiveTab("dashboard");
  });
  elements.previousPage.addEventListener("click", () => {
    if (currentPage === 1) return;
    currentPage -= 1;
    renderRecordsPage();
  });
  elements.nextPage.addEventListener("click", () => {
    if (currentPage * PAGE_SIZE >= filteredRecords().length) return;
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
