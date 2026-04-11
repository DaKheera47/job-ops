import { useOnboardingRequirement } from "@client/hooks/useOnboardingRequirement";
import type React from "react";
import { Navigate, useLocation } from "react-router-dom";

export const OnboardingGate: React.FC = () => {
  const location = useLocation();
  const { checking, complete } = useOnboardingRequirement();

  if (location.pathname === "/onboarding") {
    return null;
  }

  if (checking || complete) {
    return null;
  }

  return <Navigate to="/onboarding" replace />;
};
