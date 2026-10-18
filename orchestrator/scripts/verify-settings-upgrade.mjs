const baseUrl = process.env.JOBOPS_UPGRADE_BASE_URL;
if (!baseUrl) throw new Error("Set JOBOPS_UPGRADE_BASE_URL");

async function request(path, token, method = "GET", payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

const tokens = {};
for (const username of ["upgrade-admin", "upgrade-alice", "upgrade-bob"]) {
  const { status, body } = await request("/api/auth/login", "", "POST", {
    username,
    password: "upgrade-test-password",
  });
  if (status !== 200 || !body.ok) throw new Error(`Login failed: ${username}`);
  tokens[username] = body.data.token;
}

for (const username of Object.keys(tokens)) {
  const { status, body } = await request("/api/settings", tokens[username]);
  if (status !== 200 || !body.ok)
    throw new Error(`Settings failed: ${username}`);
  const settings = body.data;
  if (settings.model.value !== `gpt-5.4-mini-${username}`) {
    throw new Error(`Wrong migrated model: ${username}`);
  }
  if (settings.backupHour.value !== 7) {
    throw new Error(`Wrong migrated platform backup hour: ${username}`);
  }
  if (
    username !== "upgrade-admin" &&
    settings.editableKeys.includes("backupHour")
  ) {
    throw new Error(`Platform settings editable by ${username}`);
  }
}

const alice = tokens["upgrade-alice"];
const changed = await request("/api/settings", alice, "PATCH", {
  model: "gpt-5.4-mini-upgrade-alice-verified",
});
if (changed.status !== 200 || !changed.body.ok) {
  throw new Error("Personal model update failed");
}
const denied = await request("/api/settings", alice, "PATCH", {
  backupHour: 12,
});
if (denied.status !== 403 || denied.body.error?.code !== "FORBIDDEN") {
  throw new Error("Regular user changed platform backup setting");
}
const bob = await request("/api/settings", tokens["upgrade-bob"]);
if (bob.body.data.model.value !== "gpt-5.4-mini-upgrade-bob") {
  throw new Error("Alice's model update reached Bob");
}
console.log(
  "Verified migrated personal settings, shared platform setting, and authorization over HTTP.",
);
