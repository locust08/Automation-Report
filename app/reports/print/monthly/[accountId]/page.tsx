import { MonthlyReportPrint } from "@/components/reporting/print/monthly-report-print";
import { getOverallReport } from "@/lib/reporting/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MonthlyReportPrintPageProps {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    month?: string;
    metaAccountId?: string;
    googleAccountId?: string;
    platform?: string;
  }>;
}

export default async function MonthlyReportPrintPage({
  params,
  searchParams,
}: MonthlyReportPrintPageProps) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const decodedAccountId = decodeURIComponent(accountId);
  const dateRange = resolveDateRange(query);
  const report = await getOverallReport({
    accountId: decodedAccountId,
    metaAccountId: query.metaAccountId ?? null,
    googleAccountId: query.googleAccountId ?? null,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  return <MonthlyReportPrint accountId={decodedAccountId} report={report} platform={query.platform} />;
}

function resolveDateRange(query: {
  startDate?: string;
  endDate?: string;
  month?: string;
}): { startDate: string | null; endDate: string | null } {
  if (query.startDate && query.endDate) {
    return {
      startDate: query.startDate,
      endDate: query.endDate,
    };
  }

  if (!query.month || !/^\d{4}-\d{2}$/.test(query.month)) {
    return {
      startDate: query.startDate ?? null,
      endDate: query.endDate ?? null,
    };
  }

  const [yearPart, monthPart] = query.month.split("-");
  const year = Number.parseInt(yearPart, 10);
  const month = Number.parseInt(monthPart, 10);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
