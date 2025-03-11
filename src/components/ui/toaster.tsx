"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Toaster component for displaying toast notifications
 * This component should be placed in the root layout
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            "group border-border bg-background text-foreground flex gap-2 p-4 rounded-md shadow-lg",
          title: "text-sm font-semibold",
          description: "text-sm opacity-90",
          actionButton:
            "bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-2 py-0.5 rounded-sm",
          cancelButton:
            "bg-muted text-muted-foreground hover:bg-muted/80 text-xs px-2 py-0.5 rounded-sm",
          error:
            "!bg-destructive !text-destructive-foreground border-destructive",
          success: "!bg-success !text-success-foreground border-success",
          warning: "!bg-warning !text-warning-foreground border-warning",
          info: "!bg-info !text-info-foreground border-info",
        },
      }}
    />
  );
}
