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
    hintNode.textContent = `已选择 ${selections.length} 项，最多 2 项。`;

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

    if (options.referenceNumber) {
      const emphasis = document.createElement("div");
      emphasis.className = "carpool-summary-emphasis";
      emphasis.innerHTML = `
        <p class="carpool-summary-emphasis-label">请务必复制下面这个登记编号</p>
        <p class="carpool-summary-emphasis-number">${options.referenceNumber}</p>
        <p class="carpool-summary-emphasis-copy">复制后发给客服，帮你登记确认。</p>
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

  document.addEventListener("DOMContentLoaded", function () {
    const form = $("#carpoolBookingForm");
    const summaryBox = $("#carpoolSummaryBox");
    const messageNode = $("#carpoolSubmitMessage");
    const copyButton = $("#copyCarpoolSummary");
    const hintNode = $("#luggageHint");
    const otherField = $("#luggageOtherField");
    const scrollButtons = document.querySelectorAll("[data-scroll-form]");
    const fab = $("#pickupContactFab");
    const modal = $("#pickupContactModal");
    const close = $("#pickupContactClose");
    const dialog = modal ? modal.querySelector(".pickup-contact-modal-dialog") : null;

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

    form.querySelectorAll('input[name="luggage_option"]').forEach((input, index) => {
      input.dataset.luggageCount = String(LUGGAGE_COUNTS[index] || 0);
    });

    let latestSummary = "";

    form.querySelectorAll('input[name="luggage_option"]').forEach(input => {
      input.addEventListener("change", function () {
        const selections = getLuggageSelections(form);
        if (selections.length > 2) {
          this.checked = false;
          setMessage(messageNode, "行李最多只能选择 2 项。", "error");
        }
        syncLuggageState(form, hintNode, otherField);
      });
    });

    syncLuggageState(form, hintNode, otherField);

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

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setMessage(messageNode, "", "");

      if (!form.reportValidity()) {
        setMessage(messageNode, "请先填写完整所有必填项。", "error");
        focusFirstInvalidField(form);
        return;
      }

      const serviceMode = getCheckedValue(form, "service_mode");
      const shareGoal = getCheckedValue(form, "share_goal");
      const passengerCount = getCheckedValue(form, "passenger_count");
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
        `同行人数: ${getCheckedLabel(form, "passenger_count") || "-"}`,
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
        passenger_count_label: getCheckedLabel(form, "passenger_count") || "-",
        deadline_date: form.deadline_date.value,
        luggage_text: luggageText,
        nottingham_address: address,
        fallback_accept: fallbackAcceptLabel,
        notes_extra: notesExtra
      };

      latestSummary = buildSummary(summaryData);
      renderSummary(summaryBox, latestSummary);
      copyButton.disabled = false;

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

      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const created = await submitPayload(payload);
        const referenceNumber = String(created.orderNo || "").trim() || generateReferenceNumber();
        latestSummary = `${latestSummary}\n\n登记编号: ${referenceNumber}\n系统状态: 已提交\n请复制编号发给客服帮忙登记确认。`;
        setMessage(messageNode, `提交成功，登记编号：${referenceNumber}。请复制发给客服帮忙登记确认。`, "success");
        renderSummary(summaryBox, latestSummary, { referenceNumber });
      } catch (error) {
        setMessage(messageNode, `摘要已生成，但保存失败：${error.message}`, "error");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  });
})();
