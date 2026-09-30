chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "translate_text",
      title: "Traduzir seleção com Google Tradutor",
      contexts: ["selection"]
    });
  } catch (e) {}
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate_text" && info.selectionText) {
    const url = `https://translate.google.com/?sl=auto&tl=pt&text=${encodeURIComponent(info.selectionText)}&op=translate`;
    chrome.windows.create({ url, type: 'popup', width: 800, height: 600 });
  }
});
