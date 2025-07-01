import React from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { ErrorType, ErrorInfo } from "@/lib/errorHandling";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface ErrorDisplayProps {
  error: ErrorInfo;
  showDetails?: boolean;
  className?: string;
}

/**
 * Component for displaying error information in a consistent format
 */
export function ErrorDisplay({
  error,
  showDetails = false,
  className = "",
}: ErrorDisplayProps) {
  // Determine the appropriate icon based on error type
  const Icon = getErrorIcon(error.type);

  // Determine the variant based on error type
  const variant = getAlertVariant(error.type);

  return (
    <Alert variant={variant} className={className}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        {getErrorTitle(error.type)}
        <Badge variant={getBadgeVariant(error.type)}>{error.category}</Badge>
      </AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {showDetails && error.details && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Show details</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-100 p-2 dark:bg-slate-800">
              {error.details}
            </pre>
          </details>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Get the appropriate icon for the error type
 */
function getErrorIcon(type: ErrorType) {
  switch (type) {
    case ErrorType.CRITICAL:
      return AlertCircle;
    case ErrorType.WARNING:
      return AlertTriangle;
    case ErrorType.INFO:
      return Info;
    default:
      return AlertCircle;
  }
}

/**
 * Get the appropriate alert variant for the error type
 */
function getAlertVariant(type: ErrorType): "default" | "destructive" {
  switch (type) {
    case ErrorType.CRITICAL:
      return "destructive";
    default:
      return "default";
  }
}

/**
 * Get the appropriate badge variant for the error type
 */
function getBadgeVariant(
  type: ErrorType
): "default" | "destructive" | "outline" | "secondary" {
  switch (type) {
    case ErrorType.CRITICAL:
      return "destructive";
    case ErrorType.WARNING:
      return "secondary";
    case ErrorType.INFO:
      return "outline";
    default:
      return "default";
  }
}

/**
 * Get the title for the error type
 */
function getErrorTitle(type: ErrorType): string {
  switch (type) {
    case ErrorType.CRITICAL:
      return "Error";
    case ErrorType.WARNING:
      return "Warning";
    case ErrorType.INFO:
      return "Information";
    default:
      return "Notification";
  }
}
