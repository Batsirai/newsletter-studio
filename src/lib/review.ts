import { linksIn } from "./markdown";

export interface ReviewItem {
  level: "blocking" | "warning";
  message: string;
}

export interface ReviewInput {
  subject: string;
  previewText: string;
  body: string;
  fromName: string;
  postalAddress: string;
  segmentMissing: boolean;
  testSent: boolean;
  destination: string;
}

const PLACEHOLDER_TEXT = /\b(lorem ipsum|todo|tbd|xxx+)\b|\[insert[^\]]*\]/i;
const PLACEHOLDER_HOSTS = /^https?:\/\/(www\.)?(example\.(com|org|net)|your-?(site|link|domain)[^/]*)(\/|$)/i;

export function reviewCampaign(input: ReviewInput): ReviewItem[] {
  const items: ReviewItem[] = [];
  const block = (message: string) => items.push({ level: "blocking", message });
  const warn = (message: string) => items.push({ level: "warning", message });
  const emails = input.destination !== "web";

  if (!input.subject.trim()) block("Add a subject.");
  if (!input.body.trim()) block("Add some content.");
  if (emails && !input.postalAddress.trim()) block("Add a postal address in the newsletter's settings.");
  if (emails && !input.fromName.trim()) block("Add a from name in the newsletter's settings.");
  if (input.segmentMissing) block("The chosen segment was deleted. Choose who receives it again.");

  if (input.subject.trim().length > 70) warn(`The subject is ${input.subject.trim().length} characters; over 70 may be cut off.`);
  if (emails && !input.previewText.trim()) warn("No preview text.");
  if (emails && !input.testSent) warn("No test sent.");
  for (const url of linksIn(input.body)) {
    if (!/^(https?:\/\/[^\s/]+\.[^\s]+|mailto:\S+@\S+)$/i.test(url)) warn(`Broken link: "${url || "(empty)"}".`);
    else if (PLACEHOLDER_HOSTS.test(url)) warn(`Placeholder link: ${url}`);
  }
  const placeholder = PLACEHOLDER_TEXT.exec(`${input.subject}\n${input.previewText}\n${input.body}`);
  if (placeholder) warn(`Leftover placeholder text: "${placeholder[0]}".`);
  return items;
}
