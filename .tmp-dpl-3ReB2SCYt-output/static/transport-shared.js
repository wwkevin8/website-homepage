(function () {
  const AIRPORT_OPTIONS = [
    { code: "LHR", name: "\u5e0c\u601d\u7f57\u673a\u573a" },
    { code: "LGW", name: "\u76d6\u7279\u5a01\u514b\u673a\u573a" },
    { code: "MAN", name: "\u66fc\u5f7b\u65af\u7279\u673a\u573a" },
    { code: "LTN", name: "\u5362\u987f\u673a\u573a" },
    { code: "LCY", name: "\u4f26\u6566\u57ce\u5e02\u673a\u573a" },
    { code: "BHX", name: "\u4f2f\u660e\u7ff0\u673a\u573a" },
    { code: "STN", name: "\u65af\u5766\u65af\u7279\u5fb7\u673a\u573a" },
    { code: "OTHER", name: "\u5176\u4ed6\u673a\u573a" }
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

  function getLondonTodayIsoDate() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;
    return `${year}-${month}-${day}`;
  }

  function serviceLabel(type) {
    return type === "dropoff" ? "\u9001\u673a" : "\u63a5\u673a";
  }

  function requestStatusLabel(status) {
    const map = {
      published: "\u6709\u6548\u5355",
      matched: "\u6709\u6548\u5355",
      closed: "\u5df2\u8fc7\u671f",
      active: "\u6709\u6548\u5355",
      expired: "\u8fc7\u671f\u5355"
    };
    return map[status] || status || "--";
  }

  function requestMatchStatusLabel(status) {
    const map = {
      unmatched: "\u672a\u5339\u914d",
      matched: "\u5df2\u5339\u914d"
    };
    return map[status] || status || "--";
  }

  function groupStatusLabel(status) {
    const map = {
      single_member: "\u62fc\u8f66\u4e2d",
      active: "\u62fc\u8f66\u4e2d",
      open: "\u62fc\u8f66\u4e2d",
      full: "\u5df2\u62fc\u6ee1",
      closed: "\u5df2\u8fc7\u671f",
      cancelled: "\u5df2\u8fc7\u671f"
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
    return `${formatDateTime(start)} - ${formatDateTime(end)}`;
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
    window.dispatchEvent(
      new CustomEvent("admin:assistant-message", {
        detail: {
          message: String(message || ""),
          isError: Boolean(isError)
        }
      })
    );
  }

  function airportNameFromCode(code) {
    return AIRPORT_OPTIONS.find(item => item.code === code)?.name || "";
  }

  function airportOptionLabel(item) {
    return `${item.code} · ${item.name}`;
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
      nameInput.readOnly = codeInput.value !== "OTHER";
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
    getLondonTodayIsoDate,
    serviceLabel,
    requestStatusLabel,
    requestMatchStatusLabel,
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
