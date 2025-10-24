// Debug component to check admin status in production
"use client";

import { useSession } from "@/utils/auth-client";
import { isAdmin } from "@/utils/admin";

export function AdminDebug() {
  const { data: session } = useSession();
  const userIsAdmin = isAdmin({ email: session?.user?.email });

  // Only show in production for debugging
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <div className="fixed top-4 left-4 bg-red-500 text-white p-2 rounded text-xs z-50">
      <div>Email: {session?.user?.email || "No session"}</div>
      <div>Is Admin: {userIsAdmin ? "Yes" : "No"}</div>
      <div>ADMINS env: {process.env.ADMINS || "Not set"}</div>
    </div>
  );
}
