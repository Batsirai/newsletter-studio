import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { Field } from "@/client/components/Field";
import { errorMessage, NewsletterFrame } from "@/client/components/NewsletterFrame";
import { PageHeader } from "@/client/components/PageHeader";
import { CampaignStatus, formatDate } from "@/client/components/StatusBadge";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { mergeTags, renderMarkdown } from "@/lib/markdown";
import { ISSUE_PROSE } from "@/lib/prose";
import { reviewCampaign } from "@/lib/review";
import { QUARTER_HOURS } from "@/lib/schedule";
import {
  cancelSchedule,
  deleteCampaign,
  getCampaign,
  pauseCampaign,
  resumeCampaign,
  saveCampaign,
  scheduleCampaign,
  sendNow,
  sendTest,
  setIssueOnWebsite,
} from "@/serverFunctions/campaigns";

export const Route = createFileRoute("/newsletters/$id/campaigns/$campaignId/")({
  loader: ({ params }) => getCampaign({ data: { newsletterId: params.id, campaignId: params.campaignId } }),
  component: CampaignPage,
});

type Seg = { id: string; name: string; reach: number };
type Data = NonNullable<ReturnType<typeof Route.useLoaderData>>;

function CampaignPage() {
  const { id } = Route.useParams();
  const data = Route.useLoaderData();
  if (!data) return <NewsletterFrame id={id} found={false}>{null}</NewsletterFrame>;
  return (
    <NewsletterFrame id={id} found>
      <Editor key={data.campaign.id + data.campaign.status} data={data} />
    </NewsletterFrame>
  );
}

function Editor({ data }: { data: Data }) {
  const { campaign, newsletter } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const draft = campaign.status === "draft";
  const [form, setForm] = useState({
    subject: campaign.subject,
    previewText: campaign.previewText,
    body: campaign.body,
    destination: campaign.destination as "both" | "email" | "web",
    segmentId: campaign.segmentId,
  });
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const [testAs, setTestAs] = useState<"" | "start" | "finish" | "share">("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [timeZone, setTimeZone] = useState("UTC");
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setZones(Intl.supportedValuesOf("timeZone"));
  }, []);

  const ref = { newsletterId: newsletter.id, campaignId: campaign.id };
  const segment = data.segments.find((s: Seg) => s.id === form.segmentId);
  const segmentMissing = Boolean(form.segmentId && !segment);
  const recipients = segmentMissing ? 0 : segment ? segment.reach : data.totalActive;
  const review = draft
    ? reviewCampaign({ ...form, fromName: newsletter.fromName, postalAddress: newsletter.postalAddress, segmentMissing, testSent: Boolean(campaign.testSentAt) })
    : [];
  const blocking = review.filter((r) => r.level === "blocking");
  const preview = useMemo(() => renderMarkdown(mergeTags(form.body, {})), [form.body]);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const run = async (label: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await action();
      if (done) toast.success(done);
      await router.invalidate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const save = () => saveCampaign({ data: { ...ref, ...form } });

  return (
    <>
      <PageHeader
        backLink={
          <Link to="/newsletters/$id/campaigns" params={{ id: newsletter.id }} className="text-sm text-muted-foreground hover:text-foreground">
            Campaigns
          </Link>
        }
        title={campaign.subject || "New campaign"}
        description={<CampaignStatus status={campaign.status} testId="campaign-status" />}
        actions={
          draft ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete draft
              </Button>
              <Button variant="outline" pending={busy === "save"} onClick={() => run("save", save, "Draft saved")}>
                Save draft
              </Button>
            </>
          ) : campaign.status === "sent" || campaign.status === "sending" || campaign.status === "paused" ? (
            <Link to="/newsletters/$id/campaigns/$campaignId/report" params={{ id: newsletter.id, campaignId: campaign.id }} className={buttonVariants({ variant: "outline" })}>
              View report
            </Link>
          ) : null
        }
      />

      {campaign.status === "scheduled" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              Sends {formatDate(campaign.scheduledAt, true)} ({campaign.timeZone})
            </span>
            <Button variant="outline" pending={busy === "cancel"} onClick={() => run("cancel", () => cancelSchedule({ data: ref }))}>
              Cancel schedule
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {campaign.status === "sending" || campaign.status === "paused" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-sm">
              <div>
                {data.progress.sent ?? 0} sent, {(data.progress.queued ?? 0) + (data.progress.sending ?? 0)} waiting
              </div>
              {campaign.status === "paused" && campaign.note ? <div className="text-destructive">{campaign.note}</div> : null}
            </div>
            {campaign.status === "sending" ? (
              <Button variant="outline" pending={busy === "pause"} onClick={() => run("pause", () => pauseCampaign({ data: ref }))}>
                Pause
              </Button>
            ) : (
              <Button pending={busy === "resume"} onClick={() => run("resume", () => resumeCampaign({ data: ref }))}>
                Resume
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}
      {campaign.status === "sent" && campaign.destination !== "email" && newsletter.websiteEnabled && campaign.slug ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            {campaign.onWebsite ? (
              <a href={`/n/${newsletter.slug}/p/${campaign.slug}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                /n/{newsletter.slug}/p/{campaign.slug}
              </a>
            ) : (
              <span className="text-muted-foreground">Not on the website</span>
            )}
            <Button variant="outline" size="sm" onClick={() => run("web", () => setIssueOnWebsite({ data: { ...ref, onWebsite: !campaign.onWebsite } }))}>
              {campaign.onWebsite ? "Remove from website" : "Put back on website"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        <Field id="cp-subject" label="Subject">
          <Input id="cp-subject" value={form.subject} disabled={!draft} onChange={(e) => set("subject", e.target.value)} />
        </Field>
        <Field id="cp-preview" label="Preview text">
          <Input id="cp-preview" value={form.previewText} disabled={!draft} onChange={(e) => set("previewText", e.target.value)} />
        </Field>
        <Field id="cp-body" label="Content" hint="Markdown: # headings, [link](https://…), ![image](https://…), [[Button]](https://…), {{first_name|fallback}}.">
          <Textarea id="cp-body" value={form.body} disabled={!draft} rows={12} className="font-mono text-sm" onChange={(e) => set("body", e.target.value)} />
        </Field>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Preview</CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant={width === "desktop" ? "secondary" : "ghost"} aria-pressed={width === "desktop"} onClick={() => setWidth("desktop")}>
              Desktop
            </Button>
            <Button size="sm" variant={width === "phone" ? "secondary" : "ghost"} aria-pressed={width === "phone"} onClick={() => setWidth("phone")}>
              Phone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div data-testid="preview" className={`mx-auto rounded-lg border border-border bg-background p-5 ${width === "phone" ? "max-w-[375px]" : "max-w-[600px]"}`}>
            {form.previewText ? <div className="mb-3 text-xs text-muted-foreground">{mergeTags(form.previewText, {})}</div> : null}
            <div className={ISSUE_PROSE} dangerouslySetInnerHTML={{ __html: preview }} />
            <div className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">
              {newsletter.postalAddress || "Postal address"} · Unsubscribe
            </div>
          </div>
        </CardContent>
      </Card>

      {draft ? (
        <>
          <Card data-testid="review">
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent>
              {review.length ? (
                <ul className="space-y-2 text-sm">
                  {review.map((r) => (
                    <li key={r.message} className="flex items-start gap-2">
                      {r.level === "blocking" ? (
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Blocking" />
                      ) : (
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Warning" />
                      )}
                      {r.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ready to send.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="cp-destination" label="Destination">
                  <NativeSelect id="cp-destination" value={form.destination} onChange={(e) => set("destination", e.target.value as typeof form.destination)}>
                    <option value="both">Email and web</option>
                    <option value="email">Email only</option>
                    <option value="web">Web only</option>
                  </NativeSelect>
                </Field>
                <Field id="cp-audience" label="Audience">
                  <NativeSelect id="cp-audience" value={form.segmentId ?? ""} disabled={form.destination === "web"} onChange={(e) => set("segmentId", e.target.value || null)}>
                    {segmentMissing ? (
                      <option value={form.segmentId ?? ""} disabled>
                        Deleted segment
                      </option>
                    ) : null}
                    <option value="">All active contacts</option>
                    {data.segments.map((s: Seg) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              {form.destination !== "web" ? (
                <p className="text-sm text-muted-foreground" data-testid="recipient-count">
                  {recipients} of {data.totalActive} active contacts
                </p>
              ) : null}
              {form.destination !== "web" ? (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end">
                  <Field id="cp-test-as" label="Send test as">
                    <NativeSelect id="cp-test-as" value={testAs} onChange={(e) => setTestAs(e.target.value as typeof testAs)}>
                      <option value="">Plain test</option>
                      <option value="start">No book yet (start)</option>
                      <option value="finish">Book started (finish)</option>
                      <option value="share">Ordered (share)</option>
                    </NativeSelect>
                  </Field>
                  <Button
                    variant="outline"
                    pending={busy === "test"}
                    onClick={() =>
                      run("test", async () => {
                        await save();
                        const { to } = await sendTest({ data: { ...ref, footerState: testAs || null } });
                        toast.success(`Test sent to ${to}`);
                      })
                    }
                  >
                    Send test
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button disabled={blocking.length > 0} onClick={() => setConfirmSend(true)}>
                  Send now
                </Button>
              </div>
              <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
                <Field id="cp-date" label="Date">
                  <Input id="cp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field id="cp-time" label="Time">
                  <NativeSelect id="cp-time" value={time} onChange={(e) => setTime(e.target.value)}>
                    {QUARTER_HOURS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="cp-zone" label="Time zone">
                  <NativeSelect id="cp-zone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                    {(zones.length ? zones : [timeZone]).map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Button
                  variant="outline"
                  disabled={blocking.length > 0 || !date}
                  pending={busy === "schedule"}
                  onClick={() =>
                    run("schedule", async () => {
                      await save();
                      await scheduleCampaign({ data: { ...ref, date, time, timeZone } });
                    })
                  }
                >
                  Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {confirmSend ? (
        <ConfirmDialog
          title={form.destination === "web" ? "Publish this issue?" : `Send to ${recipients} contacts?`}
          confirmLabel="Send"
          pending={busy === "send"}
          onClose={() => setConfirmSend(false)}
          onConfirm={() =>
            run("send", async () => {
              await save();
              await sendNow({ data: ref });
              setConfirmSend(false);
            })
          }
        >
          {form.destination === "web" ? "It goes on the website right away." : "Emails start going out right away."}
        </ConfirmDialog>
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this draft?"
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteCampaign({ data: ref });
              await navigate({ to: "/newsletters/$id/campaigns", params: { id: newsletter.id } });
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        />
      ) : null}
    </>
  );
}
