import {
  Activity,
  BadgePercent,
  BarChart3,
  Boxes,
  ChevronRight,
  CreditCard,
  FileText,
  Image,
  LayoutDashboard,
  MessageSquareText,
  Megaphone,
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
import { useState } from "react";

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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

type NavChild = { title: string; url: string; badge?: string };
type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: string;
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
        children: [
          { title: "All Products", url: "/products" },
          { title: "Add Product", url: "/products/new" },
          { title: "Attributes", url: "/products" },
          { title: "Collections", url: "/products" },
        ],
      },
      { title: "Categories", url: "/categories", icon: Tags },
      { title: "Brands", url: "/brands", icon: Boxes },
      { title: "Inventory", url: "/inventory", icon: Warehouse, badge: "7" },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        title: "Orders",
        url: "/orders",
        icon: ShoppingCart,
        badge: "24",
        children: [
          { title: "All Orders", url: "/orders" },
          { title: "Pending", url: "/orders", badge: "9" },
          { title: "Processing", url: "/orders" },
          { title: "Shipped", url: "/orders" },
          { title: "Delivered", url: "/orders" },
          { title: "Cancelled", url: "/orders" },
          { title: "Returns & Refunds", url: "/orders" },
        ],
      },
      { title: "Transactions", url: "/reports", icon: CreditCard },
      { title: "Sales Analytics", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        title: "Customers",
        url: "/customers",
        icon: Users,
        children: [
          { title: "All Customers", url: "/customers" },
          { title: "Customer Groups", url: "/customers" },
        ],
      },
      { title: "Reviews", url: "/reviews", icon: Star, badge: "2" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Coupons", url: "/coupons", icon: BadgePercent },
      { title: "Campaigns", url: "/coupons", icon: Megaphone },
      { title: "Banners & Media", url: "/coupons", icon: Image },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Reports", url: "/reports", icon: FileText },
      { title: "Activity Logs", url: "/activity", icon: Activity },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Users & Roles", url: "/users", icon: ShieldCheck },
      { title: "Content Pages", url: "/settings", icon: MessageSquareText },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

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
        {navigation.map((group) => (
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
                        {item.badge && !collapsed && (
                          <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                        )}
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

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed ? (
          <div className="rounded-md bg-sidebar-accent p-3">
            <p className="text-xs font-medium">Storage plan</p>
            <p className="mt-0.5 text-xs text-muted-foreground">68% of 500 GB used</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div className="h-full w-[68%] rounded-full bg-primary" />
            </div>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
