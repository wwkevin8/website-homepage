(function () {
  const Shared = window.TransportShared;
  const Api = window.TransportApi;

  if (!Shared || !Api) {
    return;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const form = document.querySelector("#transportBoardFilters");
    const list = document.querySelector("#transportBoardList");
    if (!form || !list) {
      return;
    }

    Shared.populateAirportCodeSelect(form.airport_code, true);

    async function render() {
      list.innerHTML = '<div class="transport-loading">加载中...</div>';
      const groups = await Api.listPublicGroups({
        service_type: form.service_type.value,
        airport_code: form.airport_code.value,
        date_from: form.date_from.value,
        date_to: form.date_to.value
      }).catch(error => {
        list.innerHTML = `<div class="transport-empty">${Shared.escapeHtml(error.message)}</div>`;
      });

      if (!groups) {
        return;
      }

      if (!groups.length) {
        list.innerHTML = '<div class="transport-empty">当前还没有可公开的接送机拼车信息。</div>';
        return;
      }

      list.innerHTML = groups.map(group => `
        <article class="transport-board-card">
          <div class="transport-list-top">
            <div>
              <h3>${Shared.escapeHtml(Shared.serviceLabel(group.service_type))} · ${Shared.escapeHtml(Shared.formatDate(group.group_date))}</h3>
              <p>${Shared.escapeHtml(group.airport_code)} · ${Shared.escapeHtml(group.airport_name)} · ${Shared.escapeHtml(group.terminal || "--")}</p>
            </div>
            <span class="transport-status-pill">${Shared.escapeHtml(Shared.groupStatusLabel(group.status))}</span>
          </div>
          <div class="transport-board-grid">
            <div><strong>路线</strong><span>${Shared.escapeHtml(group.location_from)} → ${Shared.escapeHtml(group.location_to)}</span></div>
            <div><strong>航班时间参考</strong><span>${Shared.escapeHtml(Shared.formatDateTime(group.flight_time_reference))}</span></div>
            <div><strong>接送期待时间段</strong><span>${Shared.escapeHtml(Shared.formatTimeRange(group.preferred_time_start, group.preferred_time_end))}</span></div>
            <div><strong>车型</strong><span>${Shared.escapeHtml(group.vehicle_type || "--")}</span></div>
            <div><strong>最大人数</strong><span>${group.max_passengers}</span></div>
            <div><strong>当前已报名人数</strong><span>${group.current_passenger_count || 0}</span></div>
            <div><strong>剩余可拼人数</strong><span>${group.remaining_passenger_count || 0}</span></div>
            <div><strong>备注</strong><span>${Shared.escapeHtml(group.notes || "以工作人员最终确认为准。")}</span></div>
          </div>
          <div class="transport-card-actions">
            <a class="button button-primary" href="${Shared.getWechatContactHref()}" data-copy-wechat>联系工作人员</a>
          </div>
        </article>
      `).join("");

      list.querySelectorAll("[data-copy-wechat]").forEach(link => {
        link.addEventListener("click", async () => {
          const copied = await Shared.copyWechatId();
          if (copied) {
            window.setTimeout(() => {
              alert("客服微信 Nottsngn 已复制，可直接粘贴到微信搜索。");
            }, 50);
          }
        });
      });
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      render();
    });

    render();
  });
})();
