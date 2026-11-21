import { Badge } from "@/client/components/ui/badge";

const CONTACT: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  dormant: { label: "Dormant", variant: "secondary" },
  unsubscribed: { label: "Unsubscribed", variant: "outline" },
  bounced: { label: "Bounced", variant: "destructive" },
  complained: { label: "Complained", variant: "destructive" },
};

const CAMPAIGN: Record<string, { label: string; variant: "success" | "warning" | "secondary" | "info" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "info" },
  sending: { label: "Sending", variant: "warning" },
  paused: { label: "Paused", variant: "secondary" },
  sent: { label: "Sent", variant: "success" },
};

export const SOURCE_LABEL: Record<string, string> = { website: "Website", embed: "Embedded form", manual: "Manual" };

export function ContactStatus({ status, testId }: { status: string; testId?: string }) {
  const s = CONTACT[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={s.variant} data-testid={testId}>
      {s.label}
    </Badge>
  );
}

export function CampaignStatus({ status, testId }: { status: string; testId?: string }) {
  const s = CAMPAIGN[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={s.variant} data-testid={testId}>
      {s.label}
    </Badge>
  );
}

export function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "–";
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "";
  const d = new Date(value);
  return withTime
    ? d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
