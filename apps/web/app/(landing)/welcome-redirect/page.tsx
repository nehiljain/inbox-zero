import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";

export default async function WelcomeRedirectPage(props: {
  searchParams: Promise<{ question?: string; force?: boolean }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { completedOnboardingAt: true, utms: true },
  });

  if (!user) redirect("/login");

  if (!searchParams.force && user.completedOnboardingAt) redirect("/setup");

  // Redirect to value prop page for users who haven't completed onboarding
  // Note: We show value prop even without PostHog configured for dev testing
  redirect("/value-prop");
}
