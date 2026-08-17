import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Image src="/logo.svg" alt="" width={18} height={18} className="opacity-70" />
          <span>
            Developed by{" "}
            <a
              href="https://github.com/yash27007"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Yashwanth Aravind
            </a>
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <a
            href="https://github.com/yash27007"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Image src="/github.svg" alt="" width={16} height={16} className="opacity-70 dark:invert" />
            GitHub
          </a>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup" className="text-muted-foreground hover:text-foreground">
            Sign up
          </Link>
        </div>
      </div>
    </footer>
  );
}
