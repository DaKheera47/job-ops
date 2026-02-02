/**
 * Shared types for the job-ops orchestrator.
 */
export const APPLICATION_STAGES = [
    "applied",
    "recruiter_screen",
    "assessment",
    "hiring_manager_screen",
    "technical_interview",
    "onsite",
    "offer",
    "closed",
];
export const STAGE_LABELS = {
    applied: "Applied",
    recruiter_screen: "Recruiter Screen",
    assessment: "Assessment",
    hiring_manager_screen: "Hiring Manager Screen",
    technical_interview: "Technical Interview",
    onsite: "Final Round",
    offer: "Offer",
    closed: "Closed",
};
export const APPLICATION_OUTCOMES = [
    "offer_accepted",
    "offer_declined",
    "rejected",
    "withdrawn",
    "no_response",
    "ghosted",
];
export const APPLICATION_TASK_TYPES = [
    "prep",
    "todo",
    "follow_up",
    "check_status",
];
export const INTERVIEW_TYPES = [
    "recruiter_screen",
    "technical",
    "onsite",
    "panel",
    "behavioral",
    "final",
];
export const INTERVIEW_OUTCOMES = [
    "pass",
    "fail",
    "pending",
    "cancelled",
];
