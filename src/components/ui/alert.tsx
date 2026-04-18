import { cn } from "@/lib/utils";

interface AlertProps {
  className?: string;
  children: React.ReactNode;
}

export function Alert({ className, children }: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AlertTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("font-medium mb-1", className)}>{children}</div>;
}

export function AlertDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("text-opacity-80", className)}>{children}</div>;
}
