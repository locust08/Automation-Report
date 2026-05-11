import { summarizeAudienceItemsForChart } from "@/lib/reporting/audience-breakdown";
import { formatCompactNumber, formatDelta, formatMetricValue } from "@/lib/reporting/format";
import type {
  AudienceBreakdownRow,
  AudienceClickBreakdownResponse,
  CampaignGroup,
  CampaignRow,
  OverallReportPayload,
  Platform,
  SummaryMetric,
} from "@/lib/reporting/types";

import styles from "./monthly-report-print.module.css";

export function MonthlyReportPrint({
  accountId,
  report,
}: {
  accountId: string;
  report: OverallReportPayload;
}) {
  const visibleGroups = report.campaignGroups.filter((group) =>
    group.rows.some((row) => row.spend > 0)
  );

  return (
    <main className={styles["monthly-print"]} data-report-ready="true">
      <section className={`${styles["monthly-print__cover"]} ${styles["monthly-print__section"]}`}>
        <div>
          <p className={styles["monthly-print__eyebrow"]}>Monthly Ads Performance Report</p>
          <h1>{report.companyName}</h1>
          <p className={styles["monthly-print__period"]}>{report.dateRange.currentLabel}</p>
        </div>
        <dl className={styles["monthly-print__meta"]}>
          <div>
            <dt>Report account</dt>
            <dd>{accountId}</dd>
          </div>
          <div>
            <dt>Meta account</dt>
            <dd>{report.accountIds.metaAccountIds.join(", ") || "Not included"}</dd>
          </div>
          <div>
            <dt>Google account</dt>
            <dd>{report.accountIds.googleAccountIds.join(", ") || "Not included"}</dd>
          </div>
        </dl>
      </section>

      <section className={styles["monthly-print__section"]}>
        <SectionHeader eyebrow="Executive snapshot" title="Performance Summary" />
        <div className={styles["monthly-print__summary-grid"]}>
          {report.summaries.map((section) => (
            <article className={styles["monthly-print__panel"]} key={section.platform}>
              <h3>{section.title}</h3>
              <div className={styles["monthly-print__metric-grid"]}>
                {section.metrics.map((metric) => (
                  <MetricCard key={`${section.platform}-${metric.key}`} metric={metric} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles["monthly-print__section"]} ${styles["monthly-print__page-break"]}`}>
        <SectionHeader eyebrow="Campaign detail" title="Campaign Breakdown" />
        {visibleGroups.length > 0 ? (
          <div className={styles["monthly-print__stack"]}>
            {visibleGroups.map((group) => (
              <CampaignGroupTable key={group.id} group={group} />
            ))}
          </div>
        ) : (
          <EmptyState>No campaign rows with reportable spend were returned for this period.</EmptyState>
        )}
      </section>

      <section className={`${styles["monthly-print__section"]} ${styles["monthly-print__page-break"]}`}>
        <SectionHeader eyebrow="Audience quality" title="Audience Click Breakdown" />
        <AudienceBreakdownTables breakdown={report.audienceClickBreakdown} />
      </section>

      {report.warnings.length > 0 ? (
        <section className={`${styles["monthly-print__section"]} ${styles["monthly-print__page-break"]}`}>
          <SectionHeader eyebrow="Data notes" title="Warnings" />
          <ul className={styles["monthly-print__warnings"]}>
            {report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className={styles["monthly-print__section-header"]}>
      <p>{eyebrow}</p>
      <h2>{title}</h2>
    </header>
  );
}

function MetricCard({ metric }: { metric: SummaryMetric }) {
  return (
    <div className={styles["monthly-print__metric-card"]}>
      <dt>{metric.label}</dt>
      <dd>{formatMetric(metric)}</dd>
      <span>{formatDelta(metric.delta)}</span>
    </div>
  );
}

function CampaignGroupTable({ group }: { group: CampaignGroup }) {
  const rows = group.rows.filter((row) => row.spend > 0);
  const displayRows = rows.length > 0 ? rows : group.rows;

  return (
    <article className={styles["monthly-print__table-panel"]}>
      <h3>
        {platformLabel(group.platform)} - {group.campaignType}
      </h3>
      <table>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Impr.</th>
            <th>Clicks</th>
            <th>CTR</th>
            <th>CPM</th>
            <th>Results</th>
            <th>Cost/Result</th>
            <th>Spend</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => (
            <CampaignRowCells key={row.id} row={row} />
          ))}
          <CampaignRowCells row={group.totals} label="Grand Total" emphasized />
        </tbody>
      </table>
    </article>
  );
}

function CampaignRowCells({
  row,
  label,
  emphasized,
}: {
  row: CampaignRow;
  label?: string;
  emphasized?: boolean;
}) {
  return (
    <tr className={emphasized ? styles["monthly-print__total-row"] : undefined}>
      <td>{label ?? row.campaignName}</td>
      <td>{formatCompactNumber(row.impressions)}</td>
      <td>{formatCompactNumber(row.clicks)}</td>
      <td>{formatCompactNumber(row.ctr)}%</td>
      <td>{formatCompactNumber(row.cpm)}</td>
      <td>{formatCompactNumber(row.results)}</td>
      <td>{formatCompactNumber(row.costPerResult)}</td>
      <td>{formatCompactNumber(row.spend)}</td>
    </tr>
  );
}

function AudienceBreakdownTables({ breakdown }: { breakdown: AudienceClickBreakdownResponse }) {
  const groups = [
    {
      title: "Age",
      rows: summarizeAudienceItemsForChart(breakdown.age, "age"),
    },
    {
      title: "Gender",
      rows: summarizeAudienceItemsForChart(breakdown.gender, "gender"),
    },
    {
      title: "Country",
      rows: summarizeAudienceItemsForChart(breakdown.location.country, "country"),
    },
    {
      title: "State / Region",
      rows: summarizeAudienceItemsForChart(breakdown.location.region, "region"),
    },
    {
      title: "City",
      rows: summarizeAudienceItemsForChart(breakdown.location.city, "city"),
    },
  ];

  return (
    <div className={styles["monthly-print__audience-grid"]}>
      {groups.map((group) => (
        <AudienceTable key={group.title} title={group.title} rows={group.rows} />
      ))}
    </div>
  );
}

function AudienceTable({ title, rows }: { title: string; rows: AudienceBreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.clicks, 0);

  return (
    <article className={`${styles["monthly-print__table-panel"]} ${styles["monthly-print__avoid-break"]}`}>
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Segment</th>
              <th>Clicks</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.label}`}>
                <td>{row.label}</td>
                <td>{formatCompactNumber(row.clicks)}</td>
                <td>{formatShare(row.clicks, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState>No audience click data available.</EmptyState>
      )}
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={styles["monthly-print__empty"]}>{children}</div>;
}

function formatMetric(metric: SummaryMetric): string {
  const value = formatMetricValue(metric.value, metric.format);
  return metric.format === "currency" && value !== "No Data" ? `RM ${value}` : value;
}

function formatShare(value: number, total: number): string {
  if (total <= 0) {
    return "0.0%";
  }
  return `${((value / total) * 100).toFixed(1)}%`;
}

function platformLabel(platform: Platform): string {
  if (platform === "meta") {
    return "Meta";
  }
  if (platform === "googleYoutube") {
    return "Google YouTube";
  }
  return "Google Ads";
}
