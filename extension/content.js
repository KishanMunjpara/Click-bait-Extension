async function classifyHeadline() {
  const { isEnabled, apiUrl } = await chrome.storage.sync.get([
    "isEnabled",
    "apiUrl",
  ]);

  if (!isEnabled) {
    return { skipped: true, reason: "disabled" };
  }

  const heading =
    document.querySelector("h1") ||
    document.querySelector('[itemprop="headline"]') ||
    document.querySelector("article h1");

  if (!heading) {
    return { skipped: true, reason: "no_headline" };
  }

  const text = (heading.textContent || "").trim();
  if (!text) {
    return { skipped: true, reason: "empty_headline" };
  }

  const endpoint = apiUrl || "http://127.0.0.1:10000/predict";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }

  const data = await response.json();
  return { text, ...data };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN_PAGE") return;

  classifyHeadline()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({ ok: false, error: error?.message || String(error) })
    );

  return true; // keep channel open for async response
});
