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
    if (orderType === "box_order") return "/admin/storage/box-orders";
    if (orderType === "storage_collection") return "/admin/storage/collections";
    if (orderType === "storage_return") return "/admin/storage/returns";
    return "/admin/storage/orders";
  }

  function buildTarget(pathname, searchParams) {
    const file = pathname.split("/").pop() || "";
    const id = searchParams.get("id");
    const groupId = searchParams.get("group_id") || id;
    const requestId = searchParams.get("request_id") || id;

    const staticTargets = {
      "admin-dashboard.html": "/admin/",
      "admin-orders.html": "/admin/orders",
      "admin-users.html": "/admin/users",
      "admin-managers.html": "/admin/managers",
      "admin-memberships.html": "/admin/memberships",
      "admin-community.html": "/admin/community",
      "pickup-admin.html": "/admin/transport/requests",
      "transport-admin-login.html": "/admin/",
      "transport-admin-requests.html": "/admin/transport/requests",
      "transport-admin-request-new.html": "/admin/transport/requests",
      "transport-admin-groups.html": "/admin/transport/groups",
      "transport-admin-group-new.html": "/admin/transport/groups",
      "transport-admin-sync-logs.html": "/admin/transport/sync-logs"
    };

    if (file === "admin-storage.html") {
      return storageListTarget(searchParams);
    }
    if (file === "admin-storage-detail.html") {
      return id ? `/admin/storage/${encode(id)}` : "/admin/storage/orders";
    }
    if (file === "transport-admin-request-edit.html") {
      return requestId ? `/admin/transport/requests/${encode(requestId)}` : "/admin/transport/requests";
    }
    if (file === "transport-admin-group-edit.html") {
      return groupId ? `/admin/transport/groups/${encode(groupId)}` : "/admin/transport/groups";
    }

    return staticTargets[file] || "/admin/";
  }

  const url = new URL(window.location.href);
  if (hasEmergencyAccess(url.searchParams)) {
    return;
  }

  const target = buildTarget(url.pathname, url.searchParams);
  window.location.replace(target);
})();
