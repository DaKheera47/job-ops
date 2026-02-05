/**
 * Main App component.
 */

import React, { useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CSSTransition, SwitchTransition } from "react-transition-group";

import { Toaster } from "@/components/ui/sonner";
import * as api from "./api";
import { OnboardingGate } from "./components/OnboardingGate";
import { HomePage } from "./pages/HomePage";
import { JobPage } from "./pages/JobPage";
import { OrchestratorPage } from "./pages/OrchestratorPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UkVisaJobsPage } from "./pages/UkVisaJobsPage";
import { VisaSponsorsPage } from "./pages/VisaSponsorsPage";

export const App: React.FC = () => {
  const location = useLocation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [demoInfo, setDemoInfo] = React.useState<{
    demoMode: boolean;
    resetCadenceHours: number;
  } | null>(null);

  // Determine a stable key for transitions to avoid unnecessary unmounts when switching sub-tabs
  const pageKey = React.useMemo(() => {
    const firstSegment = location.pathname.split("/")[1] || "ready";
    if (["ready", "discovered", "applied", "all"].includes(firstSegment)) {
      return "orchestrator";
    }
    return firstSegment;
  }, [location.pathname]);

  React.useEffect(() => {
    let isCancelled = false;
    void api
      .getDemoInfo()
      .then((info) => {
        if (!isCancelled) {
          setDemoInfo({
            demoMode: info.demoMode,
            resetCadenceHours: info.resetCadenceHours,
          });
        }
      })
      .catch(() => {
        if (!isCancelled) setDemoInfo(null);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <>
      <OnboardingGate />
      {demoInfo?.demoMode && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          Demo mode: integrations are simulated and data resets every{" "}
          {demoInfo.resetCadenceHours} hours.
        </div>
      )}
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
              <Route path="/" element={<Navigate to="/ready" replace />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/job/:id" element={<JobPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/ukvisajobs" element={<UkVisaJobsPage />} />
              <Route path="/visa-sponsors" element={<VisaSponsorsPage />} />
              <Route path="/:tab" element={<OrchestratorPage />} />
              <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
            </Routes>
          </div>
        </CSSTransition>
      </SwitchTransition>

      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
};
