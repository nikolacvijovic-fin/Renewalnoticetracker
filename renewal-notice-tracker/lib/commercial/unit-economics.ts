export type UnitEconomicsSegment = {
  name: string;
  targetProfile: string;
  likelyAcvRange: string;
  supportBurden: string;
  onboardingBurden: string;
  economicQuality: "best" | "good" | "mixed" | "bad";
  whyGoodOrBad: string;
};

export type ChannelEconomics = {
  channel: string;
  likelyCac: string;
  paybackRisk: string;
  notes: string;
};

export const unitEconomicsAnalysis = {
  assumptions: [
    "Starter and Growth are the primary self-serve or light-sales plans, while Portfolio is sales-led and annual.",
    "AI extraction, support time, import cleanup, and notification delivery are the main gross-margin cost drivers.",
    "Messy spreadsheet migrations and pseudo-enterprise workflow demands are the main sources of onboarding and support drag.",
    "The product wins economically when one buyer manages a meaningful contract portfolio with moderate collaboration needs and real renewal risk."
  ],
  paybackConsiderations:
    "Payback works only if CAC stays disciplined, onboarding is tightly scoped, and the team avoids low-ACV high-touch accounts. Growth and Portfolio should ideally pay back much faster than tiny SMB accounts because the same sales and setup effort can support much larger ACV.",
  ltvConsiderations:
    "LTV improves when accounts expand tracked contract coverage, adopt owner/accountability workflows, and tie reporting to leadership reviews. LTV collapses when the product is used as a one-time migration tool or a narrow reminder utility.",
  grossMarginThreats: [
    "Free or low-priced accounts consuming extraction and support disproportionately",
    "High-touch spreadsheet cleanup treated as support instead of paid services",
    "Custom workflow asks that mimic CLM",
    "Accounts with many exceptions, low-confidence reviews, and heavy manual intervention"
  ],
  supportDrivenMarginErosion: [
    "Tiny accounts asking for setup help that exceeds ACV",
    "Messy imports that are not scoped into a paid package",
    "Repeated billing, onboarding, and workflow education that should be productized or documented",
    "Customers whose process complexity is much higher than their willingness to pay"
  ],
  strongBusinessConditions: [
    "Win the 50-500 employee SMB and midsize segment with real renewal exposure",
    "Keep pricing tied to active tracked contracts and coordination depth",
    "Turn setup, import cleanup, and workflow configuration into paid, templated services",
    "Protect CAC by staying narrow on ICP and avoiding CLM buyers",
    "Raise retention through owner, reminder, decision, and reporting loops"
  ],
  bestTargetSegmentEconomically:
    "Ops-led SMB and mid-market accounts with 50-500 employees and 50-1,000 active contracts. They have enough pain to pay, but not enough complexity to drag the team into CLM-style service work.",
  worstTargetSegmentEconomically:
    "Tiny businesses with very few contracts and large enterprise teams expecting bespoke contract workflowing. One underpays and overuses support; the other over-demands product and services complexity.",
  majorMarginThreats: [
    "Underpriced high-volume teams",
    "Support-heavy tiny accounts",
    "Manual import cleanup treated as free success work",
    "Mini-CLM drift"
  ],
  majorCacThreats: [
    "Broad paid acquisition before conversion and retention are tight",
    "Selling to the wrong persona with weak urgency",
    "Enterprise pursuits with long cycles and poor fit",
    "Channels that drive lots of signups but little activation"
  ],
  pricingPackagingImprovements: [
    "Keep generous included editor seats so collaboration is not suppressed",
    "Use active tracked contracts as the main expansion axis",
    "Reserve complex coordination and governance for Growth and Portfolio",
    "Use paid onboarding and import cleanup to protect gross margin"
  ],
  dataToCollect: [
    "ACV by segment and plan",
    "Support hours per account",
    "Onboarding time per account",
    "Import cleanup burden per account",
    "Extraction cost per account",
    "CAC by channel and persona",
    "Payback by segment",
    "NRR and churn by contract-band cohort"
  ]
};

export const unitEconomicsSegments: UnitEconomicsSegment[] = [
  {
    name: "Tiny SMB",
    targetProfile: "Teams with fewer than 25 meaningful contracts and weak operational maturity.",
    likelyAcvRange: "$300-$900",
    supportBurden: "High",
    onboardingBurden: "Medium",
    economicQuality: "bad",
    whyGoodOrBad:
      "These accounts are highly price-sensitive, often need hand-holding, and rarely justify the support load."
  },
  {
    name: "Operational SMB",
    targetProfile: "20-150 employee teams with 25-150 active contracts and one accountable ops owner.",
    likelyAcvRange: "$1.5k-$5k",
    supportBurden: "Medium",
    onboardingBurden: "Medium",
    economicQuality: "good",
    whyGoodOrBad:
      "Good self-serve or light-sales accounts if onboarding is disciplined and contract coverage expands."
  },
  {
    name: "Midsize Ops-Led",
    targetProfile: "50-500 employee teams with 150-800 active contracts and real vendor or revenue-renewal exposure.",
    likelyAcvRange: "$6k-$18k",
    supportBurden: "Medium",
    onboardingBurden: "Medium-High",
    economicQuality: "best",
    whyGoodOrBad:
      "This is the sweet spot: strong pain, meaningful ACV, and enough budget to support annual plans and paid services."
  },
  {
    name: "Enterprise-Lite CLM Seeker",
    targetProfile: "Large teams that really want approvals, drafting, negotiation, and bespoke workflowing.",
    likelyAcvRange: "$10k-$25k+",
    supportBurden: "Very High",
    onboardingBurden: "High",
    economicQuality: "mixed",
    whyGoodOrBad:
      "ACV can be large, but these accounts are dangerous unless tightly qualified because they drag support, roadmap, and implementation cost upward."
  }
];

export const channelEconomics: ChannelEconomics[] = [
  {
    channel: "Founder-led outbound",
    likelyCac: "Low-Medium",
    paybackRisk: "Manageable if ICP is narrow",
    notes: "Best early channel because the message is specific and qualification can happen quickly."
  },
  {
    channel: "Partner referrals",
    likelyCac: "Low",
    paybackRisk: "Low",
    notes: "Very attractive if partners serve procurement, legal ops-lite, or finance ops buyers."
  },
  {
    channel: "Niche content / SEO",
    likelyCac: "Medium",
    paybackRisk: "Medium",
    notes: "Can work if the category story stays narrow and intent is high."
  },
  {
    channel: "Broad paid acquisition",
    likelyCac: "High",
    paybackRisk: "High",
    notes: "Dangerous before activation, conversion, and retention are predictable."
  },
  {
    channel: "Enterprise outbound",
    likelyCac: "High",
    paybackRisk: "High",
    notes: "Long cycles and poor fit can destroy payback even if headline ACV looks attractive."
  }
];
