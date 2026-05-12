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
  SummarySection,
} from "@/lib/reporting/types";

import styles from "./monthly-report-print.module.css";

export function MonthlyReportPrint({
  accountId,
  report,
}: {
  accountId: string;
  report: OverallReportPayload;
}) {
  const title = `${report.companyName} Monthly Performance`;
  const activeAccountItems = [
    ...report.accountIds.metaAccountIds.map((id) => ({ platform: "Meta Ads", id })),
    ...report.accountIds.googleAccountIds.map((id) => ({ platform: "Google Ads", id })),
  ];

  return (
    <main className={styles.reportRoot} data-report-ready="true">
      <div className={styles.reportFrame}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroGrid}>
              <div className={styles.heroTitleBlock}>
                <h1>{title}</h1>
              </div>
              <div className={styles.heroMeta}>
                <div className={styles.datePill}>{report.dateRange.currentLabel}</div>
                <div className={styles.accountPanel}>
                  {(activeAccountItems.length > 0 ? activeAccountItems : [{ platform: "Account", id: accountId }]).map(
                    (item) => (
                      <div className={styles.accountItem} key={`${item.platform}:${item.id}`}>
                        <span>{item.platform}</span>
                        <strong>{item.id}</strong>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.contentStack}>
          {report.warnings.length > 0 ? <Warnings warnings={report.warnings} /> : null}

          {report.summaries.map((section) => (
            <DashboardMetricSection key={section.platform} section={section} />
          ))}

          <CampaignBreakdown groups={report.campaignGroups} />
          <AudienceBreakdown breakdown={report.audienceClickBreakdown} />
        </section>

        <footer className={styles.footer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/locus-t-logo-25.png" alt="LOCUS-T logo" width={220} height={40} />
          <span>LOCUS-T SDN BHD</span>
        </footer>
      </div>
    </main>
  );
}

function DashboardMetricSection({ section }: { section: SummarySection }) {
  const spendMetric = section.metrics.find((metric) => metric.key === "spend");
  if (spendMetric && (spendMetric.value ?? 0) <= 0) {
    return null;
  }

  return (
    <article className={styles.metricSection}>
      <div className={styles.logoRow}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={section.logoPath} alt={`${section.title} logo`} width={140} height={44} />
      </div>
      <div className={styles.metricGrid}>
        {section.metrics.map((metric) => (
          <MetricCard key={`${section.platform}-${metric.key}`} metric={metric} />
        ))}
      </div>
    </article>
  );
}

function MetricCard({ metric }: { metric: SummaryMetric }) {
  return (
    <div className={styles.metricItem}>
      <p className={styles.metricLabel}>{metric.label}</p>
      <div className={styles.metricValueBox}>
        <p>{formatMetric(metric)}</p>
        <span className={metric.delta !== null && metric.delta < 0 ? styles.deltaDown : styles.deltaUp}>
          {formatDelta(metric.delta)}
        </span>
      </div>
    </div>
  );
}

function CampaignBreakdown({ groups }: { groups: CampaignGroup[] }) {
  const visibleGroups = groups.filter((group) => group.rows.some((row) => row.spend > 0)).slice(0, 2);

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <section className={styles.dashboardSection}>
      <h2>Campaign Breakdown</h2>
      <div className={styles.tableStack}>
        {visibleGroups.map((group) => (
          <CampaignGroupTable key={group.id} group={group} />
        ))}
      </div>
    </section>
  );
}

function CampaignGroupTable({ group }: { group: CampaignGroup }) {
  const rows = group.rows.filter((row) => row.spend > 0).slice(0, 5);

  return (
    <article className={styles.tablePanel}>
      <h3>
        {platformLabel(group.platform)} - {group.campaignType}
      </h3>
      <table className={styles.campaignTable}>
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Impression</th>
            <th>Clicks</th>
            <th>CTR (%)</th>
            <th>CPM</th>
            <th>Results</th>
            <th>Cost/Results</th>
            <th>Ads Spent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
    <tr className={emphasized ? styles.totalRow : undefined}>
      <td>{label ?? row.campaignName}</td>
      <td>{formatCompactNumber(row.impressions)}</td>
      <td>{formatCompactNumber(row.clicks)}</td>
      <td>{formatCompactNumber(row.ctr)}</td>
      <td>{formatCompactNumber(row.cpm)}</td>
      <td>{formatCompactNumber(row.results)}</td>
      <td>{formatCompactNumber(row.costPerResult)}</td>
      <td>{formatCompactNumber(row.spend)}</td>
    </tr>
  );
}

function AudienceBreakdown({ breakdown }: { breakdown: AudienceClickBreakdownResponse }) {
  const ageRows = summarizeAudienceItemsForChart(breakdown.age, "age").slice(0, 6);
  const genderRows = summarizeAudienceItemsForChart(breakdown.gender, "gender").slice(0, 4);
  const countryRows = summarizeAudienceItemsForChart(breakdown.location.country, "country");
  const regionRows = summarizeAudienceItemsForChart(breakdown.location.region, "region");
  const cityRows = summarizeAudienceItemsForChart(breakdown.location.city, "city");
  const locationRows = (cityRows.length > 0 ? cityRows : regionRows.length > 0 ? regionRows : countryRows).slice(0, 7);
  const activeLocationTab = cityRows.length > 0 ? "City" : regionRows.length > 0 ? "State / Region" : "Country";

  return (
    <section className={styles.dashboardSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Audience Click Breakdown</h2>
          <p>Clicks by age, gender, and top 10 locations for audience optimisation.</p>
        </div>
        <div className={styles.audienceControls} aria-hidden="true">
          <span className={styles.activeControl}>Bar</span>
          <span>Pie</span>
          <span className={styles.toggleControl}>
            Hide unknown
            <i />
          </span>
        </div>
      </div>

      <div className={styles.audienceGrid}>
        <AudienceChartCard title="Age Breakdown" rows={ageRows} />
        <AudienceChartCard title="Gender Breakdown" rows={genderRows} />
      </div>

      <AudienceChartCard title="Location Breakdown" rows={locationRows} activeLocationTab={activeLocationTab} wide />
    </section>
  );
}

function AudienceChartCard({
  title,
  rows,
  wide,
  activeLocationTab,
}: {
  title: string;
  rows: AudienceBreakdownRow[];
  wide?: boolean;
  activeLocationTab?: "Country" | "State / Region" | "City";
}) {
  return (
    <article className={`${styles.audienceCard} ${wide ? styles.audienceCardWide : ""}`}>
      <div className={styles.audienceCardHeader}>
        <div>
          <h3>{title}</h3>
          <p>Clicks</p>
        </div>
        {activeLocationTab ? (
          <div className={styles.locationTabs} aria-hidden="true">
            {(["Country", "State / Region", "City"] as const).map((tab) => (
              <span key={tab} className={tab === activeLocationTab ? styles.activeLocationTab : ""}>
                {tab}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {rows.length > 0 ? <BarChart rows={rows} /> : <div className={styles.emptyState}>No audience click data available.</div>}
    </article>
  );
}

function BarChart({ rows }: { rows: AudienceBreakdownRow[] }) {
  const maxValue = Math.max(...rows.map((row) => row.clicks), 1);
  const tickValues = [1, 0.75, 0.5, 0.25, 0].map((step) => Math.round(maxValue * step));

  return (
    <div className={styles.chartShell}>
      <div className={styles.yAxis}>
        {tickValues.map((tick, index) => (
          <span key={`${tick}-${index}`}>{formatCompactNumber(tick)}</span>
        ))}
      </div>
      <div className={styles.plotArea}>
        <div className={styles.gridLines} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className={styles.barChart}>
          {rows.map((row) => {
            const percent = Math.max(4, (row.clicks / maxValue) * 100);
            return (
              <div className={styles.barColumn} key={row.label}>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ height: `${percent}%` }}>
                    <span>{formatCompactNumber(row.clicks)}</span>
                  </div>
                </div>
                <strong>{row.label}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  return (
    <section className={styles.warningPanel}>
      <h2>Report Warnings</h2>
      <ul>
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}

function formatMetric(metric: SummaryMetric): string {
  return formatMetricValue(metric.value, metric.format);
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
