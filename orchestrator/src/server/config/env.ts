import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

const candidates = [
  join(process.cwd(), ".env"),
  join(process.cwd(), "..", ".env"),
];

for (const envPath of candidates) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}
