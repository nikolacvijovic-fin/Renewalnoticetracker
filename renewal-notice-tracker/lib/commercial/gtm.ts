export type GtmAnalysis = {
  mostProfitableIcp: string;
  easiestToCloseIcp: string;
  leastLikelyToChurnIcp: string;
  efficientChannels: string[];
  weakChannels: string[];
  motionRecommendation: string;
  outboundHooks: string[];
  landingPagePositioning: string[];
  demoNarrative: string[];
  proofPointsNeeded: string[];
  channelMix: string[];
  messagingAngles: string[];
  cacReductionIdeas: string[];
  conversionImprovementIdeas: string[];
  ninetyDayActions: string[];
};

export const gtmAnalysis: GtmAnalysis = {
  mostProfitableIcp:
    "Ops-led SMB and midsize companies with 50-500 employees, 50-1,000 active contracts, and clear renewal exposure owned by finance ops, procurement ops, vendor management, or legal ops-lite.",
  easiestToCloseIcp:
    "Single-owner SMB teams already living in spreadsheets and already feeling pain from missed notice windows or surprise renewals.",
  leastLikelyToChurnIcp:
    "Cross-functional teams that assign owners, review contracts quickly, and use the dashboard plus reminders as an ongoing operating cadence.",
  efficientChannels: [
    "Founder-led outbound into finance ops, procurement ops, and vendor-management leaders",
    "Partner referrals from fractional CFOs, procurement consultants, and legal ops-lite operators",
    "Niche content targeted at renewal control, notice period risk, and spreadsheet replacement"
  ],
  weakChannels: [
    "Broad paid acquisition against generic contract management keywords",
    "Enterprise outbound aimed at full CLM buyers",
    "Channels that drive trial volume without activation quality"
  ],
  motionRecommendation:
    "Use a hybrid GTM motion: founder-led outbound and partner-led intros for higher-fit mid-market accounts, with self-serve trial for smaller but still serious ops-led buyers. Do not rely on pure self-serve or pure sales-led motion yet.",
  outboundHooks: [
    "Stop surprise auto-renewals without buying CLM.",
    "Replace renewal spreadsheets before the next notice window slips.",
    "Turn buried notice dates into owners, reminders, and decisions in one workflow.",
    "Get renewal control across teams without legal-tech bloat."
  ],
  landingPagePositioning: [
    "Lead with avoided surprise renewals and missed notice periods, not generic contract management.",
    "Position as renewal operations software for SMB and mid-market teams, not CLM.",
    "Show that the product creates visible accountability: owners, reminders, review, and decisions."
  ],
  demoNarrative: [
    "Start with the pain: one missed notice window can cost more than a year of software.",
    "Show one uploaded contract becoming a trusted, reviewed record.",
    "Show owner assignment and reminders creating accountability.",
    "Show the dashboard surfacing live upcoming obligations.",
    "Close on expansion: more coverage, more coordination, and less spreadsheet chaos."
  ],
  proofPointsNeeded: [
    "Examples of missed-renewal risk avoided",
    "Time-to-value from upload to reviewed contract",
    "How many contracts can be centralized quickly with import help",
    "Evidence that teams use owners, reminders, and decisions weekly"
  ],
  channelMix: [
    "40% founder-led outbound",
    "30% partner/referral motion",
    "20% narrow content and SEO",
    "10% product-led trial capture from direct intent traffic"
  ],
  messagingAngles: [
    "Avoid missed notice periods",
    "Stop surprise auto-renewals",
    "Get renewal accountability without CLM",
    "Replace spreadsheet-driven renewal tracking"
  ],
  cacReductionIdeas: [
    "Narrow the landing page and outbound copy to the exact renewal-ops wedge",
    "Disqualify CLM buyers fast",
    "Use partner channels where the buyer already trusts the messenger",
    "Use demo and onboarding assets that shorten time-to-belief"
  ],
  conversionImprovementIdeas: [
    "Push trial users to first reviewed contract and first owner before billing asks",
    "Offer import cleanup and setup help to high-intent messy accounts",
    "Use contract-cap and coordination prompts as upgrade triggers",
    "Use annual plans with onboarding support for Growth accounts"
  ],
  ninetyDayActions: [
    "Rewrite homepage and pricing copy around renewal control and missed notice risk",
    "Build two outbound sequences for finance ops and procurement ops",
    "Create one short demo flow built around upload, review, owner, and due-soon dashboard value",
    "Set partner outreach targets for fractional CFO and procurement operators",
    "Instrument source-to-paid quality by channel, not just signup volume"
  ]
};
