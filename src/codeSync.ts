import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { RevOpsConfig } from "./config";

export interface SyncResult {
  success: boolean;
  message: string;
  timestamp?: string;
}

interface CodePayload {
  runner_id: string;
  user_id: string;
  pre_process_code: string | null;
  post_process_code: string | null;
}

function readFileIfExists(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
  }
  return null;
}

function findWorkspaceRoot(): string | null {
  // Look for the template repo in common locations
  const candidates = [
    "/home/ubuntu/rev-ops-python-process-template",
    path.join(process.env.HOME ?? "/root", "rev-ops-python-process-template"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function postJson(url: string, data: CodePayload, authToken: string): Promise<SyncResult> {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${authToken}`,
      },
    };

    const req = transport.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk: Buffer) => { responseBody += chunk.toString(); });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            success: true,
            message: "Code synced successfully",
            timestamp: new Date().toISOString(),
          });
        } else {
          let detail = `HTTP ${res.statusCode}`;
          try {
            const parsed = JSON.parse(responseBody);
            if (parsed.detail) { detail = parsed.detail; }
          } catch { /* ignore parse errors */ }
          resolve({ success: false, message: `Sync failed: ${detail}` });
        }
      });
    });

    req.on("error", (err) => {
      resolve({ success: false, message: `Connection failed: ${err.message}` });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ success: false, message: "Request timed out" });
    });

    req.write(body);
    req.end();
  });
}

export async function syncCode(config: RevOpsConfig): Promise<SyncResult> {
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    return { success: false, message: "Could not find process template workspace" };
  }

  const preProcessPath = path.join(workspaceRoot, "pre_process", "main.py");
  const postProcessPath = path.join(workspaceRoot, "post_process", "main.py");

  const preCode = readFileIfExists(preProcessPath);
  const postCode = readFileIfExists(postProcessPath);

  if (preCode === null && postCode === null) {
    return { success: false, message: "No code files found (pre_process/main.py or post_process/main.py)" };
  }

  const payload: CodePayload = {
    runner_id: config.runnerId,
    user_id: config.userId,
    pre_process_code: preCode,
    post_process_code: postCode,
  };

  const url = `${config.backendUrl}/api/admin/cde/sync-code`;
  return postJson(url, payload, config.authToken);
}
