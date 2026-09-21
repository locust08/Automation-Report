import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { googleAdsClient } from "../lib/google-ads/client";

async function main() {
  const files = execFileSync("git", ["ls-files", "-z", "lib", ".agents/skills/google-ads-notion-campaign-builder", "cloudflare/placement-analysis/src"], { encoding: "utf8" }).split("\0").filter(path => /\.(?:ts|mjs)$/.test(path) && !path.includes(".test."));
  const fields = new Set<string>();
  for (const file of files) {
    const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        const text = ts.isTemplateExpression(node) ? node.getText(tree) : node.text;
        for (const query of text.matchAll(/SELECT\s+([\s\S]+?)\s+FROM\s+\w+/gi)) {
          for (const field of query[1].matchAll(/\b[a-z][a-z_]+(?:\.[a-z_0-9]+)+\b/g)) {
            if (/^(?:ad_group|ad_group_ad|campaign|campaign_budget|asset|customer|customer_client|customer_negative_criterion|shared_set|shared_criterion|metrics|segments|age_range_view|gender_view|geographic_view|user_location_view|topic_view|keyword_view|search_term_view|asset_group|asset_group_asset|campaign_criterion|ad_group_criterion|geo_target_constant|language_constant|detail_placement_view|performance_max_placement_view|group_placement_view|location_view|ad_group_asset|campaign_asset|customer_asset|recommendation)\./.test(field[0])) fields.add(field[0]);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  const client = googleAdsClient();
  const ordered = [...fields].sort();
  const found = new Set<string>();
  for (let i = 0; i < ordered.length; i += 50) {
    const names = ordered.slice(i, i + 50);
    const response = await client.request<{ results?: Array<{ name?: string }> }>("googleAdsFields:search", { query: `SELECT name WHERE name IN (${names.map(name => `'${name}'`).join(",")})`, pageSize: 1000 });
    for (const row of response.results ?? []) if (row.name) found.add(row.name);
  }
  const missing = ordered.filter(name => !found.has(name));
  console.log(JSON.stringify({ apiVersion: client.apiVersion, checkedFields: ordered.length, missing, note: "Field existence audit; selected-with compatibility and mutation semantics require integration validation." }, null, 2));
  if (missing.length) process.exitCode = 1;
}
main().catch(() => { console.error("Google Ads field audit failed; inspect preflight configuration."); process.exitCode = 1; });
