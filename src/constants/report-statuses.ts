export const REPORT_STATUSES = [
	"pending",
	"validated",
	"dismissed",
	"needs_review",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
	dismissed: "Dismissed",
	needs_review: "Needs review",
	pending: "Pending",
	validated: "Validated",
};
