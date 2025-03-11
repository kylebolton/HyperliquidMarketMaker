import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ErrorMessage } from "./types";

interface ErrorLogsProps {
  errors: ErrorMessage[];
  clearErrors: () => void;
}

export function ErrorLogs({ errors, clearErrors }: ErrorLogsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Logs</CardTitle>
        <CardDescription>View system logs and error messages</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {errors.length > 0 ? (
            errors.map(error => (
              <Alert
                key={error.id}
                variant={
                  error.type === "critical"
                    ? "destructive"
                    : error.type === "warning"
                    ? "default"
                    : "default"
                }
              >
                <div className="flex justify-between items-start">
                  <div>
                    <AlertTitle>
                      {error.type === "critical"
                        ? "Error"
                        : error.type === "warning"
                        ? "Warning"
                        : "Info"}
                    </AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                  </div>
                  <div className="text-xs text-gray-500">
                    {error.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </Alert>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500">
              No errors or warnings
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            onClick={clearErrors}
            disabled={errors.length === 0}
          >
            Clear Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
