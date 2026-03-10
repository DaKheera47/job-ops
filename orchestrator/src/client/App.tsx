/**
 * Main App component.
 */

import { X } from "lucide-react";
import React, { useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CSSTransition, SwitchTransition } from "react-transition-group";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { BasicAuthPrompt } from "./components/BasicAuthPrompt";
import { OnboardingGate } from "./components/OnboardingGate";
import { useDemoInfo } from "./hooks/useDemoInfo";
import { GmailOauthCallbackPage } from "./pages/GmailOauthCallbackPage";
import { HomePage } from "./pages/HomePage";
import { InProgressBoardPage } from "./pages/InProgressBoardPage";
import { JobPage } from "./pages/JobPage";
import { OrchestratorPage } from "./pages/OrchestratorPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TracerLinksPage } from "./pages/TracerLinksPage";
import { TrackingInboxPage } from "./pages/TrackingInboxPage";
import { VisaSponsorsPage } from "./pages/VisaSponsorsPage";

/** Backwards-compatibility redirects: old URL paths -> new URL paths */
const REDIRECTS: Array<{ from: string; to: string }> = [
  { from: "/", to: "/jobs/ready" },
  { from: "/home", to: "/overview" },
  { from: "/ready", to: "/jobs/ready" },
  { from: "/ready/:jobId", to: "/jobs/ready/:jobId" },
  { from: "/discovered", to: "/jobs/discovered" },
  { from: "/discovered/:jobId", to: "/jobs/discovered/:jobId" },
  { from: "/applied", to: "/jobs/applied" },
  { from: "/applied/:jobId", to: "/jobs/applied/:jobId" },
  { from: "/in-progress", to: "/applications/in-progress" },
  { from: "/in-progress/:jobId", to: "/applications/in-progress" },
  { from: "/jobs/in_progress", to: "/applications/in-progress" },
  { from: "/jobs/in_progress/:jobId", to: "/applications/in-progress" },
  { from: "/all", to: "/jobs/all" },
  { from: "/all/:jobId", to: "/jobs/all/:jobId" },
];

const DEMO_WAITLIST_BANNER_DISMISSED_KEY = "jobops.demoWaitlistBannerDismissed";

export const App: React.FC = () => {
  const location = useLocation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const demoInfo = useDemoInfo();
  const [demoWaitlistBannerDismissed, setDemoWaitlistBannerDismissed] =
    useState(() => {
      try {
        return localStorage.getItem(DEMO_WAITLIST_BANNER_DISMISSED_KEY) === "1";
      } catch {
        return false;
      }
    });

  // Determine a stable key for transitions to avoid unnecessary unmounts when switching sub-tabs
  const pageKey = React.useMemo(() => {
    const firstSegment = location.pathname.split("/")[1] || "jobs";
    if (firstSegment === "jobs") {
      return "orchestrator";
    }
    return firstSegment;
  }, [location.pathname]);

  return (
    <>
      <OnboardingGate />
      <BasicAuthPrompt />
      {demoInfo?.demoMode && !demoWaitlistBannerDismissed && (
        <div className="sticky top-0 z-50 w-full border-b border-orange-400/60 bg-orange-500 px-4 py-2 text-xs text-orange-950 shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-3">
            <p className="flex-1 text-center font-medium">
              This is a read-only demo. Want JobOps without the Docker setup? ☁️{" "}
              Cloud version coming soon — join the waitlist at{" "}
              <a
                className="font-semibold underline underline-offset-2 hover:text-orange-900"
                href="https://try.jobops.app?utm_source=demo&utm_medium=banner&utm_campaign=waitlist"
                target="_blank"
                rel="noreferrer"
              >
                try.jobops.app
              </a>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full text-orange-950 hover:bg-orange-400/30 hover:text-orange-950"
              onClick={() => {
                setDemoWaitlistBannerDismissed(true);
                try {
                  localStorage.setItem(DEMO_WAITLIST_BANNER_DISMISSED_KEY, "1");
                } catch {
                  // Ignore storage errors in restricted browser contexts.
                }
              }}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss demo waitlist banner</span>
            </Button>
          </div>
        </div>
      )}
      {demoInfo?.demoMode && (
        <div className="w-full border-b border-amber-400/50 bg-amber-500/20 px-4 py-2 text-center text-xs text-amber-100 backdrop-blur">
          Demo mode: integrations are simulated and data resets every{" "}
          {demoInfo.resetCadenceHours} hours.
        </div>
      )}
      <div>
        <SwitchTransition mode="out-in">
          <CSSTransition
            key={pageKey}
            nodeRef={nodeRef}
            timeout={100}
            classNames="page"
            unmountOnExit
          >
            <div ref={nodeRef}>
              <Routes location={location}>
                {/* Backwards-compatibility redirects */}
                {REDIRECTS.map(({ from, to }) => (
                  <Route
                    key={from}
                    path={from}
                    element={<Navigate to={to} replace />}
                  />
                ))}

                {/* Application routes */}
                <Route path="/overview" element={<HomePage />} />
                <Route
                  path="/oauth/gmail/callback"
                  element={<GmailOauthCallbackPage />}
                />
                <Route path="/job/:id" element={<JobPage />} />
                <Route
                  path="/applications/in-progress"
                  element={<InProgressBoardPage />}
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/tracer-links" element={<TracerLinksPage />} />
                <Route path="/visa-sponsors" element={<VisaSponsorsPage />} />
                <Route path="/tracking-inbox" element={<TrackingInboxPage />} />
                <Route path="/jobs/:tab" element={<OrchestratorPage />} />
                <Route
                  path="/jobs/:tab/:jobId"
                  element={<OrchestratorPage />}
                />
              </Routes>
            </div>
          </CSSTransition>
        </SwitchTransition>
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
};
