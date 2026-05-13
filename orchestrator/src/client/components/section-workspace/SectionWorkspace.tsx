import { Search } from "lucide-react";
import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SectionWorkspaceBadge = {
  label: string;
  variant?: React.ComponentProps<typeof Badge>["variant"];
};

export type SectionWorkspaceItem<TSectionId extends string = string> = {
  id: TSectionId;
  label: string;
  description: string;
  searchTerms?: string[];
};

export type SectionWorkspaceGroup<
  TGroupId extends string = string,
  TSectionId extends string = string,
> = {
  id: TGroupId;
  label: string;
  items: SectionWorkspaceItem<TSectionId>[];
};

type SectionWorkspaceNavProps<
  TGroupId extends string = string,
  TSectionId extends string = string,
> = {
  groups: SectionWorkspaceGroup<TGroupId, TSectionId>[];
  activeSectionId?: TSectionId | null;
  openGroupIds: TGroupId[];
  onOpenGroupIdsChange: (value: TGroupId[]) => void;
  onSectionSelect: (sectionId: TSectionId) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  searchPlaceholder: string;
  searchEmptyLabel: string;
  getItemBadge?: (sectionId: TSectionId) => SectionWorkspaceBadge | null;
};

export function sectionWorkspaceItemMatchesSearch(
  searchTerm: string,
  item: SectionWorkspaceItem,
): boolean {
  if (!searchTerm) return true;
  const normalized = searchTerm.toLowerCase();
  const haystack = [
    item.label,
    item.description,
    ...(item.searchTerms ?? []),
  ].join(" ");
  return haystack.toLowerCase().includes(normalized);
}

export function SectionWorkspaceNav<
  TGroupId extends string = string,
  TSectionId extends string = string,
>({
  groups,
  activeSectionId,
  openGroupIds,
  onOpenGroupIdsChange,
  onSectionSelect,
  searchValue,
  onSearchValueChange,
  searchPlaceholder,
  searchEmptyLabel,
  getItemBadge,
}: SectionWorkspaceNavProps<TGroupId, TSectionId>) {
  const trimmedSearch = searchValue.trim();
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="border-b px-4 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchValueChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label={searchPlaceholder}
            />
          </div>
        </div>
        <div className="p-2">
          {groups.length > 0 ? (
            <Accordion
              type="multiple"
              value={
                trimmedSearch ? groups.map((group) => group.id) : openGroupIds
              }
              onValueChange={(value) =>
                onOpenGroupIdsChange(value as TGroupId[])
              }
              className="space-y-1"
            >
              {groups.map((group) => (
                <AccordionItem
                  key={group.id}
                  value={group.id}
                  className="border-b border-border/60 px-2 last:border-b-0"
                >
                  <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:no-underline">
                    {group.label}
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const isActive = item.id === activeSectionId;
                        const badge = getItemBadge?.(item.id) ?? null;
                        return (
                          <Button
                            key={item.id}
                            type="button"
                            variant="ghost"
                            className={cn(
                              "h-auto min-h-9 w-full justify-start gap-2 rounded-md px-3 py-2 text-left text-sm font-medium",
                              isActive
                                ? "border border-primary/40 bg-primary/12 text-white hover:bg-primary/18"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                            )}
                            onClick={() => onSectionSelect(item.id)}
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {item.label}
                            </span>
                            {badge ? (
                              <Badge
                                variant={badge.variant ?? "secondary"}
                                className="shrink-0"
                              >
                                {badge.label}
                              </Badge>
                            ) : null}
                          </Button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {searchEmptyLabel} “{trimmedSearch}”.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

type SectionWorkspacePanelProps = {
  groupLabel: string;
  sectionLabel: string;
  sectionDescription: string;
  badge?: SectionWorkspaceBadge | null;
  secondaryBadge?: SectionWorkspaceBadge | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
};

export function SectionWorkspacePanel({
  groupLabel,
  sectionLabel,
  sectionDescription,
  badge,
  secondaryBadge,
  actions,
  children,
  footer,
  scrollable = false,
}: SectionWorkspacePanelProps) {
  const header = (
    <header
      className={cn(
        "space-y-4 border-b border-border/70 pb-5",
        scrollable && "sticky top-0 z-10 shrink-0 bg-card px-6 pt-6",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
        <span>{groupLabel}</span>
        <span>/</span>
        <span>{sectionLabel}</span>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {sectionLabel}
            </h2>
            {badge ? (
              <Badge variant={badge.variant ?? "secondary"}>
                {badge.label}
              </Badge>
            ) : null}
            {secondaryBadge ? (
              <Badge variant={secondaryBadge.variant ?? "secondary"}>
                {secondaryBadge.label}
              </Badge>
            ) : null}
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {sectionDescription}
          </p>
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-nowrap gap-2 self-start">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );

  if (!scrollable) {
    return (
      <section className="h-fit space-y-4 rounded-2xl border border-border/70 bg-card p-6">
        {header}

        {children}

        {footer}
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card">
      {header}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-4">
          {children}

          {footer}
        </div>
      </div>
    </section>
  );
}
