export interface Attachment {
  name: string;
  url: string;
}

export interface Disclosure {
  fingerprint: string;
  publishedAt: string;
  publishedLabel: string;
  title: string;
  ticker?: string;
  primaryUrl: string;
  attachments: Attachment[];
}

export interface FetchResult {
  records: Disclosure[];
  reachedKnownRecord: boolean;
  pagesVisited: number;
  newestPublishedAt?: string;
}

export interface DisclosureSource {
  browserHealthy: boolean;
  fetchSince(knownFingerprints: ReadonlySet<string>, pageLimit: number): Promise<FetchResult>;
  close(): Promise<void>;
}

export interface NotificationSender {
  lastDeliveryStatus: "never" | "ok" | "failed";
  sendDisclosure(disclosure: Disclosure, matchedKeyword: string): Promise<void>;
  sendOperational(message: string): Promise<void>;
}

export interface HealthState {
  startedAt: string;
  schedulerActive: boolean;
  pollInProgress: boolean;
  lastPollAttempt: string | null;
  lastSuccessfulPoll: string | null;
  consecutiveFailures: number;
  browserStatus: "idle" | "starting" | "healthy" | "failed" | "closed";
  telegramStatus: "never" | "ok" | "failed";
  lastError: string | null;
}
