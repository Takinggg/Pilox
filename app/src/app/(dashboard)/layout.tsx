import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { GlobalModals } from "@/components/dashboard/global-modals";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/login");
  }

  if (session.user.mfaRequired && !session.user.mfaVerified) {
    redirect("/auth/mfa");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        user={{ name: session.user.name, email: session.user.email, role: (session.user as { role?: string }).role || "viewer" }}
      />
      <main className="relative flex-1 overflow-y-auto">
        <GlobalModals />
        {children}
      </main>
      <Toaster />
    </div>
  );
}
