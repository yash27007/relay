import { AuthLayout } from "@/components/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <AuthLayout>
            {children}
        </AuthLayout>
    )
}