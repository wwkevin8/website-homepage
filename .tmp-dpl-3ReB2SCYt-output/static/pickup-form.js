(function () {
  const AIRPORT_CODE_MAP = [
    { keywords: ["heathrow", "lhr"], code: "LHR", name: "Heathrow" },
    { keywords: ["gatwick", "lgw"], code: "LGW", name: "Gatwick" },
    { keywords: ["manchester", "man"], code: "MAN", name: "Manchester" },
    { keywords: ["luton", "ltn"], code: "LTN", name: "Luton" },
    { keywords: ["london city", "city airport", "lcy"], code: "LCY", name: "London City" },
    { keywords: ["birmingham", "bhx"], code: "BHX", name: "Birmingham" },
    { keywords: ["stansted", "stn"], code: "STN", name: "Stansted" }
  ];

  const LUGGAGE_COUNTS = [2, 2, 3, 3, 4, 0];
  const CUSTOMER_SERVICE_QR_SRC = "./img/pickup-service-qr.jpg";

  function $(selector) {
    return document.querySelector(selector);
  }

  function resolveApiUrl(path) {
    if (window.location.protocol === "file:") {
      return `http://localhost:3000${path}`;
    }
    return path;
  }

  function getCheckedValue(form, name) {
    return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
  }

  function getCheckedLabel(form, name) {
    const input = form.querySelector(`input[name="${name}"]:checked`);
    return input?.parentElement?.textContent?.trim() || "";
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }

  function getLondonDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
      if (part.type !== "literal") {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second)
    };
  }

  function toDateInputValue(parts) {
    return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }

  function toDateTimeLocalValue(parts) {
    return `${toDateInputValue(parts)}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  }

  function addLondonDays(parts, daysToAdd) {
    const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + daysToAdd, parts.hour, parts.minute, parts.second));
    return getLondonDateParts(utcDate);
  }

  function applyTimeConstraints(form) {
    const nowParts = getLondonDateParts();
    const nextMinuteParts = addLondonDays(nowParts, 0);
    nextMinuteParts.second = 0;

    if (nowParts.second > 0) {
      nextMinuteParts.minute += 1;
      if (nextMinuteParts.minute >= 60) {
        nextMinuteParts.minute = 0;
        nextMinuteParts.hour += 1;
        if (nextMinuteParts.hour >= 24) {
          const nextDay = addLondonDays(nowParts, 1);
          nextMinuteParts.year = nextDay.year;
          nextMinuteParts.month = nextDay.month;
          nextMinuteParts.day = nextDay.day;
          nextMinuteParts.hour = 0;
          nextMinuteParts.minute = 0;
        }
      }
    }

    const dateTimeMin = toDateTimeLocalValue(nextMinuteParts);
    const tomorrowParts = addLondonDays(nowParts, 1);
    const deadlineMin = toDateInputValue(tomorrowParts);

    if (form.elements.flight_datetime) {
      form.elements.flight_datetime.min = dateTimeMin;
    }
    if (form.elements.preferred_time) {
      form.elements.preferred_time.min = dateTimeMin;
    }
    if (form.elements.deadline_date) {
      form.elements.deadline_date.min = deadlineMin;
    }

    return {
      dateTimeMin,
      deadlineMin
    };
  }

  function validateTimeFields(form, constraints) {
    const flightField = form.elements.flight_datetime;
    const preferredField = form.elements.preferred_time;
    const deadlineField = form.elements.deadline_date;

    if (flightField) {
      const invalidFlight = flightField.value && constraints.dateTimeMin && flightField.value < constraints.dateTimeMin;
      flightField.setCustomValidity(invalidFlight ? "抵达/起飞日期和时间必须晚于当前英国时间。" : "");
    }

    if (preferredField) {
      const invalidPreferred = preferredField.value && constraints.dateTimeMin && preferredField.value < constraints.dateTimeMin;
      preferredField.setCustomValidity(invalidPreferred ? "接送期望时间段必须晚于当前英国时间。" : "");
    }

    if (deadlineField) {
      const invalidDeadline = deadlineField.value && constraints.deadlineMin && deadlineField.value < constraints.deadlineMin;
      deadlineField.setCustomValidity(invalidDeadline ? "拼车截止日期必须晚于今天，至少从明天开始。" : "");
    }
  }

  function matchAirportCode(rawValue) {
    const normalized = String(rawValue || "").trim().toLowerCase();
    const matched = AIRPORT_CODE_MAP.find(item => item.keywords.some(keyword => normalized.includes(keyword)));
    if (matched) {
      return matched;
    }
    return {
      code: "OTHER",
      name: String(rawValue || "").trim() || "其他机场"
    };
  }

  function getLuggageSelections(form) {
    return Array.from(form.querySelectorAll('input[name="luggage_option"]:checked'));
  }

  function getLuggageCount(selections) {
    return selections.reduce((sum, input) => {
      const count = Number.parseInt(input.dataset.luggageCount || "", 10);
      return sum + (Number.isNaN(count) ? 0 : count);
    }, 0);
  }

  function syncLuggageState(form, hintNode, otherField) {
    const selections = getLuggageSelections(form);
    const hasOther = selections.some(input => input.value === "other");
    hintNode.textContent = `已选择 ${selections.length} 项，最多 1 项。`;

    otherField.hidden = !hasOther;
    const otherInput = otherField.querySelector("input");
    if (otherInput) {
      otherInput.required = hasOther;
      if (!hasOther) {
        otherInput.value = "";
      }
    }
  }

  function buildSummary(data) {
    return [
      "拼车表单摘要",
      `姓名: ${data.student_name}`,
      `微信号: ${data.wechat || "-"}`,
      `联系电话: ${data.phone}`,
      `服务类型: ${data.service_mode_label}`,
      `机场: ${data.airport_name}`,
      `航站楼: ${data.terminal}`,
      `航班号: ${data.flight_no}`,
      `航班时间: ${formatDateTime(data.flight_datetime)}`,
      `期望时间: ${formatDateTime(data.preferred_time)}`,
      `拼车价位: ${data.share_goal_label}`,
      `同行人数: ${data.passenger_count_label}`,
      `截止日期: ${data.deadline_date || "-"}`,
      `行李: ${data.luggage_text}`,
      `地址: ${data.nottingham_address}`,
      `拼车失败是否接受其他方案: ${data.fallback_accept}`,
      `备注: ${data.notes_extra || "-"}`
    ].join("\n");
  }

  function generateReferenceNumber() {
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return String(100000000 + (values[0] % 900000000));
    }
    return String(100000000 + Math.floor(Math.random() * 900000000));
  }

  function renderSummary(node, text, options = {}) {
    const pre = document.createElement("pre");
    pre.className = "carpool-summary-pre";
    pre.textContent = text;
    node.innerHTML = "";
    node.appendChild(pre);

    if (options.referenceNumber || options.groupId || options.status) {
      const emphasis = document.createElement("div");
      emphasis.className = "carpool-summary-emphasis";
      const statusLabel = options.status === "error" ? "提交失败" : "提交成功";
      const statusCopy = options.status === "error"
        ? "请检查上面的失败原因后重新提交。"
        : "邮件已通知，请尽快联系客服，并把姓名、Group ID、订单编号发给客服审核。";
      const qrBlock = options.status === "success"
        ? `
          <div class="carpool-summary-qr">
            <img src="${CUSTOMER_SERVICE_QR_SRC}" alt="接机客服二维码">
            <p>请立即扫码联系客服。未加客服并完成审核，这单无效。</p>
            <p>客服微信号：Nottsngn</p>
          </div>
        `
        : "";
      emphasis.innerHTML = `
        <p class="carpool-summary-emphasis-label">${statusLabel}</p>
        ${options.referenceNumber ? `<p class="carpool-summary-emphasis-number">${options.referenceNumber}</p>` : ""}
        ${options.groupId ? `<p class="carpool-summary-emphasis-group">Group ID: ${options.groupId}</p>` : ""}
        ${qrBlock}
        <p class="carpool-summary-emphasis-copy">${statusCopy}</p>
      `;
      node.appendChild(emphasis);
    }
  }

  function setMessage(node, text, type) {
    node.textContent = text;
    node.className = "carpool-submit-message";
    if (type === "success") {
      node.classList.add("is-success");
    }
    if (type === "error") {
      node.classList.add("is-error");
    }
  }

  async function submitPayload(payload) {
    let response;
    try {
      response = await fetch(resolveApiUrl("/api/public/transport-request-submit"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (window.location.protocol === "file:") {
        throw new Error("本地预览请先运行 npm run dev，再刷新当前页面。");
      }
      throw error;
    }

    const result = await response.json().catch(() => ({
      data: null,
      error: { message: "服务器返回了无效数据。" }
    }));

    if (!response.ok) {
      throw new Error(result.error?.message || "提交失败。");
    }

    return result.data;
  }

  function focusFirstInvalidField(form) {
    const firstInvalid = form.querySelector(":invalid");
    if (!firstInvalid) {
      return;
    }

    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      firstInvalid.focus();
      if (typeof firstInvalid.reportValidity === "function") {
        firstInvalid.reportValidity();
      }
    }, 120);
  }

  function fillFieldIfEmpty(field, value) {
    if (!field) {
      return;
    }

    if (String(field.value || "").trim()) {
      return;
    }

    const normalized = String(value || "").trim();
    if (!normalized) {
      return;
    }

    field.value = normalized;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function lockField(field) {
    if (!field) {
      return;
    }

    field.readOnly = true;
    field.setAttribute("aria-readonly", "true");
    field.dataset.lockedByProfile = "true";
  }

  function ensureSummaryModalElements() {
    let modal = document.querySelector("#carpoolSummaryModal");
    if (!modal) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `
        <div class="carpool-summary-modal" id="carpoolSummaryModal" hidden>
          <div class="carpool-summary-modal-backdrop" data-carpool-summary-close></div>
          <div class="carpool-summary-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="carpoolSummaryModalTitle">
            <button class="carpool-summary-modal-close" id="carpoolSummaryModalClose" type="button" aria-label="关闭提交摘要弹窗">×</button>
            <p class="carpool-eyebrow">提交摘要</p>
            <h2 id="carpoolSummaryModalTitle" style="margin:0 0 12px;font-size:30px;color:#143b8b;">提交结果与客服信息</h2>
            <p class="carpool-summary-text">提交后请保存这份摘要，并按弹窗里的提示尽快联系客服。</p>
            <div class="carpool-summary-box carpool-summary-box-modal" id="carpoolSummaryModalBox">
              <p class="carpool-summary-placeholder">暂未生成摘要。</p>
            </div>
            <div class="carpool-summary-actions">
              <button class="button button-secondary" type="button" id="copyCarpoolSummaryModal" disabled>复制摘要</button>
              <button class="button button-primary" type="button" data-carpool-summary-close>我知道了</button>
            </div>
          </div>
        </div>
      `;
      modal = wrapper.firstElementChild;
      document.body.appendChild(modal);
    }

    return {
      modal,
      box: modal.querySelector("#carpoolSummaryModalBox"),
      close: modal.querySelector("#carpoolSummaryModalClose"),
      copy: modal.querySelector("#copyCarpoolSummaryModal")
    };
  }

  async function hydrateLoggedInUser(form, messageNode) {
    if (!window.SiteAuth || typeof window.SiteAuth.getSession !== "function") {
      return;
    }

    try {
      const session = await window.SiteAuth.getSession();
      if (!session || !session.authenticated || !session.user) {
        return;
      }

      const user = session.user;
      const lockedFields = [
        form.elements.student_name,
        form.elements.email,
        form.elements.wechat,
        form.elements.phone
      ];

      fillFieldIfEmpty(form.elements.student_name, user.nickname);
      fillFieldIfEmpty(form.elements.email, user.email);
      fillFieldIfEmpty(form.elements.wechat, user.wechat_id);
      fillFieldIfEmpty(form.elements.phone, user.phone);
      lockedFields.forEach(lockField);

      const missingFields = [];
      if (!String(user.nickname || "").trim()) {
        missingFields.push("姓名");
      }
      if (!String(user.phone || "").trim()) {
        missingFields.push("联系电话");
      }
      if (!String(user.wechat_id || "").trim()) {
        missingFields.push("微信号");
      }

      if (missingFields.length > 0) {
        setMessage(messageNode, `已自动带入你现有的账号资料，仍缺少：${missingFields.join("、")}。请先补全后再提交。`, "error");
      } else {
        setMessage(messageNode, "已自动带入并锁定账号资料；如需修改，请先到个人中心更新。", "success");
      }
    } catch (error) {
      // Ignore auth hydration failures and keep the form usable.
    }
  }

  async function listMyFutureTransportRequests() {
    const response = await fetch(resolveApiUrl("/api/public/my-transport-requests"), {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    const payload = await response.json().catch(() => ({ data: null, error: { message: "加载个人订单失败" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "加载个人订单失败");
    }

    const now = Date.now();
    return (Array.isArray(payload.data) ? payload.data : []).filter(item => {
      if (!item || item.status === "closed") {
        return false;
      }
      const time = new Date(item.flight_datetime || item.preferred_time_start || "").getTime();
      return !Number.isNaN(time) && time > now;
    });
  }

  function serviceTypeLabel(serviceType) {
    return serviceType === "dropoff" ? "送机" : "接机";
  }

  function buildFutureOrderPrompt(nextServiceType, requests) {
    const rows = Array.isArray(requests) ? requests.filter(Boolean) : [];
    if (!rows.length) {
      return "";
    }

    const sameTypeRows = rows.filter(item => item.service_type === nextServiceType);
    const crossTypeRows = rows.filter(item => item.service_type && item.service_type !== nextServiceType);
    const lines = [];

    if (sameTypeRows.length) {
      lines.push(`您当前已有未来有效${serviceTypeLabel(nextServiceType)}单：${sameTypeRows.map(item => item.order_no).filter(Boolean).join("、")}`);
      lines.push(`系统不允许同一账号同时存在两张${serviceTypeLabel(nextServiceType)}单。`);
    } else {
      const firstCross = crossTypeRows[0];
      if (firstCross) {
        lines.push(`您当前已有一张未来有效${serviceTypeLabel(firstCross.service_type)}单：${firstCross.order_no || "--"}`);
      } else {
        lines.push("您当前已有未来有效订单。");
      }
      lines.push("如果继续提交，系统会继续判断是否允许再下一张订单。");
    }

    lines.push("提示：同一账号不能同时有两张接机单，或两张送机单。");
    lines.push("确定继续提交吗？");
    return lines.join("\n");
  }

  document.addEventListener("DOMContentLoaded", function () {
    const form = $("#carpoolBookingForm");
    const summaryBox = $("#carpoolSummaryBox");
    const summaryModalElements = ensureSummaryModalElements();
    const summaryModal = summaryModalElements.modal;
    const summaryModalBox = summaryModalElements.box;
    const summaryModalClose = summaryModalElements.close;
    const messageNode = $("#carpoolSubmitMessage");
    const copyButton = $("#copyCarpoolSummary");
    const copyModalButton = summaryModalElements.copy;
    const hintNode = $("#luggageHint");
    const otherField = $("#luggageOtherField");
    const scrollButtons = document.querySelectorAll("[data-scroll-form]");
    const fab = $("#pickupContactFab");
    const modal = $("#pickupContactModal");
    const close = $("#pickupContactClose");
    const dialog = modal ? modal.querySelector(".pickup-contact-modal-dialog") : null;
    const contactQrImage = modal ? modal.querySelector("img") : null;

    if (contactQrImage) {
      contactQrImage.setAttribute("src", CUSTOMER_SERVICE_QR_SRC);
      contactQrImage.setAttribute("alt", "接机客服二维码");
    }

    scrollButtons.forEach(button => {
      button.addEventListener("click", function () {
        $("#carpool-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (fab && modal && close && dialog) {
      function openModal() {
        modal.hidden = false;
        document.body.style.overflow = "hidden";
      }

      function closeModal() {
        modal.hidden = true;
        document.body.style.overflow = "";
      }

      fab.addEventListener("click", openModal);
      close.addEventListener("click", closeModal);
      modal.addEventListener("click", function (event) {
        if (!dialog.contains(event.target)) {
          closeModal();
        }
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !modal.hidden) {
          closeModal();
        }
      });
    }

    if (!form || !summaryBox || !messageNode || !copyButton || !hintNode || !otherField) {
      return;
    }

    function openSummaryModal() {
      if (!summaryModal) {
        return;
      }
      summaryModal.hidden = false;
      summaryModal.style.display = "block";
      document.body.style.overflow = "hidden";
    }

    function closeSummaryModal() {
      if (!summaryModal) {
        return;
      }
      summaryModal.hidden = true;
      summaryModal.style.display = "";
      document.body.style.overflow = "";
    }

    if (summaryModal && summaryModalBox && summaryModalClose) {
      summaryModalClose.addEventListener("click", closeSummaryModal);
      summaryModal.querySelectorAll("[data-carpool-summary-close]").forEach(button => {
        button.addEventListener("click", closeSummaryModal);
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !summaryModal.hidden) {
          closeSummaryModal();
        }
      });
    }

    form.querySelectorAll('input[name="luggage_option"]').forEach((input, index) => {
      input.dataset.luggageCount = String(LUGGAGE_COUNTS[index] || 0);
    });

    let latestSummary = "";
    let submissionLocked = false;
    let timeConstraints = applyTimeConstraints(form);

    function unlockSubmission() {
      submissionLocked = false;
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = false;
      }
    }

    form.addEventListener("input", function () {
      timeConstraints = applyTimeConstraints(form);
      validateTimeFields(form, timeConstraints);
      unlockSubmission();
    });

    form.addEventListener("change", function () {
      timeConstraints = applyTimeConstraints(form);
      validateTimeFields(form, timeConstraints);
      unlockSubmission();
    });

    form.querySelectorAll('input[name="luggage_option"]').forEach(input => {
      input.addEventListener("change", function () {
        if (this.checked) {
          form.querySelectorAll('input[name="luggage_option"]').forEach(otherInput => {
            if (otherInput !== this) {
              otherInput.checked = false;
            }
          });
        }
        setMessage(messageNode, "", "");
        syncLuggageState(form, hintNode, otherField);
      });
    });

    syncLuggageState(form, hintNode, otherField);
    validateTimeFields(form, timeConstraints);
    hydrateLoggedInUser(form, messageNode);

    copyButton.addEventListener("click", async function () {
      if (!latestSummary) {
        return;
      }

      try {
        await navigator.clipboard.writeText(latestSummary);
        setMessage(messageNode, "摘要已复制。", "success");
      } catch (error) {
        setMessage(messageNode, "复制失败，请手动复制。", "error");
      }
    });

    if (copyModalButton) {
      copyModalButton.addEventListener("click", async function () {
        if (!latestSummary) {
          return;
        }

        try {
          await navigator.clipboard.writeText(latestSummary);
          setMessage(messageNode, "摘要已复制。", "success");
        } catch (error) {
          setMessage(messageNode, "复制失败，请手动复制。", "error");
        }
      });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setMessage(messageNode, "", "");

      if (submissionLocked) {
        setMessage(messageNode, "这张表单已经提交成功了。如需重新提交，请先修改信息或刷新页面。", "error");
        return;
      }

      timeConstraints = applyTimeConstraints(form);
      validateTimeFields(form, timeConstraints);

      if (!form.reportValidity()) {
        setMessage(messageNode, "请先填写完整所有必填项。", "error");
        focusFirstInvalidField(form);
        return;
      }

      const serviceMode = getCheckedValue(form, "service_mode");
      const shareGoal = getCheckedValue(form, "share_goal");
      const passengerCount = String(form.passenger_count?.value || "1").trim() || "1";
      const fallbackAccept = getCheckedValue(form, "fallback_accept");
      const luggageSelections = getLuggageSelections(form);
      const airportName = form.airport_name.value.trim();
      const airportMeta = matchAirportCode(airportName);
      const address = form.nottingham_address.value.trim();
      const terminal = form.terminal.value.trim();
      const luggageOtherText = form.luggage_other?.value.trim() || "";

      const luggageText = luggageSelections
        .map(input => (input.value === "other" && luggageOtherText ? `其他: ${luggageOtherText}` : input.parentElement?.textContent?.trim() || input.value))
        .join("；") || "未填写";

      const fallbackAcceptLabel = fallbackAccept === "accept" ? "接受" : "不接受";

      const notesExtra = [
        `拼车价位: ${getCheckedLabel(form, "share_goal") || "-"}`,
        `截止日期: ${form.deadline_date.value || "-"}`,
        `同行人数: ${passengerCount}`,
        `行李: ${luggageText}`,
        `拼车失败是否接受其他方案: ${fallbackAcceptLabel}`
      ].join(" | ");

      const serviceModeLabel = serviceMode === "dropoff"
        ? "送机"
        : serviceMode === "other"
          ? "其他城市用车服务"
          : "接机";

      const summaryData = {
        student_name: form.student_name.value.trim(),
        wechat: form.wechat.value.trim(),
        phone: form.phone.value.trim(),
        service_mode_label: serviceModeLabel,
        airport_name: airportName,
        terminal,
        flight_no: form.flight_no.value.trim(),
        flight_datetime: form.flight_datetime.value,
        preferred_time: form.preferred_time.value,
        share_goal_label: getCheckedLabel(form, "share_goal") || "-",
        passenger_count_label: passengerCount,
        deadline_date: form.deadline_date.value,
        luggage_text: luggageText,
        nottingham_address: address,
        fallback_accept: fallbackAcceptLabel,
        notes_extra: notesExtra
      };

      latestSummary = buildSummary(summaryData);
      renderSummary(summaryBox, latestSummary);
      if (summaryModalBox) {
        renderSummary(summaryModalBox, latestSummary);
      }
      copyButton.disabled = false;
      if (copyModalButton) {
        copyModalButton.disabled = false;
      }

      const payload = {
        service_type: serviceMode === "dropoff" ? "dropoff" : "pickup",
        student_name: summaryData.student_name,
        phone: summaryData.phone,
        wechat: summaryData.wechat || null,
        passenger_count: Number.parseInt(passengerCount, 10),
        luggage_count: getLuggageCount(luggageSelections),
        airport_code: airportMeta.code,
        airport_name: airportMeta.name,
        terminal: terminal || null,
        flight_no: summaryData.flight_no,
        flight_datetime: summaryData.flight_datetime,
        location_from: serviceMode === "dropoff" ? address : `${airportMeta.name} ${terminal}`.trim(),
        location_to: serviceMode === "dropoff" ? `${airportMeta.name} ${terminal}`.trim() : address,
        preferred_time_start: summaryData.preferred_time,
        preferred_time_end: null,
        shareable: shareGoal !== "1",
        notes: [
          `原始服务类型: ${summaryData.service_mode_label}`,
          notesExtra
        ].join(" | ")
      };

      try {
        const existingRequests = await listMyFutureTransportRequests();
        const promptText = buildFutureOrderPrompt(payload.service_type, existingRequests);
        if (promptText && !window.confirm(promptText)) {
          setMessage(messageNode, "已取消提交。", "error");
          return;
        }
      } catch (error) {
        setMessage(messageNode, `提交前检查失败：${error.message}`, "error");
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const created = await submitPayload(payload);
        const referenceNumber = String(created.orderNo || "").trim() || generateReferenceNumber();
        const groupId = String(created.groupId || "").trim() || "-";
        submissionLocked = true;
        latestSummary = `${latestSummary}\n\n提交状态: 提交成功\n登记编号: ${referenceNumber}\nGroup ID: ${groupId}\n邮件状态: 邮件已通知\n请尽快联系客服，并把姓名、Group ID、订单编号发给客服审核。`;
        setMessage(messageNode, `提交成功，登记编号：${referenceNumber}，Group ID：${groupId}。邮件已通知，请尽快联系客服。`, "success");
        renderSummary(summaryBox, latestSummary, {
          status: "success",
          referenceNumber,
          groupId
        });
        if (summaryModalBox) {
          renderSummary(summaryModalBox, latestSummary, {
            status: "success",
            referenceNumber,
            groupId
          });
        }
        openSummaryModal();
      } catch (error) {
        latestSummary = `${latestSummary}\n\n提交状态: 提交失败\n失败原因: ${error.message}`;
        setMessage(messageNode, `提交失败：${error.message}`, "error");
        renderSummary(summaryBox, latestSummary, {
          status: "error"
        });
        if (summaryModalBox) {
          renderSummary(summaryModalBox, latestSummary, {
            status: "error"
          });
        }
        openSummaryModal();
      } finally {
        if (submitButton) {
          submitButton.disabled = submissionLocked;
        }
      }
    });
  });
})();
