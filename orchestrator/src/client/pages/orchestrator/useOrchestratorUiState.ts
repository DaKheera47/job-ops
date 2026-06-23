import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useKeyboardAvailability } from "@client/hooks/useKeyboardAvailability";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface UseOrchestratorUiStateArgs {
  isSearchComposerVisible: boolean;
  selectedJobId: string | null;
  onClearSelectedJob: () => void;
}

export function useOrchestratorUiState({
  isSearchComposerVisible,
  selectedJobId,
  onClearSelectedJob,
}: UseOrchestratorUiStateArgs) {
  const [navOpen, setNavOpen] = useState(false);
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : false,
  );
  const hasKeyboard = useKeyboardAvailability();
  const demoInfo = useDemoInfo();

  useEffect(() => {
    if (!selectedJobId) {
      setIsDetailDrawerOpen(false);
    } else if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  }, [selectedJobId, isDesktop]);

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
    if (demoInfo?.demoMode) return;
    if (!hasKeyboard) return;
    const hasSeen = localStorage.getItem("has-seen-keyboard-shortcuts");
    if (!hasSeen) {
      setIsHelpDialogOpen(true);
    }
  }, [demoInfo?.demoMode, hasKeyboard]);

  const openDetailDrawerForMobile = useCallback(() => {
    if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  }, [isDesktop]);

  const onDetailDrawerOpenChange = useCallback(
    (open: boolean) => {
      setIsDetailDrawerOpen(open);
      if (!open && !isDesktop) {
        onClearSelectedJob();
      }
    },
    [isDesktop, onClearSelectedJob],
  );

  const onHelpDialogOpenChange = useCallback((open: boolean) => {
    setIsHelpDialogOpen(open);
    if (!open) {
      localStorage.setItem("has-seen-keyboard-shortcuts", "true");
    }
  }, []);

  const isAnyModalOpen =
    isSearchComposerVisible ||
    isCommandBarOpen ||
    isFiltersOpen ||
    isHelpDialogOpen ||
    isDetailDrawerOpen ||
    navOpen;

  const isAnyModalOpenExcludingCommandBar =
    isSearchComposerVisible ||
    isFiltersOpen ||
    isHelpDialogOpen ||
    isDetailDrawerOpen ||
    navOpen;

  const isAnyModalOpenExcludingHelp =
    isSearchComposerVisible ||
    isCommandBarOpen ||
    isFiltersOpen ||
    isDetailDrawerOpen ||
    navOpen;

  return {
    navOpen,
    setNavOpen,
    isCommandBarOpen,
    setIsCommandBarOpen,
    isFiltersOpen,
    setIsFiltersOpen,
    isHelpDialogOpen,
    setIsHelpDialogOpen: setIsHelpDialogOpen as React.Dispatch<
      React.SetStateAction<boolean>
    >,
    isDetailDrawerOpen,
    isDesktop,
    isAnyModalOpen,
    isAnyModalOpenExcludingCommandBar,
    isAnyModalOpenExcludingHelp,
    openDetailDrawerForMobile,
    onDetailDrawerOpenChange,
    onHelpDialogOpenChange,
  };
}
