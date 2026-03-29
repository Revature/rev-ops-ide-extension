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
  project_type: string;
  pre_process_code: string | null;
  post_process_code: string | null;
}

interface ComponentPayload {
  runner_id: string;
  user_id: string;
  project_type: "component" | "page" | "report";
  component_files: Record<string, string>;
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

function postJson(url: string, data: CodePayload | ComponentPayload, authToken: string): Promise<SyncResult> {
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
    project_type: "process",
    pre_process_code: preCode,
    post_process_code: postCode,
  };

  const url = `${config.backendUrl}/api/admin/cde/sync-code`;
  return postJson(url, payload, config.authToken);
}

function findComponentDir(): string | null {
  const candidates = [
    "/home/ubuntu/rev-ops-react-component-template/component",
    path.join(process.env.HOME ?? "/root", "rev-ops-react-component-template/component"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function readComponentFiles(componentDir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const entries = fs.readdirSync(componentDir);
  for (const entry of entries) {
    if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      const content = readFileIfExists(path.join(componentDir, entry));
      if (content) {
        files[entry] = content;
      }
    }
  }
  return files;
}

export async function syncComponentCode(config: RevOpsConfig): Promise<SyncResult> {
  const componentDir = findComponentDir();
  if (!componentDir) {
    return { success: false, message: "Could not find component template workspace" };
  }

  const componentFiles = readComponentFiles(componentDir);
  if (Object.keys(componentFiles).length === 0) {
    return { success: false, message: "No .tsx or .ts files found in component/ directory" };
  }

  const payload: ComponentPayload = {
    runner_id: config.runnerId,
    user_id: config.userId,
    project_type: "component",
    component_files: componentFiles,
  };

  const url = `${config.backendUrl}/api/admin/cde/sync-code`;
  return postJson(url, payload, config.authToken);
}

function findPageDir(): string | null {
  const candidates = [
    "/home/ubuntu/rev-ops-react-page-template/page",
    path.join(process.env.HOME ?? "/root", "rev-ops-react-page-template/page"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

export async function syncPageCode(config: RevOpsConfig): Promise<SyncResult> {
  const pageDir = findPageDir();
  if (!pageDir) {
    return { success: false, message: "Could not find page template workspace" };
  }

  const pageFiles = readComponentFiles(pageDir);
  if (Object.keys(pageFiles).length === 0) {
    return { success: false, message: "No .tsx or .ts files found in page/ directory" };
  }

  const payload: ComponentPayload = {
    runner_id: config.runnerId,
    user_id: config.userId,
    project_type: "page",
    component_files: pageFiles,
  };

  const url = `${config.backendUrl}/api/admin/cde/sync-code`;
  return postJson(url, payload, config.authToken);
}

function findReportDir(): string | null {
  const candidates = [
    "/home/ubuntu/rev-ops-react-report-template/component",
    path.join(process.env.HOME ?? "/root", "rev-ops-react-report-template/component"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

export async function syncReportCode(config: RevOpsConfig): Promise<SyncResult> {
  const reportDir = findReportDir();
  if (!reportDir) {
    return { success: false, message: "Could not find report template workspace" };
  }

  const reportFiles = readComponentFiles(reportDir);
  if (Object.keys(reportFiles).length === 0) {
    return { success: false, message: "No .tsx or .ts files found in component/ directory" };
  }

  const payload: ComponentPayload = {
    runner_id: config.runnerId,
    user_id: config.userId,
    project_type: "report",
    component_files: reportFiles,
  };

  const url = `${config.backendUrl}/api/admin/cde/sync-code`;
  return postJson(url, payload, config.authToken);
}
