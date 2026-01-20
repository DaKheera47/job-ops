/**
 * UK Visa Sponsors search page.
 * Allows searching the government's list of licensed visa sponsors.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Search,
  Shield,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import { cn, formatDateTime } from "@/lib/utils";
import {
  PageHeader,
  StatusIndicator,
  ListItem,
  EmptyState,
  ScoreMeter,
  SplitLayout,
  ListPanel,
  DetailPanel,
  PageMain,
} from "../components";
import * as api from "../api";
import type {
  VisaSponsor,
  VisaSponsorSearchResult,
  VisaSponsorStatusResponse,
} from "../../shared/types";

const getScoreTokens = (score: number) => {
  if (score >= 90)
    return { badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" };
  if (score >= 70)
    return { badge: "border-amber-500/30 bg-amber-500/10 text-amber-200" };
  if (score >= 50)
    return { badge: "border-orange-500/30 bg-orange-500/10 text-orange-200" };
  return { badge: "border-rose-500/30 bg-rose-500/10 text-rose-200" };
};

export const VisaSponsorsPage: React.FC = () => {
  // State
  const [status, setStatus] = useState<VisaSponsorStatusResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<VisaSponsorSearchResult[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgDetails, setOrgDetails] = useState<VisaSponsor[]>([]);

  // Loading states
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => (typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false),
  );

  // Fetch status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const data = await api.getVisaSponsorStatus();
      setStatus(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch status";
      toast.error(message);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Search with debounce
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await api.searchVisaSponsors({
        query: query.trim(),
        limit: 100,
        minScore: 20,
      });
      setResults(response.results);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      toast.error(message);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // Auto-select first result
  useEffect(() => {
    if (results.length === 0) {
      setSelectedOrg(null);
      setOrgDetails([]);
      return;
    }
    if (!selectedOrg || !results.some((r) => r.sponsor.organisationName === selectedOrg)) {
      const firstOrg = results[0].sponsor.organisationName;
      setSelectedOrg(firstOrg);
      fetchOrgDetails(firstOrg);
    }
  }, [results]);

  useEffect(() => {
    if (!selectedOrg) {
      setIsDetailDrawerOpen(false);
    }
  }, [selectedOrg]);

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

  // Fetch organization details
  const fetchOrgDetails = async (orgName: string) => {
    setIsLoadingDetails(true);
    setSelectedOrg(orgName);
    try {
      const details = await api.getVisaSponsorOrganization(orgName);
      setOrgDetails(details);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch details";
      toast.error(message);
      setOrgDetails([]);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Trigger manual update
  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const result = await api.updateVisaSponsorList();
      setStatus(result.status);
      toast.success(result.message);
      if (searchQuery.trim()) {
        handleSearch(searchQuery);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSelectOrg = (orgName: string) => {
    fetchOrgDetails(orgName);
    if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  };

  const selectedResult = useMemo(
    () => results.find((r) => r.sponsor.organisationName === selectedOrg) ?? null,
    [results, selectedOrg]
  );

  const isUpdateInProgress = isUpdating || status?.isUpdating;

  const detailPanelContent = !selectedOrg ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="text-base font-semibold">Select a company</div>
      <p className="text-sm text-muted-foreground">
        Pick a company from the results to see details here.
      </p>
    </div>
  ) : isLoadingDetails ? (
    <div className="flex items-center justify-center h-32">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            Licensed Sponsor
          </span>
          {selectedResult && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                getScoreTokens(selectedResult.score).badge
              )}
            >
              {selectedResult.score}% Match
            </span>
          )}
        </div>
        <h2 className="text-lg font-semibold text-foreground">{selectedOrg}</h2>
      </div>

      {/* Location */}
      {orgDetails.length > 0 && (orgDetails[0].townCity || orgDetails[0].county) && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Location
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            {[orgDetails[0].townCity, orgDetails[0].county].filter(Boolean).join(", ")}
          </div>
        </div>
      )}

      {/* Licence types / routes */}
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
          Licensed Routes ({orgDetails.length})
        </div>
        <div className="space-y-2">
          {orgDetails.map((entry, index) => (
            <div
              key={index}
              className="rounded-lg border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <Badge variant="secondary" className="text-xs">
                  {entry.route}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Type & Rating:</span>{" "}
                {entry.typeRating}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
        <div className="font-medium text-sky-200 mb-1">What does this mean?</div>
        <p className="text-xs text-sky-300/80">
          This organisation is licensed by the UK Home Office to sponsor workers on the
          routes listed above. An "A rating" means they're fully compliant.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        icon={Shield}
        title="Visa Sponsors"
        subtitle="UK Register Search"
        statusIndicator={isUpdateInProgress ? <StatusIndicator label="Updating" /> : undefined}
        actions={
          <>
            {status && (
              <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground mr-2">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {status.totalSponsors.toLocaleString()} sponsors
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTime(status.lastUpdated) || "Never"}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleUpdate}
              disabled={isUpdateInProgress}
              aria-label="Update sponsor list"
            >
              {isUpdateInProgress ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </>
        }
      />

      <PageMain>
        {/* Search section */}
        <section className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Company name
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search for a company name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-10"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a company name to check if they're a licensed UK visa sponsor.
            </p>
          </div>
        </section>

        <SplitLayout>
          {/* Left panel - Results */}
          <ListPanel
            footer={
              results.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {results.length} result{results.length !== 1 ? "s" : ""}
                  {isSearching && (
                    <span className="ml-2">
                      <Loader2 className="inline h-3 w-3 animate-spin" />
                    </span>
                  )}
                </div>
              ) : null
            }
          >
            {!isLoadingStatus && status?.totalSponsors === 0 && (
              <EmptyState
                icon={AlertCircle}
                title="No sponsor data available"
                description="The visa sponsor list hasn't been downloaded yet."
                action={
                  <Button size="sm" onClick={handleUpdate} disabled={isUpdating}>
                    {isUpdating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download List
                      </>
                    )}
                  </Button>
                }
              />
            )}

            {status && status.totalSponsors > 0 && !searchQuery && (
              <EmptyState
                icon={Search}
                title="Search for a company"
                description="Enter a company name above to check the sponsor register."
              />
            )}

            {searchQuery && !isSearching && results.length === 0 && (
              <EmptyState
                icon={AlertCircle}
                title="No matches found"
                description={`No sponsors match "${searchQuery}". Try a different spelling.`}
              />
            )}

            {results.length > 0 &&
              results.map((result, index) => (
                <ListItem
                  key={`${result.sponsor.organisationName}-${index}`}
                  selected={selectedOrg === result.sponsor.organisationName}
                  onClick={() => handleSelectOrg(result.sponsor.organisationName)}
                  className="gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">
                        {result.sponsor.organisationName}
                      </span>
                    </div>
                    {(result.sponsor.townCity || result.sponsor.county) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[result.sponsor.townCity, result.sponsor.county]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ScoreMeter score={result.score} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </ListItem>
              ))}
          </ListPanel>

          {/* Right panel - Details */}
          <DetailPanel className="hidden lg:block">
            {detailPanelContent}
          </DetailPanel>
        </SplitLayout>
      </PageMain>

      <Drawer open={isDetailDrawerOpen} onOpenChange={setIsDetailDrawerOpen}>
        <DrawerContent className="max-h-[90vh]">
          <div className="flex items-center justify-between px-4 pt-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sponsor details</div>
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
