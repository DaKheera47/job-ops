import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { useState } from "react"

import { Accordion } from "@/components/ui/accordion"
import { ResumeProjectsSection } from "./ResumeProjectsSection"
import type { ResumeProjectCatalogItem, ResumeProjectsSettings } from "@shared/types"

const profileProjects: ResumeProjectCatalogItem[] = [
  {
    id: "proj-1",
    name: "Project One",
    description: "Desc 1",
    date: "2024",
    isVisibleInBase: true,
  },
  {
    id: "proj-2",
    name: "Project Two",
    description: "Desc 2",
    date: "2023",
    isVisibleInBase: false,
  },
]

const ResumeProjectsHarness = ({ initialDraft }: { initialDraft: ResumeProjectsSettings | null }) => {
  const [draft, setDraft] = useState<ResumeProjectsSettings | null>(initialDraft)
  const lockedCount = draft?.lockedProjectIds.length ?? 0

  return (
    <Accordion type="multiple" defaultValue={["resume-projects"]}>
      <ResumeProjectsSection
        resumeProjectsDraft={draft}
        setResumeProjectsDraft={setDraft}
        profileProjects={profileProjects}
        lockedCount={lockedCount}
        maxProjectsTotal={profileProjects.length}
        isLoading={false}
        isSaving={false}
      />
    </Accordion>
  )
}

describe("ResumeProjectsSection", () => {
  it("clamps max projects to the locked count", async () => {
    render(
      <ResumeProjectsHarness
        initialDraft={{
          maxProjects: 2,
          lockedProjectIds: ["proj-1"],
          aiSelectableProjectIds: ["proj-2"],
        }}
      />
    )

    const input = screen.getByRole("spinbutton")
    fireEvent.change(input, { target: { value: "0" } })

    await waitFor(() => expect(input).toHaveValue(1))
  })

  it("locks projects and enforces maxProjects >= locked count", () => {
    render(
      <ResumeProjectsHarness
        initialDraft={{
          maxProjects: 0,
          lockedProjectIds: [],
          aiSelectableProjectIds: ["proj-1"],
        }}
      />
    )

    const checkboxes = screen.getAllByRole("checkbox")
    const lockedCheckbox = checkboxes[0]
    const aiSelectableCheckbox = checkboxes[1]

    fireEvent.click(lockedCheckbox)

    expect(lockedCheckbox).toBeChecked()
    expect(aiSelectableCheckbox).toBeChecked()
    expect(aiSelectableCheckbox).toBeDisabled()

    const input = screen.getByRole("spinbutton")
    expect(input).toHaveValue(1)
  })
})
