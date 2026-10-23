type Variant = "default" | "success" | "warning" | "danger" | "info" | "outline";

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

// Full class names must appear literally so Tailwind's scanner generates them;
// an interpolated `np-badge-${variant}` is invisible to it.
const variantClasses: Record<Variant, string> = {
  default: "np-badge-default",
  success: "np-badge-success",
  warning: "np-badge-warning",
  danger: "np-badge-danger",
  info: "np-badge-info",
  outline: "np-badge-outline",
};

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return <span className={`np-badge ${variantClasses[variant]} ${className}`}>{children}</span>;
}

/** Map ContentStatus to Badge variant */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Variant> = {
    PUBLISHED: "success", DRAFT: "outline", PENDING_REVIEW: "warning",
    SCHEDULED: "info", PRIVATE: "default", ARCHIVED: "default", TRASH: "danger",
  };
  return <Badge variant={map[status] ?? "default"}>{status.replace("_", " ").toLowerCase()}</Badge>;
}
