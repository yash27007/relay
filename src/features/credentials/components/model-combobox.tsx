"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useModelsByCredential } from "../hooks/use-credentials";

interface ModelComboboxProps {
  credentialId: string | undefined;
  value: string | undefined;
  onChange: (value: string) => void;
}

/**
 * A searchable model picker backed by `listModels`. Deliberately not a
 * strict Select: typing a value that isn't in the fetched list (a fetch
 * failure, or a model too new to be listed yet) is still accepted via
 * "Use <text>" — this field must never block saving the node.
 */
export function ModelCombobox({ credentialId, value, onChange }: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: models, isLoading, isError, refetch } = useModelsByCredential(credentialId);

  const placeholder = !credentialId
    ? "Select a credential first"
    : isLoading
      ? "Loading models..."
      : isError
        ? "Couldn't load models"
        : "Select a model";

  const filteredModels = (models ?? []).filter((model) =>
    model.id.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!credentialId}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a model id..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isError && (
              <div className="text-muted-foreground p-2 text-xs">
                Couldn&apos;t load models.{" "}
                <button type="button" className="underline" onClick={() => refetch()}>
                  Retry
                </button>
              </div>
            )}
            {search && !filteredModels.some((model) => model.id === search) && (
              <CommandItem
                value={search}
                onSelect={() => {
                  onChange(search);
                  setOpen(false);
                }}
              >
                Use &quot;{search}&quot;
              </CommandItem>
            )}
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup>
              {filteredModels.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn("mr-2 size-4", value === model.id ? "opacity-100" : "opacity-0")}
                  />
                  {model.label ? `${model.label} (${model.id})` : model.id}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
