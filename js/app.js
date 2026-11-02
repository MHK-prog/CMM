(function cmmApp() {
  "use strict";

  const STORAGE_KEY = "cmm_report_card_workspace_v1";
  const SCORE_FIELDS = [
    { key: "classActivity", label: "فعالیت کلاسی", max: 40, sourceIndex: 0 },
    { key: "speaking", label: "Speaking", max: 20, sourceIndex: 1 },
    { key: "reading", label: "Reading", max: 20, sourceIndex: 2 },
    { key: "homework", label: "Homework", max: 20, sourceIndex: 3 },
    { key: "midterm", label: "میان‌ترم / Midterm", max: 40, sourceIndex: 4 },
    { key: "discipline", label: "انضباط / Discipline", max: 10, sourceIndex: 5 },
    { key: "listening", label: "Listening", max: 10, sourceIndex: 6 },
    { key: "vocabulary", label: "Vocabulary", max: 10, sourceIndex: 7 },
    { key: "spelling", label: "Spelling", max: 10, sourceIndex: 8 },
    { key: "grammar", label: "Grammar", max: 10, sourceIndex: 9 },
    { key: "writing", label: "Writing", max: 10, sourceIndex: 10 }
  ];
  const DIGITS = { "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9","٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9","٫":".","،":"." };

  let classes = [];
  let selectedClassId = "";

  const $ = id => document.getElementById(id);
  const fileInput = $("importFile");
  const classPicker = $("classPicker");
  const studentsRoot = $("studentList");
  const statusMessage = $("statusMessage");

  function normalizeDigits(value) {
    return String(value == null ? "" : value).replace(/[۰-۹٠-٩٫،]/g, char => DIGITS[char] || char).trim();
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "object" && value.score !== undefined) value = value.score;
    const normalized = normalizeDigits(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function textOrEmpty(value) {
    return String(value == null ? "" : value).trim();
  }

  function mapBackupStudent(student, index) {
    const reportCard = student.reportCard || {};
    const oldScores = Array.isArray(reportCard.scores) ? reportCard.scores : [];
    const directScores = student.teacherScores || {};
    const teacherFields = new Set(["classActivity", "midterm", "discipline"]);
    const scores = {};
    SCORE_FIELDS.forEach(field => {
      if (!teacherFields.has(field.key)) {
        scores[field.key] = null;
        return;
      }
      const imported = directScores[field.key];
      const candidate = imported !== undefined
        ? imported
        : oldScores[field.sourceIndex] !== undefined
          ? oldScores[field.sourceIndex]
          : student.scores && student.scores[field.key];
      scores[field.key] = numberOrNull(candidate);
    });

    return {
      id: String(student.id || "student-" + (index + 1)),
      name: textOrEmpty(student.fullName || student.name),
      father: textOrEmpty(student.fatherName || student.father || student.parentName),
      nationalId: textOrEmpty(student.nationalId || student.nationalCode || student.idCode),
      scores: scores
    };
  }

  function normalizeClass(source, index) {
    const students = Array.isArray(source.students) ? source.students : [];
    return {
      id: String(source.id || "class-" + (index + 1)),
      name: textOrEmpty(source.name || source.className) || "کلاس " + (index + 1),
      sessionNumber: textOrEmpty(source.sessionNumber || source.session?.sessionNo || source.session?.number) || "—",
      dateJalali: textOrEmpty(source.dateJalali || source.session?.dateJalali) || "—",
      students: students.map(mapBackupStudent)
    };
  }

  function normalizeInput(data) {
    if (data && data.format === "cmm-grade-import" && data.class && Array.isArray(data.students)) {
      return [normalizeClass({
        id: data.class.id,
        name: data.class.name,
        sessionNumber: data.class.sessionNumber,
        dateJalali: data.class.dateJalali,
        students: data.students
      }, 0)];
    }
    if (data && Array.isArray(data.classes)) return data.classes.map(normalizeClass);
    if (data && data.class && Array.isArray(data.students)) {
      return [normalizeClass({
        id: data.class.id,
        name: data.class.name,
        sessionNumber: data.class.sessionNumber || data.class.sessionNo,
        dateJalali: data.class.dateJalali,
        students: data.students
      }, 0)];
    }
    if (data && Array.isArray(data.students)) return [normalizeClass(data, 0)];
    throw new Error("این فایل ساختار JSON قابل‌پشتیبانی ندارد.");
  }

  function currentClass() {
    return classes.find(classItem => String(classItem.id) === String(selectedClassId)) || null;
  }

  function setStatus(message, kind) {
    statusMessage.textContent = message;
    statusMessage.dataset.kind = kind || "info";
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ classes, selectedClassId }));
      return true;
    } catch (error) {
      setStatus("ذخیرهٔ محلی انجام نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.", "error");
      return false;
    }
  }

  function loadLocal() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!stored || !Array.isArray(stored.classes)) return false;
      classes = stored.classes;
      selectedClassId = stored.selectedClassId || classes[0]?.id || "";
      return true;
    } catch (error) {
      return false;
    }
  }

  function completionCount(student) {
    let filled = 0;
    if (textOrEmpty(student.name)) filled += 1;
    if (textOrEmpty(student.father)) filled += 1;
    if (textOrEmpty(student.nationalId)) filled += 1;
    SCORE_FIELDS.forEach(field => {
      const score = numberOrNull(student.scores[field.key]);
      if (score !== null && score >= 0 && score <= field.max) filled += 1;
    });
    return filled;
  }

  function totalRequiredFields() {
    return SCORE_FIELDS.length + 3;
  }

  function updateCompletionUi() {
    const cls = currentClass();
    if (!cls) return;
    const completed = cls.students.filter(student => completionCount(student) === totalRequiredFields()).length;
    $("summaryProgress").textContent = completed + " از " + cls.students.length;
    $("downloadZipButton").disabled = cls.students.length === 0;
    cls.students.forEach((student, index) => {
      const summary = studentsRoot.querySelector('[data-summary-index="' + index + '"]');
      if (!summary) return;
      summary.textContent = completionCount(student) + " از " + totalRequiredFields() + " مورد";
      const name = studentsRoot.querySelector('[data-summary-name="' + index + '"]');
      if (name) name.textContent = student.name || "زبان‌آموز بدون نام";
    });
  }

  function addIdentityField(container, student, index, field, label, placeholder) {
    const wrapper = document.createElement("label");
    wrapper.className = "form-field";
    wrapper.appendChild(document.createTextNode(label));
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = placeholder || "";
    input.value = student[field] || "";
    input.dataset.studentIndex = String(index);
    input.dataset.identityField = field;
    input.classList.toggle("invalid", !textOrEmpty(input.value));
    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }

  function addScoreField(container, student, index, field) {
    const wrapper = document.createElement("label");
    wrapper.className = "score-field";
    const text = document.createElement("span");
    text.className = "score-label";
    text.appendChild(document.createTextNode(field.label));
    const max = document.createElement("small");
    max.textContent = "از " + field.max;
    text.appendChild(max);

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.min = "0";
    input.max = String(field.max);
    input.step = "0.5";
    input.placeholder = "۰ تا " + field.max;
    input.value = student.scores[field.key] == null ? "" : String(student.scores[field.key]);
    input.dataset.studentIndex = String(index);
    input.dataset.scoreKey = field.key;
    input.classList.toggle("invalid", !isValidScore(input.value, field.max));
    wrapper.append(text, input);
    container.appendChild(wrapper);
  }

  function isValidScore(value, max) {
    const number = numberOrNull(value);
    return number !== null && number >= 0 && number <= max;
  }

  function renderStudents() {
    const cls = currentClass();
    studentsRoot.replaceChildren();
    if (!cls) {
      $("emptyState").hidden = false;
      $("summaryRow").hidden = true;
      classPicker.disabled = true;
      $("downloadZipButton").disabled = true;
      return;
    }

    $("emptyState").hidden = true;
    $("summaryRow").hidden = false;
    classPicker.disabled = classes.length < 2;
    $("summaryClass").textContent = cls.name;
    $("summarySession").textContent = cls.sessionNumber + " · " + cls.dateJalali;

    cls.students.forEach((student, index) => {
      const details = document.createElement("details");
      details.className = "student-panel";
      details.open = index === 0;
      const summary = document.createElement("summary");
      const number = document.createElement("span");
      number.className = "student-number";
      number.textContent = String(index + 1);
      const name = document.createElement("span");
      name.className = "student-summary-name";
      name.dataset.summaryName = String(index);
      name.textContent = student.name || "زبان‌آموز بدون نام";
      const progress = document.createElement("span");
      progress.className = "student-progress";
      progress.dataset.summaryIndex = String(index);
      progress.textContent = completionCount(student) + " از " + totalRequiredFields() + " مورد";
      summary.append(number, name, progress);
      details.appendChild(summary);

      const editor = document.createElement("div");
      editor.className = "student-editor";
      const identitySection = document.createElement("section");
      identitySection.className = "form-section";
      const identityTitle = document.createElement("h3");
      identityTitle.textContent = "مشخصات زبان‌آموز";
      identitySection.appendChild(identityTitle);
      const identityGrid = document.createElement("div");
      identityGrid.className = "identity-grid";
      addIdentityField(identityGrid, student, index, "name", "نام و نام خانوادگی", "نام زبان‌آموز");
      addIdentityField(identityGrid, student, index, "father", "نام پدر", "نام پدر");
      addIdentityField(identityGrid, student, index, "nationalId", "کد ملی", "کد ملی");
      identitySection.appendChild(identityGrid);

      const scoresSection = document.createElement("section");
      scoresSection.className = "form-section";
      const scoresTitle = document.createElement("h3");
      scoresTitle.textContent = "نمرات کارنامه";
      scoresSection.appendChild(scoresTitle);
      const scoresGrid = document.createElement("div");
      scoresGrid.className = "score-grid";
      SCORE_FIELDS.forEach(field => addScoreField(scoresGrid, student, index, field));
      scoresSection.appendChild(scoresGrid);
      editor.append(identitySection, scoresSection);
      details.appendChild(editor);
      studentsRoot.appendChild(details);
    });

    updateCompletionUi();
  }

  function renderClassPicker() {
    classPicker.replaceChildren();
    classes.forEach(classItem => {
      const option = new Option(classItem.name, classItem.id, false, String(classItem.id) === String(selectedClassId));
      classPicker.appendChild(option);
    });
    if (!classes.length) {
      classPicker.appendChild(new Option("ابتدا فایل JSON را وارد کنید", ""));
      classPicker.disabled = true;
    }
    renderStudents();
  }

  function importFile(file) {
    if (!file) return;
    file.text().then(text => {
      const parsed = JSON.parse(text);
      const loadedClasses = normalizeInput(parsed);
      if (!loadedClasses.length) throw new Error("در فایل، کلاسی پیدا نشد.");
      classes = loadedClasses;
      selectedClassId = classes[0].id;
      const persisted = saveLocal();
      renderClassPicker();
      setStatus(classes.length + " کلاس و " + classes.reduce((count, cls) => count + cls.students.length, 0) + " زبان‌آموز وارد شد. " + (persisted ? "اطلاعات را تکمیل کنید." : "این صفحه را نبندید؛ ذخیرهٔ خودکار مرورگر فعال نیست."), persisted ? "success" : "error");
    }).catch(error => {
      setStatus(error.message || "خواندن فایل ناموفق بود.", "error");
    }).finally(() => {
      fileInput.value = "";
    });
  }

  function safeFilePart(value) {
    return String(value || "student")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 64) || "student";
  }

  function validateStudent(student) {
    const missing = [];
    if (!textOrEmpty(student.name)) missing.push("نام");
    if (!textOrEmpty(student.father)) missing.push("نام پدر");
    if (!textOrEmpty(student.nationalId)) missing.push("کد ملی");
    SCORE_FIELDS.forEach(field => {
      if (!isValidScore(student.scores[field.key], field.max)) missing.push(field.label);
    });
    return missing;
  }

  function reportDataFor(cls, student) {
    const scores = {};
    SCORE_FIELDS.forEach(field => {
      scores[field.key] = numberOrNull(student.scores[field.key]);
    });
    return {
      className: cls.name,
      sessionNumber: cls.sessionNumber,
      dateJalali: cls.dateJalali,
      student: { name: student.name, father: student.father, nationalId: student.nationalId },
      scores: scores
    };
  }

  function reportHtml(data) {
    const safeData = JSON.stringify(data)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const styles = $("reportStyleTemplate").innerHTML;
    const markup = $("reportMarkupTemplate").innerHTML.replace("__REPORT_DATA__", safeData);
    const title = "کارنامه - " + escapeHtml(data.student.name);
    return "<!doctype html><html lang=\"fa\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + title + "</title>" + styles + "</head><body data-theme=\"violet\">" + markup + "</body></html>";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let crc = n;
      for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      table[n] = crc >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipHeader(size, nameLength, crc, time, date, offset, central) {
    const header = new Uint8Array((central ? 46 : 30) + nameLength);
    const view = new DataView(header.buffer);
    if (central) {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, time, true);
      view.setUint16(14, date, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, size, true);
      view.setUint32(24, size, true);
      view.setUint16(28, nameLength, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, offset, true);
    } else {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, time, true);
      view.setUint16(12, date, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, size, true);
      view.setUint32(22, size, true);
      view.setUint16(26, nameLength, true);
      view.setUint16(28, 0, true);
    }
    return header;
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    let offset = 0;

    files.forEach(file => {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const checksum = crc32(data);
      const local = zipHeader(data.length, name.length, checksum, dosTime, dosDate, 0, false);
      local.set(name, 30);
      localParts.push(local, data);
      const central = zipHeader(data.length, name.length, checksum, dosTime, dosDate, offset, true);
      central.set(name, 46);
      centralParts.push(central);
      offset += local.length + data.length;
    });

    const directorySize = centralParts.reduce((total, part) => total + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, directorySize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  function downloadZip() {
    const cls = currentClass();
    if (!cls || !cls.students.length) return;
    const invalid = cls.students.map((student, index) => ({ student, index, missing: validateStudent(student) })).filter(item => item.missing.length);
    if (invalid.length) {
      const first = invalid.slice(0, 3).map(item => (item.student.name || "زبان‌آموز " + (item.index + 1)) + " (" + item.missing.join("، ") + ")");
      setStatus("برای ساخت ZIP، همهٔ مشخصات و نمره‌ها را کامل کنید: " + first.join("؛ ") + (invalid.length > 3 ? "؛ و " + (invalid.length - 3) + " نفر دیگر" : ""), "error");
      return;
    }

    try {
      const files = cls.students.map((student, index) => ({
        name: String(index + 1).padStart(2, "0") + "-" + safeFilePart(student.name) + ".html",
        content: reportHtml(reportDataFor(cls, student))
      }));
      const zip = createZip(files);
      download(zip, "CMM-" + safeFilePart(cls.name) + "-report-cards.zip");
      setStatus(files.length + " فایل HTML در ZIP آماده شد.", "success");
    } catch (error) {
      console.error(error);
      setStatus("ساخت ZIP انجام نشد؛ دوباره تلاش کنید.", "error");
    }
  }

  function handleInput(event) {
    const input = event.target;
    const index = Number(input.dataset.studentIndex);
    const cls = currentClass();
    const student = cls?.students[index];
    if (!student) return;

    if (input.dataset.identityField) {
      student[input.dataset.identityField] = input.value;
      input.classList.toggle("invalid", !textOrEmpty(input.value));
    } else if (input.dataset.scoreKey) {
      const field = SCORE_FIELDS.find(item => item.key === input.dataset.scoreKey);
      if (!field) return;
      student.scores[field.key] = input.value === "" ? null : input.value;
      input.classList.toggle("invalid", !isValidScore(input.value, field.max));
    } else {
      return;
    }

    saveLocal();
    updateCompletionUi();
  }

  $("chooseFileButton").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", event => importFile(event.target.files?.[0]));
  classPicker.addEventListener("change", () => {
    selectedClassId = classPicker.value;
    saveLocal();
    renderStudents();
  });
  studentsRoot.addEventListener("input", handleInput);
  $("downloadZipButton").addEventListener("click", downloadZip);

  if (loadLocal()) {
    renderClassPicker();
    setStatus("اطلاعات ذخیره‌شدهٔ این مرورگر بارگذاری شد. می‌توانید ادامه دهید یا فایل تازه‌ای وارد کنید.", "success");
  } else {
    renderClassPicker();
  }
})();
