"use client";
import {
  CreditCardIcon,
  FolderOpenIcon,
  HistoryIcon,
  KeyIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  StarIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useHasActiveSubscription } from "@/components/subscriptions/hooks";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { checkout, signOut } from "@/lib/auth-client";

// Decorative — the accessible name comes from the tooltip/link text next to
// it (or its own aria-label when it stands alone as the collapsed trigger).
const RelayLogo = () => (
  <svg
    viewBox="0 0 24 24"
    className="size-6 shrink-0"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M13 2L4.09 12.11C3.69 12.59 3.89 13.34 4.5 13.5L11 15L11 22L19.91 11.89C20.31 11.41 20.11 10.66 19.5 10.5L13 9L13 2Z"
      fill="currentColor"
      className="text-primary"
    />
  </svg>
);

const menuItems = [
  {
    title: "Main",
    items: [
      {
        title: "Workflows",
        icon: FolderOpenIcon,
        url: "/workflows",
      },
      {
        title: "Credentials",
        icon: KeyIcon,
        url: "/credentials",
      },
      {
        title: "Executions",
        icon: HistoryIcon,
        url: "/executions",
      },
    ],
  },
];
export const AppSidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { hasActiveSubscription, isLoading } =
    useHasActiveSubscription();
  const { resolvedTheme, setTheme } = useTheme();
  const { state, toggleSidebar } = useSidebar();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering theme-dependent UI after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {state === "collapsed" ? (
              // Collapsed: no room for a separate trigger button, so the
              // logo itself becomes the trigger — hovering it explains what
              // clicking it does, via SidebarMenuButton's built-in tooltip
              // (which only renders in the collapsed state to begin with).
              <SidebarMenuButton
                tooltip="Open sidebar"
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                className="h-10 px-4"
              >
                <RelayLogo />
              </SidebarMenuButton>
            ) : (
              <div className="flex items-center gap-1">
                <SidebarMenuButton
                  asChild
                  className="flex-1 gap-x-1.5 h-10 px-4 hover:bg-transparent active:bg-transparent focus-visible:ring-0"
                >
                  <Link href="/" prefetch>
                    <span className="flex items-center gap-1.5">
                      <RelayLogo />
                      <span className="font-semibold text-xl dark:text-white font-poppins tracking-tight">
                        relay
                      </span>
                    </span>
                    {hasActiveSubscription && (
                      <Badge
                        variant={"secondary"}
                        className="font-semibold tracking-wider"
                      >
                        Pro
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
                {/* SidebarMenuButton's own tooltip prop is deliberately
                  suppressed once expanded (its label is already visible) —
                  this trigger has no visible label of its own, so it needs
                  a real always-shown tooltip instead. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="Close sidebar"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                      <PanelLeftIcon className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Close sidebar
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {menuItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={
                        item.url === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.url)
                      }
                      asChild
                      className="gap-x-4 h-10 px-4"
                    >
                      {/* prefetch enables background loading of linked routes as they enter the viewport, ensuring near-instant navigation by caching page data before the user clicks.*/}
                      <Link href={item.url} prefetch>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {!hasActiveSubscription && !isLoading && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Upgrade to Pro"
                className="gap-x-4 h-10 px-4"
                onClick={() => {
                  checkout({ slug: "pro" });
                }}
              >
                <StarIcon className="h-4 w-4" />
                <span>Upgrade to pro</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Profile"
              isActive={pathname === "/profile"}
              asChild
              className="gap-x-4 h-10 px-4"
            >
              <Link href="/profile" prefetch>
                <UserIcon className="h-4 w-4" />
                <span>Profile</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Billing Portal"
              className="gap-x-4 h-10 px-4"
              onClick={() => {}}
            >
              <CreditCardIcon className="h-4 w-4" />
              <span>Billing Portal</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={
                mounted && resolvedTheme === "dark"
                  ? "Light Mode"
                  : "Dark Mode"
              }
              className="gap-x-4 h-10 px-4"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {mounted && resolvedTheme === "dark" ? (
                <SunIcon className="h-4 w-4" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
              <span>
                {mounted && resolvedTheme === "dark"
                  ? "Light Mode"
                  : "Dark Mode"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Logout"
              className="gap-x-4 h-10 px-4"
              onClick={() => {
                signOut({
                  fetchOptions: {
                    onSuccess: () => router.push("/login"),
                  },
                });
              }}
            >
              <LogOutIcon className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
