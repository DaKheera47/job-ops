"""Pydantic schemas for resume tailoring."""

from typing import Any

from pydantic import BaseModel, Field, ConfigDict

# Use strict mode to avoid additionalProperties
model_config = ConfigDict(extra='forbid')


class Location(BaseModel):
    city: str | None = None
    region: str | None = None
    countryCode: str | None = None


class Profile(BaseModel):
    network: str | None = None
    username: str | None = None
    url: str | None = None


class Basics(BaseModel):
    name: str
    label: str = ""
    email: str = ""
    phone: str = ""
    url: str = ""
    location: Location | None = None
    profiles: list[Profile] | None = None


class WorkEntry(BaseModel):
    name: str
    position: str
    startDate: str
    endDate: str | None = None
    summary: str = ""
    highlights: list[str] | None = None


class EducationEntry(BaseModel):
    institution: str
    area: str
    studyType: str
    startDate: str
    endDate: str | None = None
    courses: list[str] | None = None


class Project(BaseModel):
    name: str
    description: str = ""
    keywords: list[str] | None = None
    startDate: str | None = None
    endDate: str | None = None
    url: str | None = None


class Skill(BaseModel):
    name: str
    keywords: list[str] | None = None
    proofPoint: str | None = None


class Certification(BaseModel):
    name: str
    issuer: str | None = None
    date: str | None = None


class Metadata(BaseModel):
    pageCount: int = 2
    selectedSkills: list[str] | None = None


class TailoredResume(BaseModel):
    """Complete tailored resume output."""

    basics: Basics | None = None
    summary: str | None = None
    work: list[WorkEntry] | None = None
    education: list[EducationEntry] | None = None
    projects: list[Project] | None = None
    skills: list[Skill] | None = None
    certifications: list[Certification] | None = None
    metadata: Metadata | None = None


class WritingStyle(BaseModel):
    """Writing style preferences."""

    tone: str = "professional"
    formality: str = "medium"
    manualLanguage: str = "english"


class Constraints(BaseModel):
    """Tailoring constraints."""

    maxPages: int = 2
    targetKeywords: list[str] | None = None


class TailorRequest(BaseModel):
    """Request to tailor a resume."""

    jobDescription: str
    masterResumeJson: dict[str, Any]
    writingStyle: WritingStyle = Field(default_factory=WritingStyle)
    constraints: Constraints = Field(default_factory=Constraints)
    jobId: str | None = None  # For logging/tracing


class TailorResponse(BaseModel):
    """Response from tailoring service."""

    success: bool
    data: dict[str, Any] | None = None
    coverLetter: str | None = None
    error: str | None = None


class TailorMetadata(BaseModel):
    """Metadata about the tailoring result."""

    pageCount: int = 2
    selectedSkills: list[str] | None = None
    proofPoints: dict[str, str] | None = None


# Schema definitions for Instructor LLM calls
class SummaryOutput(BaseModel):
    """Output schema for summary generation."""

    summary: str = Field(..., description="Tailored resume summary paragraph (max 3 sentences, ~60 words)")


class WorkOutput(BaseModel):
    """Output schema for work experience generation."""

    work: list[WorkEntry] = Field(
        ..., description="Work experience with tailored summary and highlights"
    )


class SupportingOutput(BaseModel):
    """Output schema for supporting sections generation."""

    education: list[EducationEntry] | None = Field(None, description="Education with tailored courses")
    projects: list[Project] | None = Field(None, description="Selected projects with descriptions")
    skills: list[Skill] | None = Field(None, description="Skills with proof points")
    certificates: list[Certification] | None = Field(None, description="Selected certificates")
    metadata: Metadata | None = Field(None, description="Metadata about the tailoring")


class CoverLetterOutput(BaseModel):
    """Output schema for cover letter generation."""

    cover_letter: str = Field(
        ..., description="Professional 3-4 paragraph cover letter in markdown format."
    )
