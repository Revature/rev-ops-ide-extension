import * as vscode from "vscode";
import * as path from "path";
import { loadConfig, RevOpsConfig } from "./config";
import { syncCode, SyncResult } from "./codeSync";

let config: RevOpsConfig | null = null;
let lastSyncResult: SyncResult | null = null;
let sidebarProvider: RevOpsSidebarProvider | null = null;
let autoSyncTimeout: NodeJS.Timeout | null = null;

const AUTO_SYNC_DEBOUNCE_MS = 2000;

export function activate(context: vscode.ExtensionContext) {
  console.log("Rev-Ops Code Sync extension activating...");

  // Load config
  config = loadConfig();
  if (!config) {
    console.warn("Rev-Ops config not found — extension will run in offline mode");
  } else {
    console.log(`Rev-Ops config loaded: backend=${config.backendUrl}, runner=${config.runnerId}`);
  }

  // Register sidebar webview
  sidebarProvider = new RevOpsSidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("revopsCodeSync", sidebarProvider)
  );

  // Register sync command
  context.subscriptions.push(
    vscode.commands.registerCommand("rev-ops-code-sync.syncCode", handleSync)
  );

  // Watch for file saves and auto-sync
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const filePath = doc.uri.fsPath;
      if (filePath.includes("pre_process") || filePath.includes("post_process")) {
        scheduleAutoSync();
      }
    })
  );

  console.log("Rev-Ops Code Sync extension activated");
}

function scheduleAutoSync() {
  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout);
  }
  autoSyncTimeout = setTimeout(() => {
    handleSync();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

async function handleSync() {
  if (!config) {
    vscode.window.showWarningMessage("Rev-Ops: No config found. Cannot sync code.");
    return;
  }

  // Notify sidebar that sync started
  sidebarProvider?.postMessage({ type: "syncStarted" });

  const result = await syncCode(config);
  lastSyncResult = result;

  // Notify sidebar of result
  sidebarProvider?.postMessage({
    type: "syncResult",
    success: result.success,
    message: result.message,
    timestamp: result.timestamp ?? null,
  });

  if (!result.success) {
    vscode.window.showWarningMessage(`Rev-Ops sync failed: ${result.message}`);
  }
}

export function deactivate() {
  if (autoSyncTimeout) {
    clearTimeout(autoSyncTimeout);
  }
}

// ── Sidebar Webview Provider ────────────────────────────────────────────────

class RevOpsSidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "src", "webview"),
        vscode.Uri.joinPath(this._extensionUri, "out", "webview"),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "syncCode") {
        vscode.commands.executeCommand("rev-ops-code-sync.syncCode");
      } else if (msg.type === "requestState") {
        this.postMessage({
          type: "stateUpdate",
          connected: config !== null,
          backendUrl: config?.backendUrl ?? null,
          lastSync: lastSyncResult
            ? {
                success: lastSyncResult.success,
                message: lastSyncResult.message,
                timestamp: lastSyncResult.timestamp ?? null,
              }
            : null,
        });
      }
    });
  }

  postMessage(msg: Record<string, unknown>) {
    this._view?.webview.postMessage(msg);
  }

  private _getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview", "sidebar.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview", "sidebar.js")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${cssUri}">
  <title>Rev-Ops Code Sync</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Rev-Ops</h2>
      <p class="subtitle">Code Sync</p>
    </div>

    <div id="status" class="status">
      <div id="connection-status" class="connection-badge disconnected">
        <span class="dot"></span>
        <span id="connection-text">Checking...</span>
      </div>
    </div>

    <button id="sync-btn" class="sync-button">
      <span id="sync-btn-text">Sync Code</span>
    </button>

    <div id="last-sync" class="last-sync hidden">
      <p class="last-sync-label">Last sync:</p>
      <p id="last-sync-time" class="last-sync-time"></p>
      <p id="last-sync-status" class="last-sync-status"></p>
    </div>

    <div class="info">
      <p>Code auto-syncs when you save <code>main.py</code> files.</p>
      <p>Click <strong>Sync Code</strong> to manually sync.</p>
    </div>
  </div>
  <script src="${jsUri}"></script>
</body>
</html>`;
  }
}
