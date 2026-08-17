import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";

/**
 * A dropdown you can type into.
 *
 * A plain select puts every customer in one long list, so picking one off a
 * few hundred means scrolling to it. Here two or three letters of the name is
 * enough, and the phone number is searchable too — mills often remember the
 * number before the spelling.
 *
 * `options` are `{ value, label, hint }`. `hint` shows beside the name and is
 * matched when searching. `footer` is pinned below the results, which is where
 * an "add new" row belongs so it cannot be lost among them.
 */
export function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  searchPlaceholder = "Type to search…",
  emptyText = "No match.",
  footer,
  testid,
  className,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    // modal, because almost every one of these sits inside a dialog. A dialog
    // holds on to the keyboard, and a popover that does not take that over
    // opens but refuses to be typed into.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testid}
          className={cn("h-11 w-full justify-between gap-2 font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      {/* Matched to the trigger so the list never ends up narrower than the
          names in it. */}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          // Searching the name and the phone number together, so either finds
          // the right person.
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={searchPlaceholder} data-testid={testid ? `${testid}-search` : undefined} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  // cmdk matches against this, so everything searchable goes in
                  // it; what is shown is the children below.
                  value={`${o.label} ${o.hint || ""} ${o.value}`}
                  onSelect={() => { onChange(o.value); setOpen(false); }}
                  data-testid={testid ? `${testid}-option-${o.value}` : undefined}
                >
                  <Check className={cn("mr-2 h-4 w-4", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto pl-2 text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
            {footer && (
              <>
                <CommandSeparator />
                <CommandGroup>{footer({ close: () => setOpen(false) })}</CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
