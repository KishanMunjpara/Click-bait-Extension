let isEnabled = false;

const statusEl = () => document.getElementById("status");

function setStatus(message, kind = "info") {
  const el = statusEl();
  el.textContent = message;
  el.dataset.kind = kind;
}

function updateButton() {
  const toggleBtn = document.getElementById("toggleBtn");
  toggleBtn.textContent = isEnabled ? "Disable" : "Enable";
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    // Already injected or restricted page
    console.debug("content script inject:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.sync.get(["isEnabled"]);
  isEnabled = Boolean(data.isEnabled);
  updateButton();

  document.getElementById("toggleBtn").addEventListener("click", async () => {
    isEnabled = !isEnabled;
    await chrome.storage.sync.set({ isEnabled });
    updateButton();
    setStatus(isEnabled ? "Detection enabled." : "Detection disabled.", "info");
  });

  document.getElementById("scanBtn").addEventListener("click", async () => {
    setStatus("Scanning…", "info");
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      setStatus("No active tab.", "error");
      return;
    }

    await ensureContentScript(tab.id);

    chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(
          chrome.runtime.lastError.message || "Could not reach this page.",
          "error"
        );
        return;
      }
      if (!response?.ok) {
        setStatus(response?.error || "Scan failed.", "error");
        return;
      }

      const result = response.result;
      if (result.skipped) {
        const reasons = {
          disabled: "Enable CliNe first, then scan.",
          no_headline: "No headline (h1) found on this page.",
          empty_headline: "Headline was empty.",
        };
        setStatus(reasons[result.reason] || "Skipped.", "warn");
        return;
      }

      const pct = Math.round((result.score ?? 0) * 100);
      if (result.label === "clickbait") {
        setStatus(`Clickbait (${pct}% score)\n“${result.text}”`, "warn");
      } else {
        setStatus(`Not clickbait (${pct}% score)\n“${result.text}”`, "ok");
      }
    });
  });
});
