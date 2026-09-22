import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/common/IconButton";
import { DateLabel } from "@/components/common/DateLabel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingSkeleton } from "@/components/loading/LoadingSkeleton";
import { apiErrorMessage } from "@/lib/api/client";
import {
  useDeleteNotificationMutation,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
} from "@/features/account/account-hooks";

/**
 * `/account/notifications` — notification center.
 *
 * Read/unread state, priority/type badges, mark-read, mark-all-read and
 * delete with pagination. Backend `actionUrl`s are internal paths rendered
 * as same-origin links — never arbitrary external redirects.
 */
export const Route = createFileRoute("/account/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const [page, setPage] = useState(1);
  const list = useNotificationsQuery(page);
  const markRead = useMarkNotificationReadMutation();
  const markAll = useMarkAllNotificationsReadMutation();
  const remove = useDeleteNotificationMutation();

  const meta = list.data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px]"
          disabled={markAll.isPending || (list.data?.items.length ?? 0) === 0}
          aria-busy={markAll.isPending}
          onClick={() =>
            markAll.mutate(undefined, {
              onSuccess: () => toast.success("All notifications marked as read."),
              onError: (err) => toast.error(apiErrorMessage(err)),
            })
          }
        >
          <CheckCheck className="mr-1 h-4 w-4" />
          Mark all read
        </Button>
      </div>

      {list.isPending ? (
        <div role="status">
          <LoadingSkeleton count={3} />
        </div>
      ) : list.isError ? (
        <ErrorState
          error={list.error}
          title="Unable to load your notifications"
          onRetry={() => void list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-10 w-10" />}
          title="No notifications"
          description="Updates about your orders, payments and reviews will appear here."
        />
      ) : (
        <>
          <ul className="divide-y rounded-md border" aria-live="polite">
            {list.data.items.map((notification) => (
              <li
                key={notification.id}
                className={
                  "flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between " +
                  (notification.read ? "" : "bg-accent/40")
                }
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {!notification.read ? (
                      <span
                        aria-label="Unread"
                        className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                      />
                    ) : null}
                    <span className="break-words">{notification.title}</span>
                    <Badge variant="secondary">{notification.priority}</Badge>
                    <Badge variant="outline">{notification.type}</Badge>
                  </p>
                  {notification.message ? (
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {notification.message}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    <DateLabel date={notification.createdAt} />
                  </p>
                  {notification.actionUrl && notification.actionUrl.startsWith("/") ? (
                    <a
                      href={notification.actionUrl}
                      className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        if (!notification.read) {
                          markRead.mutate(notification.id);
                        }
                      }}
                    >
                      View
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!notification.read ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate(notification.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                  <IconButton
                    icon={<Trash2 className="h-4 w-4" />}
                    aria-label={`Delete notification: ${notification.title}`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(notification.id, {
                        onError: (err) => toast.error(apiErrorMessage(err)),
                      })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav aria-label="Notification pages" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span aria-live="polite" className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
