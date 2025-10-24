"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Play, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface MigrationStatus {
  totalUsers: number;
  migratedUsers: number;
  pendingUsers: number;
  migrationProgress: number;
}

interface MigrationResult {
  totalUsers: number;
  migrated: number;
  skipped: number;
  errors: number;
  results: Array<{
    userId: string;
    userEmail: string;
    status: "success" | "skipped" | "error";
    rulesUpdated: string[];
    scheduleCreated?: boolean;
    error?: string;
  }>;
}

interface DigestMigrationAdminProps {
  emailAccountId: string;
}

export function DigestMigrationAdmin({
  emailAccountId,
}: DigestMigrationAdminProps) {
  const [isDryRun, setIsDryRun] = useState(true);
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [lastResult, setLastResult] = useState<MigrationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/digest-migration", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        console.error("Failed to load status:", response.statusText);
      }
    } catch (error) {
      console.error("Failed to load status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const runMigration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/digest-migration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dryRun: isDryRun }),
      });

      if (response.ok) {
        const data = await response.json();
        setLastResult(data);
        // Refresh status after migration
        await loadStatus();
      } else {
        console.error("Migration failed:", response.statusText);
      }
    } catch (error) {
      console.error("Migration failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "skipped":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Digest Migration Admin</CardTitle>
          <CardDescription>
            Migrate existing users to enable digest emails for ALL categories
            (To Reply, Newsletter, Marketing, Calendar, Receipt, Notification) +
            Cold Email digest
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <Button onClick={loadStatus} variant="outline" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Load Status"
              )}
            </Button>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="dryRun"
                checked={isDryRun}
                onChange={(e) => setIsDryRun(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="dryRun" className="text-sm font-medium">
                Dry Run (test only)
              </label>
            </div>

            <Button
              onClick={runMigration}
              disabled={isLoading}
              className="flex items-center space-x-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>{isDryRun ? "Test Migration" : "Run Migration"}</span>
            </Button>
          </div>

          {status && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{status.totalUsers}</div>
                <div className="text-sm text-gray-500">Total Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {status.migratedUsers}
                </div>
                <div className="text-sm text-gray-500">Migrated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {status.pendingUsers}
                </div>
                <div className="text-sm text-gray-500">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {status.migrationProgress.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">Progress</div>
              </div>
            </div>
          )}

          {lastResult && (
            <Alert>
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center space-x-4">
                    <Badge variant="outline">
                      Total: {lastResult.totalUsers}
                    </Badge>
                    <Badge variant="default">
                      Migrated: {lastResult.migrated}
                    </Badge>
                    <Badge variant="secondary">
                      Skipped: {lastResult.skipped}
                    </Badge>
                    <Badge variant="destructive">
                      Errors: {lastResult.errors}
                    </Badge>
                  </div>

                  {lastResult.results.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Recent Results:</h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {lastResult.results
                          .slice(0, 10)
                          .map((result, index) => (
                            <div
                              key={index}
                              className="flex items-center space-x-2 text-sm"
                            >
                              {getStatusIcon(result.status)}
                              <span className="font-mono">
                                {result.userEmail}
                              </span>
                              <span className="text-gray-500">
                                {result.rulesUpdated.length > 0 &&
                                  `(${result.rulesUpdated.join(", ")})`}
                                {result.scheduleCreated && " + Schedule"}
                              </span>
                              {result.error && (
                                <span className="text-red-500 text-xs">
                                  {result.error}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
