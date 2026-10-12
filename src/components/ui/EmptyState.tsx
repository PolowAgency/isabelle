import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-16 px-6">
      <div className="h-12 w-12 rounded-full bg-sage/30 flex items-center justify-center text-pine/50 mb-1">
        <Icon size={22} />
      </div>
      <p className="font-medium text-pine">{title}</p>
      {description && (
        <p className="text-sm text-pine/50 max-w-xs">{description}</p>
      )}
    </div>
  );
}
