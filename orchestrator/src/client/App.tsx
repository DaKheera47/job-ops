/**
 * Main App component.
 */

import React, { useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CSSTransition, SwitchTransition } from "react-transition-group";

import { Toaster } from "@/components/ui/sonner";
import { BasicAuthPrompt } from "./components/BasicAuthPrompt";
import { OnboardingGate } from "./components/OnboardingGate";
import { useDemoInfo } from "./hooks/useDemoInfo";
import { HomePage } from "./pages/HomePage";
import { JobPage } from "./pages/JobPage";
import { OrchestratorPage } from "./pages/OrchestratorPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VisaSponsorsPage } from "./pages/VisaSponsorsPage";

export const App: React.FC = () => {
  const location = useLocation();
  const nodeRef = useRef<HTMLDivElement>(null);
  const demoInfo = useDemoInfo();

  // Determine a stable key for transitions to avoid unnecessary unmounts when switching sub-tabs
  const pageKey = React.useMemo(() => {
    const firstSegment = location.pathname.split("/")[1] || "ready";
    if (["ready", "discovered", "applied", "all"].includes(firstSegment)) {
      return "orchestrator";
    }
    return firstSegment;
  }, [location.pathname]);

  return (
    <>
      <OnboardingGate />
      <BasicAuthPrompt />
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
                <Route path="/" element={<Navigate to="/ready" replace />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/job/:id" element={<JobPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/visa-sponsors" element={<VisaSponsorsPage />} />
                <Route path="/:tab" element={<OrchestratorPage />} />
                <Route path="/:tab/:jobId" element={<OrchestratorPage />} />
              </Routes>
            </div>
          </CSSTransition>
        </SwitchTransition>
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
};
