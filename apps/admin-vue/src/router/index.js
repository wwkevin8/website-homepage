import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "@/stores/session";
import AdminLayout from "@/layouts/AdminLayout.vue";
import BoxOrderDetailView from "@/views/BoxOrderDetailView.vue";
import CommunityPostDetailView from "@/views/CommunityPostDetailView.vue";
import CommunityView from "@/views/CommunityView.vue";
import DashboardView from "@/views/DashboardView.vue";
import LoginRedirectView from "@/views/LoginRedirectView.vue";
import ManagersView from "@/views/ManagersView.vue";
import MembershipDetailView from "@/views/MembershipDetailView.vue";
import MembershipsView from "@/views/MembershipsView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import OrderDetailView from "@/views/OrderDetailView.vue";
import OrdersView from "@/views/OrdersView.vue";
import StorageAllOrdersView from "@/views/StorageAllOrdersView.vue";
import StorageOrderDetailView from "@/views/StorageOrderDetailView.vue";
import StorageOrdersView from "@/views/StorageOrdersView.vue";
import StorageSyncLogsView from "@/views/StorageSyncLogsView.vue";
import TransportGroupDetailView from "@/views/TransportGroupDetailView.vue";
import TransportGroupsView from "@/views/TransportGroupsView.vue";
import TransportRequestDetailView from "@/views/TransportRequestDetailView.vue";
import TransportRequestsView from "@/views/TransportRequestsView.vue";
import TransportSyncLogsView from "@/views/TransportSyncLogsView.vue";
import UsersView from "@/views/UsersView.vue";

function normalizeAdminPath(path = "/") {
  const rawPath = typeof path === "string" && path ? path : "/";
  if (rawPath === "/admin-vue" || rawPath.startsWith("/admin-vue/")) {
    return rawPath.replace(/^\/admin-vue(?=\/|$)/, "/admin");
  }
  if (rawPath === "/admin" || rawPath.startsWith("/admin/")) {
    return rawPath;
  }
  return `/admin${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
}

function buildLoginUrl(returnPath = "/") {
  const targetPath = normalizeAdminPath(returnPath);
  return `/admin-login.html?return_to=${encodeURIComponent(targetPath)}`;
}

const router = createRouter({
  history: createWebHistory("/admin/"),
  routes: [
    {
      path: "/login-redirect",
      name: "login-redirect",
      component: LoginRedirectView,
      meta: { public: true }
    },
    {
      path: "/",
      component: AdminLayout,
      children: [
        {
          path: "",
          name: "dashboard",
          component: DashboardView,
          meta: { title: "Dashboard" }
        },
        {
          path: "dashboard",
          redirect: { name: "dashboard" }
        },
        {
          path: "users",
          name: "users",
          component: UsersView,
          meta: { title: "用户管理" }
        },
        {
          path: "orders",
          name: "orders",
          component: OrdersView,
          meta: { title: "订单中心" }
        },
        {
          path: "orders/:id",
          name: "order-detail",
          component: OrderDetailView,
          meta: { title: "订单详情" }
        },
        {
          path: "managers",
          name: "managers",
          component: ManagersView,
          meta: { title: "管理员管理" }
        },
        {
          path: "memberships",
          name: "memberships",
          component: MembershipsView,
          meta: { title: "会员权益" }
        },
        {
          path: "memberships/:id",
          name: "membership-detail",
          component: MembershipDetailView,
          meta: { title: "会员权益详情" }
        },
        {
          path: "community",
          name: "community",
          component: CommunityView,
          meta: { title: "社区管理" }
        },
        {
          path: "community/posts/:id",
          name: "community-post-detail",
          component: CommunityPostDetailView,
          meta: { title: "社区帖子详情" }
        },
        {
          path: "transport/requests",
          name: "transport-requests",
          component: TransportRequestsView,
          meta: { title: "登记接送机订单" }
        },
        {
          path: "transport/requests/:id",
          name: "transport-request-detail",
          component: TransportRequestDetailView,
          meta: { title: "接送机订单详情" }
        },
        {
          path: "transport/groups",
          name: "transport-groups",
          component: TransportGroupsView,
          meta: { title: "拼车组管理" }
        },
        {
          path: "transport/groups/:id",
          name: "transport-group-detail",
          component: TransportGroupDetailView,
          meta: { title: "拼车组详情" }
        },
        {
          path: "transport/sync-logs",
          name: "transport-sync-logs",
          component: TransportSyncLogsView,
          meta: { title: "同步巡检日志" }
        },
        {
          path: "storage/orders",
          name: "storage-all-orders",
          component: StorageAllOrdersView,
          meta: { title: "全部订单" }
        },
        {
          path: "storage/box-orders",
          name: "storage-box-orders",
          component: StorageOrdersView,
          meta: { title: "买箱订单", orderType: "box_order" }
        },
        {
          path: "storage/collections",
          name: "storage-collections",
          component: StorageOrdersView,
          meta: { title: "取寄存订单", orderType: "storage_collection" }
        },
        {
          path: "storage/returns",
          name: "storage-returns",
          component: StorageOrdersView,
          meta: { title: "送寄存订单", orderType: "storage_return" }
        },
        {
          path: "storage/sync-logs",
          name: "storage-sync-logs",
          component: StorageSyncLogsView,
          meta: { title: "寄存同步巡检日志" }
        },
        {
          path: "storage/box-orders/:id",
          name: "storage-box-order-detail",
          component: BoxOrderDetailView,
          meta: { title: "买箱订单详情" }
        },
        {
          path: "storage/storage-orders/:id",
          name: "storage-service-order-detail",
          component: StorageOrderDetailView,
          meta: { title: "寄存订单详情" }
        },
        {
          path: "storage/:id",
          name: "storage-order-detail",
          component: StorageOrderDetailView,
          meta: { title: "寄存订单详情" }
        }
      ]
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: NotFoundView,
      meta: { public: true }
    }
  ]
});

router.beforeEach(async to => {
  if (to.meta.public) {
    return true;
  }

  const sessionStore = useSessionStore();
  const session = await sessionStore.ensureSession().catch(() => null);
  if (!session?.authenticated || !session?.is_admin) {
    window.location.replace(buildLoginUrl(to.fullPath || "/"));
    return false;
  }

  return true;
});

export default router;
