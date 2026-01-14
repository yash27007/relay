import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import Link from "next/link";

type EntityHeaderProps = {
    title: string,
    description?: string,
    newButtonLabel: string,
    disabled?: boolean,
    iscreating?: boolean
} & (
        | { onNew: () => void; newButtonHref?: never }
        | { newButtonHref: string, onNew?: never }
        | { onNew?: never; newButtonHref?: never }
    );

export const EntityHeader = ({
    title,
    description,
    onNew,
    newButtonLabel,
    newButtonHref,
    disabled,
    iscreating

}: EntityHeaderProps) => {
    return (
        <div className="flex flex-row items-center justify-between gap-x-4">
            <div className="flex flex-col">
                <h1 className="text-lg md:text-xl font-semibold">
                    {title}
                </h1>
                {description && (
                    <p className="text-xs md:text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            {onNew && !newButtonHref && (
                <Button disabled={iscreating || disabled} className="size-sm" onClick={onNew}>
                    <PlusIcon className="size-4" />
                    {newButtonLabel}
                </Button>
            )}
            {!onNew && newButtonHref && (
                <Button className="size-sm" asChild>
                    <Link href={newButtonHref} prefetch>
                        <PlusIcon className="size-4" />
                        {newButtonLabel}
                    </Link>
                </Button>
            )}
        </div>
    )
};


type EntityContainerProps = {
    children: React.ReactNode
    header?: React.ReactNode
    search?: React.ReactNode
    pagination?: React.ReactNode
}

export const EntityContainer = ({
    children,
    header,
    search,
    pagination
}: EntityContainerProps) => {
    return (
        <div className="p-4 md:px-10 md:py-6 h-full">
            <div className="max-auto max-w-7xl w-full flex flex-col gap-y-8 h-full">
                {header}

                <div className="flex flex-col gap-y-4 h-full">
                    {search}
                    {children}
                </div>
                {pagination}
            </div>
        </div>
    )
}