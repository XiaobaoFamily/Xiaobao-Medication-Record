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
  authMessage: $("#auth-message"),
  recordForm: $("#record-form"),
  formMessage: $("#form-message"),
  occurredAt: $("#occurred-at"),
  medicine: $("#medicine"),
  medicineField: $("#medicine-field"),
  doseField: $("#dose-field"),
  doseAmount: $("#dose-amount"),
  doseUnit: $("#dose-unit"),
  note: $("#note"),
  saveButton: $("#save-button"),
  syncState: $("#sync-state"),
  records: $("#records"),
  empty: $("#empty-state"),
  refresh: $("#refresh"),
};

const typeMeta = {
  inhaled: { label: "吸入药", icon: "吸", className: "inhaled" },
  oral: { label: "口服药", icon: "服", className: "oral" },
  behavior: { label: "小宝行为", icon: "记", className: "behavior" },
};

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

function applyTypeDefaults(type) {
  const isBehavior = type === "behavior";
  show(elements.medicineField, !isBehavior);
  show(elements.doseField, !isBehavior);
  elements.medicine.required = !isBehavior;
  elements.doseAmount.required = !isBehavior;

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
}

elements.occurredAt.value = localDateTimeValue();
elements.recordForm?.addEventListener("change", (event) => {
  if (event.target.name === "type") applyTypeDefaults(event.target.value);
});

if (!configured) {
  show(elements.setup, true);
} else {
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true },
  });

  async function renderSession(session) {
    const signedIn = Boolean(session);
    show(elements.auth, !signedIn);
    show(elements.app, signedIn);
    show(elements.signOut, signedIn);
    if (signedIn) await loadRecords();
  }

  async function loadRecords() {
    elements.syncState.textContent = "同步中…";
    const [recentResult, todayResult] = await Promise.all([
      supabase
        .from("medication_records")
        .select("id, occurred_at, type, medicine, dose_amount, dose_unit, note")
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase
        .from("medication_records")
        .select("type")
        .gte("occurred_at", startOfTodayIso()),
    ]);

    const error = recentResult.error ?? todayResult.error;
    if (error) {
      elements.syncState.textContent = "同步失败";
      setMessage(elements.formMessage, `读取失败：${error.message}`, true);
      return;
    }

    renderRecords(recentResult.data ?? []);
    renderTotals(todayResult.data ?? []);
    elements.syncState.textContent = "已同步";
  }

  function renderTotals(rows) {
    const counts = rows.reduce(
      (result, row) => ({ ...result, [row.type]: result[row.type] + 1 }),
      { inhaled: 0, oral: 0, behavior: 0 },
    );
    $("#medicine-total").textContent = counts.inhaled + counts.oral;
    $("#inhaled-total").textContent = counts.inhaled;
    $("#oral-total").textContent = counts.oral;
    $("#behavior-total").textContent = counts.behavior;
  }

  function renderRecords(rows) {
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
      title.textContent = row.type === "behavior" ? meta.label : row.medicine;
      const eventDate = new Date(row.occurred_at);
      time.dateTime = row.occurred_at;
      time.textContent = new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(eventDate);

      dose.textContent = row.type === "behavior" ? "行为记录" : `${meta.label} · ${Number(row.dose_amount)} ${row.dose_unit}`;
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
    const email = new FormData(elements.loginForm).get("email");
    setMessage(elements.authMessage, "正在发送…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` },
    });
    setMessage(
      elements.authMessage,
      error ? `发送失败：${error.message}` : "登录链接已发送，请检查邮箱。",
      Boolean(error),
    );
  });

  elements.recordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = selectedType();
    const isBehavior = type === "behavior";
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = "保存中…";
    setMessage(elements.formMessage, "");

    const payload = {
      occurred_at: new Date(elements.occurredAt.value).toISOString(),
      type,
      medicine: isBehavior ? null : elements.medicine.value.trim(),
      dose_amount: isBehavior ? null : Number(elements.doseAmount.value),
      dose_unit: isBehavior ? null : elements.doseUnit.value,
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
    elements.occurredAt.value = localDateTimeValue();
    setMessage(elements.formMessage, "已保存");
    await loadRecords();
  });

  elements.refresh.addEventListener("click", loadRecords);
  elements.signOut.addEventListener("click", async () => {
    await supabase.auth.signOut();
  });

  const { data } = await supabase.auth.getSession();
  await renderSession(data.session);
  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => renderSession(session), 0);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
