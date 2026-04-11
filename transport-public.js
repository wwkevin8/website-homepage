(function () {
  const Shared = window.TransportShared;
  const Api = window.TransportApi;

  if (!Shared || !Api) {
    return;
  }

  const DEFAULT_BOARD_PAGE_SIZE = 10;
  const DEFAULT_PREVIEW_SIZE = 6;

  function normalizeResponse(payload) {
    if (Array.isArray(payload)) {
      return {
        items: payload,
        total: payload.length,
        page: 1,
        page_size: payload.length,
        has_next: false
      };
    }

    return {
      items: Array.isArray(payload?.items) ? payload.items : [],
      total: Number(payload?.total) || 0,
      page: Number(payload?.page) || 1,
      page_size: Number(payload?.page_size) || 0,
      has_next: Boolean(payload?.has_next)
    };
  }

  function getAirportLabel(group) {
    return group.airport_name || group.airport_code || "--";
  }

  function getFlightNumber(group) {
    return group.flight_no || "--";
  }

  function getBoardingDate(group) {
    return Shared.formatDate(group.group_date);
  }

  function getWaitingCount(group) {
    if (group.remaining_passenger_count !== undefined && group.remaining_passenger_count !== null) {
      return group.remaining_passenger_count;
    }
    if (group.max_passengers !== undefined && group.max_passengers !== null) {
      return group.max_passengers;
    }
    return 0;
  }

  function renderInfoGrid(group, itemClassName) {
    return `
      <div class="${itemClassName}">
        <strong>本次拼车类型</strong>
        <span>${Shared.escapeHtml(Shared.serviceLabel(group.service_type))}</span>
      </div>
      <div class="${itemClassName}">
        <strong>抵达/出发的英国机场</strong>
        <span>${Shared.escapeHtml(getAirportLabel(group))}</span>
      </div>
      <div class="${itemClassName}">
        <strong>抵达/出发航站楼</strong>
        <span>${Shared.escapeHtml(group.terminal || "--")}</span>
      </div>
      <div class="${itemClassName}">
        <strong>您的航班号</strong>
        <span>${Shared.escapeHtml(getFlightNumber(group))}</span>
      </div>
      <div class="${itemClassName}">
        <strong>抵达/起飞日期</strong>
        <span>${Shared.escapeHtml(getBoardingDate(group))}</span>
      </div>
      <div class="${itemClassName}">
        <strong>待拼人数</strong>
        <span>${Shared.escapeHtml(getWaitingCount(group))} 人</span>
      </div>
    `;
  }

  function renderBoardCard(group) {
    const airportLabel = getAirportLabel(group);
    const terminalLabel = group.terminal || "--";
    const routeLabel = `${group.location_from || "--"} 到 ${group.location_to || "--"}`;
    const waitingCount = getWaitingCount(group);
    return `
      <article class="transport-board-card transport-board-card-surface">
        <div class="transport-board-card-top">
          <div class="transport-board-card-copy">
            <p class="transport-board-card-kicker">${Shared.escapeHtml(Shared.serviceLabel(group.service_type))}拼车</p>
            <h3>${Shared.escapeHtml(airportLabel)} · ${Shared.escapeHtml(terminalLabel)}</h3>
            <p class="transport-board-card-meta">${Shared.escapeHtml(getBoardingDate(group))} · ${Shared.escapeHtml(routeLabel)}</p>
          </div>
          <span class="transport-status-pill transport-board-card-pill">待拼 ${Shared.escapeHtml(waitingCount)} 人</span>
        </div>
        <div class="transport-board-scroll">
          <div class="transport-board-grid transport-board-grid-simple transport-board-grid-inline">
            ${renderInfoGrid(group, "transport-board-field")}
          </div>
        </div>
      </article>
    `;
  }

  function renderPreviewCard(group) {
    return `
      <article class="pickup-board-card">
        <div class="pickup-board-stats pickup-board-stats-simple pickup-board-stats-inline">
          ${renderInfoGrid(group, "pickup-board-stat")}
        </div>
      </article>
    `;
  }

  function renderPagination(container, page, hasNext) {
    if (!container) {
      return;
    }

    container.innerHTML = `
      <button class="button button-secondary" type="button" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} 页</span>
      <button class="button button-secondary" type="button" data-page-action="next" ${hasNext ? "" : "disabled"}>下一页</button>
    `;
  }

  async function initBoardPage() {
    const form = document.querySelector("#transportBoardFilters");
    const list = document.querySelector("#transportBoardList");
    const pagination = document.querySelector("#transportBoardPagination");
    if (!form || !list) {
      return;
    }

    let currentPage = 1;
    let hasNextPage = false;

    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render(page = 1) {
      currentPage = page;
      list.innerHTML = '<div class="transport-loading">加载中...</div>';
      if (pagination) {
        pagination.innerHTML = "";
      }

      const response = await Api.listPublicGroups({
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value,
        include_past: !form.date_from.value ? "true" : "",
        sort: form.date_from.value ? "upcoming" : "latest",
        limit: DEFAULT_BOARD_PAGE_SIZE,
        page
      }).catch(error => {
        list.innerHTML = `<div class="transport-empty">${Shared.escapeHtml(error.message)}</div>`;
        return null;
      });

      if (!response) {
        return;
      }

      const payload = normalizeResponse(response);
      hasNextPage = payload.has_next;

      if (!payload.items.length) {
        list.innerHTML = '<div class="transport-empty">当前还没有可公开查看的最新拼车信息。</div>';
        renderPagination(pagination, 1, false);
        return;
      }

      list.innerHTML = payload.items.map(renderBoardCard).join("");
      renderPagination(pagination, payload.page, payload.has_next);
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render(1);
    });

    if (pagination) {
      pagination.addEventListener("click", event => {
        const action = event.target.closest("[data-page-action]")?.dataset.pageAction;
        if (!action) {
          return;
        }
        if (action === "prev" && currentPage > 1) {
          render(currentPage - 1);
        }
        if (action === "next" && hasNextPage) {
          render(currentPage + 1);
        }
      });
    }

    render(1);
  }

  async function initPickupPreview() {
    const section = document.querySelector("#pickup-board");
    if (!section) {
      return;
    }

    let list = document.querySelector("#pickupBoardPreview");
    if (!list) {
      const existingEmpty = section.querySelector(".pickup-board-empty");
      list = document.createElement("div");
      list.className = "pickup-board-list";
      list.id = "pickupBoardPreview";
      if (existingEmpty) {
        existingEmpty.replaceWith(list);
      } else {
        section.appendChild(list);
      }
    }

    list.innerHTML = '<div class="transport-loading">加载中...</div>';

    let response = await Api.listPublicGroups({
      date_from: Shared.getLondonTodayIsoDate(),
      sort: "upcoming",
      limit: DEFAULT_PREVIEW_SIZE,
      page: 1
    }).catch(error => {
      list.innerHTML = `<div class="pickup-board-empty">${Shared.escapeHtml(error.message)}</div>`;
      return null;
    });

    if (!response) {
      return;
    }

    let payload = normalizeResponse(response);
    if (!payload.items.length) {
      response = await Api.listPublicGroups({
        include_past: "true",
        sort: "latest",
        limit: DEFAULT_PREVIEW_SIZE,
        page: 1
      }).catch(error => {
        list.innerHTML = `<div class="pickup-board-empty">${Shared.escapeHtml(error.message)}</div>`;
        return null;
      });

      if (!response) {
        return;
      }

      payload = normalizeResponse(response);
      if (!payload.items.length) {
        list.innerHTML = '<div class="pickup-board-empty">当前还没有已发布的最新拼车信息。</div>';
        return;
      }
    }

    list.innerHTML = `
      <div class="pickup-board-track-scroll">
        <div class="pickup-board-track">
          ${payload.items.map(renderPreviewCard).join("")}
        </div>
      </div>
    `;
  }

  document.addEventListener("DOMContentLoaded", () => {
    initBoardPage();
    initPickupPreview();
  });
})();
