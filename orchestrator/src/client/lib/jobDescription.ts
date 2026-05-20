import { stripHtml } from "@/lib/utils";

export const looksLikeHtmlJobDescription = (jobDescription?: string | null) =>
  /<([a-z][\w:-]*)(?:\s[^>]*)?>/i.test(jobDescription ?? "");

export const getRenderableJobDescription = (jobDescription?: string | null) => {
  if (!jobDescription) return "No description available.";

  const plainText = looksLikeHtmlJobDescription(jobDescription)
    ? stripHtml(jobDescription)
    : jobDescription;

  const normalizedLineBreaks = plainText.replace(/\r\n/g, "\n");
  if (
    normalizedLineBreaks.includes("\\n") &&
    !normalizedLineBreaks.includes("\n")
  ) {
    return normalizedLineBreaks.replace(/\\n/g, "\n");
  }

  return normalizedLineBreaks;
};
