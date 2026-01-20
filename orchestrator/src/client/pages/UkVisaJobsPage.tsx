/**
 * UK Visa Jobs search page.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  DollarSign,
  ExternalLink,
  GraduationCap,
  Home,
  Loader2,
  MapPin,
  Menu,
  Search,
  Settings,
  Shield,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn, formatDate, formatDateTime, stripHtml } from "@/lib/utils";
import * as api from "../api";
import type { CreateJobInput } from "../../shared/types";

const clampText = (value: string, max = 160) => (value.length > max ? `${value.slice(0, max).trim()}...` : value);

const jobKey = (job: CreateJobInput) => job.sourceJobId || job.jobUrl;

const navLinks = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/visa-sponsors", label: "Visa Sponsors", icon: Shield },
  { to: "/ukvisajobs", label: "UK Visa Jobs", icon: Briefcase },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const UkVisaJobsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [searchTermInput, setSearchTermInput] = useState("");
  const [activeSearchTerm, setActiveSearchTerm] = useState<string | null>(null);
  const [results, setResults] = useState<CreateJobInput[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastSearchTerm, setLastSearchTerm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => (typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false),
  );

  useEffect(() => {
    if (results.length === 0) {
      setSelectedJobId(null);
      return;
    }
    const firstKey = jobKey(results[0]);
    if (!selectedJobId || !results.some((job) => jobKey(job) === selectedJobId)) {
      setSelectedJobId(firstKey);
    }
  }, [results, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setIsDetailDrawerOpen(false);
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => setIsDesktop(media.matches);
    handleChange();
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (isDesktop && isDetailDrawerOpen) {
      setIsDetailDrawerOpen(false);
    }
  }, [isDesktop, isDetailDrawerOpen]);

  useEffect(() => {
    setSelectedJobIds(new Set());
  }, [results]);

  const selectedJob = useMemo(
    () => (selectedJobId ? results.find((job) => jobKey(job) === selectedJobId) ?? null : null),
    [results, selectedJobId],
  );

  const summaryCounts = useMemo(() => {
    const startIndex = totalJobs === 0 ? 0 : (page - 1) * pageSize + 1;
    const endIndex = totalJobs === 0 ? 0 : Math.min(page * pageSize, totalJobs);
    return {
      startIndex,
      endIndex,
    };
  }, [page, pageSize, totalJobs]);

  const runSearch = async ({ term, pageNumber }: { term: string | null; pageNumber: number }) => {
    try {
      setIsSearching(true);
      setErrorMessage(null);
      const response = await api.searchUkVisaJobs({
        searchTerm: term ?? undefined,
        page: pageNumber,
      });
      setResults(response.jobs);
      setPage(response.page);
      setPageSize(response.pageSize);
      setTotalJobs(response.totalJobs);
      setTotalPages(response.totalPages);
      setLastRunAt(new Date().toISOString());
      if (response.jobs.length === 0) {
        toast.message("No UK Visa Jobs found for this search.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "UK Visa Jobs search failed";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const terms = searchTermInput
      .split(/[\n,]+/)
      .map((term) => term.trim())
      .filter(Boolean);
    const term = terms[0] || null;

    if (terms.length > 1) {
      toast.message("Using the first term for pagination.");
    }

    setActiveSearchTerm(term);
    setLastSearchTerm(term);
    setPage(1);

    await runSearch({ term, pageNumber: 1 });
  };

  const handlePageChange = (nextPage: number) => {
    if (isSearching) return;
    if (nextPage < 1 || nextPage > totalPages) return;
    setPage(nextPage);
    void runSearch({ term: activeSearchTerm, pageNumber: nextPage });
  };

  const handleImportSelected = async () => {
    const selectedJobs = results.filter((job) => selectedJobIds.has(jobKey(job)));
    if (selectedJobs.length === 0) return;

    try {
      setIsImporting(true);
      const response = await api.importUkVisaJobs({ jobs: selectedJobs });
      toast.success(`Imported ${response.created} jobs`, {
        description: response.skipped ? `${response.skipped} skipped (duplicates)` : undefined,
      });
      setSelectedJobIds(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import jobs";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const selectedDescription = useMemo(() => {
    if (!selectedJob?.jobDescription) return "No description available.";
    const cleaned = stripHtml(selectedJob.jobDescription);
    return cleaned || "No description available.";
  }, [selectedJob]);

  const selectedJobLink = selectedJob ? selectedJob.applicationLink || selectedJob.jobUrl : "#";
  const selectedDeadline = selectedJob ? formatDate(selectedJob.deadline) : null;
  const selectedPosted = selectedJob ? formatDate(selectedJob.datePosted) : null;
  const selectedCount = selectedJobIds.size;
  const allSelected = results.length > 0 && results.every((job) => selectedJobIds.has(jobKey(job)));
  const selectAllState = allSelected ? true : selectedCount > 0 ? "indeterminate" : false;
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  };

  const detailPanelContent = !selectedJob ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="text-base font-semibold">Select a job</div>
      <p className="text-sm text-muted-foreground">Pick a job from the list to inspect details.</p>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{selectedJob.title}</div>
          <div className="text-sm text-muted-foreground">{selectedJob.employer}</div>
        </div>
        <Badge variant="outline" className="uppercase tracking-wide">
          UK Visa Jobs
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {selectedJob.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {selectedJob.location}
          </span>
        )}
        {selectedDeadline && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {selectedDeadline}
          </span>
        )}
        {selectedPosted && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Posted {selectedPosted}
          </span>
        )}
        {selectedJob.salary && (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            {selectedJob.salary}
          </span>
        )}
        {selectedJob.degreeRequired && (
          <span className="flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5" />
            {selectedJob.degreeRequired}
          </span>
        )}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs text-muted-foreground">Job type</div>
          <div className="font-medium">{selectedJob.jobType || "Not set"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Job level</div>
          <div className="font-medium">{selectedJob.jobLevel || "Not set"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Location</div>
          <div className="font-medium">{selectedJob.location || "Not set"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Deadline</div>
          <div className="font-medium">{selectedDeadline || "Not set"}</div>
        </div>
      </div>

      <Separator />

      <Button asChild size="sm" variant="outline" className="w-full gap-2 sm:w-auto">
        <a href={selectedJobLink} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
          View job
        </a>
      </Button>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
          {selectedDescription}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64">
                <SheetHeader>
                  <SheetTitle>JobOps</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-2">
                  {navLinks.map(({ to, label, icon: Icon }) => (
                    <button
                      key={to}
                      type="button"
                      onClick={() => {
                        if (location.pathname === to) {
                          setNavOpen(false);
                          return;
                        }
                        setNavOpen(false);
                        setTimeout(() => navigate(to), 150);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                        location.pathname === to || (to === "/" && ["/ready", "/discovered", "/applied", "/all"].includes(location.pathname))
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold tracking-tight">UK Visa Jobs</div>
              <div className="text-xs text-muted-foreground">Live search console</div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-6 pb-12">
        <section className="rounded-xl border border-border/60 bg-card/40 p-4">
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]" onSubmit={handleSearch}>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Job title search term
              </label>
              <Input
                value={searchTermInput}
                onChange={(event) => setSearchTermInput(event.target.value)}
                placeholder="e.g. data analyst"
                className="h-10"
              />
            </div>

            <div className="flex items-end">
              <Button type="submit" className="h-10 w-full gap-2" disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </div>
          </form>

          {errorMessage && (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <Separator className="my-4" />

          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              Last run: {lastRunAt ? formatDateTime(lastRunAt) : "No searches yet"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {totalJobs} total
              </Badge>
              <Badge variant="outline" className="text-xs">
                {results.length} on page
              </Badge>
              <span>
                Page {page} of {totalPages}
              </span>
              {lastSearchTerm && <span className="truncate">Term: {lastSearchTerm}</span>}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="relative min-w-0 rounded-xl border border-border/60 bg-card/40">
            {isSearching && results.length > 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/70 text-sm text-muted-foreground backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Fetching UK Visa Jobs...</span>
              </div>
            )}
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                {isSearching ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <div className="text-base font-semibold">Searching...</div>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Fetching fresh UK Visa Jobs listings.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-base font-semibold">No results yet</div>
                    <p className="max-w-md text-sm text-muted-foreground">
                      Run a search to fetch fresh UK Visa Jobs listings.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectAllState}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          setSelectedJobIds(new Set(results.map((job) => jobKey(job))));
                        } else {
                          setSelectedJobIds(new Set());
                        }
                      }}
                      aria-label="Select all jobs on this page"
                    />
                    <span>Select page</span>
                    <Separator orientation="vertical" className="h-4" />
                    <span>{selectedCount} selected</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 sm:w-auto"
                    onClick={handleImportSelected}
                    disabled={selectedCount === 0 || isImporting}
                  >
                    {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    {isImporting ? "Importing..." : "Import to DB"}
                  </Button>
                </div>
                <div className="divide-y divide-border/60">
                  {results.map((job) => {
                    const key = jobKey(job);
                    const isSelected = key === selectedJobId;
                    const isChecked = selectedJobIds.has(key);
                    const description = job.jobDescription ? clampText(stripHtml(job.jobDescription)) : "No description.";

                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectJob(key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleSelectJob(key);
                          }
                        }}
                        className={cn(
                          "flex w-full items-start gap-4 px-4 py-3 text-left transition-colors",
                          isSelected ? "bg-muted/40" : "hover:bg-muted/30",
                        )}
                        aria-pressed={isSelected}
                      >
                        <div
                          className="mt-1"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          role="presentation"
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setSelectedJobIds((current) => {
                                const next = new Set(current);
                                if (checked) {
                                  next.add(key);
                                } else {
                                  next.delete(key);
                                }
                                return next;
                              });
                            }}
                            aria-label={`Select ${job.title}`}
                          />
                        </div>
                        <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="space-y-1">
                            <div className="truncate text-sm font-semibold">{job.title}</div>
                            <div className="text-xs text-muted-foreground">{job.employer}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">{description}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {job.location}
                              </span>
                            )}
                            {job.salary && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3.5 w-3.5" />
                                {job.salary}
                              </span>
                            )}
                            {job.deadline && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {formatDate(job.deadline)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {job.jobType && (
                              <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                                {job.jobType}
                              </Badge>
                            )}
                            {job.jobLevel && (
                              <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                                {job.jobLevel}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                  <span>
                    Showing {summaryCounts.startIndex}-{summaryCounts.endIndex} of {totalJobs}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={!canGoPrev || isSearching}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={!canGoNext || isSearching}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="min-w-0 rounded-xl border border-border/60 bg-card/40 p-4 lg:sticky lg:top-24 lg:self-start hidden lg:block">
            {detailPanelContent}
          </div>
        </section>
      </main>

      <Drawer open={isDetailDrawerOpen} onOpenChange={setIsDetailDrawerOpen}>
        <DrawerContent className="max-h-[90vh]">
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Job details</div>
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                Close
              </Button>
            </DrawerClose>
          </div>
          <div className="max-h-[calc(90vh-3.5rem)] overflow-y-auto px-4 pb-6 pt-3">
            {detailPanelContent}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};
