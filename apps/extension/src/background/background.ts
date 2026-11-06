import { parseGitHubUrl } from '../services/githubDetector.js';
import { storageService, GitHubContext } from '../services/storageService.js';

// Setup side panel behavior on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[OpenProofPay Background] Extension installed');

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((err) => {
      console.warn('[OpenProofPay Background] Could not set panel behavior:', err);
    });
  }
});

// Update active GitHub tab context
async function updateActiveTabContext(tabId?: number) {
  try {
    let queryOptions: chrome.tabs.QueryInfo = { active: true, currentWindow: true };
    if (tabId !== undefined) {
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        handleTabUrl(tab.url, tab.title, tab.id);
        return;
      }
    }

    const [tab] = await chrome.tabs.query(queryOptions);
    if (tab && tab.url) {
      handleTabUrl(tab.url, tab.title, tab.id);
    } else {
      await storageService.setGitHubContext(null);
      clearBadge();
    }
  } catch (err) {
    console.debug('[OpenProofPay Background] Tab update check:', err);
  }
}

async function handleTabUrl(url: string, title?: string, tabId?: number) {
  const ghContext = parseGitHubUrl(url, title);
  if (ghContext) {
    await storageService.setGitHubContext(ghContext);
    updateBadge(ghContext, tabId);
  } else {
    await storageService.setGitHubContext(null);
    clearBadge(tabId);
  }
}

function updateBadge(ctx: GitHubContext, tabId?: number) {
  const badgeText = ctx.type === 'pull' ? 'PR' : ctx.type === 'issue' ? 'ISS' : 'GH';
  const badgeColor = ctx.type === 'pull' ? '#3b82f6' : ctx.type === 'issue' ? '#10b981' : '#64748b';

  chrome.action.setBadgeText({ text: badgeText, tabId });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
}

function clearBadge(tabId?: number) {
  chrome.action.setBadgeText({ text: '', tabId });
}

// Tab change event listeners
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateActiveTabContext(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateActiveTabContext(tabId);
  }
});

// Message handling between Popup, SidePanel, and Background Worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse): boolean => {
  if (message.type === 'OPEN_SIDEPANEL') {
    const targetWindowId = sender.tab?.windowId;
    if (targetWindowId && chrome.sidePanel?.open) {
      chrome.sidePanel.open({ windowId: targetWindowId }).then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        console.error('Error opening side panel:', err);
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    // Popup does not have sender.tab — query the last focused window
    chrome.windows.getLastFocused((win) => {
      if (win?.id && chrome.sidePanel?.open) {
        chrome.sidePanel.open({ windowId: win.id }).then(() => {
          sendResponse({ success: true });
        }).catch((err) => {
          console.error('Error opening side panel:', err);
          sendResponse({ success: false, error: err.message });
        });
      } else {
        sendResponse({ success: false, error: 'Could not identify window for side panel' });
      }
    });
    return true; // Keep message channel open for async response
  } else if (message.type === 'GET_ACTIVE_CONTEXT') {
    storageService.getGitHubContext().then((ctx) => {
      sendResponse({ success: true, data: ctx });
    });
    return true;
  }
  return false;
});
