import {
  BadgePercent,
  BarChart3,
  Boxes,
  ChevronRight,
  Image,
  Images,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tags,
  Users,
  Warehouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAdminAuth } from "@/lib/auth/AdminAuthContext";
import type { PermissionModule } from "@/lib/api/types";

type NavChild = { title: string; url: string };
type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Backend RBAC module guarding this page (view action). */
  module?: PermissionModule;
  children?: NavChild[];
};
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  {
    label: "Main",
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "Catalog",
    items: [
      {
        title: "Products",
        url: "/products",
        icon: Package,
        module: "catalog",
        children: [
          { title: "All Products", url: "/products" },
          { title: "Add Product", url: "/products/new" },
        ],
      },
      { title: "Categories", url: "/categories", icon: Tags, module: "catalog" },
      { title: "Brands", url: "/brands", icon: Boxes, module: "catalog" },
      { title: "Inventory", url: "/inventory", icon: Warehouse, module: "inventory" },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        title: "Orders",
        url: "/orders",
        icon: ShoppingCart,
        module: "orders",
        children: [
          { title: "All Orders", url: "/orders" },
          { title: "Pending", url: "/orders" },
          { title: "Processing", url: "/orders" },
          { title: "Shipped", url: "/orders" },
          { title: "Delivered", url: "/orders" },
          { title: "Cancelled", url: "/orders" },
          { title: "Returns & Refunds", url: "/orders" },
        ],
      },
      { title: "Reports", url: "/reports", icon: BarChart3, module: "reports" },
    ],
  },
  {
    label: "Customers",
    items: [
      { title: "Customers", url: "/customers", icon: Users, module: "customers" },
      { title: "Reviews", url: "/reviews", icon: Star, module: "catalog" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Coupons", url: "/coupons", icon: BadgePercent, module: "marketing" },
      { title: "Banners", url: "/banners", icon: Image, module: "marketing" },
      { title: "Media Library", url: "/media", icon: Images, module: "marketing" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users & Roles", url: "/users", icon: ShieldCheck, module: "administration" },
      { title: "Settings", url: "/settings", icon: Settings, module: "settings" },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { hasPermission } = useAdminAuth();

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  // Permission-aware navigation: items whose backend module the signed-in
  // admin cannot view are hidden (the backend independently enforces RBAC on
  // every request; this only shapes the UI).
  const visibleGroups = useMemo(
    () =>
      navigation
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => !item.module || hasPermission(item.module, "view"),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [hasPermission],
  );

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex h-12 items-center gap-2.5 px-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Boxes className="h-4.5 w-4.5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">Northpeak</p>
              <p className="truncate text-xs text-muted-foreground">Commerce Console</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1.5">
            <SidebarGroupLabel className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/80">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActive(item.url);
                  if (!item.children || collapsed) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <Link to={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  const isOpen = open[item.title] ?? active;
                  return (
                    <Collapsible
                      key={item.title}
                      open={isOpen}
                      onOpenChange={(v) => setOpen((s) => ({ ...s, [item.title]: v }))}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton isActive={active} tooltip={item.title}>
                            <item.icon />
                            <span>{item.title}</span>
                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.title}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === child.url}
                                >
                                  <Link to={child.url}>
                                    <span>{child.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border" />
    </Sidebar>
  );
}
