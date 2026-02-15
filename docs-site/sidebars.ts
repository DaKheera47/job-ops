import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: ["getting-started/self-hosting"],
    },
    {
      type: "category",
      label: "Core Features",
      items: [
        "features/overview",
        "features/orchestrator",
        "features/settings",
        "features/reactive-resume",
        "features/in-progress-board",
        "features/ghostwriter",
        "features/post-application-tracking",
        "features/visa-sponsors",
      ],
    },
    {
      type: "category",
      label: "Extractors",
      items: [
        "extractors/overview",
        "extractors/gradcracker",
        "extractors/jobspy",
        "extractors/manual",
        "extractors/ukvisajobs",
      ],
    },
    {
      type: "category",
      label: "Self-Hosting & Ops",
      items: [
        "getting-started/self-hosting",
        "troubleshooting/common-problems",
      ],
    },
    {
      type: "category",
      label: "Troubleshooting",
      items: ["troubleshooting/common-problems"],
    },
    {
      type: "category",
      label: "Reference / FAQ",
      items: ["reference/faq", "reference/documentation-style-guide"],
    },
  ],
};

export default sidebars;
