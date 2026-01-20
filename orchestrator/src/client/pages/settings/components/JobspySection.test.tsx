import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useState } from "react"

import { Accordion } from "@/components/ui/accordion"
import { JobspySection } from "./JobspySection"

const JobspyHarness = () => {
  const [jobspySitesDraft, setJobspySitesDraft] = useState<string[] | null>(null)
  const [jobspyLocationDraft, setJobspyLocationDraft] = useState<string | null>(null)
  const [jobspyResultsWantedDraft, setJobspyResultsWantedDraft] = useState<number | null>(null)
  const [jobspyHoursOldDraft, setJobspyHoursOldDraft] = useState<number | null>(null)
  const [jobspyCountryIndeedDraft, setJobspyCountryIndeedDraft] = useState<string | null>(null)
  const [jobspyLinkedinFetchDescriptionDraft, setJobspyLinkedinFetchDescriptionDraft] = useState<boolean | null>(null)

  return (
    <Accordion type="multiple" defaultValue={["jobspy"]}>
      <JobspySection
        jobspySitesDraft={jobspySitesDraft}
        setJobspySitesDraft={setJobspySitesDraft}
        defaultJobspySites={["indeed", "linkedin"]}
        effectiveJobspySites={["indeed", "linkedin"]}
        jobspyLocationDraft={jobspyLocationDraft}
        setJobspyLocationDraft={setJobspyLocationDraft}
        defaultJobspyLocation="UK"
        effectiveJobspyLocation="UK"
        jobspyResultsWantedDraft={jobspyResultsWantedDraft}
        setJobspyResultsWantedDraft={setJobspyResultsWantedDraft}
        defaultJobspyResultsWanted={200}
        effectiveJobspyResultsWanted={200}
        jobspyHoursOldDraft={jobspyHoursOldDraft}
        setJobspyHoursOldDraft={setJobspyHoursOldDraft}
        defaultJobspyHoursOld={72}
        effectiveJobspyHoursOld={72}
        jobspyCountryIndeedDraft={jobspyCountryIndeedDraft}
        setJobspyCountryIndeedDraft={setJobspyCountryIndeedDraft}
        defaultJobspyCountryIndeed="UK"
        effectiveJobspyCountryIndeed="UK"
        jobspyLinkedinFetchDescriptionDraft={jobspyLinkedinFetchDescriptionDraft}
        setJobspyLinkedinFetchDescriptionDraft={setJobspyLinkedinFetchDescriptionDraft}
        defaultJobspyLinkedinFetchDescription={true}
        effectiveJobspyLinkedinFetchDescription={true}
        isLoading={false}
        isSaving={false}
      />
    </Accordion>
  )
}

describe("JobspySection", () => {
  it("toggles scraped sites and keeps checkboxes in sync", () => {
    render(<JobspyHarness />)

    const indeedCheckbox = screen.getByLabelText("Indeed")
    const linkedinCheckbox = screen.getByLabelText("LinkedIn")

    expect(indeedCheckbox).toBeChecked()
    expect(linkedinCheckbox).toBeChecked()

    fireEvent.click(indeedCheckbox)
    expect(indeedCheckbox).not.toBeChecked()
    expect(linkedinCheckbox).toBeChecked()

    fireEvent.click(indeedCheckbox)
    expect(indeedCheckbox).toBeChecked()
  })

  it("clamps numeric inputs to allowed ranges", () => {
    render(<JobspyHarness />)

    const numericInputs = screen.getAllByRole("spinbutton")
    const resultsWantedInput = numericInputs[0]
    const hoursOldInput = numericInputs[1]

    fireEvent.change(resultsWantedInput, { target: { value: "999" } })
    expect(resultsWantedInput).toHaveValue(500)

    fireEvent.change(hoursOldInput, { target: { value: "0" } })
    expect(hoursOldInput).toHaveValue(1)
  })
})
