/** One figure with its label. */
export function Stat({ label, value, sub, testId }: { label: string; value: string | number; sub?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid={testId}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-sm text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
