import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "@/stores/session";
import AdminLayout from "@/layouts/AdminLayout.vue";
import CommunityView from "@/views/CommunityView.vue";
import DashboardView from "@/views/DashboardView.vue";
import LoginRedirectView from "@/views/LoginRedirectView.vue";
import ManagersView from "@/views/ManagersView.vue";
import MembershipsView from "@/views/MembershipsView.vue";
import NotFoundView from "@/views/NotFoundView.vue";
import OrdersView from "@/views/OrdersView.vue";
import StorageOrdersView from "@/views/StorageOrdersView.vue";
import TransportGroupsView from "@/views/TransportGroupsView.vue";
import TransportRequestsView from "@/views/TransportRequestsView.vue";
import TransportSyncLogsView from "@/views/TransportSyncLogsView.vue";
import UsersView from "@/views/UsersView.vue";

function buildLoginUrl(returnPath = "/") {
  const targetPath = returnPath.startsWith("/admin-vue")
    ? returnPath
    : `/admin-vue${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`;
  return `/admin-login.html?return_to=${encodeURIComponent(targetPath)}`;
}

const router = createRouter({
  history: createWebHistory("/admin-vue/"),
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
          path: "community",
          name: "community",
          component: CommunityView,
          meta: { title: "社区管理" }
        },
        {
          path: "transport/requests",
          name: "transport-requests",
          component: TransportRequestsView,
          meta: { title: "登记接送机订单" }
        },
        {
          path: "transport/groups",
          name: "transport-groups",
          component: TransportGroupsView,
          meta: { title: "拼车组管理" }
        },
        {
          path: "transport/sync-logs",
          name: "transport-sync-logs",
          component: TransportSyncLogsView,
          meta: { title: "同步巡检日志" }
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
