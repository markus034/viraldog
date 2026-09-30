"use strict";

const STORAGE_KEYS = {
  INSTAGRAM: "dog_saver_instagram_favorite_profiles",
  INSTAGRAM_LEGACY: "ig_saver_favorite_profiles",
  TIKTOK: "dog_saver_tiktok_favorite_profiles"
};

const state = {
  activePlatform: "instagram",
  detectedProfile: null,
  detectedPlatform: null,
  favorites: {
    instagram: [],
    tiktok: []
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  setupHeaderActions();
  setupPlatformTabs();
  setupQuickAdd();
  setupSearch();
  await loadFavorites();
  await detectActiveTabProfile();
});

// Close popup action
function setupHeaderActions() {
  const closeBtn = document.getElementById("close-popup-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.close();
    });
  }
}

// Platform tabs (Instagram vs TikTok)
function setupPlatformTabs() {
  const tabs = document.querySelectorAll(".platform-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const platform = tab.dataset.platform;
      if (platform && platform !== state.activePlatform) {
        setActivePlatform(platform);
      }
    });
  });
}

function setActivePlatform(platform) {
  state.activePlatform = platform;

  document.querySelectorAll(".platform-tab").forEach((tab) => {
    const isActive = tab.dataset.platform === platform;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  updateQuickAddState();
  renderFavoritesList();
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById("favorites-search");
  const clearBtn = document.getElementById("clear-search");

  if (!searchInput || !clearBtn) return;

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    clearBtn.hidden = query.length === 0;
    renderFavoritesList();
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.hidden = true;
    renderFavoritesList();
    searchInput.focus();
  });
}

// Quick Add Bar (Image 3)
function setupQuickAdd() {
  const input = document.getElementById("quick-add-input");
  const btn = document.getElementById("quick-add-btn");

  if (!input || !btn) return;

  input.addEventListener("input", () => {
    updateQuickAddState();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btn.click();
    }
  });

  btn.addEventListener("click", async () => {
    const rawVal = input.value.trim();
    const cleanUsername = rawVal.replace(/^@/, "").trim();

    if (!cleanUsername) {
      input.focus();
      return;
    }

    await toggleFavorite(state.activePlatform, cleanUsername);
  });
}

// Detect profile from currently active browser tab
async function detectActiveTabProfile() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      updateQuickAddState();
      return;
    }

    const url = new URL(tab.url);
    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    let detectedPlatform = null;
    let detectedUsername = null;

    if (host.includes("tiktok.com")) {
      // Match /@username
      const match = path.match(/^\/@([a-zA-Z0-9_.-]+)/);
      if (match && match[1]) {
        detectedPlatform = "tiktok";
        detectedUsername = match[1];
      }
    } else if (host.includes("instagram.com")) {
      // Match /username (ignore non-profile paths)
      const ignoredPaths = [
        "explore", "direct", "stories", "reels", "reel", "p",
        "accounts", "emails", "developer", "about", "help",
        "api", "legal", "privacy", "terms", "challenge", "consent", "ajax"
      ];
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 1 && !ignoredPaths.includes(segments[0].toLowerCase())) {
        const potentialUser = segments[0];
        if (/^[A-Za-z0-9._]{1,30}$/.test(potentialUser)) {
          detectedPlatform = "instagram";
          detectedUsername = potentialUser;
        }
      }
    }

    state.detectedPlatform = detectedPlatform;
    state.detectedProfile = detectedUsername;

    if (detectedPlatform) {
      setActivePlatform(detectedPlatform);
    }

    if (detectedUsername) {
      const input = document.getElementById("quick-add-input");
      if (input) {
        input.value = `@${detectedUsername}`;
      }
    }

    updateQuickAddState();
  } catch (err) {
    updateQuickAddState();
  }
}

// Update "Favoritar" button text / state and toggle quick-add visibility
function updateQuickAddState() {
  const quickAddSection = document.getElementById("quick-add-section");
  const input = document.getElementById("quick-add-input");
  const btn = document.getElementById("quick-add-btn");
  if (!quickAddSection || !input || !btn) return;

  const isProfileOpenForActivePlatform = Boolean(
    state.detectedProfile && state.detectedPlatform === state.activePlatform
  );

  quickAddSection.hidden = !isProfileOpenForActivePlatform;

  if (!isProfileOpenForActivePlatform) {
    return;
  }

  const currentUsername = (input.value.trim() || `@${state.detectedProfile}`).replace(/^@/, "").toLowerCase();
  const currentList = state.favorites[state.activePlatform] || [];
  const isAlreadyFav = currentList.some((u) => u.toLowerCase() === currentUsername);

  if (isAlreadyFav && currentUsername) {
    btn.textContent = "Favoritado";
    btn.classList.add("is-favorited");
  } else {
    btn.textContent = "Favoritar";
    btn.classList.remove("is-favorited");
  }
}

// Load favorites from chrome.storage.local
async function loadFavorites() {
  try {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.INSTAGRAM,
      STORAGE_KEYS.INSTAGRAM_LEGACY,
      STORAGE_KEYS.TIKTOK
    ]);

    const igProfiles = Array.from(new Set([
      ...(Array.isArray(stored[STORAGE_KEYS.INSTAGRAM]) ? stored[STORAGE_KEYS.INSTAGRAM] : []),
      ...(Array.isArray(stored[STORAGE_KEYS.INSTAGRAM_LEGACY]) ? stored[STORAGE_KEYS.INSTAGRAM_LEGACY] : [])
    ])).map(u => String(u || "").replace(/^@/, "").trim()).filter(Boolean);

    const ttProfiles = (Array.isArray(stored[STORAGE_KEYS.TIKTOK]) ? stored[STORAGE_KEYS.TIKTOK] : [])
      .map(u => String(u || "").replace(/^@/, "").trim()).filter(Boolean);

    state.favorites.instagram = igProfiles;
    state.favorites.tiktok = ttProfiles;

    updateTabCounts();
    renderFavoritesList();
  } catch (err) {
    showStatus("Erro ao carregar favoritos.");
  }
}

function updateTabCounts() {
  const igCountEl = document.getElementById("count-instagram");
  const ttCountEl = document.getElementById("count-tiktok");

  if (igCountEl) igCountEl.textContent = String(state.favorites.instagram.length);
  if (ttCountEl) ttCountEl.textContent = String(state.favorites.tiktok.length);
}

// Render active platform favorites list (Image 2)
function renderFavoritesList() {
  const listEl = document.getElementById("favorites-list");
  const emptyEl = document.getElementById("empty-state");
  const searchInput = document.getElementById("favorites-search");
  if (!listEl) return;

  const rawQuery = searchInput ? searchInput.value.trim().toLowerCase().replace(/^@/, "") : "";
  const platformList = state.favorites[state.activePlatform] || [];

  const filtered = rawQuery
    ? platformList.filter(u => u.toLowerCase().includes(rawQuery))
    : platformList;

  listEl.innerHTML = "";

  if (filtered.length === 0) {
    if (emptyEl) {
      emptyEl.hidden = false;
      const titleEl = emptyEl.querySelector(".empty-title");
      const subEl = emptyEl.querySelector(".empty-subtitle");
      if (rawQuery) {
        if (titleEl) titleEl.textContent = "Nenhum perfil encontrado";
        if (subEl) subEl.textContent = `Nenhum favorito corresponde a "@${escapeHtml(rawQuery)}".`;
      } else {
        if (titleEl) titleEl.textContent = "Nenhum perfil favoritado";
        if (subEl) subEl.textContent = `Salve seus perfis favoritos do ${state.activePlatform === "instagram" ? "Instagram" : "TikTok"}.`;
      }
    }
    return;
  }

  if (emptyEl) emptyEl.hidden = true;

  filtered.forEach((username) => {
    const item = createFavoriteRow(state.activePlatform, username);
    listEl.appendChild(item);
  });
}

// Create profile row matching Image 2
function createFavoriteRow(platform, username) {
  const row = document.createElement("div");
  row.className = "favorite-item";
  row.dataset.username = username;
  row.dataset.platform = platform;
  row.role = "listitem";

  const profileUrl = platform === "instagram"
    ? `https://www.instagram.com/${encodeURIComponent(username)}/`
    : `https://www.tiktok.com/@${encodeURIComponent(username)}`;

  row.innerHTML = `
    <div class="favorite-main" title="Abrir perfil @${escapeHtml(username)}">
      <span class="favorite-star" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" stroke-width="1">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </span>
      <span class="favorite-username">@${escapeHtml(username)}</span>
    </div>
    <div class="favorite-actions">
      <button type="button" class="delete-btn" title="Remover @${escapeHtml(username)} dos favoritos" aria-label="Remover @${escapeHtml(username)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    </div>
  `;

  // Click on main area opens profile
  const mainArea = row.querySelector(".favorite-main");
  if (mainArea) {
    mainArea.addEventListener("click", async () => {
      try {
        await chrome.tabs.create({ url: profileUrl });
        window.close();
      } catch (err) {
        showStatus("Erro ao abrir perfil.");
      }
    });
  }

  // Click on delete trash icon
  const deleteBtn = row.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeFavorite(platform, username);
    });
  }

  return row;
}

// Add or remove favorite profile
async function toggleFavorite(platform, username) {
  const clean = String(username || "").replace(/^@/, "").trim();
  if (!clean) return;

  const currentList = state.favorites[platform] || [];
  const index = currentList.findIndex(u => u.toLowerCase() === clean.toLowerCase());

  if (index >= 0) {
    // Remove if already present
    currentList.splice(index, 1);
  } else {
    // Add to top
    currentList.unshift(clean);
  }

  await saveFavorites(platform, currentList);
  updateQuickAddState();
}

async function removeFavorite(platform, username) {
  const currentList = state.favorites[platform] || [];
  const updated = currentList.filter(u => u.toLowerCase() !== username.toLowerCase());
  await saveFavorites(platform, updated);
  updateQuickAddState();
}

async function saveFavorites(platform, list) {
  try {
    state.favorites[platform] = list;

    if (platform === "instagram") {
      await chrome.storage.local.set({
        [STORAGE_KEYS.INSTAGRAM]: list,
        [STORAGE_KEYS.INSTAGRAM_LEGACY]: list
      });
    } else if (platform === "tiktok") {
      await chrome.storage.local.set({
        [STORAGE_KEYS.TIKTOK]: list
      });
    }

    updateTabCounts();
    renderFavoritesList();
  } catch (err) {
    showStatus("Erro ao atualizar favoritos.");
  }
}

function showStatus(message) {
  const status = document.getElementById("popup-status");
  if (status) {
    status.textContent = message;
    status.hidden = false;
    setTimeout(() => {
      status.hidden = true;
    }, 3000);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
