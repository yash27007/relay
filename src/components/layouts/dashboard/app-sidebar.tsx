/** biome-ignore-all assist/source/organizeImports: <explanation> */
"use client"
import {
    CreditCardIcon,
    FolderOpenIcon,
    HistoryIcon,
    KeyIcon,
    LogOutIcon,
    StarIcon,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { signOut } from "@/lib/auth-client"

import { usePathname, useRouter } from "next/navigation"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from "@/components/ui/sidebar"


const menuItems = [
    {
        title: "Main",
        items: [{
            title: "Workflows",
            icon: FolderOpenIcon,
            url: '/workflows'
        },
        {
            title: "Credentials",
            icon: KeyIcon,
            url: "/credentials"
        },
        {
            title: "Executions",
            icon: HistoryIcon,
            url: "/executions"
        }
        ]
    }
]
export const AppSidebar = () => {
    const pathname = usePathname()
    const router = useRouter()
    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild className="gap-x-4 h-10 px-4 hover:bg-accent/0">
                            <Link href="/" prefetch>
                                <Image src="/logo.svg" alt="Relay" width={30} height={30} />
                                <span className="font-semibold text-xl">Relay</span>
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
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Upgrade to Pro" className="gap-x-4 h-10 px-4"
                            onClick={() => { }}
                        >
                            <StarIcon className="h-4 w-4" />
                            <span>Upgrade to pro</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Billing Portal"
                            className="gap-x-4 h-10 px-4"
                            onClick={() => { }}
                        >
                            <CreditCardIcon className="h-4 w-4" />
                            <span>Billing Portal</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton tooltip="Logout"
                            className="gap-x-4 h-10 px-4"
                            onClick={() => {
                                signOut({
                                    fetchOptions: {
                                        onSuccess: () => router.push("/login")
                                    }
                                })
                            }}
                        >
                            <LogOutIcon className="h-4 w-4" />
                            <span>Logout</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}