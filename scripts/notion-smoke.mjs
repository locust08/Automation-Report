const NOTION_API_VERSION = "2026-03-11";

function trimNotionEnvValue(value) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function extractNotionDatabaseId(value) {
  const trimmed = trimNotionEnvValue(value) ?? "";
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(
    /([0-9a-f]{32})|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );

  return match ? match[0] : null;
}

function isValidNotionDatabaseId(value) {
  return /^[0-9a-f]{32}$/i.test(value) || /^[0-9a-f-]{36}$/i.test(value);
}

async function main() {
  const notionToken = trimNotionEnvValue(process.env.NOTION_TOKEN) ?? "";
  const rawDatabaseId = trimNotionEnvValue(process.env.NOTION_DATABASE_ID) ?? "";
  const databaseId = extractNotionDatabaseId(rawDatabaseId);
  const tokenFingerprint = notionToken
    ? notionToken.length <= 8
      ? `${notionToken.slice(0, 2)}...${notionToken.slice(-2)}`
      : `${notionToken.slice(0, 4)}...${notionToken.slice(-4)}`
    : "(missing)";

  console.info(
    `[notion-smoke] token_present=${Boolean(notionToken)} token_length=${notionToken.length} token_fingerprint=${tokenFingerprint} database_id=${databaseId || "(missing)"}`
  );

  if (!notionToken) {
    throw new Error("Missing required env var NOTION_TOKEN.");
  }

  if (!rawDatabaseId) {
    throw new Error("Missing required env var NOTION_DATABASE_ID.");
  }

  if (!databaseId || !isValidNotionDatabaseId(databaseId)) {
    throw new Error(
      `Invalid NOTION_DATABASE_ID "${rawDatabaseId}". Expected a 32-char or 36-char Notion ID.`
    );
  }

  const endpoint = `https://api.notion.com/v1/databases/${databaseId}`;
  console.info(`[notion-smoke] GET ${endpoint}`);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
    },
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    let message = bodyText.trim();
    try {
      const json = JSON.parse(bodyText);
      if (json?.message) {
        message = json.message;
      }
    } catch {}
    console.error(
      `[notion-smoke] request_failed status=${response.status} endpoint=${endpoint} response_body=${message || "(empty)"}`
    );
    throw new Error(
      message || `Notion API request failed with status ${response.status} while reading the database.`
    );
  }

  const bodyText = await response.text().catch(() => "");
  let json = null;
  try {
    json = JSON.parse(bodyText);
  } catch {}

  const dataSources = json?.data_sources ?? [];
  if (!Array.isArray(dataSources) || dataSources.length === 0) {
    throw new Error(
      "Database retrieval succeeded but data_sources is missing or empty. If this is a linked database, use the original source database/data source instead."
    );
  }

  const dataSourceId = dataSources[0]?.id?.trim();
  if (!dataSourceId) {
    throw new Error(
      "Database retrieval succeeded but data_sources[0].id is missing. If this is a linked database, use the original source database/data source instead."
    );
  }

  const queryEndpoint = `https://api.notion.com/v1/data_sources/${dataSourceId}/query`;
  console.info(
    `[notion-smoke] database access OK data_source_id=${dataSourceId} query_endpoint=${queryEndpoint}`
  );
}

main().catch((error) => {
  console.error(
    `[notion-smoke] ${error instanceof Error ? error.message : "Unknown Notion smoke test error."}`
  );
  process.exitCode = 1;
});
