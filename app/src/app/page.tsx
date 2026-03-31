import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

function publicLandingUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_PILOX_LANDING_URL?.trim() ?? "";
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/agents");
  }
  const landing = publicLandingUrl();
  if (landing) {
    redirect(landing);
  }
  redirect("/auth/login");
}
