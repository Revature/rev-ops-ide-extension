(function () {
  const vscode = acquireVsCodeApi();

  const syncBtn = document.getElementById("sync-btn");
  const syncBtnText = document.getElementById("sync-btn-text");
  const connectionStatus = document.getElementById("connection-status");
  const connectionText = document.getElementById("connection-text");
  const lastSyncSection = document.getElementById("last-sync");
  const lastSyncTime = document.getElementById("last-sync-time");
  const lastSyncStatus = document.getElementById("last-sync-status");

  // Request current state on load
  vscode.postMessage({ type: "requestState" });

  // Sync button click
  syncBtn.addEventListener("click", () => {
    if (!syncBtn.disabled) {
      vscode.postMessage({ type: "syncCode" });
    }
  });

  // Handle messages from extension
  window.addEventListener("message", (event) => {
    const msg = event.data;

    switch (msg.type) {
      case "stateUpdate":
        updateConnection(msg.connected, msg.backendUrl);
        if (msg.lastSync) {
          showLastSync(msg.lastSync.success, msg.lastSync.message, msg.lastSync.timestamp);
        }
        break;

      case "syncStarted":
        syncBtn.disabled = true;
        syncBtn.classList.add("syncing");
        syncBtnText.textContent = "Syncing...";
        break;

      case "syncResult":
        syncBtn.disabled = false;
        syncBtn.classList.remove("syncing");
        syncBtnText.textContent = "Sync Code";
        showLastSync(msg.success, msg.message, msg.timestamp);
        break;
    }
  });

  function updateConnection(connected, backendUrl) {
    if (connected) {
      connectionStatus.className = "connection-badge connected";
      connectionText.textContent = "Connected";
    } else {
      connectionStatus.className = "connection-badge disconnected";
      connectionText.textContent = "No config found";
    }
    syncBtn.disabled = !connected;
  }

  function showLastSync(success, message, timestamp) {
    lastSyncSection.classList.remove("hidden");

    if (timestamp) {
      const date = new Date(timestamp);
      lastSyncTime.textContent = date.toLocaleTimeString();
    } else {
      lastSyncTime.textContent = "";
    }

    lastSyncStatus.textContent = success ? "Success" : message;
    lastSyncStatus.className = "last-sync-status " + (success ? "success" : "failed");
  }
})();
