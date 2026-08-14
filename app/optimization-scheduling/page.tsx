import { redirect } from "next/navigation";
import { OptimizationSchedulingPageClient } from "@/components/optimization-scheduling/optimization-scheduling-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function OptimizationSchedulingPage(){
  const session=await getServerAuthSession();
  if(!session)redirect("/");
  if(session.role!=="admin")redirect("/dashboard");
  return <OptimizationSchedulingPageClient/>;
}
