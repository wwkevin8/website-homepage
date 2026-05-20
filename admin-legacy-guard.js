(function () {
  const EMERGENCY_PARAM = "legacy_admin_emergency";
  const EMERGENCY_SESSION_KEY = "ngn_legacy_admin_emergency";

  function hasEmergencyAccess(searchParams) {
    if (searchParams.get(EMERGENCY_PARAM) === "1") {
      try {
        window.sessionStorage.setItem(EMERGENCY_SESSION_KEY, "1");
      } catch (error) {}
      return true;
    }
    try {
      return window.sessionStorage.getItem(EMERGENCY_SESSION_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function encode(value) {
    return encodeURIComponent(value || "");
  }

  function storageListTarget(searchParams) {
    const orderType = searchParams.get("order_type");
    if (orderType === "box_order") return "/admin-vue/storage/box-orders";
    if (orderType === "storage_collection") return "/admin-vue/storage/collections";
    if (orderType === "storage_return") return "/admin-vue/storage/returns";
    return "/admin-vue/storage/orders";
  }

  function buildTarget(pathname, searchParams) {
    const file = pathname.split("/").pop() || "";
    const id = searchParams.get("id");
    const groupId = searchParams.get("group_id") || id;
    const requestId = searchParams.get("request_id") || id;

    const staticTargets = {
      "admin-dashboard.html": "/admin-vue/",
      "admin-orders.html": "/admin-vue/orders",
      "admin-users.html": "/admin-vue/users",
      "admin-managers.html": "/admin-vue/managers",
      "admin-memberships.html": "/admin-vue/memberships",
      "admin-community.html": "/admin-vue/community",
      "pickup-admin.html": "/admin-vue/transport/requests",
      "transport-admin-login.html": "/admin-vue/",
      "transport-admin-requests.html": "/admin-vue/transport/requests",
      "transport-admin-request-new.html": "/admin-vue/transport/requests",
      "transport-admin-groups.html": "/admin-vue/transport/groups",
      "transport-admin-group-new.html": "/admin-vue/transport/groups",
      "transport-admin-sync-logs.html": "/admin-vue/transport/sync-logs"
    };

    if (file === "admin-storage.html") {
      return storageListTarget(searchParams);
    }
    if (file === "admin-storage-detail.html") {
      return id ? `/admin-vue/storage/${encode(id)}` : "/admin-vue/storage/orders";
    }
    if (file === "transport-admin-request-edit.html") {
      return requestId ? `/admin-vue/transport/requests/${encode(requestId)}` : "/admin-vue/transport/requests";
    }
    if (file === "transport-admin-group-edit.html") {
      return groupId ? `/admin-vue/transport/groups/${encode(groupId)}` : "/admin-vue/transport/groups";
    }

    return staticTargets[file] || "/admin-vue/";
  }

  const url = new URL(window.location.href);
  if (hasEmergencyAccess(url.searchParams)) {
    return;
  }

  const target = buildTarget(url.pathname, url.searchParams);
  window.location.replace(target);
})();
