"use client";
import {
  CreditCardIcon,
  FolderOpenIcon,
  HistoryIcon,
  KeyIcon,
  LogOutIcon,
  MoonIcon,
  StarIcon,
  SunIcon,
} from "lucide-react";
import Image from "next/image";
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
} from "@/components/ui/sidebar";
import { checkout, signOut } from "@/lib/auth-client";

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
            <SidebarMenuButton
              asChild
              className="gap-x-4 h-10 px-4 hover:bg-transparent active:bg-transparent focus-visible:ring-0"
            >
              <Link href="/" prefetch className="">
                <span className="flex items-center gap-1.5">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M13 2L4.09 12.11C3.69 12.59 3.89 13.34 4.5 13.5L11 15L11 22L19.91 11.89C20.31 11.41 20.11 10.66 19.5 10.5L13 9L13 2Z"
                      fill="currentColor"
                      className="text-primary"
                    />
                  </svg>
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
              tooltip="Billing Portal"
              className="gap-x-4 h-10 px-4"
              onClick={() => { }}
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
