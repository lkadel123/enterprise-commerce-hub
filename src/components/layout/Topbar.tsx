import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CircleHelp,
  LogOut,
  Mail,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Activity as ActivityIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifications } from "@/lib/mock-data";

const labels: Record<string, string> = {
  "": "Dashboard",
  products: "Products",
  new: "New Product",
  categories: "Categories",
  brands: "Brands",
  inventory: "Inventory",
  orders: "Orders",
  customers: "Customers",
  reviews: "Reviews",
  coupons: "Coupons",
  reports: "Reports",
  users: "Users & Roles",
  activity: "Activity Logs",
  settings: "Settings",
};

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem("np-theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("np-theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

export function Topbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { dark, toggle } = useTheme();
  const segments = pathname.split("/").filter(Boolean);
  const title = labels[segments[segments.length - 1] ?? ""] ?? segments[segments.length - 1] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 border-b bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
        <SidebarTrigger className="shrink-0" />
        <Separator orientation="vertical" className="hidden h-5 sm:block" />

        <div className="hidden min-w-0 lg:block">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {segments.map((seg, i) => (
                <span key={seg + i} className="contents">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {i === segments.length - 1 ? (
                      <BreadcrumbPage className="capitalize">
                        {labels[seg] ?? seg}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink className="capitalize">
                        {labels[seg] ?? seg}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <p className="mt-0.5 truncate text-sm font-semibold tracking-tight capitalize">
            {title}
          </p>
        </div>

        <div className="relative mx-auto hidden w-full max-w-md md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products, orders, customers..."
            className="h-9 bg-surface-muted pl-9 text-sm"
            aria-label="Global search"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:block">
            ⌘K
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            className="hidden h-9 sm:inline-flex"
            onClick={() => toast.success("Quick action panel opened")}
          >
            <Plus className="h-4 w-4" />
            Create
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-4.5 w-4.5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-surface" />
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-88 p-0">
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <p className="text-sm font-semibold">Notifications</p>
                <Badge variant="secondary">{notifications.length} new</Badge>
              </div>
              <div className="max-h-88 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.title}
                    className="flex gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-surface-muted"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-2">
                <Button variant="outline" size="sm" className="w-full">
                  View all notifications
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden h-9 w-9 sm:inline-flex">
                <Mail className="h-4.5 w-4.5" />
                <span className="sr-only">Messages</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Messages</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={toggle}>
                {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden h-9 w-9 sm:inline-flex">
                <CircleHelp className="h-4.5 w-4.5" />
                <span className="sr-only">Help</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Help &amp; docs</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-surface-muted">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                    AW
                  </AvatarFallback>
                </Avatar>
                <div className="hidden text-left lg:block">
                  <p className="text-xs font-medium">Amelia Whitfield</p>
                  <p className="text-[11px] text-muted-foreground">Super Admin</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-medium">Amelia Whitfield</p>
                <p className="text-xs font-normal text-muted-foreground">
                  amelia.w@northpeak.com
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="h-4 w-4" /> Profile
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4" /> Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ShieldCheck className="h-4 w-4" /> Security
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/activity">
                  <ActivityIcon className="h-4 w-4" /> Activity
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
                <Link to="/login">
                  <LogOut className="h-4 w-4" /> Log out
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
