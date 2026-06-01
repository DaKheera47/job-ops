import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type React from "react";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "@/client/hooks/useSettings";

export const OnboardingGate: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOffline = () => {
      navigate("/offline", { replace: true });
    };
    window.addEventListener("offline", handleOffline);
    return () => window.removeEventListener("offline", handleOffline);
  }, [navigate]);

  if (location.pathname === "/onboarding" && !navigator.onLine) {
    return <Navigate to="/offline" replace />;
  }

  if (
    location.pathname === "/onboarding" ||
    location.pathname === "/sign-in" ||
    location.pathname === "/offline"
  ) {
    return null;
  }

  return <OnboardingRedirect />;
};

const OnboardingRedirect: React.FC = () => {
  const { error } = useSettings();
  const { checking, complete } = useOnboardingStatus();

  if (error) {
    if (!navigator.onLine) {
      return <Navigate to="/offline" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  if (checking || complete) {
    return null;
  }

  return <Navigate to="/onboarding" replace />;
};
