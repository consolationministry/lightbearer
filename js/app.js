import { getAllHymns } from "./hymn-service.js?v=31";
import { searchHymns, rankHymnResults } from "./search.js";
import { getFavorites, isFavorite, toggleFavorite } from "./favorites.js";
import { addRecent, getRecentNumbers } from "./recent.js";
import { getReadingParts } from "./hymn-reading.js";
import { getMemberContent, servicePlanDayLabel } from "./public-content.js";
import { castProgrammeVote, getProgrammeInteractions } from "./programme-interactions.js";
import { excerptProgrammeDescription, PROGRAMME_DESCRIPTION_COLLAPSE_LIMIT, repairMojibake } from "./programme-feed-utils.js";
import { ACCENT_THEMES, getSettings, saveSettings } from "./settings.js";
import { applyAvailableUpdate, initializeUpdates } from "./updates.js";
import { APP_VERSION } from "./version.js";
import { remainingSplashMs } from "./splash-timing.js";
import { quoteBannerHtml, startQuoteBanner, stopQuoteBanner } from "./quote-banner.js";
import { displayHymnalName } from "./hymnal-labels.js";
import { UPLOADED_HYMN_SOURCE, UPLOADED_YORUBA_HYMN_SOURCE } from "./hymnal-selection.js";
import {
  emptyLiveAudioData,
  loadPublicLiveAudioSegment,
  loadPublicLiveAudioData,
  recordPublicLiveAudioListen,
  submitPublicLiveAudioComment,
  togglePublicLiveAudioReaction,
  sendPublicLiveAudioBurst
} from "./live-audio-public-data.js";
import { createLiveAudioId, subscribeLiveAudioBursts, getLiveAudioVisitorId } from "./live-audio-realtime.js";
import { publicLiveAudioConnectionMessage, publicLiveAudioJoinError, publicLiveAudioNetworkIssue } from "./live-audio-status.js";
import {
  createSavedLiveAudioPlaybackUrl,
  getSavedLiveAudioPrograms,
  removeSavedLiveAudioProgram,
  saveLiveAudioRecordingOffline
} from "./live-audio-offline.js";
import { startLiveAudioListener } from "./live-audio-webrtc.js";
import {
  mountAudioPlayer,
  prepareAudioPlayer,
  preserveRecordedAudioPlayer,
  isWaitingForLiveAudioSegment,
  getNextLiveAudioSegmentIndex,
  seekAudioPlayer,
  returnToLiveAudio,
  setLiveAudioStream,
  setAudioPlayerVolume,
  stopAudioPlayer,
  toggleAudioMute,
  toggleAudioPlayback
} from "./live-audio-player.js";
import { renderLiveAudioListener, renderLiveAudioPage, updateLiveAudioListener } from "./live-audio-views.js";
import { fetchLibraryBooks, fetchBookPages, fetchPageSocial, likeBookPage, commentOnBookPage } from "./library-data.js";
import { renderAudioLibrary } from "./audio-library.js";

const splashStartedAt = Date.now();
const CHURCH_MOTTO = "Occupy Till I Come";
const ACTIVE_VERSION = APP_VERSION;

const header = document.getElementById("brand-header");
const main = document.getElementById("main-content");
const nav = document.getElementById("bottom-nav");
const shell = document.getElementById("app-shell");
const splash = document.getElementById("splash");
const splashMotto = document.querySelector(".splash-motto");
if (splashMotto) splashMotto.textContent = CHURCH_MOTTO;
const toast = document.getElementById("toast");
const updateDialog = document.getElementById("update-dialog");
const updateMessage = document.getElementById("update-message");
const updateVersion = document.getElementById("update-version");
const updateStatus = document.getElementById("update-status");
const updateInstallButton = document.getElementById("update-install");
const state = { hymns: [], publicContent: null, programmeInteractions: {}, programmeInteractionsAvailable: null, programmeVotesAvailable: null, programmeVotePending: {}, programmeDescriptionsExpanded: {}, programmeSelectedId: null, programmeCategoryFilter: "", serviceSelectedId: null, serviceAimId: null, liveAudioData: emptyLiveAudioData(), savedLiveAudioPrograms: getSavedLiveAudioPrograms(), savingLiveAudioIds: new Set(), liveAudioPlaybackUrl: "", liveAudioOfflinePlayback: false, liveAudioOpenToken: 0, liveAudioLoading: false, liveAudioError: "", liveAudioJoinError: null, liveAudioQuery: "", liveAudioCategory: "", selectedLiveAudioProgramId: null, liveAudioStartedAt: null, liveAudioTimer: null, liveAudioPollTimer: null, liveAudioSegmentPollTimer: null, liveAudioSegmentRequest: false, liveAudioSegmentRequestToken: 0, liveAudioRequestToken: 0, liveAudioConnectToken: 0, liveAudioListener: null, liveAudioConnecting: false, liveAudioConnectionStatus: "", liveAudioStatusCode: "", liveAudioBroadcastOffline: false, liveAudioHasConnected: false, liveAudioCountRecorded: false, liveAudioEnding: false, liveAudioEndingTimer: null, liveAudioBurstSub: null, liveAudioBurstProgramId: "", liveAudioListenEventId: "", view: "home", readerReturnView: "home", libraryBooks: [], libraryLoaded: false, bookDisclaimerVisible: false, bookDisclaimerTimer: null, bookId: null,bookPages: [], bookPagesLoaded: false, bookPageIndex: 0, bookPageSocial: null, bookPageLikedMap: {}, selectedNumber: null, query: "", category: "", searchOpen: false, settings: getSettings(), toastTimer: null };

try { state.query = localStorage.getItem("lightbearer-search") || ""; state.searchOpen = Boolean(state.query); } catch (error) {}

try { state.query = localStorage.getItem("lightbearer-search") || ""; state.searchOpen = Boolean(state.query); } catch (error) {}

const iconPaths = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20M8 7h8M8 10h7"/>',
  heart: '<path d="M20.8 8.8c0 5.3-8.8 11-8.8 11s-8.8-5.7-8.8-11a4.8 4.8 0 0 1 8.8-2.4 4.8 4.8 0 0 1 8.8 2.4Z"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.2 4.2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="m15 18-6-6 6-6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  sparkle: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.7 14.4A8.8 8.8 0 0 1 9.6 3.3 8.8 8.8 0 1 0 20.7 14.4Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  radio: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="m7 5 10-3M8 15h8"/><circle cx="8" cy="10" r="1.7"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>'
};

function icon(name, extraClass) {
  return '<svg class="' + (extraClass || "") + '" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (iconPaths[name] || "") + '</svg>';
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
  });
}

const ACCENT_PALETTES = {
  blue: { accent: "#1d4ed8", soft: "#dbeafe", deep: "#1e40af" },
  green: { accent: "#15803d", soft: "#dcfce7", deep: "#166534" },
  purple: { accent: "#7c3aed", soft: "#ede9fe", deep: "#5b21b6" },
  rose: { accent: "#be123c", soft: "#ffe4e6", deep: "#9f1239" },
  teal: { accent: "#0f766e", soft: "#ccfbf1", deep: "#115e59" }
};

function applyPreferences() {
  const preference = state.settings.theme;
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = preference === "system" ? (prefersDark ? "dark" : "light") : preference;
  const colors = ACCENT_PALETTES[state.settings.accent] || ACCENT_PALETTES.blue;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = state.settings.accent;
  document.documentElement.style.setProperty("--accent", colors.accent);
  document.documentElement.style.setProperty("--accent-light", colors.accent);
  document.documentElement.style.setProperty("--accent-dark", colors.deep);
  document.documentElement.style.setProperty("--accent-deep", colors.deep);
  document.documentElement.style.setProperty("--accent-soft", colors.soft);
  document.documentElement.style.setProperty("--purple", colors.accent);
  document.documentElement.style.setProperty("--purple-soft", colors.soft);
  document.documentElement.style.setProperty("--hymn-size", state.settings.fontSize + "px");
  document.documentElement.style.fontSize = (state.settings.fontSize * 16 / 21) + "px";
}

function renderHeader() {
  const activeView = state.view === "reader" ? state.readerReturnView : state.view;
  const searchExpanded = state.view === "home" ? state.searchOpen || Boolean(state.query) : false;
  header.innerHTML = '<button class="brand-lockup" type="button" data-action="navigate" data-view="home" aria-label="Go to Home" data-testid="button-brand-home"><img src="./assets/church-logo-placeholder.png" alt="" width="60" height="60"><span><span class="brand-name">C&S Bible Church</span><span class="brand-subtitle">' + CHURCH_MOTTO + '</span></span></button><div class="header-actions"><button class="header-icon-button" type="button" data-action="header-search" aria-label="Search hymns" aria-expanded="' + searchExpanded + '" data-testid="button-header-search">' + icon("search") + '</button></div>';
}

function renderNav() {
  const activeView = state.view === "reader" ? state.readerReturnView : state.view;
  const items = [
    ["home", "Home", "home"],
    ["forms", "Forms", "layers"],
    ["programs", "Programs", "sparkle"],
    ["services", "Services", "calendar"],
    ["library", "Library", "book"],
    ["recent", "Recent", "history"],
    ["settings", "Settings", "settings"],
    ["listen-live", "Live", "radio"],
    ["listen-recorded", "Listen", "radio"],
    ["audio-library", "Audio Library", "music"]
  ];
  nav.innerHTML = items.map(function (item) {
    if (item[0] === "forms") return '<a class="nav-item" href="./forms.html" data-testid="nav-forms">' + icon(item[2]) + '<span>Forms</span></a>';
    const isLiveAudio = item[0] === "listen-live" || item[0] === "listen-recorded";
    const category = item[0] === "listen-live" ? "__live__" : "";
    const selected = isLiveAudio && state.view === "listen" && (state.liveAudioCategory || "") === category;
    const view = isLiveAudio ? "listen" : item[0];
    if (isLiveAudio) {
      return '<button class="nav-item" type="button" data-action="navigate" data-view="listen" data-category="' + category + '" aria-current="' + (selected ? "page" : "false") + '" data-testid="nav-' + item[0] + '">' + icon(item[2]) + '<span>' + item[1] + '</span></button>';
    }
    return '<button class="nav-item" type="button" data-action="navigate" data-view="' + view + '" aria-current="' + (activeView === view ? "page" : "false") + '" data-testid="nav-' + item[0] + '">' + icon(item[2]) + '<span>' + item[1] + '</span></button>';
  }).join("");
}

function renderSearchBar() {
  return '<div class="search-panel"><form class="search-form" role="search" data-search-form><label class="sr-only" for="hymn-search">Search by hymn number, title, keyword, or first line</label>' + icon("search", "search-icon") + '<input id="hymn-search" type="search" inputmode="search" autocomplete="off" value="' + escapeHtml(state.query) + '" placeholder="Search number, title, first line…" data-testid="input-hymn-search"><button class="search-submit" type="submit" aria-label="Search hymns" data-testid="button-search-hymns">' + icon("arrowRight") + '</button></form></div>';
}

function renderHomeSearch() {
  if (!state.searchOpen && !state.query) return "";
  return '<div class="home-search-control is-open">' + renderSearchBar() + '<button class="home-search-close" type="button" data-action="close-search" aria-label="Close search" data-testid="button-close-search">' + icon("close") + '</button></div>';
}
