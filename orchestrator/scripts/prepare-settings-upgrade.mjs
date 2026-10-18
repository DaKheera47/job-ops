import { join } from "node:path";
import Database from "better-sqlite3";

const { settingsRegistry } = await import(
  new URL("../../shared/src/settings-registry.ts", import.meta.url).href
);

const baseUrl = process.env.JOBOPS_UPGRADE_BASE_URL;
const dataDir = process.env.DATA_DIR;
if (!baseUrl || !dataDir)
  throw new Error("Set JOBOPS_UPGRADE_BASE_URL and DATA_DIR");

async function request(path, token, method = "GET", payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(
      `${method} ${path}: ${response.status} ${body.error?.code}`,
    );
  }
  return body.data;
}

const setup = await request("/api/auth/setup", null, "POST", {
  username: "upgrade-admin",
  password: "upgrade-test-password",
});
const adminToken = setup.token;
for (const username of ["upgrade-alice", "upgrade-bob"]) {
  await request("/api/workspaces/users", adminToken, "POST", {
    username,
    password: "upgrade-test-password",
  });
}
await request("/api/settings", adminToken, "PATCH", {
  llmProvider: "openai",
  model: "gpt-5.4-mini",
  llmApiKey: "sk-test-upgrade-admin",
  searchTerms: ["upgrade engineer"],
  backupHour: 7,
});

const sqlite = new Database(join(dataDir, "jobs.db"));
const users = sqlite
  .prepare(`SELECT users.username, users.id AS user_id, tenant_memberships.tenant_id
    FROM users JOIN tenant_memberships ON tenant_memberships.user_id = users.id
    WHERE users.username LIKE 'upgrade-%'
    ORDER BY users.username`)
  .all();
const insert = sqlite.prepare(`INSERT OR REPLACE INTO settings
  (tenant_id, user_id, key, value, created_at, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`);
const allKeys = Object.keys(settingsRegistry);
sqlite.transaction(() => {
  for (const user of users) {
    for (const key of allKeys) {
      const definition = settingsRegistry[key];
      let value =
        "default" in definition && "serialize" in definition
          ? definition.serialize(definition.default())
          : null;
      if (value == null) value = `legacy-${key}-${user.username}`;
      if (key === "llmProvider") value = "openai";
      if (key === "model") value = `gpt-5.4-mini-${user.username}`;
      if (key === "llmApiKey") value = `sk-test-${user.username}`;
      if (key === "backupEnabled") value = "1";
      if (key === "backupHour")
        value = user.username === "upgrade-admin" ? "7" : "9";
      if (key === "searchTerms") value = JSON.stringify([user.username]);
      insert.run(user.tenant_id, user.user_id, key, value);
    }
  }
})();
const count = sqlite
  .prepare("SELECT count(*) AS count FROM settings")
  .get().count;
sqlite.close();
if (count !== users.length * allKeys.length) {
  throw new Error(
    `Expected ${users.length * allKeys.length} rows, got ${count}`,
  );
}
console.log(
  `Prepared old-version database: ${users.length} users, ${allKeys.length} keys, ${count} rows.`,
);
