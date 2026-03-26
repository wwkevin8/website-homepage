(function () {
  const AIRPORT_OPTIONS = [
    { code: "LHR", name: "Heathrow Airport" },
    { code: "LGW", name: "Gatwick Airport" },
    { code: "MAN", name: "Manchester Airport" },
    { code: "LTN", name: "Luton Airport" },
    { code: "LCY", name: "London City Airport" },
    { code: "BHX", name: "Birmingham Airport" },
    { code: "STN", name: "Stansted Airport" },
    { code: "OTHER", name: "Other Airport" }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDateTime(value) {
    if (!value) {
      return "--";
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

  function formatDate(value) {
    if (!value) {
      return "--";
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function serviceLabel(type) {
    return type === "dropoff" ? "送机" : "接机";
  }

  function requestStatusLabel(status) {
    const map = {
      draft: "草稿",
      open: "开放中",
      grouped: "已分组",
      closed: "已关闭",
      cancelled: "已取消"
    };
    return map[status] || status || "--";
  }

  function groupStatusLabel(status) {
    const map = {
      draft: "草稿",
      open: "可拼车",
      full: "已满员",
      closed: "已关闭",
      cancelled: "已取消"
    };
    return map[status] || status || "--";
  }

  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function formatTimeRange(start, end) {
    if (!start && !end) {
      return "--";
    }
    return `${formatDateTime(start)} ~ ${formatDateTime(end)}`;
  }

  function fieldValue(form, selector) {
    const node = form.querySelector(selector);
    if (!node) {
      return "";
    }
    if (node.type === "checkbox") {
      return node.checked;
    }
    return node.value;
  }

  function showMessage(node, message, isError) {
    if (!node) {
      return;
    }
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(isError));
    node.classList.toggle("is-success", Boolean(message && !isError));
  }

  function airportNameFromCode(code) {
    return AIRPORT_OPTIONS.find(item => item.code === code)?.name || "";
  }

  function airportOptionLabel(item) {
    return `${item.code} - ${item.name}`;
  }

  function populateAirportCodeSelect(select, includeEmpty = true) {
    if (!select) {
      return;
    }
    if (select.options.length > (includeEmpty ? 1 : 0)) {
      return;
    }
    if (!includeEmpty) {
      select.innerHTML = "";
    }
    AIRPORT_OPTIONS.forEach(item => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = airportOptionLabel(item);
      select.appendChild(option);
    });
  }

  function syncAirportNameField(codeInput, nameInput) {
    if (!codeInput || !nameInput) {
      return;
    }
    const sync = () => {
      nameInput.value = airportNameFromCode(codeInput.value);
      if (codeInput.value === "OTHER") {
        nameInput.readOnly = false;
        if (!nameInput.value) {
          nameInput.value = "";
        }
      } else {
        nameInput.readOnly = true;
      }
    };
    codeInput.addEventListener("change", sync);
    sync();
  }

  function getWechatContactHref() {
    return "weixin://";
  }

  async function copyWechatId() {
    try {
      await navigator.clipboard.writeText("Nottsngn");
      return true;
    } catch (error) {
      return false;
    }
  }

  window.TransportShared = {
    AIRPORT_OPTIONS,
    escapeHtml,
    formatDateTime,
    formatDate,
    serviceLabel,
    requestStatusLabel,
    groupStatusLabel,
    queryParam,
    formatTimeRange,
    fieldValue,
    showMessage,
    airportNameFromCode,
    airportOptionLabel,
    populateAirportCodeSelect,
    syncAirportNameField,
    getWechatContactHref,
    copyWechatId
  };
})();
