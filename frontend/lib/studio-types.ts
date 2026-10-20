// Adapted from What's Good's photoStudio and photoStudioChat types.
// These describe the Fussy Panda API's whitelisted previews, never private storage paths.
export type PhotoStudioEnvironment = {
  id: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
};
export type PhotoStudioPhoto = {
  id: string;
  imageUrl: string;
  messageId?: string | null;
  createdAt: string;
};
export type PhotoStudioMessage = {
  id: string;
  role: "user" | "agent";
  type: "source_image" | "instruction" | "generated_image";
  status: "pending" | "generating" | "completed" | "failed";
  sequence: number;
  text: string | null;
  imageUrl: string | null;
  libraryPhoto?: PhotoStudioPhoto | null;
};
export type PhotoStudioChatSummary = {
  id: string;
  title: string;
  sourceImageUrl: string;
  environmentImageUrl: string | null;
  lastMessageAt: string;
};
export type PhotoStudioChat = PhotoStudioChatSummary & {
  messages: PhotoStudioMessage[];
};
export type StudioStatus = {
  status: "guest" | "authenticated";
  authenticated: boolean;
  availableTokens: number;
  remainingTrialTokens: number;
  trialExhausted: boolean;
  downloadEligible: boolean;
};
export type CreditSummary = {
  permanent: number;
  monthly: number;
  trial?: number;
  available: number;
};
export type Plan = "basic" | "pro" | "enterprise";
export type Subscription = {
  planTier: "none" | Plan;
  effectivePlan: string;
  subscriptionStatus: string;
  hasStripeSubscription: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  credits: CreditSummary;
};
export type PlanOffer = {
  key: Plan;
  name: string;
  credits: number;
  amount: number | null;
  currency: string | null;
  available: boolean;
};
export type Claim = {
  status:
    | "none"
    | "claimed"
    | "already_claimed"
    | "pending"
    | "conflict"
    | "unavailable";
  code?: string;
};
