import Link from "next/link";
import Image from "next/image";
export function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-sm space-y-8">
                <Link
                    href="/"
                    className="flex items-center justify-center gap-3"
                >
                    <Image
                        alt="Relay"
                        src="/logo.svg"
                        width={30}
                        height={30}
                        priority
                    />
                    <span className="text-2xl font-medium tracking-tight text-foreground">
                        Relay
                    </span>
                </Link>
                {children}
            </div>
        </div>
    )
}