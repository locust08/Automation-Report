import { lockedProviderAction } from "@/lib/change-control/provider-route";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return lockedProviderAction(request, params, "Retry"); }
