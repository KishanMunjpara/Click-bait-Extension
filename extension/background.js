const DEFAULT_API = "http://127.0.0.1:10000/predict";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["apiUrl", "isEnabled"], (data) => {
    if (data.apiUrl == null) {
      chrome.storage.sync.set({ apiUrl: DEFAULT_API });
    }
    if (data.isEnabled == null) {
      chrome.storage.sync.set({ isEnabled: false });
    }
  });
});
