// background.js (proxy mode) — no OpenAI, calls your local/remote proxy
const DEFAULT_PROXY_URL = "http://localhost:3000"; // Vi har satt din lokala server som standard

async function getProxyUrl() {
  // Denna funktion är för framtiden om du vill kunna byta server-url enkelt
  return new Promise((resolve) => {
    chrome.storage.sync.get(["proxy_url"], (res) => resolve(res.proxy_url || DEFAULT_PROXY_URL));
  });
}

async function callProxy(question) {
  const url = await getProxyUrl();
  if (!url) throw new Error("Ingen proxy-URL inställd.");

  // Vår nya server förväntar sig en POST-förfrågan
  const res = await fetch(url.replace(/\/+$/,"") + "/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });

  if (!res.ok) throw new Error(`Serverfel: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.answer || "";
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.action === "generateReply") {
        const tabId = sender?.tab?.id;
        // Anropa vår smarta server med frågan från content.js
        const text = await callProxy(request.message || "");
        if (tabId && text) {
          // Skicka det färdiga svaret tillbaka till content.js för att klistras in
          chrome.tabs.sendMessage(tabId, { action: "insertReply", text });
        }
        sendResponse({ ok: true });
        return;
      }
    } catch (e) {
      try {
        // Skicka felmeddelande till content.js om något går snett
        if (sender?.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, { action: "aiError", message: String(e?.message || e) });
        }
      } catch (_) {}
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true; // Håller meddelande-porten öppen för asynkrona svar
});

console.log("Intercom AI Helper (Background Script) är laddad.");