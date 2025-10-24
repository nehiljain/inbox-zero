import { AdminUpgradeUserForm } from "@/app/(app)/admin/AdminUpgradeUserForm";
import { AdminUserControls } from "@/app/(app)/admin/AdminUserControls";
import { TopSection } from "@/components/TopSection";
import { auth } from "@/utils/auth";
import { ErrorPage } from "@/components/ErrorPage";
import { isAdmin } from "@/utils/admin";
import {
  AdminSyncStripe,
  AdminSyncStripeCustomers,
} from "@/app/(app)/admin/AdminSyncStripe";
import { RegisterSSOModal } from "@/app/(app)/admin/RegisterSSOModal";

export default async function AdminPage() {
  const session = await auth();

  // DEBUG: Add temporary logging
  console.log("=== ADMIN DEBUG ===");
  console.log("Session user email:", session?.user.email);
  console.log("ADMINS env var:", process.env.ADMINS);
  console.log("Is admin check:", isAdmin({ email: session?.user.email }));
  console.log("==================");

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        title="No Access"
        description={`You do not have permission to access this page. 
        
Debug info:
- Your email: ${session?.user.email}
- ADMINS env: ${process.env.ADMINS}
- Is admin: ${isAdmin({ email: session?.user.email })}`}
      />
    );
  }

  return (
    <div>
      <TopSection title="Admin" />

      <div className="m-8 space-y-8">
        <AdminUpgradeUserForm />
        <AdminUserControls />
        <RegisterSSOModal />

        <div className="flex gap-2">
          <AdminSyncStripe />
          <AdminSyncStripeCustomers />
        </div>
      </div>
    </div>
  );
}
