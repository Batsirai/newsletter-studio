/**
 * The newsletter's own From, given the patterns the Gateway accepts from this
 * app (`everyapp email set --sender`): one exact address, or `<slug>@domain`
 * under `*@domain`. Undefined means the Gateway's own sender.
 */
export function senderFor(
  patterns: readonly string[],
  newsletter: { slug: string; fromName: string },
): { address: string; name: string } | undefined {
  const first = patterns.find(Boolean);
  if (!first || !newsletter.fromName) return undefined;
  const address = first.startsWith("*@") ? `${newsletter.slug}@${first.slice(2)}` : first;
  return { address, name: newsletter.fromName };
}
