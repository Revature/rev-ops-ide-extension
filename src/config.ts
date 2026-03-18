import * as fs from "fs";
import * as path from "path";

export interface RevOpsConfig {
  backendUrl: string;
  authToken: string;
  runnerId: string;
  userId: string;
  projectType: "process" | "component" | "page";
}

const CONFIG_PATHS = [
  "/home/ubuntu/.revops.config",
  path.join(process.env.HOME ?? "/root", ".revops.config"),
];

export function loadConfig(): RevOpsConfig | null {
  for (const configPath of CONFIG_PATHS) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);

        if (!parsed.backendUrl || !parsed.authToken || !parsed.userId) {
          console.error(`Rev-Ops config at ${configPath} missing required fields`);
          continue;
        }

        return {
          backendUrl: parsed.backendUrl,
          authToken: parsed.authToken,
          runnerId: parsed.runnerId,
          userId: parsed.userId,
          projectType: parsed.projectType ?? "process",
        };
      }
    } catch (err) {
      console.error(`Failed to read Rev-Ops config at ${configPath}:`, err);
    }
  }
  return null;
}
