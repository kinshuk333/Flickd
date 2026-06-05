import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion as Motion } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import * as d3 from 'd3';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';
import {
  AppShell,
  DashboardCard,
  ChartCard,
  PremiumTabs,
  SidebarStat,
  MetricCard,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui';
import {
  Sparkles,
  BarChart3,
  Clapperboard,
  Activity,
  Blend,
  CalendarRange,
  HeartHandshake,
  Brain,
  Compass,
  Repeat,
  Clock3,
  Star,
  Film,
  Gauge,
  Layers,
  Palette,
} from 'lucide-react';

const ACCENT_COLOR = '#3b82f6';
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
const CHART_THEME = {
  colors: CHART_COLORS,
  grid: {
    stroke: 'rgba(91, 112, 148, 0.26)',
    strokeDasharray: '3 5',
  },
  axis: {
    stroke: 'rgba(148, 163, 184, 0.55)',
    tick: { fill: '#8fa2c0', fontSize: 11, fontWeight: 500 },
  },
  tooltip: {
    contentStyle: {
      backgroundColor: 'rgba(10, 15, 28, 0.96)',
      border: '1px solid rgba(96, 118, 154, 0.48)',
      borderRadius: '14px',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.45)',
      color: '#e5edf8',
    },
    labelStyle: { color: '#f8fafc', fontWeight: 700 },
    itemStyle: { color: '#7db7ff', fontWeight: 600 },
    cursor: { fill: 'rgba(96, 165, 250, 0.1)' },
  },
  legend: {
    iconType: 'circle',
    wrapperStyle: { color: '#a8b8d6', fontSize: 12, paddingTop: 8 },
  },
  margin: {
    vertical: { top: 12, right: 18, bottom: 8, left: 4 },
    horizontal: { top: 10, right: 20, bottom: 8, left: 8 },
  },
  barRadius: {
    vertical: [7, 7, 0, 0],
    horizontal: [0, 8, 8, 0],
  },
};
const getChartColor = (index) => CHART_THEME.colors[index % CHART_THEME.colors.length];
const formatCompactChartValue = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '';
  if (Math.abs(number) >= 1000) {
    return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(number)}`;
};
const formatOneDecimalChartValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : '';
};
const getTouchDistance = (touches) => {
  if (!touches || touches.length < 2) return 0;
  const first = touches[0];
  const second = touches[1];
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};
const getTouchCenter = (touches) => {
  if (!touches || touches.length === 0) return { x: 0, y: 0 };
  if (touches.length === 1) return { x: touches[0].clientX, y: touches[0].clientY };
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
};
const TRACE_GENRE_PALETTE = {
  drama: '#4F7BD9',
  crime: '#7A4FD9',
  action: '#E0673B',
  comedy: '#F2C94C',
  'sci-fi': '#3ED6D1',
  sci_fi: '#3ED6D1',
  scifi: '#3ED6D1',
  horror: '#B23A48',
  romance: '#E88CCB',
  thriller: '#D94FD1',
  animation: '#2EC4B6',
  documentary: '#6AAE75',
  default: '#6B7FA6',
};
const DATA_CACHE_KEY = 'imdb-ratings-dataset-v1';
const datasetCacheKey = (userId) => `${DATA_CACHE_KEY}:${String(userId || 'guest')}`;
const MEMBERS_LOCAL_CACHE_KEY = 'imdb-members-directory-v1';
const memberDatasetKey = (userId) => `imdb-member-dataset-${userId}`;
const moodboardsStorageKey = (userId) => `imdb-moodboards-${String(userId || 'guest')}`;
const moodboardsBackupStorageKey = (userId) => `imdb-moodboards-backup-${String(userId || 'guest')}`;
const moodboardsBackupMetaKey = (userId) => `imdb-moodboards-backup-meta-${String(userId || 'guest')}`;

const toShareableRows = (rows = []) => rows.map((row) => ({
  t: row?.title || '',
  tt: row?.titleType || 'movie',
  yr: Number(row?.yourRating) || 0,
  ir: Number(row?.imdbRating) || 0,
  y: Number(row?.year) || 0,
  g: row?.genres || '',
  d: row?.directors || '',
  r: Number(row?.runtime) || 0,
  v: Number(row?.imdbVotes || row?.numVotes) || 0,
  i: row?.imdbId || row?.imdbID || '',
  dr: row?.dateRated instanceof Date ? row.dateRated.toISOString() : (row?.dateRated || null),
  c: row?.country || '',
}));

const fromShareableRows = (rows = []) => rows
  .map((row) => ({
    title: row?.title ?? row?.t ?? '',
    titleType: row?.titleType ?? row?.tt ?? 'movie',
    yourRating: Number(row?.yourRating ?? row?.yr) || 0,
    imdbRating: Number(row?.imdbRating ?? row?.ir) || 0,
    year: Number(row?.year ?? row?.y) || 0,
    genres: row?.genres ?? row?.g ?? '',
    directors: row?.directors ?? row?.d ?? '',
    runtime: Number(row?.runtime ?? row?.r) || 0,
    imdbVotes: Number(row?.imdbVotes ?? row?.numVotes ?? row?.v) || 0,
    numVotes: Number(row?.numVotes ?? row?.imdbVotes ?? row?.v) || 0,
    imdbId: row?.imdbId ?? row?.imdbID ?? row?.i ?? '',
    dateRated: (row?.dateRated ?? row?.dr) ? new Date(row?.dateRated ?? row?.dr) : null,
    country: row?.country ?? row?.c ?? '',
  }))
  .filter((row) => row?.title);
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase =
  globalThis.__flickdSupabaseClient ||
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
if (!globalThis.__flickdSupabaseClient) {
  globalThis.__flickdSupabaseClient = supabase;
}
const isSupabaseNetworkError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  );
};
const toPublicMemberSnapshot = (snapshot = {}) => {
  const safe = (snapshot && typeof snapshot === 'object') ? snapshot : {};
  const topGenres = Array.isArray(safe?.topGenres) ? safe.topGenres.slice(0, 8) : [];
  const eraPreference = Array.isArray(safe?.eraPreference) ? safe.eraPreference.slice(0, 8) : [];
  const cinemaMind = Array.isArray(safe?.cinemaMind) ? safe.cinemaMind.slice(0, 10) : [];
  const cinemaSignals = Array.isArray(safe?.cinemaSignals) ? safe.cinemaSignals.slice(0, 8) : [];
  const ratingDist = Array.isArray(safe?.ratingDist) ? safe.ratingDist.slice(0, 10) : [];
  const profileLinks = safe?.profileLinks && typeof safe.profileLinks === 'object'
    ? {
        instagram: safe.profileLinks.instagram || '',
        x: safe.profileLinks.x || '',
        facebook: safe.profileLinks.facebook || '',
      }
    : { instagram: '', x: '', facebook: '' };

  return {
    stats: safe?.stats || null,
    followings: Array.isArray(safe?.followings) ? safe.followings : [],
    aboutMe: String(safe?.aboutMe || ''),
    publicIdentity: safe?.publicIdentity && typeof safe.publicIdentity === 'object'
      ? {
          realName: String(safe.publicIdentity.realName || ''),
          nickname: String(safe.publicIdentity.nickname || ''),
          useNickname: Boolean(safe.publicIdentity.useNickname),
          displayName: String(safe.publicIdentity.displayName || ''),
        }
      : null,
    profileLinks,
    personality: safe?.personality || null,
    topGenres,
    eraPreference,
    cinemaMind,
    cinemaSignals,
    ratingDist,
    patterns: safe?.patterns
      ? {
          ...(safe.patterns || {}),
          spectrums: Array.isArray(safe?.patterns?.spectrums) ? safe.patterns.spectrums.slice(0, 8) : [],
        }
      : null,
    moodboards: Array.isArray(safe?.moodboards)
      ? safe.moodboards.slice(0, 30).map((m) => ({ id: m?.id, title: m?.title || '' }))
      : [],
    // Keep per-user dataset in snapshot so the same account can restore on another browser/device.
    // Member directory list queries project only lightweight fields, so this won't bloat list payloads.
    dataset: Array.isArray(safe?.dataset)
      ? safe.dataset
      : Array.isArray(safe?.rows)
        ? safe.rows
        : Array.isArray(safe?.data)
          ? safe.data
          : [],
    updatedAt: safe?.updatedAt || new Date().toISOString(),
  };
};
const WORLD_GEOJSON_URL = 'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';
const CINEMA_MIND_ARCHETYPES = [
  'Meaning Seekers',
  'Reality Explorers',
  'Myth Makers',
  'Emotional Viewers',
  'Story Lovers',
  'Character Explorers',
  'Spectacle Fans',
  'Thrill Seekers',
  'Comedy Lovers',
  'Visual Stylists',
  'World Builders',
  'Animation Admirers',
];

const GENRE_ARCHETYPE_MAP = {
  'Meaning Seekers': ['drama', 'biography', 'history', 'war'],
  'Reality Explorers': ['crime', 'documentary', 'drama'],
  'Myth Makers': ['fantasy', 'adventure'],
  'Emotional Viewers': ['romance', 'drama', 'family'],
  'Story Lovers': ['mystery', 'thriller', 'crime'],
  'Character Explorers': ['drama', 'biography'],
  'Spectacle Fans': ['action', 'adventure', 'sci-fi', 'science fiction'],
  'Thrill Seekers': ['horror', 'thriller'],
  'Comedy Lovers': ['comedy'],
  'Visual Stylists': ['drama', 'fantasy'],
  'World Builders': ['fantasy', 'sci-fi', 'science fiction', 'adventure'],
  'Animation Admirers': ['animation'],
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const deriveMemberStatsFromRows = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows.filter((row) => row?.title && Number(row?.yourRating) > 0) : [];
  if (!safeRows.length) {
    return {
      totalFilms: 0,
      avgYourRating: 0,
      mostRatedGenre: 'N/A',
    };
  }

  const avgYourRating = safeRows.reduce((sum, row) => sum + (Number(row?.yourRating) || 0), 0) / safeRows.length;
  const genreCount = {};
  safeRows.forEach((row) => {
    String(row?.genres || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .forEach((g) => {
        genreCount[g] = (genreCount[g] || 0) + 1;
      });
  });

  return {
    totalFilms: safeRows.length,
    avgYourRating: Number(avgYourRating || 0),
    mostRatedGenre: Object.keys(genreCount).sort((a, b) => genreCount[b] - genreCount[a])[0] || 'N/A',
  };
};

const ratingToWeight = (rating) => {
  const numeric = Number(rating) || 0;
  if (numeric >= 9) return 2.5;
  if (numeric >= 8) return 2;
  if (numeric >= 7) return 1.5;
  if (numeric >= 6) return 1;
  return 0.5;
};
const stableStringify = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
};
const sameStringList = (a = [], b = []) => (
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((item, index) => String(item) === String(b[index]))
);
const countryLookupKey = (country) => String(country || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '');
const hasUsableCountryName = (country) => {
  const value = String(country || '').trim();
  if (!value) return false;
  return !/^(unknown|n\/a|na|null|undefined|none|error)$/i.test(value);
};
const movieCountryKey = (movie = {}) => {
  const imdbId = String(movie?.imdbId || movie?.imdbID || movie?.const || '').trim();
  if (imdbId) return `imdb:${imdbId}`;
  return `title:${String(movie?.title || '').trim().toLowerCase()}|${Number(movie?.year) || ''}`;
};

export default function App() {
  const [data, setData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [hiddenTreasuresPage, setHiddenTreasuresPage] = useState(1);
  const [hiddenGemsPage, setHiddenGemsPage] = useState(1);
  const [watchedPage, setWatchedPage] = useState(1);
  const [watchedDecadeFilter, setWatchedDecadeFilter] = useState('all');
  const [watchedYearFilter, setWatchedYearFilter] = useState('all');
  const [watchedRatingFilter, setWatchedRatingFilter] = useState('all');
  const [watchedGenreFilter, setWatchedGenreFilter] = useState('all');
  const [watchedCountryFilter, setWatchedCountryFilter] = useState('all');
  const [watchedDirectorFilter, setWatchedDirectorFilter] = useState('all');
  const [watchedSortBy, setWatchedSortBy] = useState('year_desc');
  const [watchedMoreFiltersOpen, setWatchedMoreFiltersOpen] = useState(false);
  const [watchedSearchQuery, setWatchedSearchQuery] = useState('');
  const [selectedTopGenre, setSelectedTopGenre] = useState('all');
  const [topGenrePage, setTopGenrePage] = useState(1);
  const [topGenreView, setTopGenreView] = useState('horizontal');
  const [personalCanonView, setPersonalCanonView] = useState('horizontal');
  const [favoriteYearView, setFavoriteYearView] = useState('horizontal');
  const [hiddenGemsView, setHiddenGemsView] = useState('horizontal');
  const [hiddenTreasuresView, setHiddenTreasuresView] = useState('horizontal');
  const [timelineHoverKey, setTimelineHoverKey] = useState(null);
  const [timelineDragging, setTimelineDragging] = useState(false);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineMaxScroll, setTimelineMaxScroll] = useState(0);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [traceFullscreen, setTraceFullscreen] = useState(false);
  const [expandedDecades, setExpandedDecades] = useState([]);
  const [selectedFavoriteYear, setSelectedFavoriteYear] = useState(null);
  const [favoriteYearPage, setFavoriteYearPage] = useState(1);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareCardBusy, setShareCardBusy] = useState(false);
  const [shareCardConfig, setShareCardConfig] = useState(null);
  const [personalCanonPage, setPersonalCanonPage] = useState(1);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [fetchingMovieDetails, setFetchingMovieDetails] = useState(false);
  const [posters, setPosters] = useState({});
  const [unavailablePosters, setUnavailablePosters] = useState({});
  const [countryOverrides, setCountryOverrides] = useState({});
  const [fetchingCountries, setFetchingCountries] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0 });
  const [letterboxdImporting, setLetterboxdImporting] = useState(false);
  const [letterboxdProgress, setLetterboxdProgress] = useState({ current: 0, total: 0, phase: '' });
  const [letterboxdError, setLetterboxdError] = useState('');
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [lastDataSyncAt, setLastDataSyncAt] = useState(null);
  const [moodboards, setMoodboards] = useState([]);
  const [activeMoodboard, setActiveMoodboard] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilmPicker, setShowFilmPicker] = useState(false);
  const [newMoodboardTitle, setNewMoodboardTitle] = useState('');
  const [pendingMoodboardFilmKeys, setPendingMoodboardFilmKeys] = useState([]);
  const [moodboardFilmSearch, setMoodboardFilmSearch] = useState('');
  const [moodboardGenreFilter, setMoodboardGenreFilter] = useState('all');
  const [moodboardDecadeFilter, setMoodboardDecadeFilter] = useState('all');
  const [moodboardYearFilter, setMoodboardYearFilter] = useState('all');
  const [moodboardCountryFilter, setMoodboardCountryFilter] = useState('all');
  const [moodboardDirectorFilter, setMoodboardDirectorFilter] = useState('all');
  const [moodboardMinRatingFilter, setMoodboardMinRatingFilter] = useState('all');
  const [moodboardFiltersExpanded, setMoodboardFiltersExpanded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [directorArchetypeMap, setDirectorArchetypeMap] = useState({});
  const [worldGeoJson, setWorldGeoJson] = useState(null);
  const [countryRatingThreshold, setCountryRatingThreshold] = useState(8);
  const [countryTimeRange] = useState('all');
  const [yearlyChartTooltip, setYearlyChartTooltip] = useState(null);
  const [hoveredMapCountry, setHoveredMapCountry] = useState(null);
  const [mapTooltip, setMapTooltip] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapWheelLock, setMapWheelLock] = useState(false);
  const [deepDiveWheelLock, setDeepDiveWheelLock] = useState(false);
  const [mapDragStart, setMapDragStart] = useState(null);
  const [traceHover, setTraceHover] = useState(null);
  const [traceTooltip, setTraceTooltip] = useState(null);
  const [traceZoom, setTraceZoom] = useState(1);
  const [tracePan, setTracePan] = useState({ x: 0, y: 0 });
  const [traceRevealProgress, setTraceRevealProgress] = useState(0);
  const [traceSelectedDirector, setTraceSelectedDirector] = useState(null);
  const [traceDirectorModalView, setTraceDirectorModalView] = useState('list'); // 'list' | 'details'
  const [isBookExporting, setIsBookExporting] = useState(false);
  const [membersDirectory, setMembersDirectory] = useState([]);
  const [membersPage, setMembersPage] = useState(0);
  const [membersRetryNonce, setMembersRetryNonce] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [mobileTopNavOpen, setMobileTopNavOpen] = useState(false);
  const [membersSearchQuery, setMembersSearchQuery] = useState('');
  const [followingSearchQuery, setFollowingSearchQuery] = useState('');
  const [followersSearchQuery, setFollowersSearchQuery] = useState('');
  const [publicCommunityMode, setPublicCommunityMode] = useState(false);
  const [showCreateProfileModal, setShowCreateProfileModal] = useState(false);
  const [membersEnabled, setMembersEnabled] = useState(true);
  const [memberViewUserId, setMemberViewUserId] = useState(null);
  const [memberViewName, setMemberViewName] = useState('');
  const [memberViewAvatarUrl, setMemberViewAvatarUrl] = useState('');
  const [memberViewSocials, setMemberViewSocials] = useState({ instagram: '', x: '', facebook: '' });
  const [memberViewAboutMe, setMemberViewAboutMe] = useState('');
  const [memberViewMoodboards, setMemberViewMoodboards] = useState([]);
  const [memberViewSnapshot, setMemberViewSnapshot] = useState(null);
  const [hasHydratedCurrentUserData, setHasHydratedCurrentUserData] = useState(false);
  const [hasHydratedUserData, setHasHydratedUserData] = useState(false);
  const [canSyncUserData, setCanSyncUserData] = useState(false);
  const [showTasteResonance, setShowTasteResonance] = useState(false);
  const [tasteResonanceLoading, setTasteResonanceLoading] = useState(false);
  const [followedMemberIds, setFollowedMemberIds] = useState([]);
  const [followerUserIds, setFollowerUserIds] = useState([]);
  const [followerFollowKeys, setFollowerFollowKeys] = useState([]);
  const [followsTableEnabled, setFollowsTableEnabled] = useState(true);
  const [lastSeenFollowerIds, setLastSeenFollowerIds] = useState([]);
  const [profileAvatarFailed, setProfileAvatarFailed] = useState(false);
  const [profileAvatarBust, setProfileAvatarBust] = useState(0);
  const [socialLinks, setSocialLinks] = useState({ instagram: '', x: '', facebook: '' });
  const [socialLinksDraft, setSocialLinksDraft] = useState({ instagram: '', x: '', facebook: '' });
  const [savingSocialLinks, setSavingSocialLinks] = useState(false);
  const [aboutMe, setAboutMe] = useState('');
  const [aboutMeDraft, setAboutMeDraft] = useState('');
  const [savingAboutMe, setSavingAboutMe] = useState(false);
  const [publicNickname, setPublicNickname] = useState('');
  const [publicNicknameDraft, setPublicNicknameDraft] = useState('');
  const [useNicknamePublicly, setUseNicknamePublicly] = useState(false);
  const [useNicknamePubliclyDraft, setUseNicknamePubliclyDraft] = useState(false);
  const [savingPublicIdentity, setSavingPublicIdentity] = useState(false);
  const [publicIdentityError, setPublicIdentityError] = useState('');
  const [followToast, setFollowToast] = useState(null);
  const [supabasePinging, setSupabasePinging] = useState(false);
  const [_supabaseHealth, setSupabaseHealth] = useState({
    status: 'idle', // idle | ok | slow | error
    lastMs: null,
    label: '',
    error: '',
    at: null,
  });
  const ownDashboardDataRef = React.useRef(null);
  const ownDashboardMetaRef = React.useRef(null);
  const traceSvgRef = React.useRef(null);
  const mainContentRef = React.useRef(null);
  const mainScrollRef = React.useRef(null);
  const tasteTimelineFullscreenRef = React.useRef(null);
  const mapFullscreenRef = React.useRef(null);
  const mapWheelSurfaceRef = React.useRef(null);
  const timelineWheelSurfaceRef = React.useRef(null);
  const traceFullscreenRef = React.useRef(null);
  const tasteTimelineRef = React.useRef(null);
  const tasteTimelineDraggingRef = React.useRef(false);
  const tasteTimelineDragStartRef = React.useRef({ x: 0, left: 0 });
  const mapTouchGestureRef = React.useRef({ mode: null });
  const traceTouchGestureRef = React.useRef({ mode: null });
  const timelineTouchGestureRef = React.useRef({ mode: null });
  const posterLoadInFlightRef = React.useRef(new Set());
  const posterFailedAtRef = React.useRef({});
  const omdbCacheAvailableRef = React.useRef(true);
  const lastCountryFetchAttemptAtRef = React.useRef(0);
  const membersFetchInFlightRef = React.useRef(false);
  const lastAuthUserIdRef = React.useRef(null);

  // ============ SUPABASE AUTH CONFIG ============
const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [supabaseDataEnabled, setSupabaseDataEnabled] = useState(true);
  
  useEffect(() => {
    let authResolved = false;
    const fallbackTimer = setTimeout(() => {
      if (!authResolved) setLoadingAuth(false);
    }, 2500);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authResolved = true;
      setUser(session?.user || null);
      setLoadingAuth(false);
    });

    return () => {
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const key = user?.id ? `imdb-following-${user.id}` : 'imdb-following-guest';
    const saved = localStorage.getItem(key);
    setFollowedMemberIds(saved ? JSON.parse(saved) : []);
  }, [user?.id]);

  // Hard isolation between accounts:
  // whenever authenticated user changes, reset in-memory dashboard state immediately.
  useEffect(() => {
    const nextUserId = user?.id ? String(user.id) : null;
    const prevUserId = lastAuthUserIdRef.current;
    const hasUserChanged = prevUserId !== nextUserId;

    if (hasUserChanged) {
      setData(null);
      setFileName('');
      setLoadedFromCache(false);
      setLastDataSyncAt(null);
      setPosters({});
      setUnavailablePosters({});
      setCountryOverrides({});
      setSelectedMovie(null);
      setMovieDetails(null);
      setHoveredMapCountry(null);
      setMapTooltip(null);
      setMemberViewUserId(null);
      setMemberViewName('');
      setMemberViewAvatarUrl('');
      setMemberViewSocials({ instagram: '', x: '', facebook: '' });
      setMemberViewSnapshot(null);
      setMemberViewAboutMe('');
      setMemberViewMoodboards([]);
      setShowTasteResonance(false);
      setHasHydratedCurrentUserData(false);
      setHasHydratedUserData(false);
      setCanSyncUserData(false);
    }

    lastAuthUserIdRef.current = nextUserId;
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `imdb-followers-seen-${user.id}` : 'imdb-followers-seen-guest';
    const saved = localStorage.getItem(key);
    try {
      const parsed = saved ? JSON.parse(saved) : [];
      setLastSeenFollowerIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setLastSeenFollowerIds([]);
    }
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `imdb-aboutme-${user.id}` : 'imdb-aboutme-guest';
    const saved = localStorage.getItem(key);
    const value = saved ? String(saved).slice(0, 250) : '';
    setAboutMe(value);
    setAboutMeDraft(value);
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `imdb-public-identity-${user.id}` : 'imdb-public-identity-guest';
    let parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      parsed = null;
    }
    const nickname = String(parsed?.nickname || '').slice(0, 60).trim();
    const useNickname = Boolean(parsed?.useNickname);
    setPublicNickname(nickname);
    setPublicNicknameDraft(nickname);
    setUseNicknamePublicly(useNickname);
    setUseNicknamePubliclyDraft(useNickname);
    setPublicIdentityError('');
  }, [user?.id]);

  useEffect(() => {
    if (!user || !membersEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from('member_profiles')
          .select('snapshot')
          .eq('user_id', String(user.id))
          .maybeSingle();
        if (cancelled || error) return;
        const identity = row?.snapshot?.publicIdentity || null;
        if (!identity || typeof identity !== 'object') return;
        const nickname = String(identity?.nickname || '').slice(0, 60).trim();
        const useNickname = Boolean(identity?.useNickname);
        let cached = null;
        try {
          cached = JSON.parse(localStorage.getItem(`imdb-public-identity-${user.id}`) || 'null');
        } catch {
          cached = null;
        }
        if (cached && (String(cached.nickname || '').trim() || Boolean(cached.useNickname))) {
          return;
        }
        setPublicNickname(nickname);
        setPublicNicknameDraft(nickname);
        setUseNicknamePublicly(useNickname);
        setUseNicknamePubliclyDraft(useNickname);
        try {
          localStorage.setItem(`imdb-public-identity-${user.id}`, JSON.stringify({ nickname, useNickname }));
        } catch {
          // ignore local cache write failures
        }
      } catch {
        // ignore identity hydration failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, membersEnabled]);

  const writeMoodboardsLocalCache = React.useCallback((nextMoodboards) => {
    const primaryKey = moodboardsStorageKey(user?.id);
    const backupKey = moodboardsBackupStorageKey(user?.id);
    const metaKey = moodboardsBackupMetaKey(user?.id);
    const payload = JSON.stringify(Array.isArray(nextMoodboards) ? nextMoodboards : []);
    localStorage.setItem(primaryKey, payload);
    localStorage.setItem(backupKey, payload);
    localStorage.setItem(metaKey, JSON.stringify({ savedAt: new Date().toISOString() }));
  }, [user?.id]);

  useEffect(() => {
    const key = moodboardsStorageKey(user?.id);
    const backupKey = moodboardsBackupStorageKey(user?.id);
    const saved = localStorage.getItem(key);
    const backup = localStorage.getItem(backupKey);
    if (!saved && !backup) {
      setMoodboards([]);
      setHasHydratedUserData(false);
      setCanSyncUserData(false);
      return;
    }
    try {
      const parsed = saved ? JSON.parse(saved) : [];
      const parsedBackup = backup ? JSON.parse(backup) : [];
      const primaryList = Array.isArray(parsed) ? parsed : [];
      const backupList = Array.isArray(parsedBackup) ? parsedBackup : [];
      const recovered = primaryList.length ? primaryList : backupList;
      setMoodboards(recovered);
      if (!primaryList.length && backupList.length) {
        localStorage.setItem(key, JSON.stringify(backupList));
      }
    } catch {
      try {
        const parsedBackup = backup ? JSON.parse(backup) : [];
        const backupList = Array.isArray(parsedBackup) ? parsedBackup : [];
        setMoodboards(backupList);
        if (backupList.length) {
          localStorage.setItem(key, JSON.stringify(backupList));
        } else {
          setMoodboards([]);
        }
      } catch {
        setMoodboards([]);
      }
    }
    setHasHydratedUserData(false);
    setCanSyncUserData(false);
  }, [user?.id]);

  const accountRealName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '').trim();
  const activePublicNickname = String(publicNicknameDraft || publicNickname || '').trim();
  const activeUseNicknamePublicly = Boolean(useNicknamePubliclyDraft || useNicknamePublicly);
  const resolvedOwnPublicName = (activeUseNicknamePublicly && activePublicNickname)
    ? activePublicNickname
    : (accountRealName || 'Cinephile');
  const getPublicIdentityPayload = React.useCallback((overrides = {}) => {
    const nickname = String((overrides.nickname ?? publicNickname) || '').trim();
    const useNickname = Boolean(overrides.useNickname ?? useNicknamePublicly);
    return {
      realName: accountRealName || '',
      nickname,
      useNickname,
      displayName: useNickname && nickname ? nickname : (accountRealName || 'Cinephile'),
    };
  }, [accountRealName, publicNickname, useNicknamePublicly]);

  const currentProfileAvatarUrlRaw = memberViewUserId ? memberViewAvatarUrl : user?.user_metadata?.avatar_url;
  const currentProfileAvatarLabel = memberViewUserId
    ? (memberViewName || 'Cinephile')
    : (resolvedOwnPublicName || 'User');

  const withCacheBust = (url, bust) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (value.startsWith('data:') || value.startsWith('blob:')) return value;
    const join = value.includes('?') ? '&' : '?';
    return `${value}${join}cb=${bust || 0}`;
  };

  useEffect(() => {
    setProfileAvatarFailed(false);
    setProfileAvatarBust(0);
  }, [memberViewUserId, memberViewAvatarUrl, user?.user_metadata?.avatar_url]);

  const currentProfileAvatarUrl = currentProfileAvatarUrlRaw
    ? withCacheBust(currentProfileAvatarUrlRaw, profileAvatarBust)
    : '';

  const currentProfileAboutMe = memberViewUserId ? (memberViewAboutMe || '') : (aboutMe || '');
  const currentProfileAboutMeCapped = String(currentProfileAboutMe || '').slice(0, 250);

  const runSupabaseTracked = async (label, promiseFactory) => {
    const started = performance.now();
    try {
      const result = await promiseFactory();
      const ms = Math.round(performance.now() - started);
      const err = result?.error || null;
      setSupabaseHealth({
        status: err ? 'error' : (ms > 3000 ? 'slow' : 'ok'),
        lastMs: ms,
        label,
        error: err ? String(err?.message || err?.code || 'Unknown error') : '',
        at: Date.now(),
      });
      return result;
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      setSupabaseHealth({
        status: 'error',
        lastMs: ms,
        label,
        error: String(error?.message || 'Network error'),
        at: Date.now(),
      });
      throw error;
    }
  };

  const isRetryableSupabaseError = (error) => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return (
      code === 'CLIENT_TIMEOUT' ||
      code === '57014' ||
      code === '504' ||
      message.includes('timeout') ||
      message.includes('failed to fetch') ||
      message.includes('network request failed') ||
      message.includes('lock')
    );
  };

  const runSupabaseResilient = async (label, promiseFactory, options = {}) => {
    const timeoutMs = Number(options?.timeoutMs || 12000);
    const retries = Number(options?.retries ?? 2);
    const baseDelayMs = Number(options?.baseDelayMs || 350);
    let lastResult = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const queryPromise = runSupabaseTracked(label, promiseFactory);
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ data: null, error: { code: 'CLIENT_TIMEOUT', message: `${label} exceeded ${timeoutMs}ms` } });
        }, timeoutMs);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      lastResult = result;

      if (!result?.error) return result;
      if (!isRetryableSupabaseError(result.error) || attempt >= retries) return result;

      const delay = baseDelayMs * (attempt + 1) + Math.floor(Math.random() * 180);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return lastResult || { data: null, error: { code: 'UNKNOWN', message: `${label} failed` } };
  };

  const handleRetrySupabaseConnection = async () => {
    if (supabasePinging) return;
    setSupabasePinging(true);
    try {
      const probeUserId = String(user?.id || '').trim();
      if (probeUserId) {
        await runSupabaseTracked('health:member_profiles', () =>
          supabase
            .from('member_profiles')
            .select('user_id')
            .eq('user_id', probeUserId)
            .limit(1)
        );
      } else {
        await runSupabaseTracked('health:omdb_cache', () =>
          supabase
            .from('omdb_cache')
            .select('cache_key')
            .limit(1)
        );
      }
    } catch {
      // Supabase health state is already set by runSupabaseTracked
    } finally {
      setSupabasePinging(false);
    }
  };

  useEffect(() => {
    const key = user?.id ? `imdb-following-${user.id}` : 'imdb-following-guest';
    localStorage.setItem(key, JSON.stringify(followedMemberIds));
  }, [followedMemberIds, user?.id]);
  
  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) console.error('Sign in error:', error);
  };
  
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const clearLocalAuthState = () => {
      setData(null);
      setFileName('');
      setLoadedFromCache(false);
      setLastDataSyncAt(null);
      setUser(null);
      setMoodboards([]);
      localStorage.removeItem(moodboardsStorageKey(user?.id));
      setFollowedMemberIds([]);
      setSocialLinks({ instagram: '', x: '', facebook: '' });
      if (user?.id) {
        localStorage.removeItem(`imdb-following-${user.id}`);
      }
      setHasHydratedCurrentUserData(false);
      setHasHydratedUserData(false);
      setCanSyncUserData(false);
    };

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        throw error;
      }
      clearLocalAuthState();
    } catch (error) {
      console.error('Sign out error:', error);
      clearLocalAuthState();
      alert('Signed out locally. If Google auto-selects an account next time, choose "Use another account".');
    } finally {
      setSigningOut(false);
      setLoadingAuth(false);
    }
  };

  const toggleFollowMember = (memberId, memberName = '') => {
    const id = String(memberId || '');
    if (!id) return;
    if (String(id) === String(user?.id || '')) return;
    const previous = Array.isArray(followedMemberIds) ? [...followedMemberIds] : [];
    const alreadyFollowing = previous.includes(id);
    const next = alreadyFollowing ? previous.filter((item) => item !== id) : [...previous, id];
    setFollowedMemberIds(next);
    if (!alreadyFollowing) {
      const safeName = String(memberName || memberViewName || 'this member');
      setFollowToast({
        id: Date.now(),
        name: safeName,
      });
    }
    if (!user || !followsTableEnabled) return;
    (async () => {
      try {
        if (alreadyFollowing) {
          const { error } = await supabase
            .from('follows')
            .delete()
            .eq('follower_user_id', user.id)
            .eq('followed_user_id', id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('follows')
            .insert({
              follower_user_id: user.id,
              followed_user_id: id,
            });
          // Duplicate relation is fine; treat as success.
          if (error && String(error?.code || '') !== '23505') throw error;
        }
        // Refresh immediately so Following/Followers tabs reflect latest server truth.
        const [followingRes, followersRes] = await Promise.all([
          runSupabaseResilient(
            'follows:following:post_toggle',
            () => supabase
              .from('follows')
              .select('followed_user_id')
              .eq('follower_user_id', user.id)
              .limit(500),
            { timeoutMs: 10000, retries: 2, baseDelayMs: 300 }
          ),
          runSupabaseResilient(
            'follows:followers:post_toggle',
            () => supabase
              .from('follows')
              .select('follower_user_id,created_at')
              .eq('followed_user_id', user.id)
              .limit(500),
            { timeoutMs: 10000, retries: 2, baseDelayMs: 300 }
          ),
        ]);
        if (!followingRes.error) {
          const followingIds = (followingRes.data || [])
            .map((row) => String(row?.followed_user_id || '').trim())
            .filter(Boolean);
          setFollowedMemberIds(followingIds);
        }
        if (!followersRes.error) {
          const followerRows = Array.isArray(followersRes.data) ? followersRes.data : [];
          const followerIds = followerRows
            .map((row) => String(row?.follower_user_id || '').trim())
            .filter(Boolean);
          setFollowerUserIds(followerIds);
          const followerKeys = followerRows
            .map((row) => {
              const idVal = String(row?.follower_user_id || '').trim();
              if (!idVal) return '';
              const atVal = row?.created_at ? String(row.created_at) : '';
              return `${idVal}|${atVal}`;
            })
            .filter(Boolean);
          setFollowerFollowKeys(followerKeys);
        }
      } catch (error) {
        console.error('toggleFollowMember failed:', error);
        if (error?.code === 'PGRST205' || error?.status === 404) {
          setFollowsTableEnabled(false);
        }
        setFollowedMemberIds(previous);
        alert('Could not update follow status right now. Please try again.');
      }
    })();
  };

  useEffect(() => {
    if (!followToast) return;
    const timer = setTimeout(() => setFollowToast(null), 5000);
    return () => clearTimeout(timer);
  }, [followToast]);

  const openTasteResonance = async () => {
    if (!memberViewUserId) return;
    setTasteResonanceLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 220));
    setShowTasteResonance(true);
    setTasteResonanceLoading(false);
  };
  const loadMoodboardsFromSupabase = async () => {
    if (!user) return;
    if (!supabaseDataEnabled) {
      setHasHydratedUserData(true);
      setCanSyncUserData(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_data')
        .select('moodboards, followings, social_links')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        if (error?.code === 'PGRST205' || error?.status === 404) {
          setSupabaseDataEnabled(false);
        }
        setHasHydratedUserData(true);
        setCanSyncUserData(false);
        return;
      }

      if (data?.moodboards) {
        setMoodboards(data.moodboards);
        writeMoodboardsLocalCache(data.moodboards);
      }
      if (!followsTableEnabled && Array.isArray(data?.followings)) {
        setFollowedMemberIds(data.followings.map((id) => String(id)));
        localStorage.setItem(`imdb-following-${user.id}`, JSON.stringify(data.followings.map((id) => String(id))));
      }
      if (data?.social_links && typeof data.social_links === 'object') {
        const normalized = {
          instagram: data.social_links.instagram || '',
          x: data.social_links.x || '',
          facebook: data.social_links.facebook || '',
        };
        setSocialLinks(normalized);
        setSocialLinksDraft(normalized);
      }
      setHasHydratedUserData(true);
      setCanSyncUserData(true);
    } catch (error) {
      if (isSupabaseNetworkError(error)) {
        console.warn('Supabase temporarily unreachable while loading user data.');
      } else {
        console.error('loadMoodboardsFromSupabase failed:', error);
      }
      setHasHydratedUserData(true);
      setCanSyncUserData(false);
    }
  };
  
  useEffect(() => {
    if (user && supabaseDataEnabled) loadMoodboardsFromSupabase();
  }, [user, supabaseDataEnabled, followsTableEnabled, writeMoodboardsLocalCache]);

  useEffect(() => {
    if (!user || !membersEnabled) return;
    if (String(aboutMe || '').trim()) return;
    let cancelled = false;
    (async () => {
      const { data: row, error } = await supabase
        .from('member_profiles')
        .select('snapshot')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
        if (!error) {
          const remote = row?.snapshot?.aboutMe;
          if (remote && String(remote).trim()) {
            const value = String(remote).slice(0, 250);
            setAboutMe(value);
            setAboutMeDraft(value);
            try {
              localStorage.setItem(`imdb-aboutme-${user.id}`, value);
            } catch {
            // ignore local storage failures
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, membersEnabled, aboutMe]);

  useEffect(() => {
    if (!user || !supabaseDataEnabled || !hasHydratedUserData || !canSyncUserData) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = {
          user_id: user.id,
          moodboards,
          followings: followedMemberIds,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from('user_data')
          .upsert(payload, { onConflict: 'user_id' });
        if (cancelled) return;
        if (error) {
          if (error?.code === 'PGRST205' || error?.status === 404) {
            setSupabaseDataEnabled(false);
          }
        }
      } catch (error) {
        if (!cancelled) {
          if (isSupabaseNetworkError(error)) {
            console.warn('Supabase temporarily unreachable while syncing user data.');
          } else {
            console.error('user_data sync failed:', error);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [followedMemberIds, moodboards, user, supabaseDataEnabled, hasHydratedUserData, canSyncUserData]);

  const handleSaveSocialLinks = async () => {
    if (!user || !supabaseDataEnabled || savingSocialLinks) return;
    setSavingSocialLinks(true);
    try {
      const nextLinks = {
        instagram: socialLinksDraft.instagram || '',
        x: socialLinksDraft.x || '',
        facebook: socialLinksDraft.facebook || '',
      };
      const payload = {
        user_id: user.id,
        social_links: nextLinks,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('user_data')
        .upsert(payload, { onConflict: 'user_id' });
      if (!error) {
        setSocialLinks(nextLinks);

        // Keep shared member profile snapshot in sync so other users can see links.
        if (membersEnabled) {
          const updatedAt = new Date().toISOString();
          const snapshotBase = currentMemberSnapshot && typeof currentMemberSnapshot === 'object' ? currentMemberSnapshot : {};
          const snapshot = toPublicMemberSnapshot({
            ...snapshotBase,
            publicIdentity: getPublicIdentityPayload(),
            profileLinks: nextLinks,
            updatedAt,
          });

          const memberPayload = {
            user_id: user.id,
            display_name: resolvedOwnPublicName,
            email: user.email || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            snapshot,
            updated_at: updatedAt,
          };

          const { error: memberProfileError } = await supabase
            .from('member_profiles')
            .upsert(memberPayload, { onConflict: 'user_id' });

          if (memberProfileError) {
            console.error('member_profiles upsert failed (social links):', memberProfileError);
          }
        }
      } else if (error?.code === 'PGRST205' || error?.status === 404) {
        setSupabaseDataEnabled(false);
      }
    } catch (error) {
      if (isSupabaseNetworkError(error)) {
        alert('Network issue while saving social links. Please try again in a moment.');
      } else {
        console.error('handleSaveSocialLinks failed:', error);
      }
    } finally {
      setSavingSocialLinks(false);
    }
  };

  const handleSavePublicIdentity = async () => {
    if (!user || savingPublicIdentity) return;
    const nickname = String(publicNicknameDraft || '').slice(0, 60).trim();
    const useNickname = Boolean(useNicknamePubliclyDraft);
    if (useNickname && !nickname) {
      setPublicIdentityError('Add a nickname before hiding your real name.');
      return;
    }

    setSavingPublicIdentity(true);
    setPublicIdentityError('');
    const identity = getPublicIdentityPayload({ nickname, useNickname });
    setPublicNickname(nickname);
    setPublicNicknameDraft(nickname);
    setUseNicknamePublicly(useNickname);
    setUseNicknamePubliclyDraft(useNickname);

    try {
      localStorage.setItem(`imdb-public-identity-${user.id}`, JSON.stringify({ nickname, useNickname }));
    } catch {
      // ignore local storage failures
    }

    try {
      if (supabaseDataEnabled) {
        const { error } = await supabase
          .from('user_data')
          .upsert({
            user_id: user.id,
            public_identity: identity,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        if (error?.code === 'PGRST205' || error?.status === 404) {
          setSupabaseDataEnabled(false);
        }
      }

      if (membersEnabled) {
        const updatedAt = new Date().toISOString();
        const snapshotBase = currentMemberSnapshot && typeof currentMemberSnapshot === 'object' ? currentMemberSnapshot : {};
        const snapshot = toPublicMemberSnapshot({
          ...snapshotBase,
          publicIdentity: identity,
          aboutMe: aboutMe || '',
          profileLinks: {
            instagram: socialLinks.instagram || '',
            x: socialLinks.x || '',
            facebook: socialLinks.facebook || '',
          },
          updatedAt,
        });

        const { error: memberProfileError } = await supabase
          .from('member_profiles')
          .upsert({
            user_id: user.id,
            display_name: identity.displayName,
            email: user.email || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            snapshot,
            updated_at: updatedAt,
          }, { onConflict: 'user_id' });
        if (memberProfileError) {
          console.error('member_profiles upsert failed (public identity):', memberProfileError);
        }
      }
    } catch (error) {
      if (isSupabaseNetworkError(error)) {
        alert('Network issue while saving identity. Please try again in a moment.');
      } else {
        console.error('handleSavePublicIdentity failed:', error);
      }
    } finally {
      setSavingPublicIdentity(false);
    }
  };

  const handleSaveAboutMe = async () => {
    if (!user || savingAboutMe) return;
    setSavingAboutMe(true);

    const clean = String(aboutMeDraft || '').slice(0, 250).trim();
    setAboutMe(clean);
    try {
      localStorage.setItem(`imdb-aboutme-${user.id}`, clean);
    } catch {
      // ignore local storage failures
    }

    // Save into member_profiles snapshot so it shows up for other members.
    if (membersEnabled) {
      const updatedAt = new Date().toISOString();
      const snapshotBase = currentMemberSnapshot && typeof currentMemberSnapshot === 'object' ? currentMemberSnapshot : {};
      const snapshot = toPublicMemberSnapshot({
        ...snapshotBase,
        publicIdentity: getPublicIdentityPayload(),
        aboutMe: clean,
        profileLinks: {
          instagram: socialLinks.instagram || '',
          x: socialLinks.x || '',
          facebook: socialLinks.facebook || '',
        },
        updatedAt,
      });

      const payload = {
        user_id: user.id,
        display_name: resolvedOwnPublicName,
        email: user.email || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        snapshot,
        updated_at: updatedAt,
      };

      const { error } = await supabase
        .from('member_profiles')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) {
        console.error('member_profiles upsert failed (about me):', error);
      }
    }

    setSavingAboutMe(false);
  };
  
  useEffect(() => {
    const normalizeArchetypeName = (name) => {
      const value = String(name || '').trim().toLowerCase();
      const matched = CINEMA_MIND_ARCHETYPES.find((item) => item.toLowerCase() === value);
      return matched || null;
    };

    const parseCsvLine = (line) => {
      const out = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          out.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      out.push(current);
      return out.map((v) => v.trim());
    };

    fetch('/cinema_director_archetype_mapping.csv')
      .then((res) => res.text())
      .then((text) => {
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length <= 1) return;
        const map = {};
        for (let i = 1; i < lines.length; i++) {
          const [director, a1, a2] = parseCsvLine(lines[i]);
          if (!director) continue;
          const normalized = [a1, a2]
            .map(normalizeArchetypeName)
            .filter(Boolean);
          map[director.toLowerCase()] = normalized;
        }
        setDirectorArchetypeMap(map);
      })
      .catch(() => {
        setDirectorArchetypeMap({});
      });
  }, []);


  useEffect(() => {
    fetch(WORLD_GEOJSON_URL)
      .then((res) => res.json())
      .then((json) => setWorldGeoJson(json))
      .catch(() => setWorldGeoJson(null));
  }, []);

  useEffect(() => {
    setHoveredMapCountry(null);
    setMapTooltip(null);
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
  }, [countryRatingThreshold]);
  // ============ END SUPABASE AUTH ============

  const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '';
  const OMDB_API_KEY_FALLBACK = import.meta.env.VITE_OMDB_API_KEY_FALLBACK || '';
  const OMDB_API_KEYS_RAW = import.meta.env.VITE_OMDB_API_KEYS || '';
  const OMDB_API_KEYS = React.useMemo(() => {
    const splitKeys = (value) =>
      String(value || '')
        .split(/[,\s]+/)
        .map((k) => k.trim())
        .filter(Boolean);

    return [...new Set([
      ...splitKeys(OMDB_API_KEY),
      ...splitKeys(OMDB_API_KEY_FALLBACK),
      ...splitKeys(OMDB_API_KEYS_RAW),
    ])];
  }, [OMDB_API_KEY, OMDB_API_KEY_FALLBACK, OMDB_API_KEYS_RAW]);
  const OMDB_CACHE_TABLE = 'omdb_cache';
  const MOVIE_CACHE_TABLE = 'movie_cache';
  const OMDB_FETCH_TIMEOUT_MS = 8000;
  const invalidOmdbKeysRef = React.useRef(new Set());

  const hiddenGemsPerPage = 10;
  const hiddenTreasuresPerPage = 10;
  const deepDiveFilmsPerPage = 10;
  const watchedFilmsPerPage = 24;
  const topGenreFilmsPerPage = 10;

  const persistDataset = (rows, sourceFileName) => {
    try {
      const payload = {
        rows,
        fileName: sourceFileName || fileName || 'IMDb Ratings',
        updatedAt: new Date().toISOString(),
      };
      if (user?.id) {
        localStorage.setItem(datasetCacheKey(user.id), JSON.stringify(payload));
      }
      if (user?.id && Array.isArray(rows) && rows.length) {
        localStorage.setItem(memberDatasetKey(user.id), JSON.stringify(toShareableRows(rows)));
      }
      setLastDataSyncAt(payload.updatedAt);
    } catch (e) {
      console.error('Failed to cache dataset:', e);
    }
  };

  useEffect(() => {
    if (!user?.id || !Array.isArray(data) || !data.length) return;

    try {
      localStorage.setItem(memberDatasetKey(user.id), JSON.stringify(toShareableRows(data)));
    } catch (e) {
      console.error('Failed to cache member dataset:', e);
    }
  }, [user?.id, data]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setHasHydratedCurrentUserData(false);

    const hydrateCurrentUserDataset = async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(datasetCacheKey(user.id)) || 'null');
        if (cached?.rows?.length) {
          const hydratedRows = cached.rows.map((row) => ({
            ...row,
            dateRated: row?.dateRated ? new Date(row.dateRated) : null,
            imdbVotes: Number(row?.imdbVotes ?? row?.numVotes) || 0,
            numVotes: Number(row?.numVotes ?? row?.imdbVotes) || 0,
          }));

          if (!cancelled) {
            setData(hydratedRows);
            setFileName(cached.fileName || 'IMDb Ratings (cached)');
            setLoadedFromCache(true);
            setLastDataSyncAt(cached.updatedAt || null);
            setHasHydratedCurrentUserData(true);
          }
          return;
        }

        // Fallback: restore this user's dataset from Supabase snapshot if local cache is empty.
        const { data: row, error } = await supabase
          .from('member_profiles')
          .select('snapshot,updated_at')
          .eq('user_id', String(user.id))
          .maybeSingle();

        if (!cancelled && !error && row?.snapshot) {
          const remoteRows = Array.isArray(row.snapshot?.dataset)
            ? row.snapshot.dataset
            : Array.isArray(row.snapshot?.rows)
              ? row.snapshot.rows
              : Array.isArray(row.snapshot?.data)
                ? row.snapshot.data
                : [];

          if (remoteRows.length) {
            const normalized = fromShareableRows(remoteRows);
            if (normalized.length) {
              setData(normalized);
              setFileName('IMDb Ratings (synced)');
              setLoadedFromCache(false);
              setLastDataSyncAt(row.updated_at || null);
              setHasHydratedCurrentUserData(true);
              try {
                localStorage.setItem(datasetCacheKey(user.id), JSON.stringify({
                  rows: normalized,
                  fileName: 'IMDb Ratings (synced)',
                  updatedAt: row.updated_at || new Date().toISOString(),
                }));
              } catch {
                // ignore local cache write failures
              }
              return;
            }
          }
        }

        if (!cancelled) {
          setData(null);
          setFileName('');
          setLoadedFromCache(false);
          setLastDataSyncAt(null);
          setHasHydratedCurrentUserData(true);
        }
      } catch (e) {
        console.error('Failed to restore cached dataset:', e);
        if (!cancelled) {
          setData(null);
          setFileName('');
          setLoadedFromCache(false);
          setLastDataSyncAt(null);
          setHasHydratedCurrentUserData(true);
        }
      }
    };

    hydrateCurrentUserDataset();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  useEffect(() => {
    if (!data?.length || fetchingCountries) return;

    const hasMissingCountry = data.some((movie) => !hasUsableCountryName(movie?.country) && !hasUsableCountryName(countryOverrides[movieCountryKey(movie)]));
    if (!hasMissingCountry) return;
    const now = Date.now();
    if (now - lastCountryFetchAttemptAtRef.current < 60000) return;
    lastCountryFetchAttemptAtRef.current = now;

    let cancelled = false;
    (async () => {
      const enriched = await fetchCountryData(data, OMDB_API_KEY);
      if (!cancelled && enriched?.length) persistDataset(enriched, fileName || 'IMDb Ratings');
    })();

    return () => {
      cancelled = true;
    };
  }, [data, fetchingCountries, fileName, countryOverrides]);

  const cleanTitleForOmdb = (title) => {
    if (!title || typeof title !== 'string') return '';
    let cleaned = title.trim();
    cleaned = cleaned.replace(/\s*\(\d{4}(\d{4})?\)$/i, '');
    cleaned = cleaned.replace(/\s*\([IVXLCDMivxlcdm]+\)$/i, '');
    cleaned = cleaned.replace(/\s*-\s*(Director's Cut|Extended Cut|Uncut|International Version)$/i, '');
    cleaned = cleaned.replace(/\s*:\s*(Extended|Unrated|Director's Cut)$/i, '');
    cleaned = cleaned.replace(/\s*\[.*?\]$/g, '');
    return cleaned.replace(/\s+/g, ' ').trim();
  };

  const buildOmdbCacheKey = (title, year, imdbId) => {
    const safeId = String(imdbId || '').trim();
    if (safeId) return `imdb:${safeId}`;
    const safeTitle = cleanTitleForOmdb(String(title || '')).toLowerCase();
    if (!safeTitle) return '';
    return `title:${safeTitle}|${Number(year) || ''}`;
  };

  const buildOmdbTitleCacheKey = (title, year) => {
    const safeTitle = cleanTitleForOmdb(String(title || '')).toLowerCase();
    if (!safeTitle) return '';
    return `title:${safeTitle}|${Number(year) || ''}`;
  };

  const syncDatasetToMemberProfile = async (rows = []) => {
    if (!user?.id) return;
    try {
      const safeRows = Array.isArray(rows) ? rows : [];
      const avgYourRating = safeRows.length
        ? safeRows.reduce((sum, row) => sum + (Number(row?.yourRating) || 0), 0) / safeRows.length
        : 0;

      const genreCount = {};
      safeRows.forEach((row) => {
        String(row?.genres || '')
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
          .forEach((genre) => {
            genreCount[genre] = (genreCount[genre] || 0) + 1;
          });
      });
      const mostRatedGenre = Object.keys(genreCount).sort((a, b) => genreCount[b] - genreCount[a])[0] || 'N/A';

      const baseSnapshot = currentMemberSnapshot && typeof currentMemberSnapshot === 'object'
        ? currentMemberSnapshot
        : (minimalMemberSnapshot && typeof minimalMemberSnapshot === 'object' ? minimalMemberSnapshot : {});

      const updatedAt = new Date().toISOString();
      const snapshot = toPublicMemberSnapshot({
        ...baseSnapshot,
        publicIdentity: getPublicIdentityPayload(),
        stats: {
          totalFilms: safeRows.length,
          avgYourRating: Number(avgYourRating || 0),
          mostRatedGenre,
        },
        dataset: toShareableRows(safeRows),
        updatedAt,
      });

      const payload = {
        user_id: user.id,
        display_name: resolvedOwnPublicName,
        email: user.email || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        snapshot,
        updated_at: updatedAt,
      };

      const { error } = await supabase
        .from('member_profiles')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) {
        console.error('member_profiles upsert failed (dataset sync):', error);
      }
    } catch (e) {
      console.error('Dataset cloud sync failed:', e);
    }
  };

  const fetchOmdbWithFallback = async (buildUrlForKey) => {
    const availableKeys = OMDB_API_KEYS.filter((k) => !invalidOmdbKeysRef.current.has(k));
    if (!availableKeys.length) {
      return { Response: 'False', Error: 'OMDb API key unavailable or request limit reached.' };
    }
    let lastPayload = null;

    for (const key of availableKeys) {
      if (invalidOmdbKeysRef.current.has(key)) continue;
      try {
        const url = buildUrlForKey(key);
        if (!url) continue;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OMDB_FETCH_TIMEOUT_MS);
        let res;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        if (res.status === 401) {
          invalidOmdbKeysRef.current.add(key);
          continue;
        }
        const json = await res.json();
        if (json?.Response === 'True') return json;
        if (json?.Error && /invalid api key|unauthorized|request limit reached/i.test(String(json.Error))) {
          invalidOmdbKeysRef.current.add(key);
          continue;
        }
        lastPayload = json || lastPayload;
      } catch {
        // Try next key.
      }
    }

    return lastPayload;
  };

  const getOmdbCache = async ({ title, year, imdbId }) => {
    if (!omdbCacheAvailableRef.current) return null;
    const cacheKey = buildOmdbCacheKey(title, year, imdbId);
    if (!cacheKey) return null;

    const { data, error } = await supabase
      .from(OMDB_CACHE_TABLE)
      .select('data,poster,country')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error) {
      if (error?.code === 'PGRST205' || error?.status === 404) {
        omdbCacheAvailableRef.current = false;
      }
      return null;
    }

    if (data?.data) return {
      payload: data.data,
      poster: data.poster || null,
      country: data.country || null,
    };

    const safeTitle = cleanTitleForOmdb(String(title || '')).toLowerCase();
    const safeYear = Number(year) || null;
    if (!safeTitle || !safeYear) return null;

    const { data: titleMatches, error: titleError } = await supabase
      .from(OMDB_CACHE_TABLE)
      .select('data,poster,country,title,year')
      .eq('year', safeYear)
      .ilike('title', cleanTitleForOmdb(String(title || '')))
      .limit(3);

    if (titleError) return null;

    const match = Array.isArray(titleMatches)
      ? titleMatches.find((row) => cleanTitleForOmdb(String(row?.title || row?.data?.Title || '')).toLowerCase() === safeTitle)
      : null;

    if (!match?.data) return null;
    return {
      payload: match.data,
      poster: match.poster || null,
      country: match.country || null,
    };
  };

  const setOmdbCache = async ({ title, year, imdbId, payload }) => {
    if (!omdbCacheAvailableRef.current || !payload) return;
    const cacheKey = buildOmdbCacheKey(title, year, imdbId);
    if (!cacheKey) return;

    const resolvedImdbId = imdbId || payload?.imdbID || payload?.imdbId || null;
    const resolvedTitle = title || payload?.Title || null;
    const resolvedYear = Number(year) || Number(String(payload?.Year || '').match(/\d{4}/)?.[0]) || null;
    const baseRecord = {
      imdb_id: resolvedImdbId,
      title: resolvedTitle,
      year: resolvedYear,
      poster: payload?.Poster && payload.Poster !== 'N/A' ? payload.Poster : null,
      country: payload?.Country && payload.Country !== 'N/A' ? payload.Country : null,
      data: payload,
      updated_at: new Date().toISOString(),
    };

    const titleCacheKey = buildOmdbTitleCacheKey(resolvedTitle, resolvedYear);
    const cacheKeys = [...new Set([cacheKey, titleCacheKey].filter(Boolean))];
    const records = cacheKeys.map((key) => ({ ...baseRecord, cache_key: key }));

    const { error } = await supabase
      .from(OMDB_CACHE_TABLE)
      .upsert(records, { onConflict: 'cache_key' });

    if (error && (error?.code === 'PGRST205' || error?.status === 404)) {
      omdbCacheAvailableRef.current = false;
    }
  };

  const normalizeMovieCachePayload = (row) => {
    if (!row) return null;
    const safeTitle = String(row?.title || '').trim();
    if (!safeTitle) return null;
    const year = Number(row?.year) || '';
    const runtime = Number(row?.runtime) || 0;
    const poster = String(row?.poster || row?.poster_url || '').trim();
    return {
      Response: 'True',
      Source: 'movie_cache',
      Title: safeTitle,
      Year: year ? String(year) : '',
      Type: row?.title_type || 'movie',
      Runtime: runtime ? `${runtime} min` : '',
      Genre: row?.genres || '',
      Director: row?.directors || '',
      Writer: row?.writers || '',
      Actors: row?.stars || '',
      Plot: row?.description || '',
      Country: row?.country || '',
      Language: row?.languages || '',
      Poster: poster || 'N/A',
      imdbID: row?.imdb_id || '',
      imdbRating: row?.imdb_rating != null ? String(row.imdb_rating) : '',
      imdbVotes: row?.imdb_votes != null ? String(row.imdb_votes) : '',
    };
  };

  const getMovieCache = async ({ title, year, imdbId }) => {
    const safeId = String(imdbId || '').trim();
    const safeTitle = cleanTitleForOmdb(String(title || '')).toLowerCase();
    const safeYear = Number(year) || null;

    try {
      let match = null;
      if (safeId) {
        const { data, error } = await supabase
          .from(MOVIE_CACHE_TABLE)
          .select('imdb_id,cache_key,title,year,title_type,runtime,imdb_rating,imdb_votes,genres,directors,country,languages,description,movie_link,stars,writers')
          .eq('imdb_id', safeId)
          .maybeSingle();
        if (!error && data) match = data;
      }

      if (!match && safeTitle && safeYear) {
        const { data, error } = await supabase
          .from(MOVIE_CACHE_TABLE)
          .select('imdb_id,cache_key,title,year,title_type,runtime,imdb_rating,imdb_votes,genres,directors,country,languages,description,movie_link,stars,writers')
          .eq('year', safeYear)
          .ilike('title', cleanTitleForOmdb(String(title || '')))
          .limit(5);
        if (!error && Array.isArray(data)) {
          match = data.find((row) => cleanTitleForOmdb(String(row?.title || '')).toLowerCase() === safeTitle) || data[0] || null;
        }
      }

      const payload = normalizeMovieCachePayload(match);
      if (!payload) return null;
      return {
        payload,
        poster: payload.Poster && payload.Poster !== 'N/A' ? payload.Poster : null,
        country: payload.Country || null,
      };
    } catch {
      return null;
    }
  };

  const getMovieMetadataCache = async ({ title, year, imdbId }) => {
    const movieCache = await getMovieCache({ title, year, imdbId });
    if (movieCache?.payload) return movieCache;
    return getOmdbCache({ title, year, imdbId });
  };

  const getBulkMovieCacheMatches = async (films = []) => {
    const results = new Map();
    const keyEntries = [];

    films.forEach((film, index) => {
      const title = cleanTitleForOmdb(String(film?.title || '')).toLowerCase();
      const year = Number(film?.year) || null;
      if (!title || !year) return;
      const cacheKey = buildOmdbTitleCacheKey(title, year);
      if (cacheKey) keyEntries.push({ index, cacheKey, title, year });
    });

    const selectedColumns = 'imdb_id,cache_key,title,year,title_type,runtime,imdb_rating,imdb_votes,genres,directors,country,languages,description,movie_link,stars,writers';
    const entriesByKey = new Map();
    keyEntries.forEach((entry) => {
      if (!entriesByKey.has(entry.cacheKey)) entriesByKey.set(entry.cacheKey, []);
      entriesByKey.get(entry.cacheKey).push(entry);
    });

    const uniqueKeys = Array.from(entriesByKey.keys());
    for (let i = 0; i < uniqueKeys.length; i += 400) {
      const keys = uniqueKeys.slice(i, i + 400);
      try {
        const { data: rows, error } = await supabase
          .from(MOVIE_CACHE_TABLE)
          .select(selectedColumns)
          .in('cache_key', keys);
        if (!error && Array.isArray(rows)) {
          rows.forEach((row) => {
            const entries = entriesByKey.get(row?.cache_key) || [];
            const payload = normalizeMovieCachePayload(row);
            if (!payload) return;
            entries.forEach((entry) => {
              results.set(entry.index, {
                payload,
                poster: payload.Poster !== 'N/A' ? payload.Poster : null,
                country: payload.Country || null,
              });
            });
          });
        }
      } catch {
        // Use fallback matching below.
      }
    }

    const missingKeys = uniqueKeys.filter((key) =>
      (entriesByKey.get(key) || []).some((entry) => !results.has(entry.index))
    );
    for (let i = 0; i < missingKeys.length; i += 400) {
      const keys = missingKeys.slice(i, i + 400);
      try {
        const { data: rows, error } = await supabase
          .from(OMDB_CACHE_TABLE)
          .select('cache_key,data,poster,country')
          .in('cache_key', keys);
        if (!error && Array.isArray(rows)) {
          rows.forEach((row) => {
            const entries = entriesByKey.get(row?.cache_key) || [];
            if (!row?.data) return;
            entries.forEach((entry) => {
              if (results.has(entry.index)) return;
              results.set(entry.index, {
                payload: row.data,
                poster: row.poster || null,
                country: row.country || null,
              });
            });
          });
        }
      } catch {
        // Missed rows can still use the normal fallback path.
      }
    }

    const missesByYear = new Map();
    keyEntries.forEach((entry) => {
      if (results.has(entry.index)) return;
      if (!missesByYear.has(entry.year)) missesByYear.set(entry.year, []);
      missesByYear.get(entry.year).push(entry);
    });

    const yearEntries = Array.from(missesByYear.entries());
    for (let i = 0; i < yearEntries.length; i += 5) {
      const chunk = yearEntries.slice(i, i + 5);
      await Promise.all(chunk.map(async ([year, entries]) => {
        try {
          const wantedTitles = new Set(entries.map((entry) => entry.title));
          const { data: rows, error } = await supabase
            .from(MOVIE_CACHE_TABLE)
            .select(selectedColumns)
            .eq('year', year)
            .limit(1000);
          if (error || !Array.isArray(rows)) return;

          const candidates = new Map();
          rows.forEach((row) => {
            const key = cleanTitleForOmdb(String(row?.title || '')).toLowerCase();
            if (wantedTitles.has(key) && !candidates.has(key)) {
              candidates.set(key, row);
            }
          });

          entries.forEach((entry) => {
            const match = candidates.get(entry.title);
            const payload = normalizeMovieCachePayload(match);
            if (payload) results.set(entry.index, { payload, poster: payload.Poster !== 'N/A' ? payload.Poster : null, country: payload.Country || null });
          });
        } catch {
          // Keep import moving; missed rows can use the normal fallback path.
        }
      }));
    }

    return results;
  };

  const fetchMovieDetails = async (movie) => {
    if (!movie) return;

    setFetchingMovieDetails(true);
    setMovieDetails(null);

    try {
      const imdbId = String(movie?.imdbId || movie?.imdbID || '').trim();
      const title = String(movie?.title || '').trim();
      const year = Number(movie?.year) || '';

      const cached = await getMovieMetadataCache({ title, year, imdbId });
      if (cached?.payload) {
        setMovieDetails(cached.payload);
        return;
      }

      let payload = null;
      if (imdbId) {
        payload = await fetchOmdbWithFallback((key) =>
          `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&plot=full&apikey=${key}`
        );
      }
      if (!payload || payload?.Response !== 'True') {
        payload = await fetchOmdbWithFallback((key) =>
          `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitleForOmdb(title))}${year ? `&y=${year}` : ''}&plot=full&apikey=${key}`
        );
      }

      if (payload) {
        setOmdbCache({ title, year, imdbId, payload });
      }

      setMovieDetails(payload || { Error: 'Could not load movie details.' });
    } catch {
      setMovieDetails({ Error: 'Could not load movie details.' });
    } finally {
      setFetchingMovieDetails(false);
    }
  };

  const handleMovieClick = async (movie) => {
    setSelectedMovie(movie);
    await fetchMovieDetails(movie);
  };

  const safeMovieDetails =
    movieDetails && typeof movieDetails === 'object' ? movieDetails : null;

  const closeMovieModal = () => {
    setSelectedMovie(null);
    setMovieDetails(null);
  };

  const renderMovieDetailsModal = (zClassName = 'z-[100]') => (
    <div className={`fixed inset-0 ${zClassName} flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm`} onClick={closeMovieModal}>
      <div className="bg-[#111] rounded-xl w-full max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Movie Details</h2>
          <button onClick={closeMovieModal} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="p-4">
          {fetchingMovieDetails ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-blue-500 mb-3"></div>
              <p className="text-gray-400 text-sm">Fetching movie details...</p>
            </div>
          ) : safeMovieDetails ? (
            safeMovieDetails.Error ? (
              <div className="text-center py-6 text-red-400">{safeMovieDetails.Error}</div>
            ) : (
              <div className="space-y-4">
                {safeMovieDetails.Poster && safeMovieDetails.Poster !== 'N/A' && (
                  <div className="flex justify-center">
                    <img src={safeMovieDetails.Poster} alt={safeMovieDetails.Title} className="max-h-56 rounded-lg shadow-lg" />
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{safeMovieDetails.Title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {safeMovieDetails.Year && <span className="bg-gray-800 px-2 py-0.5 rounded-full">{safeMovieDetails.Year}</span>}
                    {safeMovieDetails.Rated && <span className="bg-gray-800 px-2 py-0.5 rounded-full">{safeMovieDetails.Rated}</span>}
                    {safeMovieDetails.Runtime && <span className="bg-gray-800 px-2 py-0.5 rounded-full">{safeMovieDetails.Runtime}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800 p-3 rounded-lg text-center">
                    <p className="text-gray-400 text-xs">IMDb Rating</p>
                    <p className="text-2xl font-bold text-yellow-400"> {safeMovieDetails.imdbRating}</p>
                  </div>
                  <div className="bg-gray-800 p-3 rounded-lg text-center">
                    <p className="text-gray-400 text-xs">Your Rating</p>
                    <p className="text-2xl font-bold text-green-400"> {selectedMovie?.yourRating ?? '-'}</p>
                  </div>
                </div>

                {typeof safeMovieDetails.Genre === 'string' && safeMovieDetails.Genre.length > 0 && (
                  <div>
                    <h4 className="text-gray-400 text-xs mb-1">Genres</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {safeMovieDetails.Genre.split(', ').map((g, i) => (
                        <span key={i} className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full text-xs">{g}</span>
                      ))}
                    </div>
                  </div>
                )}

                {safeMovieDetails.Plot && safeMovieDetails.Plot !== 'N/A' && (
                  <div>
                    <h4 className="text-gray-400 text-xs mb-1">Plot</h4>
                    <p className="text-gray-300 text-sm leading-relaxed">{safeMovieDetails.Plot}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {safeMovieDetails.Director && safeMovieDetails.Director !== 'N/A' && (
                    <div>
                      <p className="text-gray-400">Director</p>
                      <p className="text-white font-medium">{safeMovieDetails.Director}</p>
                    </div>
                  )}
                  {safeMovieDetails.Writer && safeMovieDetails.Writer !== 'N/A' && (
                    <div>
                      <p className="text-gray-400">Writer</p>
                      <p className="text-white font-medium">{safeMovieDetails.Writer}</p>
                    </div>
                  )}
                  {safeMovieDetails.Actors && safeMovieDetails.Actors !== 'N/A' && (
                    <div className="col-span-2">
                      <p className="text-gray-400">Cast</p>
                      <p className="text-white font-medium">{safeMovieDetails.Actors}</p>
                    </div>
                  )}
                  {safeMovieDetails.Country && safeMovieDetails.Country !== 'N/A' && (
                    <div>
                      <p className="text-gray-400">Country</p>
                      <p className="text-white font-medium">{safeMovieDetails.Country}</p>
                    </div>
                  )}
                  {safeMovieDetails.Language && safeMovieDetails.Language !== 'N/A' && (
                    <div>
                      <p className="text-gray-400">Language</p>
                      <p className="text-white font-medium">{safeMovieDetails.Language}</p>
                    </div>
                  )}
                  {safeMovieDetails.BoxOffice && safeMovieDetails.BoxOffice !== 'N/A' && (
                    <div>
                      <p className="text-gray-400">Box Office</p>
                      <p className="text-white font-medium">{safeMovieDetails.BoxOffice}</p>
                    </div>
                  )}
                  {safeMovieDetails.Awards && safeMovieDetails.Awards !== 'N/A' && (
                    <div>
                      <p className="text-gray-400">Awards</p>
                      <p className="text-yellow-300 font-medium">{safeMovieDetails.Awards}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );

  const markPosterUnavailable = React.useCallback((posterKey) => {
    if (!posterKey) return;
    setUnavailablePosters((prev) => (prev?.[posterKey] ? prev : { ...prev, [posterKey]: true }));
  }, []);

  const clearPosterUnavailable = React.useCallback((posterKey) => {
    if (!posterKey) return;
    setUnavailablePosters((prev) => {
      if (!prev?.[posterKey]) return prev;
      const next = { ...prev };
      delete next[posterKey];
      return next;
    });
  }, []);

  const renderPosterStatus = React.useCallback(() => 'No poster available', []);

  const showYearlyChartTooltip = React.useCallback((payload, coordinate) => {
    const point = Array.isArray(payload) ? payload[0]?.payload : payload?.payload || payload;
    if (!point) return;
    setYearlyChartTooltip({
      coordinate: coordinate || null,
      label: point.year,
      payload: [
        {
          name: 'Film count',
          value: point.filmCount,
          dataKey: 'filmCount',
          payload: point,
        },
      ],
    });
  }, []);

  const fetchPoster = async (title, year, imdbId = null) => {
    const safeTitle = String(title || '').trim();
    const safeYear = Number(year) || '';
    if (!safeTitle) return null;

    const key = `${safeTitle}_${safeYear}`;
    if (posters[key]) return posters[key];

    const inFlight = posterLoadInFlightRef.current;
    if (inFlight.has(key)) return null;

    const now = Date.now();
    const lastFailedAt = posterFailedAtRef.current[key] || 0;
    if (now - lastFailedAt < 20000) return null;

    inFlight.add(key);

    try {
      const cached = await getMovieMetadataCache({ title: safeTitle, year: safeYear, imdbId });
      if (cached?.poster) {
        setPosters((prev) => (prev?.[key] === cached.poster ? prev : { ...prev, [key]: cached.poster }));
        delete posterFailedAtRef.current[key];
        clearPosterUnavailable(key);
        return cached.poster;
      }

      let json = null;
      if (imdbId) {
        json = await fetchOmdbWithFallback((keyValue) =>
          `https://www.omdbapi.com/?i=${encodeURIComponent(String(imdbId))}&apikey=${keyValue}`
        );
      }
      if ((!json || json?.Response !== 'True' || !json?.Poster || json.Poster === 'N/A')) {
        json = await fetchOmdbWithFallback((keyValue) =>
          `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitleForOmdb(safeTitle))}${safeYear ? `&y=${safeYear}` : ''}&apikey=${keyValue}`
        );
      }

      if (json?.Response === 'True' && json?.Poster && json.Poster !== 'N/A') {
        setPosters((prev) => (prev?.[key] === json.Poster ? prev : { ...prev, [key]: json.Poster }));
        setOmdbCache({ title: safeTitle, year: safeYear, imdbId, payload: json });
        delete posterFailedAtRef.current[key];
        clearPosterUnavailable(key);
        return json.Poster;
      }

      posterFailedAtRef.current[key] = Date.now();
      markPosterUnavailable(key);
      return null;
    } finally {
      inFlight.delete(key);
    }
  };

  const loadPostersForFilms = async (
    films = [],
    options = {}
  ) => {
    if (!Array.isArray(films) || films.length === 0) return;
    const {
      batchSize = 12,
      retryPasses = 0,
      retryDelayMs = 350,
    } = options;

    const getUnloadedUniqueFilms = () => {
      const unique = [];
      const seen = new Set();
      films.forEach((film) => {
        const title = String(film?.title || '').trim();
        const year = Number(film?.year) || '';
        if (!title) return;
        const key = `${title}_${year}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (posters[key]) return;
        unique.push(film);
      });
      return unique;
    };

    let pending = getUnloadedUniqueFilms();
    if (pending.length === 0) return;

    for (let pass = 0; pass <= retryPasses; pass += 1) {
      for (let i = 0; i < pending.length; i += batchSize) {
        const batch = pending.slice(i, i + batchSize);
        await Promise.all(
          batch.map((film) => fetchPoster(film?.title, film?.year, film?.imdbId || film?.imdbID || null))
        );
        if (retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
      if (pass < retryPasses) {
        pending = getUnloadedUniqueFilms();
        if (pending.length === 0) break;
      }
    }
  };

  const parseVoteCount = (value) => {
    const cleaned = String(value ?? '').replace(/,/g, '').replace(/[^\d]/g, '');
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const parseOmdbRuntime = (value) => {
    const numeric = Number(String(value || '').match(/\d+/)?.[0]);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const applyImportedDataset = (rows, sourceName, fromCache = false) => {
    setData(rows);
    setFileName(sourceName);
    setLoadedFromCache(fromCache);
    persistDataset(rows, sourceName);
    syncDatasetToMemberProfile(rows);
    setHiddenGemsPage(1);
    setHiddenTreasuresPage(1);
    setWatchedPage(1);
    setTopGenrePage(1);
    setPersonalCanonPage(1);
    setFavoriteYearPage(1);
    setSelectedMovie(null);
    setMovieDetails(null);
  };

  const normalizeOmdbPayloadToRow = (film, payload) => {
    const isValidOmdb = payload?.Response === 'True';
    const omdbYear = Number(String(payload?.Year || '').match(/\d{4}/)?.[0]) || 0;
    const title = String(isValidOmdb ? payload?.Title || film?.title : film?.title || '').trim();
    const year = Number(film?.year) || omdbYear || 0;
    const imdbVotes = isValidOmdb ? parseVoteCount(payload?.imdbVotes) : 0;
    return {
      title,
      titleType: String(isValidOmdb ? payload?.Type || 'movie' : 'movie').toLowerCase(),
      yourRating: Number(film?.yourRating) || 0,
      imdbRating: isValidOmdb ? Number(payload?.imdbRating) || 0 : 0,
      year,
      genres: isValidOmdb && payload?.Genre !== 'N/A' ? String(payload?.Genre || '').trim() : '',
      directors: isValidOmdb && payload?.Director !== 'N/A' ? String(payload?.Director || '').trim() : '',
      runtime: isValidOmdb ? parseOmdbRuntime(payload?.Runtime) : 0,
      imdbVotes,
      numVotes: imdbVotes,
      imdbId: isValidOmdb ? String(payload?.imdbID || '').trim() : '',
      dateRated: film?.dateRated || null,
      country: isValidOmdb && payload?.Country !== 'N/A' ? String(payload?.Country || '').split(',')[0].trim() : '',
      letterboxdUrl: film?.letterboxdUrl || '',
    };
  };

  const enrichLetterboxdFilm = async (film, options = {}) => {
    const title = String(film?.title || '').trim();
    const year = Number(film?.year) || '';
    if (!title || !Number(film?.yourRating)) return null;

    const cached = options.skipCache ? null : await getMovieMetadataCache({ title, year, imdbId: null });
    const payload = cached?.payload || await fetchOmdbWithFallback((key) =>
      `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitleForOmdb(title))}${year ? `&y=${year}` : ''}&apikey=${key}`
    );

    if (payload?.Response === 'True') {
      setOmdbCache({ title, year, imdbId: payload?.imdbID || null, payload });
    }

    const row = normalizeOmdbPayloadToRow(film, payload);
    const poster = payload?.Poster && payload.Poster !== 'N/A' ? payload.Poster : film?.poster;
    if (poster && row.title) {
      const posterKey = `${row.title}_${row.year || ''}`;
      setPosters((prev) => (prev?.[posterKey] === poster ? prev : { ...prev, [posterKey]: poster }));
      clearPosterUnavailable(posterKey);
    }
    return row;
  };

  const inflateRawZipBytes = async (bytes) => {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot read zip exports. Please upload ratings.csv from the export instead.');
    }

    const decompress = async (format) => {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    };

    try {
      return await decompress('deflate-raw');
    } catch {
      return decompress('deflate');
    }
  };

  const extractRatingsCsvFromZip = async (arrayBuffer) => {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    const minEocdOffset = Math.max(0, bytes.length - 65557);
    let eocdOffset = -1;

    for (let offset = bytes.length - 22; offset >= minEocdOffset; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        eocdOffset = offset;
        break;
      }
    }

    if (eocdOffset < 0) {
      throw new Error('Could not read this Letterboxd zip export.');
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let directoryOffset = view.getUint32(eocdOffset + 16, true);

    for (let index = 0; index < totalEntries; index += 1) {
      if (view.getUint32(directoryOffset, true) !== 0x02014b50) break;

      const method = view.getUint16(directoryOffset + 10, true);
      const compressedSize = view.getUint32(directoryOffset + 20, true);
      const fileNameLength = view.getUint16(directoryOffset + 28, true);
      const extraLength = view.getUint16(directoryOffset + 30, true);
      const commentLength = view.getUint16(directoryOffset + 32, true);
      const localHeaderOffset = view.getUint32(directoryOffset + 42, true);
      const fileName = decoder.decode(bytes.slice(directoryOffset + 46, directoryOffset + 46 + fileNameLength));

      if (fileName.toLowerCase() === 'ratings.csv' || fileName.toLowerCase().endsWith('/ratings.csv')) {
        const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
        const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
        const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
        const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
        const textBytes = method === 0 ? compressed : method === 8 ? await inflateRawZipBytes(compressed) : null;
        if (!textBytes) throw new Error('Unsupported compression in this Letterboxd zip export.');
        return decoder.decode(textBytes);
      }

      directoryOffset += 46 + fileNameLength + extraLength + commentLength;
    }

    throw new Error('ratings.csv was not found in this Letterboxd export.');
  };

  const getWorkbookFromUploadedFile = async (file) => {
    const buffer = await file.arrayBuffer();
    if (/\.zip$/i.test(file.name || '')) {
      const ratingsCsv = await extractRatingsCsvFromZip(buffer);
      return XLSX.read(ratingsCsv, { type: 'string' });
    }
    return XLSX.read(buffer, { type: 'array' });
  };

  const enrichLetterboxdRows = async (films) => {
    const rows = [];
    setLetterboxdImporting(true);
    setLetterboxdProgress({ current: 0, total: films.length, phase: 'Checking saved film data' });
    const bulkMatches = await getBulkMovieCacheMatches(films);
    const batchSize = 80;
    setLetterboxdProgress({
      current: Math.min(bulkMatches.size, films.length),
      total: films.length,
      phase: bulkMatches.size ? 'Using saved film data' : 'Filling Letterboxd export with OMDb data',
    });

    try {
      for (let index = 0; index < films.length; index += batchSize) {
        const batch = films.slice(index, index + batchSize).map((film, offset) => ({ film, originalIndex: index + offset }));
        const enriched = await Promise.all(batch.map(({ film, originalIndex }) => {
          const cached = bulkMatches.get(originalIndex);
          if (cached?.payload) {
            const row = normalizeOmdbPayloadToRow(film, cached.payload);
            if (cached.poster && row.title) {
              const posterKey = `${row.title}_${row.year || ''}`;
              setPosters((prev) => (prev?.[posterKey] === cached.poster ? prev : { ...prev, [posterKey]: cached.poster }));
              clearPosterUnavailable(posterKey);
            }
            return row;
          }
          return enrichLetterboxdFilm(film, { skipCache: true });
        }));
        rows.push(...enriched.filter(Boolean));
        setLetterboxdProgress({
          current: Math.min(index + batch.length, films.length),
          total: films.length,
          phase: 'Filling Letterboxd export with OMDb data',
        });
      }
      return rows;
    } catch (error) {
      console.error('Letterboxd enrichment failed:', error);
      throw error;
    } finally {
      setLetterboxdImporting(false);
    }
  };
  
  const handleFileUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
      const workbook = await getWorkbookFromUploadedFile(file);
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      if (!sheet) return;

      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const normalizeKey = (key) =>
        String(key || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');

      const getByAliases = (row, aliases) => {
        const keyMap = {};
        Object.keys(row || {}).forEach((k) => {
          keyMap[normalizeKey(k)] = row[k];
        });

        for (const alias of aliases) {
          const value = keyMap[normalizeKey(alias)];
          if (value !== undefined) return value;
        }
        return '';
      };

      const isLetterboxdExport = rawRows.some((row) => {
        const name = String(getByAliases(row, ['Name'])).trim();
        const year = String(getByAliases(row, ['Year'])).trim();
        const rating = String(getByAliases(row, ['Rating'])).trim();
        const uri = String(getByAliases(row, ['Letterboxd URI', 'Letterboxd URL', 'URI', 'URL'])).trim();
        return Boolean(
          (name && year && rating && uri) ||
          (name && year && rating && !String(getByAliases(row, ['Title', 'Your Rating', 'IMDb Rating', 'Const'])).trim())
        );
      });

      if (isLetterboxdExport) {
        const films = rawRows
          .map((row) => {
            const title = String(getByAliases(row, ['Name', 'Title'])).trim();
            const year = Number(getByAliases(row, ['Year', 'Release Year'])) || 0;
            const ratingRaw = Number(getByAliases(row, ['Rating', 'Your Rating']));
            const yourRating = Number.isFinite(ratingRaw) ? Math.round(ratingRaw * 2) : 0;
            const letterboxdUrl = String(getByAliases(row, ['Letterboxd URI', 'Letterboxd URL', 'URI', 'URL'])).trim();
            const dateRated = parseExcelDate(getByAliases(row, ['Date', 'Date Rated', 'Watched Date']));
            if (!title || !yourRating || yourRating <= 0) return null;
            return {
              title,
              year,
              yourRating: Math.min(10, Math.max(1, yourRating)),
              letterboxdUrl,
              dateRated,
            };
          })
          .filter(Boolean);

        if (!films.length) {
          alert('No valid rated films found in the Letterboxd export.');
          return;
        }

        setLetterboxdError('');
        const sourceName = file.name || 'Letterboxd Export';
        const rows = await enrichLetterboxdRows(films);

        if (!rows.length) {
          alert('Letterboxd films were found, but none could be converted into dashboard data.');
          return;
        }

        applyImportedDataset(rows, sourceName);
        setLetterboxdProgress({ current: rows.length, total: rows.length, phase: 'Import complete' });
        return;
      }

      const parsed = rawRows
        .map((row) => {
          const title = String(getByAliases(row, ['Title', 'Original Title'])).trim();
          const titleType = String(getByAliases(row, ['Title Type', 'Type'])).trim().toLowerCase();
          const yourRatingRaw = getByAliases(row, ['Your Rating', 'Rating']);
          const yourRating = Number(yourRatingRaw);

          if (!title) return null;
          if (!Number.isFinite(yourRating) || yourRating <= 0) return null;

          const imdbRating = Number(getByAliases(row, ['IMDb Rating', 'IMDB Rating', 'Average Rating'])) || 0;
          const year = Number(getByAliases(row, ['Year', 'Release Year'])) || 0;
          const genres = String(getByAliases(row, ['Genres', 'Genre'])).trim();
          const directors = String(getByAliases(row, ['Directors', 'Director'])).trim();
          const runtime = Number(getByAliases(row, ['Runtime (mins)', 'Runtime', 'Runtime Mins'])) || 0;
          const imdbVotes = parseVoteCount(getByAliases(row, ['Num Votes', 'IMDb Votes', 'IMDB Votes', 'Votes']));
          const imdbId = String(getByAliases(row, ['Const', 'IMDb ID', 'imdbID', 'tconst'])).trim();
          const dateRated = parseExcelDate(getByAliases(row, ['Date Rated', 'Date Watched', 'Watched Date']));
          const country = String(getByAliases(row, ['Country', 'Country of Origin'])).trim();

          return {
            title,
            titleType: titleType || 'movie',
            yourRating,
            imdbRating,
            year,
            genres,
            directors,
            runtime,
            imdbVotes,
            numVotes: imdbVotes,
            imdbId,
            dateRated,
            country,
          };
        })
        .filter(Boolean);

      if (!parsed.length) {
        alert('No valid rated films found in the uploaded file.');
        return;
      }

      applyImportedDataset(parsed, file.name);
    } catch (error) {
      console.error('File upload failed:', error);
      alert(error?.message || 'Could not parse this file. Please upload a valid IMDb export, Letterboxd ratings.csv, or Letterboxd zip export.');
    }
  };
  const handleRemoveUploadedFile = () => {
    const shouldRemove = window.confirm('Remove current IMDb file and clear all dashboard data?');
    if (!shouldRemove) return;

    try {
      if (user?.id) {
        localStorage.removeItem(datasetCacheKey(user.id));
        localStorage.removeItem(memberDatasetKey(user.id));
      }
    } catch (e) {
      console.error('Failed to clear cached dataset:', e);
    }

    setData(null);
    setFileName('');
    setLoadedFromCache(false);
    setLastDataSyncAt(null);
    setLetterboxdError('');
    setLetterboxdProgress({ current: 0, total: 0, phase: '' });
    setPosters({});
    setUnavailablePosters({});
    setSelectedMovie(null);
    setMovieDetails(null);
    setHoveredMapCountry(null);
    setMapTooltip(null);
    setActiveTab('overview');
    syncDatasetToMemberProfile([]);
  };
  const parseExcelDate = (excelDate) => {
    if (!excelDate) return null;
    if (typeof excelDate === 'string') {
      const parsed = new Date(excelDate);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  };

  const fetchCountryData = async (movies, _apiKey) => {
    if (!movies?.length) return movies;

    setFetchingCountries(true);
    setFetchProgress({ current: 0, total: movies.length });

    const cache = JSON.parse(localStorage.getItem('countryCache') || '{}');
    const updated = [];
    const resolvedCountries = {};
    const BATCH_SIZE = 60;

    try {
      for (let i = 0; i < movies.length; i += BATCH_SIZE) {
        const batch = movies.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (movie) => {
          const key = `${movie.title}_${movie.year}`;
          const overrideKey = movieCountryKey(movie);
          if (hasUsableCountryName(cache[key])) {
            resolvedCountries[overrideKey] = cache[key];
            return { ...movie, country: cache[key] };
          }

          const cleanTitle = cleanTitleForOmdb(movie.title);

          try {
            const cached = await getMovieMetadataCache({
              title: movie.title,
              year: movie.year,
              imdbId: movie.imdbId || movie.imdbID || null,
            });
            if (cached?.country) {
              cache[key] = cached.country;
              resolvedCountries[overrideKey] = cached.country;
              return { ...movie, country: cached.country };
            }

            let json = null;
            const movieImdbId = String(movie?.imdbId || movie?.imdbID || '').trim();
            if (movieImdbId) {
              json = await fetchOmdbWithFallback((key) =>
                `https://www.omdbapi.com/?i=${encodeURIComponent(movieImdbId)}&apikey=${key}`
              );
            }
            if (!json || json?.Response !== 'True') {
              json = await fetchOmdbWithFallback((key) =>
                `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitle)}&y=${movie.year}&apikey=${key}`
              );
            }

            if (json?.Response === 'True' && json.Country) {
              const country = json.Country.split(',')[0].trim();
              cache[key] = country;
              resolvedCountries[overrideKey] = country;
              setOmdbCache({ title: movie.title, year: movie.year, imdbId: movie.imdbId || movie.imdbID || null, payload: json });
              return { ...movie, country };
            }
          } catch {
            // Ignore lookup failures and keep country as Unknown.
          }

          return movie;
        });

        const results = await Promise.all(promises);
        updated.push(...results);
        setFetchProgress({ current: updated.length, total: movies.length });
      }
    } finally {
      localStorage.setItem('countryCache', JSON.stringify(cache));
      if (Object.keys(resolvedCountries).length) {
        setCountryOverrides((prev) => ({ ...prev, ...resolvedCountries }));
      }
      setFetchingCountries(false);
    }

    return updated;
  };

  const retryCountryMapping = async () => {
    if (!Array.isArray(data) || !data.length || fetchingCountries) return;
    lastCountryFetchAttemptAtRef.current = 0;
    const enriched = await fetchCountryData(data, OMDB_API_KEY);
    if (enriched?.length) persistDataset(enriched, fileName || 'IMDb Ratings');
  };

  const getMovieCountry = (movie) => {
    const direct = String(movie?.country || '').trim();
    if (hasUsableCountryName(direct)) return direct;
    return countryOverrides[movieCountryKey(movie)] || '';
  };

  const _getFeatureName = (feature) => {
    return (
      feature?.properties?.name ||
      feature?.properties?.NAME ||
      feature?.properties?.admin ||
      feature?.properties?.ADMIN ||
      feature?.id ||
      ''
    );
  };
  const normalizeCountryName = (country) => {
    if (!country) return '';
    const value = String(country).trim();
    if (!value) return '';

    const aliases = {
      USA: 'United States of America',
      'U.S.A.': 'United States of America',
      'U.S.': 'United States of America',
      US: 'United States of America',
      UK: 'United Kingdom',
      'U.K.': 'United Kingdom',
      Russia: 'Russian Federation',
      Korea: 'South Korea',
      'Republic of Korea': 'South Korea',
      'Korea, South': 'South Korea',
      'Korea, Republic of': 'South Korea',
      'North Korea': "Democratic People's Republic of Korea",
      'Czech Republic': 'Czechia',
      Iran: 'Iran, Islamic Republic of',
      Syria: 'Syrian Arab Republic',
      Bolivia: 'Bolivia, Plurinational State of',
      Venezuela: 'Venezuela, Bolivarian Republic of',
      Moldova: 'Moldova, Republic of',
      Taiwan: 'Taiwan, Province of China',
      Palestine: 'Palestine, State of',
      Vietnam: 'Viet Nam',
      Brunei: 'Brunei Darussalam',
      Laos: "Lao People's Democratic Republic",
      'Ivory Coast': "Cote d'Ivoire",
      'Cape Verde': 'Cabo Verde',
      Swaziland: 'Eswatini',
      Macedonia: 'North Macedonia',
      Burma: 'Myanmar',
      'The Netherlands': 'Netherlands',
      UAE: 'United Arab Emirates',
      Turkiye: 'Turkey',
      'Trkiye': 'Turkey',
    };

    return aliases[value] || value;
  };

  const getCountryMatchKeys = (country) => {
    const normalized = normalizeCountryName(country);
    const keys = new Set([countryLookupKey(country), countryLookupKey(normalized)]);
    const aliasGroups = [
      ['USA', 'US', 'United States', 'United States of America', 'America'],
      ['UK', 'U.K.', 'United Kingdom', 'Great Britain'],
      ['Russia', 'Russian Federation'],
      ['South Korea', 'Korea, South', 'Republic of Korea', 'Korea, Republic of'],
      ['North Korea', "Democratic People's Republic of Korea"],
      ['Iran', 'Iran, Islamic Republic of'],
      ['Vietnam', 'Viet Nam'],
      ['Turkey', 'Turkiye', 'Trkiye'],
      ['Czech Republic', 'Czechia'],
      ["Ivory Coast", "Cote d'Ivoire"],
      ['Syria', 'Syrian Arab Republic'],
      ['Bolivia', 'Bolivia, Plurinational State of'],
      ['Venezuela', 'Venezuela, Bolivarian Republic of'],
      ['Moldova', 'Moldova, Republic of'],
      ['Taiwan', 'Taiwan, Province of China'],
      ['Palestine', 'Palestine, State of'],
      ['Laos', "Lao People's Democratic Republic"],
      ['Brunei', 'Brunei Darussalam'],
      ['Cape Verde', 'Cabo Verde'],
      ['Swaziland', 'Eswatini'],
      ['Macedonia', 'North Macedonia'],
      ['Burma', 'Myanmar'],
      ['The Netherlands', 'Netherlands'],
      ['UAE', 'United Arab Emirates'],
    ];
    const countryKeys = new Set([countryLookupKey(country), countryLookupKey(normalized)]);
    aliasGroups.forEach((group) => {
      const groupKeys = group.map(countryLookupKey);
      if (groupKeys.some((key) => countryKeys.has(key))) {
        groupKeys.forEach((key) => keys.add(key));
      }
    });
    return Array.from(keys).filter(Boolean);
  };

  const getFeatureCountryName = (feature) => {
    const raw =
      feature?.properties?.name ||
      feature?.properties?.NAME ||
      feature?.properties?.ADMIN ||
      feature?.properties?.admin ||
      feature?.properties?.sovereignt ||
      feature?.properties?.SOVEREIGNT ||
      feature?.id ||
      '';

    return normalizeCountryName(raw);
  };


  const getCountryPreference = (minRating = 8, timeRange = 'all') => {
    if (!data) return [];

    const currentYear = new Date().getFullYear();
    const countryStats = {};

    data.forEach((movie) => {
      const rating = Number(movie?.yourRating) || 0;
      if (rating < minRating) return;

      const releaseYear = Number(movie?.year) || 0;
      if (timeRange === 'last10' && releaseYear > 0 && releaseYear < currentYear - 9) {
        return;
      }

      const movieCountry = getMovieCountry(movie);
      if (!hasUsableCountryName(movieCountry)) return;

      const normalizedCountry = normalizeCountryName(String(movieCountry).split(',')[0].trim());
      if (!hasUsableCountryName(normalizedCountry)) return;

      countryStats[normalizedCountry] = (countryStats[normalizedCountry] || 0) + 1;
    });

    return Object.entries(countryStats)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
  };


  const getMapIntensityColor = (count) => {
    if (!count || count <= 0) return '#1e2f4d';
    if (count < 10) return '#bfdbfe';
    if (count <= 50) return '#3b82f6';
    return '#0b2a8a';
  };

  const _generateSmartTagline = (films) => {
    if (!films || films.length === 0) return '';
    
    const allGenres = [];
    const themes = {
      urban: ['city', 'urban', 'night', 'neon', 'street', 'downtown'],
      rural: ['nature', 'rural', 'country', 'farm', 'village', 'small town'],
      psychological: ['mind', 'identity', 'memory', 'dream', 'reality', 'split', 'disorder'],
      relationship: ['love', 'relationship', 'family', 'marriage', 'friend', 'connection'],
      conflict: ['war', 'fight', 'battle', 'conflict', 'revolution', 'resistance'],
      moral: ['moral', 'ethic', 'choice', 'guilt', 'redemption', 'justice'],
      emotional: ['emotion', 'feeling', 'cry', 'tears', 'heart', 'soul'],
      tension: ['thriller', 'suspense', 'fear', 'danger', 'mystery', 'secret'],
    };
    
    const decadeVibes = {
      '1910': 'Silent era elegance',
      '1920': 'Golden age glamour',
      '1930': 'Noir shadows',
      '1940': 'Wartime resolve',
      '1950': 'Post-war complexity',
      '1960': 'Revolutionary spirit',
      '1970': 'Gritty realism',
      '1980': 'Excess and neon',
      '1990': 'Alternative grit',
      '2000': 'Digital dawn',
      '2010': 'Streaming era depth',
      '2020': 'Modern chaos',
    };

    films.forEach(f => {
      const genres = (f.genres || '').split(',').map(g => g.trim().toLowerCase());
      allGenres.push(...genres);
    });

    // Count genre themes
    const genreCounts = {};
    allGenres.forEach(g => {
      genreCounts[g] = (genreCounts[g] || 0) + 1;
    });

    // Detect themes in genres
    const detectedThemes = [];
    Object.entries(themes).forEach(([theme, keywords]) => {
      const hasMatch = allGenres.some(g => keywords.some(k => g.includes(k)));
      if (hasMatch) detectedThemes.push(theme);
    });

    // Get decade
    const years = films.map(f => f.year).filter(y => y >= 1910);
    const avgYear = years.length > 0 ? years.reduce((a, b) => a + b, 0) / years.length : 2010;
    const decade = Math.floor(avgYear / 10) * 10;

    // Build tagline
    let tagline = '';
    
    // Theme-based
    if (detectedThemes.includes('psychological')) {
      tagline = 'Dreams, memory, and fractured identity';
    } else if (detectedThemes.includes('urban')) {
      tagline = 'Urban loneliness in neon-lit cities';
    } else if (detectedThemes.includes('tension')) {
      tagline = 'Slow-burning psychological tension';
    } else if (detectedThemes.includes('relationship')) {
      tagline = 'Hearts intertwined across time';
    } else if (detectedThemes.includes('conflict')) {
      tagline = 'Battle lines drawn in blood and ideology';
    } else if (detectedThemes.includes('moral')) {
      tagline = 'Slow-burning moral dilemmas';
    } else if (detectedThemes.includes('emotional')) {
      tagline = 'Tears that wash away the soul';
    } else if (detectedThemes.includes('rural')) {
      tagline = 'Simplicity in the heartland';
    } else {
      // Use decade-based fallback
      tagline = decadeVibes[String(decade)] || 'Cinema captured in time';
    }

    // Add runtime nuance
    const avgRuntime = films.reduce((s, f) => s + (f.runtime || 0), 0) / films.length;
    if (avgRuntime > 160) {
      tagline = 'Epic journeys through time';
    } else if (avgRuntime < 90) {
      tagline = 'Moments that last forever';
    }

    return tagline;
  };

  const _calculateVibeStrength = (films) => {
    if (!films || films.length < 2) return 0;

    const genreSets = films.map(f => new Set((f.genres || '').split(',').map(g => g.trim().toLowerCase())));
    const years = films.map(f => f.year).filter(y => y > 1900);
    
    // Genre cohesion (Jaccard similarity)
    let totalGenreSimilarity = 0;
    for (let i = 0; i < genreSets.length; i++) {
      for (let j = i + 1; j < genreSets.length; j++) {
        const intersection = new Set([...genreSets[i]].filter(x => genreSets[j].has(x)));
        const union = new Set([...genreSets[i], ...genreSets[j]]);
        totalGenreSimilarity += intersection.size / union.size;
      }
    }
    const genreCohesion = genreSets.length > 1 ? totalGenreSimilarity / (genreSets.length * (genreSets.length - 1) / 2) : 0;

    // Year consistency
    let yearVariance = 0;
    if (years.length > 1) {
      const meanYear = years.reduce((a, b) => a + b, 0) / years.length;
      yearVariance = Math.sqrt(years.reduce((s, y) => s + Math.pow(y - meanYear, 2), 0) / years.length);
    }
    const yearCohesion = Math.max(0, 1 - yearVariance / 50); // Less than 50 years variance = good

    // Combined vibe strength
    const vibeStrength = Math.round((genreCohesion * 0.7 + yearCohesion * 0.3) * 100);
    return Math.min(100, Math.max(0, vibeStrength));
  };

  // ============ TASTE CARD CALCULATIONS ============
  const calculateSpectrums = (films) => {
    if (!films || films.length === 0) return null;

    // Light  Dark (based on genres)
    const darkGenres = ['horror', 'thriller', 'crime', 'drama', 'war', 'mystery'];
    const lightGenres = ['comedy', 'animation', 'family', 'musical', 'romance', 'adventure'];
    let darkScore = 0, lightScore = 0;
    
    films.forEach(f => {
      const genres = (f.genres || '').toLowerCase();
      darkGenres.forEach(g => { if (genres.includes(g)) darkScore++; });
      lightGenres.forEach(g => { if (genres.includes(g)) lightScore++; });
    });
    const lightDarkValue = films.length ? Math.min(100, Math.max(0, 50 + ((darkScore - lightScore) / films.length) * 50)) : 50;

    // Slow Burn  Fast Paced (runtime + genres)
    const slowGenres = ['drama', 'biography', 'history', 'documentary'];
    const fastGenres = ['action', 'thriller', 'horror', 'comedy'];
    let slowScore = 0, fastScore = 0;
    films.forEach(f => {
      const genres = (f.genres || '').toLowerCase();
      const runtime = f.runtime || 120;
      slowGenres.forEach(g => { if (genres.includes(g)) slowScore++; });
      fastGenres.forEach(g => { if (genres.includes(g)) fastScore++; });
      if (runtime > 150) slowScore += 0.5;
      if (runtime < 90) fastScore += 0.5;
    });
    const paceValue = films.length ? Math.min(100, Math.max(0, 50 + ((fastScore - slowScore) / films.length) * 50)) : 50;

    // Mainstream  Niche (vote count)
    const MAINSTREAM = 100000;
    const NICHE = 5000;
    let mainstream = 0, niche = 0;
    films.forEach(f => {
      const votes = f.numVotes || 0;
      if (votes >= MAINSTREAM) mainstream++;
      else if (votes <= NICHE) niche++;
    });
    const nicheValue = films.length ? Math.min(100, Math.max(0, ((niche - mainstream) / films.length + 0.5) * 100)) : 50;

    // Realistic  Surreal
    const realisticGenres = ['documentary', 'drama', 'biography', 'history', 'war', 'sport'];
    const surrealGenres = ['fantasy', 'sci-fi', 'animation', 'horror', 'mystery'];
    let realisticScore = 0, surrealScore = 0;
    films.forEach(f => {
      const genres = (f.genres || '').toLowerCase();
      realisticGenres.forEach(g => { if (genres.includes(g)) realisticScore++; });
      surrealGenres.forEach(g => { if (genres.includes(g)) surrealScore++; });
    });
    const surrealValue = films.length ? Math.min(100, Math.max(0, 50 + ((surrealScore - realisticScore) / films.length) * 50)) : 50;

    // Indie  Big Budget
    const indieGenres = ['drama', 'comedy', 'thriller', 'horror'];
    const bigBudgetGenres = ['action', 'adventure', 'sci-fi', 'fantasy'];
    let indieScore = 0, bigScore = 0;
    films.forEach(f => {
      const genres = (f.genres || '').toLowerCase();
      const votes = f.numVotes || 0;
      indieGenres.forEach(g => { if (genres.includes(g) && votes < 50000) indieScore++; });
      bigBudgetGenres.forEach(g => { if (genres.includes(g) && votes > 100000) bigScore++; });
    });
    const bigBudgetValue = films.length ? Math.min(100, Math.max(0, 50 + ((bigScore - indieScore) * 50) / films.length)) : 50;

    // Dialogue Heavy  Visual Storytelling
    const dialogueGenres = ['drama', 'romance', 'comedy', 'biography'];
    const visualGenres = ['animation', 'action', 'sci-fi', 'fantasy', 'music'];
    let dialogueScore = 0, visualScore = 0;
    films.forEach(f => {
      const genres = (f.genres || '').toLowerCase();
      const runtime = f.runtime || 120;
      dialogueGenres.forEach(g => { if (genres.includes(g) && runtime < 130) dialogueScore++; });
      visualGenres.forEach(g => { if (genres.includes(g)) visualScore++; });
    });
    const visualValue = films.length ? Math.min(100, Math.max(0, 50 + ((visualScore - dialogueScore) / films.length) * 50)) : 50;

    // Optimistic  Bleak
    const optimisticGenres = ['comedy', 'romance', 'animation', 'adventure', 'family'];
    const bleakGenres = ['horror', 'thriller', 'drama', 'war', 'crime'];
    let optimisticScore = 0, bleakScore = 0;
    films.forEach(f => {
      const genres = (f.genres || '').toLowerCase();
      optimisticGenres.forEach(g => { if (genres.includes(g)) optimisticScore++; });
      bleakGenres.forEach(g => { if (genres.includes(g)) bleakScore++; });
    });
    const bleakValue = films.length ? Math.min(100, Math.max(0, 50 + ((bleakScore - optimisticScore) / films.length) * 50)) : 50;

    return [
      { left: 'Light', right: 'Dark', value: lightDarkValue },
      { left: 'Slow Burn', right: 'Fast Paced', value: paceValue },
      { left: 'Mainstream', right: 'Niche', value: nicheValue },
      { left: 'Realistic', right: 'Surreal', value: surrealValue },
      { left: 'Indie', right: 'Big Budget', value: bigBudgetValue },
      { left: 'Dialogue', right: 'Visual', value: visualValue },
      { left: 'Optimistic', right: 'Bleak', value: bleakValue },
    ];
  };

  const calculatePopularityBuckets = (films) => {
    if (!films || films.length === 0) return [];
    const MAINSTREAM = 100000;
    const MIDTIER = 20000;
    let mainstream = 0, midtier = 0, niche = 0;
    films.forEach(f => {
      const votes = f.numVotes || 0;
      if (votes >= MAINSTREAM) mainstream++;
      else if (votes >= MIDTIER) midtier++;
      else niche++;
    });
    return [
      { label: 'Mainstream', count: mainstream, percentage: Math.round(mainstream / films.length * 100) },
      { label: 'Mid-tier', count: midtier, percentage: Math.round(midtier / films.length * 100) },
      { label: 'Niche', count: niche, percentage: Math.round(niche / films.length * 100) },
    ];
  };

  const calculateDecadeDistribution = (films) => {
    if (!films || films.length === 0) return [];
    const decades = {};
    films.forEach(f => {
      const year = f.year || 2000;
      const dec = Math.floor(year / 10) * 10;
      decades[dec] = (decades[dec] || 0) + 1;
    });
    return Object.entries(decades)
      .sort((a, b) => b[0] - a[0])
      .map(([dec, count]) => ({
        decade: dec,
        count,
        percentage: films.length ? Math.round(count / films.length * 100) : 0,
      }));
  };

  const calculateRuntimeDistribution = (films) => {
    if (!films || films.length === 0) return { buckets: [], totalHours: 0 };
    const buckets = [
      { label: '< 90 min', min: 0, max: 90, count: 0 },
      { label: '90-120 min', min: 90, max: 120, count: 0 },
      { label: '120-150 min', min: 120, max: 150, count: 0 },
      { label: '150+ min', min: 150, max: 9999, count: 0 },
    ];
    let totalMinutes = 0;
    films.forEach(f => {
      const runtime = f.runtime || 0;
      totalMinutes += runtime;
      buckets.forEach(b => {
        if (runtime >= b.min && runtime < b.max) b.count++;
      });
    });
    const totalHours = Math.round(totalMinutes / 60);
    return {
      buckets: buckets.map(b => ({
        ...b,
        percentage: films.length ? Math.round(b.count / films.length * 100) : 0,
      })),
      totalHours,
    };
  };

  // ============ END TASTE CARD CALCULATIONS ============

  const toFilmKey = (film) => `${String(film?.title || '').trim().toLowerCase()}__${Number(film?.year) || 0}`;
  const uniqueWords = (text) =>
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && w.length > 2);

  const jaccard = (a, b) => {
    const aa = new Set(a || []);
    const bb = new Set(b || []);
    if (!aa.size && !bb.size) return 1;
    const inter = [...aa].filter((x) => bb.has(x)).length;
    const union = new Set([...aa, ...bb]).size || 1;
    return inter / union;
  };

  const cosineFromMaps = (a, b) => {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    if (!keys.size) return 1;
    let dot = 0;
    let sa = 0;
    let sb = 0;
    keys.forEach((k) => {
      const av = Number(a?.[k] || 0);
      const bv = Number(b?.[k] || 0);
      dot += av * bv;
      sa += av * av;
      sb += bv * bv;
    });
    const denom = Math.sqrt(sa) * Math.sqrt(sb);
    if (!denom) return 0;
    return dot / denom;
  };

  const _getSuggestions = (films, allData) => {
    if (!films || films.length < 3 || !allData || allData.length === 0) return [];

    // Analyze moodboard
    const moodGenres = {};
    const moodDecades = {};
    let moodRatingSum = 0;
    
    films.forEach(f => {
      (f.genres || '').split(',').map(g => g.trim()).filter(Boolean).forEach(g => {
        moodGenres[g] = (moodGenres[g] || 0) + 1;
      });
      const dec = Math.floor((f.year || 2000) / 10) * 10;
      moodDecades[dec] = (moodDecades[dec] || 0) + 1;
      moodRatingSum += f.yourRating || 0;
    });

    const moodAvgRating = moodRatingSum / films.length;
    const topMoodGenres = Object.entries(moodGenres).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g.toLowerCase());

    // Score all non-moodboard films
    const scored = allData
      .filter(f => !films.some(mf => mf.title === f.title && mf.year === f.year))
      .map(f => {
        const filmGenres = (f.genres || '').split(',').map(g => g.trim().toLowerCase());
        const filmDecade = Math.floor((f.year || 2000) / 10) * 10;
        
        // Genre match score
        let genreScore = 0;
        topMoodGenres.forEach(mg => {
          if (filmGenres.some(fg => fg.includes(mg) || mg.includes(fg))) {
            genreScore += 3;
          }
        });

        // Decade match
        const decadeMatch = Object.keys(moodDecades).includes(String(filmDecade)) ? 2 : 0;

        // Rating similarity
        const ratingDiff = Math.abs((f.yourRating || 0) - moodAvgRating);
        const ratingScore = ratingDiff < 1 ? 3 : ratingDiff < 2 ? 1 : 0;

        return {
          ...f,
          score: genreScore + decadeMatch + ratingScore,
        };
      })
      .filter(f => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return scored;
  };

  const saveMoodboards = (nextOrUpdater) => {
    setMoodboards((prev) => {
      const next =
        typeof nextOrUpdater === 'function'
          ? nextOrUpdater(prev)
          : nextOrUpdater;
      writeMoodboardsLocalCache(next);
      return next;
    });
  };

  const createMoodboard = (title) => {
    const newBoard = {
      id: Date.now(),
      title,
      films: [],
      createdAt: new Date().toISOString(),
    };
    saveMoodboards((prev) => [...prev, newBoard]);
    setActiveMoodboard(newBoard.id);
    setShowCreateModal(false);
    setNewMoodboardTitle('');
  };

  const addFilmsToMoodboard = (boardId, films) => {
    if (!Array.isArray(films) || films.length === 0) return;
    saveMoodboards((prev) =>
      prev.map((board) => {
        if (String(board.id) !== String(boardId)) return board;
        const existing = new Set((board.films || []).map((f) => `${String(f?.title || '').toLowerCase()}::${Number(f?.year) || 0}`));
        const toAdd = films.filter((film) => {
          const key = `${String(film?.title || '').toLowerCase()}::${Number(film?.year) || 0}`;
          if (existing.has(key)) return false;
          existing.add(key);
          return true;
        });
        return toAdd.length ? { ...board, films: [...board.films, ...toAdd] } : board;
      })
    );
  };

  const removeFilmFromMoodboard = (boardId, filmIndex) => {
    saveMoodboards((prev) =>
      prev.map((b) => {
        if (String(b.id) === String(boardId)) {
          return { ...b, films: b.films.filter((_, i) => i !== filmIndex) };
        }
        return b;
      })
    );
  };

  const deleteMoodboard = (boardId) => {
    saveMoodboards((prev) => prev.filter((b) => String(b.id) !== String(boardId)));
    if (String(activeMoodboard) === String(boardId)) {
      setActiveMoodboard(null);
    }
  };

  const displayedMoodboards = memberViewUserId ? memberViewMoodboards : moodboards;
  const currentMoodboard = displayedMoodboards.find(b => b.id === activeMoodboard);
  React.useEffect(() => {
    if (!displayedMoodboards.length) {
      if (activeMoodboard !== null) setActiveMoodboard(null);
      return;
    }
    const hasActive = displayedMoodboards.some((b) => String(b?.id) === String(activeMoodboard));
    if (!hasActive) {
      setActiveMoodboard(displayedMoodboards[0].id);
    }
  }, [displayedMoodboards, activeMoodboard]);
  const pendingMoodboardFilms = useMemo(() => {
    if (!pendingMoodboardFilmKeys.length || !data?.length) return [];
    const keys = new Set(pendingMoodboardFilmKeys);
    return data.filter((film) => keys.has(`${String(film?.title || '').toLowerCase()}::${Number(film?.year) || 0}`));
  }, [pendingMoodboardFilmKeys, data]);
  const moodboardGenreOptions = useMemo(() => {
    if (!data?.length) return [];
    const set = new Set();
    data.forEach((film) => {
      (film?.genres || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => set.add(g));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);
  const moodboardDecadeOptions = useMemo(() => {
    if (!data?.length) return [];
    const set = new Set();
    data.forEach((film) => {
      const year = Number(film?.year);
      if (Number.isFinite(year) && year > 1800) {
        set.add(`${Math.floor(year / 10) * 10}s`);
      }
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [data]);
  const moodboardYearOptions = useMemo(() => {
    if (!data?.length) return [];
    const set = new Set();
    data.forEach((film) => {
      const year = Number(film?.year);
      if (Number.isFinite(year) && year > 1800) {
        set.add(year);
      }
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [data]);
  const moodboardCountryOptions = useMemo(() => {
    if (!data?.length) return [];
    const set = new Set();
    data.forEach((film) => {
      const rawCountry = String(getMovieCountry(film)).split(',')[0]?.trim();
      const normalized = normalizeCountryName(rawCountry);
      if (normalized) set.add(normalized);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);
  const moodboardDirectorOptions = useMemo(() => {
    if (!data?.length) return [];
    const set = new Set();
    data.forEach((film) => {
      String(film?.directors || '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
        .forEach((d) => set.add(d));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);
  const filteredMoodboardFilms = useMemo(() => {
    if (!data?.length) return [];
    const board = moodboards.find((b) => b.id === activeMoodboard);
    const existing = new Set((board?.films || []).map((f) => `${String(f.title || '').toLowerCase()}::${Number(f.year) || 0}`));
    const q = moodboardFilmSearch.trim().toLowerCase();
    const minRating = moodboardMinRatingFilter === 'all' ? null : Number(moodboardMinRatingFilter);

    return data
      .filter((film) => {
        if (!film) return false;
        const title = String(film.title || '');
        const year = Number(film.year) || 0;
        if (existing.has(`${title.toLowerCase()}::${year}`)) return false;
        if (q && !title.toLowerCase().includes(q)) return false;
        if (moodboardGenreFilter !== 'all') {
          const genres = String(film.genres || '')
            .split(',')
            .map((g) => g.trim().toLowerCase())
            .filter(Boolean);
          if (!genres.includes(moodboardGenreFilter.toLowerCase())) return false;
        }
        if (moodboardDecadeFilter !== 'all') {
          const decade = `${Math.floor((Number(film.year) || 0) / 10) * 10}s`;
          if (decade !== moodboardDecadeFilter) return false;
        }
        if (moodboardYearFilter !== 'all' && String(Number(film.year) || '') !== moodboardYearFilter) return false;
        if (moodboardCountryFilter !== 'all') {
          const filmCountry = normalizeCountryName(String(getMovieCountry(film)).split(',')[0]?.trim());
          if (filmCountry !== moodboardCountryFilter) return false;
        }
        if (moodboardDirectorFilter !== 'all') {
          const filmDirectors = String(film?.directors || '')
            .split(',')
            .map((d) => d.trim().toLowerCase())
            .filter(Boolean);
          if (!filmDirectors.includes(moodboardDirectorFilter.toLowerCase())) return false;
        }
        if (minRating !== null && (Number(film.yourRating) || 0) < minRating) return false;
        return true;
      })
      .sort((a, b) => (Number(b.yourRating) || 0) - (Number(a.yourRating) || 0))
      .slice(0, 400);
  }, [data, moodboards, activeMoodboard, moodboardFilmSearch, moodboardGenreFilter, moodboardDecadeFilter, moodboardYearFilter, moodboardCountryFilter, moodboardDirectorFilter, moodboardMinRatingFilter]);

  const getCinematicPersonality = () => {
    if (!data || data.length === 0) return null;

    // 1. Compute metrics
    const genreCounts = {};
    const decadeCounts = {};
    const runtimeSum = { total: 0, count: 0 };
    const voteCounts = { mainstream: 0, niche: 0 };
    const ratings = [];

    const MAINSTREAM_VOTE_THRESHOLD = 50000;

    data.forEach(movie => {
      // Genre analysis
      (movie.genres || '').split(',').map(g => g.trim()).filter(Boolean).forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });

      // Decade analysis
      if (movie.year >= 1900 && movie.year <= 2025) {
        const dec = Math.floor(movie.year / 10) * 10;
        decadeCounts[dec] = (decadeCounts[dec] || 0) + 1;
      }

      // Runtime
      if (movie.runtime > 0) {
        runtimeSum.total += movie.runtime;
        runtimeSum.count++;
      }

      // Mainstream vs Niche
      if (movie.numVotes >= MAINSTREAM_VOTE_THRESHOLD) {
        voteCounts.mainstream++;
      } else {
        voteCounts.niche++;
      }

      // Ratings
      if (movie.yourRating > 0) {
        ratings.push(movie.yourRating);
      }
    });

    // Get top 3 genres
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    // Get most watched decade
    const mostWatchedDecade = Object.entries(decadeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '2010s';

    // Calculate averages
    const avgRuntime = runtimeSum.count > 0 ? Math.round(runtimeSum.total / runtimeSum.count) : 0;
    const avgRating = ratings.length > 0 
      ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) 
      : 0;
    const nichePercentage = data.length > 0 
      ? Math.round((voteCounts.niche / data.length) * 100) 
      : 0;

    // Determine dominant genre for colors
    const dominantGenre = topGenres[0] || 'Drama';

    // 2. Generate personality based on metrics
    const personality = generatePersonality({
      topGenres,
      dominantGenre,
      mostWatchedDecade,
      avgRuntime,
      avgRating,
      nichePercentage,
      totalFilms: data.length,
    });

    return {
      topGenres,
      mostWatchedDecade,
      avgRuntime,
      avgRating,
      nichePercentage,
      dominantGenre,
      ...personality,
    };
  };

  const generatePersonality = ({ topGenres, dominantGenre: _dominantGenre, mostWatchedDecade, avgRuntime, avgRating, nichePercentage, totalFilms: _totalFilms }) => {
    // Determine archetype based on combinations
    let archetype, description, traits;

    const hasSciFi = topGenres.some(g => g.toLowerCase().includes('sci-fi') || g.toLowerCase().includes('science'));
    const hasHorror = topGenres.some(g => g.toLowerCase().includes('horror'));
    const hasRomance = topGenres.some(g => g.toLowerCase().includes('romance'));
    const hasThriller = topGenres.some(g => g.toLowerCase().includes('thriller'));
    const hasDocumentary = topGenres.some(g => g.toLowerCase().includes('documentary'));
    const hasClassic = parseInt(mostWatchedDecade) < 1980;
    const isNiche = nichePercentage > 60;
    const lovesLong = avgRuntime > 140;
    const lovesShort = avgRuntime < 100;
    const isHarsh = parseFloat(avgRating) < 6.5;
    const isGenerous = parseFloat(avgRating) >= 8;

    // Archetype selection logic
    if (hasHorror && isNiche) {
      archetype = "The Dark Visionary";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Emotionally Restless", "Morally Ambiguous", "Psychological Realism", "Melancholic Core", "Late-Night Cinema"];
    } else if (hasSciFi && isNiche) {
      archetype = "The Future Dreamer";
      description = "Your ratings suggest a deep attraction to emotionally fractured worlds, morally uncertain characters, and cinema that values atmosphere as much as narrative.";
      traits = ["Visual Obsessive", "Narrative Minimalist", "Genre Subverter", "Atmosphere Oriented", "Auteur Driven"];
    } else if (hasRomance && lovesLong) {
      archetype = "The Romantic Idealist";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Humanist Leaning", "Intimacy Focused", "Memory-Driven", "Atmosphere Oriented", "Emotionally Restless"];
    } else if (hasThriller && lovesShort) {
      archetype = "The Adrenaline Minimalist";
      description = "Your ratings suggest a deep attraction to emotionally fractured worlds, morally uncertain characters, and cinema that values atmosphere as much as narrative.";
      traits = ["Narrative Minimalist", "Morally Ambiguous", "Late-Night Cinema", "Psychological Realism", "Genre Subverter"];
    } else if (hasDocumentary && isNiche) {
      archetype = "The Truth Seeker";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Humanist Leaning", "Psychological Realism", "Slow Cinema Friendly", "Intimacy Focused", "Auteur Driven"];
    } else if (hasClassic && lovesLong) {
      archetype = "The Classicist";
      description = "Your ratings suggest a deep attraction to emotionally fractured worlds, morally uncertain characters, and cinema that values atmosphere as much as narrative.";
      traits = ["Auteur Driven", "Slow Cinema Friendly", "Visual Obsessive", "Memory-Driven", "Narrative Minimalist"];
    } else if (parseInt(mostWatchedDecade) >= 2010 && isNiche) {
      archetype = "The Indie Spirit";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Genre Subverter", "Narrative Minimalist", "Atmosphere Oriented", "Emotionally Restless", "Intimacy Focused"];
    } else if (parseInt(mostWatchedDecade) >= 1980 && parseInt(mostWatchedDecade) < 2010) {
      archetype = "The Neon Realist";
      description = "Your ratings suggest a deep attraction to emotionally fractured worlds, morally uncertain characters, and cinema that values atmosphere as much as narrative.";
      traits = ["Morally Ambiguous", "Late-Night Cinema", "Visual Obsessive", "Psychological Realism", "Melancholic Core"];
    } else if (isGenerous && topGenres.length >= 2) {
      archetype = "The Emotional Explorer";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Emotionally Restless", "Humanist Leaning", "Intimacy Focused", "Memory-Driven", "Atmosphere Oriented"];
    } else if (nichePercentage < 30) {
      archetype = "The Cultural Connoisseur";
      description = "Your ratings suggest a deep attraction to emotionally fractured worlds, morally uncertain characters, and cinema that values atmosphere as much as narrative.";
      traits = ["Auteur Driven", "Visual Obsessive", "Genre Subverter", "Humanist Leaning", "Psychological Realism"];
    } else if (lovesShort && isHarsh) {
      archetype = "The Brutalist";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Narrative Minimalist", "Morally Ambiguous", "Atmosphere Oriented", "Late-Night Cinema", "Slow Cinema Friendly"];
    } else if (lovesLong && isGenerous) {
      archetype = "The Epic Dreamer";
      description = "Your ratings suggest a deep attraction to emotionally fractured worlds, morally uncertain characters, and cinema that values atmosphere as much as narrative.";
      traits = ["Slow Cinema Friendly", "Auteur Driven", "Visual Obsessive", "Memory-Driven", "Melancholic Core"];
    } else {
      archetype = "The Eclectic Soul";
      description = "You gravitate toward films where emotion lives beneath restraint, with stories shaped by ambiguity, tension, and quiet psychological intensity.";
      traits = ["Genre Subverter", "Emotionally Restless", "Atmosphere Oriented", "Psychological Realism", "Intimacy Focused"];
    }

    return { archetype, description, traits };
  };

  const getCinematicPatterns = () => {
    if (!data || data.length === 0) return null;

    const directorCounts = {};
    const genreSet = new Set();
    const decadeCounts = {};
    const runtimeSum = { total: 0, count: 0 };
    const voteCounts = [];
    const ratingSum = { total: 0, count: 0 };
    const ratingValues = [];

    const MAINSTREAM_VOTE_THRESHOLD = 50000;

    data.forEach(movie => {
      // Director analysis
      (movie.directors || '').split(',').map(d => d.trim()).filter(Boolean).forEach(d => {
        directorCounts[d] = (directorCounts[d] || 0) + 1;
      });

      // Genre analysis
      (movie.genres || '').split(',').map(g => g.trim()).filter(Boolean).forEach(g => {
        genreSet.add(g);
      });

      // Decade analysis
      if (movie.year >= 1900) {
        const dec = Math.floor(movie.year / 10) * 10;
        decadeCounts[dec] = (decadeCounts[dec] || 0) + 1;
      }

      // Runtime
      if (movie.runtime > 0) {
        runtimeSum.total += movie.runtime;
        runtimeSum.count++;
      }

      // Votes
      voteCounts.push(movie.numVotes || 0);

      // Rating
      if (movie.yourRating > 0) {
        ratingSum.total += movie.yourRating;
        ratingSum.count++;
        ratingValues.push(movie.yourRating);
      }
    });

    // Calculate metrics
    const totalFilms = data.length;
    const directorCount = Object.keys(directorCounts).length;
    const oneTimeDirectors = Object.values(directorCounts).filter(c => c === 1).length;
    const repeatDirectors = directorCount - oneTimeDirectors;

    const explorationScore = directorCount > 0 ? Math.round((oneTimeDirectors / directorCount) * 100) : 0;
    const loyaltyScore = directorCount > 0 ? Math.round((repeatDirectors / directorCount) * 100) : 0;

    // Era bias
    const eraEntries = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1]);
    const dominantDecade = eraEntries[0]?.[0] || '2010';
    const eraPercentage = eraEntries[0] ? Math.round((eraEntries[0][1] / totalFilms) * 100) : 0;

    // Genre breadth
    const genreBreadth = genreSet.size;

    // Compute top genres for behavior summary
    const genreCounts = {};
    data.forEach(movie => {
      (movie.genres || '').split(',').map(g => g.trim()).filter(Boolean).forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });
    const topGenresList = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    // Rating consistency (based on standard deviation of your ratings)
    const avgRuntime = runtimeSum.count > 0 ? runtimeSum.total / runtimeSum.count : 0;
    const avgRating = ratingSum.count > 0 ? ratingSum.total / ratingSum.count : 0;

    // Std dev is more interpretable than the old "rating * runtime" intensity.
    // Convert it to a 0-100 "consistency" score: lower spread => higher score.
    let ratingStdDev = 0;
    if (ratingValues.length > 1) {
      const mean = avgRating;
      const variance =
        ratingValues.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / ratingValues.length;
      ratingStdDev = Math.sqrt(variance);
    }
    const CONSISTENCY_STDDEV_MAX = 2.5; // ~0..2.5 covers most real-world rating spreads
    const ratingConsistency = Math.max(
      0,
      Math.min(100, Math.round((1 - ratingStdDev / CONSISTENCY_STDDEV_MAX) * 100))
    );

    // Mainstream vs Niche
    const nicheCount = voteCounts.filter(v => v < MAINSTREAM_VOTE_THRESHOLD).length;
    const mainstreamCount = totalFilms - nicheCount;
    const nicheScore = totalFilms > 0 ? Math.round((nicheCount / totalFilms) * 100) : 0;

    // Generate behavior summary
    const behaviorSummary = generateBehaviorSummary({
      explorationScore,
      loyaltyScore,
      dominantDecade,
      eraPercentage,
      genreBreadth,
      ratingConsistency,
      nicheScore,
      avgRating,
      topGenres: topGenresList,
    });

    return {
      explorationScore,
      loyaltyScore,
      dominantDecade,
      eraPercentage,
      genreBreadth,
      ratingConsistency,
      ratingStdDev: Number(ratingStdDev || 0).toFixed(2),
      nicheScore,
      mainstreamCount,
      avgRating: avgRating.toFixed(1),
      avgRuntime: Math.round(avgRuntime),
      behaviorSummary,
    };
  };

  const generateBehaviorSummary = ({ explorationScore, loyaltyScore: _loyaltyScore, dominantDecade, eraPercentage: _eraPercentage, genreBreadth: _genreBreadth, ratingConsistency, nicheScore: _nicheScore, avgRating: _avgRating, topGenres }) => {
    let summary = "Your cinematic behavior is: ";

    // Exploration vs Loyalty
    if (explorationScore > 70) {
      summary += "You explore widely, always discovering new voices. ";
    } else if (explorationScore > 40) {
      summary += "You balance exploration with loyalty to familiar filmmakers. ";
    } else {
      summary += "You're loyal to your favorite directors, revisiting their works repeatedly. ";
    }

    // Era influence
    if (parseInt(dominantDecade) < 1970) {
      summary += "You have a deep appreciation for cinema's golden age. ";
    } else if (parseInt(dominantDecade) < 1990) {
      summary += "You thrive in the era of cinematic rebellion and innovation. ";
    } else if (parseInt(dominantDecade) >= 2010) {
      summary += "You're immersed in modern storytelling. ";
    }

    // Rating consistency
    if (ratingConsistency >= 75) {
      summary += "Your ratings are consistent and decisive. ";
    } else if (ratingConsistency <= 40) {
      summary += "Your ratings are varied, embracing extremes. ";
    }

    // Genre influence
    if (topGenres.length > 0) {
      summary += `You're particularly drawn to ${topGenres.slice(0, 2).join(' and ')}.`;
    }

    return summary;
  };

  const getCinemaMindProfile = () => {
    if (!data || data.length === 0) return null;
    const metadataRows = data.filter((movie) =>
      String(movie?.genres || '').trim() || String(movie?.directors || '').trim()
    );
    if (!metadataRows.length) {
      return {
        archetypes: [],
        signals: [],
        metadataReady: 0,
        metadataTotal: data.length,
      };
    }

    const archetypeTotals = CINEMA_MIND_ARCHETYPES.reduce((acc, archetype) => {
      acc[archetype] = 0;
      return acc;
    }, {});

    let totalWeight = 0;

    metadataRows.forEach((movie) => {
      const rating = Number(movie?.yourRating);
      if (!rating) return;

      const titleType = String(movie?.titleType || '').trim().toLowerCase();
      if (titleType && titleType !== 'movie') return;

      const weight = ratingToWeight(rating);
      totalWeight += weight;

      const genres = String(movie?.genres || '')
        .split(',')
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean);

      const directors = String(movie?.directors || '')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);

      CINEMA_MIND_ARCHETYPES.forEach((archetype) => {
        const mappedGenres = GENRE_ARCHETYPE_MAP[archetype] || [];
        const genreContribution = mappedGenres.some((genre) => genres.includes(genre)) ? 1 : 0;

        let directorContribution = 0;
        directors.forEach((director) => {
          const mapped = directorArchetypeMap[director] || [];
          if (mapped.includes(archetype)) {
            directorContribution += 0.2;
          }
        });

        const contribution = genreContribution + directorContribution;
        archetypeTotals[archetype] += contribution * weight;
      });
    });

    if (totalWeight <= 0) {
      return {
        archetypes: CINEMA_MIND_ARCHETYPES.map((name) => ({ name, value: 0 })),
        signals: [],
      };
    }

    const archetypeScores = CINEMA_MIND_ARCHETYPES.reduce((acc, archetype) => {
      acc[archetype] = clamp01(archetypeTotals[archetype] / totalWeight);
      return acc;
    }, {});

    const archetypes = CINEMA_MIND_ARCHETYPES.map((name) => ({
      name,
      value: Math.round(archetypeScores[name] * 100),
    }));

    const avg = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length;

    const signals = [
      {
        name: 'Narrative Depth',
        value: Math.round(
          clamp01(
            avg(
              archetypeScores['Meaning Seekers'],
              archetypeScores['Story Lovers'],
              archetypeScores['Character Explorers']
            )
          ) * 100
        ),
      },
      {
        name: 'Visual Style',
        value: Math.round(
          clamp01(avg(archetypeScores['Visual Stylists'], archetypeScores['Myth Makers'])) * 100
        ),
      },
      {
        name: 'Atmospheric Tone',
        value: Math.round(
          clamp01(avg(archetypeScores['Visual Stylists'], archetypeScores['Emotional Viewers'])) * 100
        ),
      },
      {
        name: 'Spectacle',
        value: Math.round(clamp01(archetypeScores['Spectacle Fans']) * 100),
      },
      {
        name: 'Emotional Intensity',
        value: Math.round(
          clamp01(avg(archetypeScores['Emotional Viewers'], archetypeScores['Character Explorers'])) * 100
        ),
      },
      {
        name: 'Worldbuilding',
        value: Math.round(
          clamp01(
            avg(
              archetypeScores['World Builders'],
              archetypeScores['Myth Makers'],
              archetypeScores['Animation Admirers']
            )
          ) * 100
        ),
      },
    ];

    return {
      archetypes,
      signals,
      metadataReady: metadataRows.length,
      metadataTotal: data.length,
    };
  };

  const getSummaryStats = () => {
    if (!data?.length) return null;
    const total = data.length;
    const avgYour = (data.reduce((sum, movie) => sum + (Number(movie?.yourRating) || 0), 0) / total).toFixed(1);
    const avgDiff = (data.reduce((sum, movie) => sum + ((Number(movie?.yourRating) || 0) - (Number(movie?.imdbRating) || 0)), 0) / total).toFixed(2);

    const genreCounts = {};
    data.forEach((movie) => {
      String(movie?.genres || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((genre) => {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });
    });

    const mostRatedGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    return { totalFilms: total, avgYourRating: avgYour, avgDifference: avgDiff, mostRatedGenre };
  };

  const getMetadataStatus = () => {
    if (!Array.isArray(data) || !data.length) return { ready: 0, total: 0, percent: 0, loading: false };
    const ready = data.filter((movie) =>
      String(movie?.genres || '').trim() ||
      String(movie?.directors || '').trim() ||
      String(movie?.country || '').trim() ||
      String(movie?.imdbId || '').trim()
    ).length;
    return {
      ready,
      total: data.length,
      percent: Math.round((ready / data.length) * 100),
      loading: ready < data.length && letterboxdImporting,
    };
  };

  const getRatingDistribution = () => {
    if (!data?.length) return [];
    const dist = Array(11).fill(0);
    data.forEach((movie) => {
      const rating = Math.round(Number(movie?.yourRating) || 0);
      if (rating >= 1 && rating <= 10) dist[rating] += 1;
    });
    return dist.slice(1).map((count, idx) => ({ rating: idx + 1, count }));
  };

  const getGenreAffinity = () => {
    if (!data?.length) return [];
    const statsByGenre = {};

    data
      .filter((movie) => String(movie?.genres || '').trim())
      .forEach((movie) => {
      const rating = Number(movie?.yourRating) || 0;
      String(movie?.genres || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((genre) => {
          if (!statsByGenre[genre]) statsByGenre[genre] = { sum: 0, count: 0 };
          statsByGenre[genre].sum += rating;
          statsByGenre[genre].count += 1;
        });
    });

    return Object.entries(statsByGenre)
      .map(([genre, s]) => ({ genre, avgRating: Number((s.sum / s.count).toFixed(2)), count: s.count }))
      .filter((item) => item.count >= 3)
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, 10);
  };

  const getEraPreference = () => {
    if (!data?.length) return [];
    const decadeMap = {};

    data.forEach((movie) => {
      const year = Number(movie?.year) || 0;
      const rating = Number(movie?.yourRating) || 0;
      if (year < 1900) return;
      const decadeStart = Math.floor(year / 10) * 10;
      const key = `${decadeStart}s`;
      if (!decadeMap[key]) decadeMap[key] = { sum: 0, count: 0 };
      decadeMap[key].sum += rating;
      decadeMap[key].count += 1;
    });

    return Object.entries(decadeMap)
      .map(([decade, s]) => ({ decade, avgRating: Number((s.sum / s.count).toFixed(2)), count: s.count }))
      .sort((a, b) => parseInt(a.decade, 10) - parseInt(b.decade, 10));
  };

  const getHiddenGems = () => {
    if (!data?.length) return { films: [], allFilms: [] };
    const gems = data
      .filter((movie) => (Number(movie?.yourRating) || 0) - (Number(movie?.imdbRating) || 0) > 2.5)
      .map((movie) => ({
        ...movie,
        difference: Number(((Number(movie?.yourRating) || 0) - (Number(movie?.imdbRating) || 0)).toFixed(1)),
      }))
      .sort((a, b) => b.difference - a.difference);

    return { films: gems.slice(0, 20), allFilms: gems };
  };

  const getFavoriteFilmPerYear = () => {
    if (!data?.length) return [];
    const grouped = {};

    data.forEach((movie) => {
      const year = Number(movie?.year) || 0;
      const rating = Number(movie?.yourRating) || 0;
      if (year < 1900 || rating < 9) return;
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(movie);
    });

    return Object.entries(grouped)
      .map(([year, films]) => ({
        year: Number(year),
        films: films.sort((a, b) => (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0) || (Number(b?.imdbRating) || 0) - (Number(a?.imdbRating) || 0)),
        filmCount: films.length,
      }))
      .sort((a, b) => b.year - a.year);
  };

  const getPersonalCanonByDecade = () => {
    if (!data?.length) return [];
    const grouped = {};

    data.forEach((movie) => {
      const year = Number(movie?.year) || 0;
      const rating = Number(movie?.yourRating) || 0;
      if (year < 1900 || rating < 9) return;
      const decadeStart = Math.floor(year / 10) * 10;
      const key = `${decadeStart}s`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(movie);
    });

    return Object.entries(grouped)
      .map(([decade, films]) => ({
        decade,
        films: films.sort((a, b) => (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0) || (Number(b?.year) || 0) - (Number(a?.year) || 0)),
        filmCount: films.length,
      }))
      .sort((a, b) => parseInt(a.decade, 10) - parseInt(b.decade, 10));
  };

  const getYearlyHighlight = () => {
    if (!data?.length) return [];
    const grouped = {};

    data.forEach((movie) => {
      const year = Number(movie?.year) || 0;
      if (year < 1900) return;
      grouped[year] = (grouped[year] || 0) + 1;
    });

    return Object.entries(grouped)
      .map(([year, filmCount]) => ({ year: Number(year), filmCount }))
      .sort((a, b) => a.year - b.year);
  };

  const getTopFilmPerGenre = () => {
    if (!data?.length) return [];
    const genreMap = {};

    data.forEach((movie) => {
      const genres = String(movie?.genres || '').split(',').map((g) => g.trim()).filter(Boolean);
      genres.forEach((genre) => {
        if (!genreMap[genre]) genreMap[genre] = [];
        genreMap[genre].push(movie);
      });
    });

    return Object.entries(genreMap)
      .map(([genre, films]) => {
        const sortedFilms = films
          .slice()
          .sort((a, b) => (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0) || (Number(b?.imdbRating) || 0) - (Number(a?.imdbRating) || 0));

        const dedup = [];
        const seen = new Set();
        sortedFilms.forEach((film) => {
          const key = `${film?.title}_${film?.year}`;
          if (seen.has(key)) return;
          seen.add(key);
          dedup.push(film);
        });

        const topFilms = dedup.slice(0, 30);
        const avgGenreRating = topFilms.length
          ? topFilms.reduce((sum, film) => sum + (Number(film?.yourRating) || 0), 0) / topFilms.length
          : 0;

        return {
          genre,
          films: topFilms,
          avgGenreRating,
        };
      })
      .filter((item) => item.films.length > 0)
      .sort((a, b) => b.avgGenreRating - a.avgGenreRating)
      .slice(0, 10);
  };

  const getMostConsistentlyLovedDirectors = () => {
    if (!data?.length) return [];

    const directorMap = {};
    data.forEach((movie) => {
      if (movie?.titleType && movie.titleType !== 'movie') return;
      const yourRating = Number(movie?.yourRating);
      if (!Number.isFinite(yourRating) || yourRating <= 0) return;

      const directors = String(movie?.directors || '')
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

      directors.forEach((director) => {
        if (!directorMap[director]) {
          directorMap[director] = {
            director,
            totalFilms: 0,
            highRatedCount: 0,
            ratingSum: 0,
          };
        }
        directorMap[director].totalFilms += 1;
        directorMap[director].ratingSum += yourRating;
        if (yourRating >= 8) directorMap[director].highRatedCount += 1;
      });
    });

    return Object.values(directorMap)
      .filter((d) => d.totalFilms >= 2 && d.highRatedCount >= 1)
      .map((d) => ({
        director: d.director,
        totalFilms: d.totalFilms,
        highRatedCount: d.highRatedCount,
        avgYourRating: Number((d.ratingSum / d.totalFilms).toFixed(2)),
        consistency: Number(((d.highRatedCount / d.totalFilms) * 100).toFixed(1)),
      }))
      .sort((a, b) =>
        b.highRatedCount - a.highRatedCount
        || b.consistency - a.consistency
        || b.avgYourRating - a.avgYourRating
        || a.director.localeCompare(b.director)
      )
      .slice(0, 10);
  };

  const getHiddenTreasures = () => {
    if (!data?.length) {
      return {
        films: [],
        allFilms: [],
        stats: { count: 0, yourAvg: 0, avgVotes: 0, avgImdb: 0, avgDiff: 0 },
      };
    }

    const parseVotes = (rawVotes) => {
      const cleaned = String(rawVotes ?? '')
        .replace(/,/g, '')
        .replace(/[^\d.]/g, '');
      const value = Number(cleaned);
      return Number.isFinite(value) ? value : 0;
    };

    const treasures = data
      .filter((movie) => {
        if (movie?.titleType && movie.titleType !== 'movie') return false;
        const yourRating = Number(movie?.yourRating) || 0;
        const votes = parseVotes(movie?.imdbVotes);
        return yourRating >= 8 && votes > 0 && votes < 2000;
      })
      .map((movie) => {
        const yourRating = Number(movie?.yourRating) || 0;
        const imdbRating = Number(movie?.imdbRating) || 0;
        const votes = parseVotes(movie?.imdbVotes);
        return {
          ...movie,
          imdbVotes: votes,
          difference: Number((yourRating - imdbRating).toFixed(1)),
        };
      })
      .sort((a, b) =>
        b.difference - a.difference
        || (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0)
        || (Number(a?.imdbVotes) || 0) - (Number(b?.imdbVotes) || 0)
      );

    const count = treasures.length;
    const yourAvg = count
      ? Number((treasures.reduce((sum, m) => sum + (Number(m?.yourRating) || 0), 0) / count).toFixed(2))
      : 0;
    const avgVotes = count
      ? Math.round(treasures.reduce((sum, m) => sum + (Number(m?.imdbVotes) || 0), 0) / count)
      : 0;
    const avgImdb = count
      ? Number((treasures.reduce((sum, m) => sum + (Number(m?.imdbRating) || 0), 0) / count).toFixed(2))
      : 0;
    const avgDiff = count
      ? Number((treasures.reduce((sum, m) => sum + (Number(m?.difference) || 0), 0) / count).toFixed(2))
      : 0;

    return {
      films: treasures.slice(0, hiddenTreasuresPerPage),
      allFilms: treasures,
      stats: { count, yourAvg, avgVotes, avgImdb, avgDiff },
    };
  };

  const getMostWatchedGenres = () => {
    if (!data?.length) {
      return { genres: [], totalGenres: 0, topGenre: null };
    }
    const counts = {};

    data.forEach((movie) => {
      if (movie?.titleType && movie.titleType !== 'movie') return;
      String(movie?.genres || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((genre) => {
          counts[genre] = (counts[genre] || 0) + 1;
        });
    });

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
    const genres = Object.entries(counts)
      .map(([genre, count]) => ({
        genre,
        count,
        percentage: Number(((count / total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      genres,
      totalGenres: total,
      topGenre: genres[0] || null,
    };
  };

  const cinemaMindProfile = getCinemaMindProfile();

  const patterns = getCinematicPatterns();

  const personality = getCinematicPersonality();

  const stats = getSummaryStats();
  const hasDashboardData = Array.isArray(data) && data.length > 0;
  const metadataStatus = getMetadataStatus();
  const ratingDist = getRatingDistribution();
  const genreAffinity = getGenreAffinity();
  const eraPreference = getEraPreference();
  const eraChartMin = eraPreference.length
    ? Math.max(0, Number((Math.min(...eraPreference.map((item) => item.avgRating)) - 0.5).toFixed(1)))
    : 0;
  const hiddenGems = getHiddenGems();
  const favoriteFilmPerYear = getFavoriteFilmPerYear();
  const shareCardTop10Films = React.useMemo(
    () => (shareCardConfig?.films || []).slice(0, 10),
    [shareCardConfig]
  );

  const openShareCard = async (config) => {
    const safeFilms = (Array.isArray(config?.films) ? config.films : []).filter(Boolean);
    if (!safeFilms.length) return;
    // If browser fullscreen is active, global fixed overlays rendered outside that element
    // may appear hidden. Exit fullscreen first, then open the share card.
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen exit errors and still attempt to open share card
    }
    setShareCardConfig({
      title: config?.title || 'My Top 10',
      subtitle: config?.subtitle || 'Personal Card',
      filenameBase: config?.filenameBase || 'flickd-share',
      films: safeFilms.map((film) => ({
        ...film,
        yourRating: Number.isFinite(Number(film?.yourRating)) ? Number(film.yourRating) : Number(film?.rating || 0),
      })),
    });
    setShareCardOpen(true);
  };
  const personalCanon = getPersonalCanonByDecade();
  const yearlyHighlight = getYearlyHighlight();
  const topFilmPerGenre = getTopFilmPerGenre();
    const directorFingerprintData = React.useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return null;

    const films = data
      .filter((movie) => {
        const type = String(movie?.titleType || '').toLowerCase();
        if (type && type !== 'movie') return false;
        const ratingRaw = String(movie?.yourRating ?? '').trim();
        if (!ratingRaw) return false;
        const rating = Number(movie?.yourRating);
        if (!Number.isFinite(rating)) return false;
        const directorsRaw = String(movie?.directors || movie?.director || '').trim();
        return Boolean(directorsRaw);
      })
      .map((movie) => {
        const year = Number(movie?.year);
        const safeYear = Number.isFinite(year) ? year : '';
        const rating = Number(movie?.yourRating);
        const rawDirectors = String(movie?.directors || movie?.director || '');
        const directors = rawDirectors
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean);
        const watchedDate = movie?.dateRated instanceof Date ? movie.dateRated : (movie?.dateRated ? new Date(movie.dateRated) : null);
        return {
          title: movie?.title || 'Unknown Title',
          year: safeYear,
          rating,
          imdbId: movie?.imdbId || movie?.imdbID || movie?.const || null,
          directors,
          genres: String(movie?.genres || '')
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean),
          watchedDate: watchedDate instanceof Date && !Number.isNaN(watchedDate.getTime()) ? watchedDate : null,
        };
      });

    if (films.length === 0) return null;

    const directorMap = new Map();
    films.forEach((film) => {
      film.directors.forEach((director) => {
        if (!directorMap.has(director)) {
          directorMap.set(director, []);
        }
        directorMap.get(director).push(film);
      });
    });

    const sortedDirectors = Array.from(directorMap.entries())
      .map(([name, list]) => {
        const avgRating = list.reduce((sum, f) => sum + (Number(f.rating) || 0), 0) / Math.max(list.length, 1);
        return { name, films: list, count: list.length, avgRating };
      })
      .sort((a, b) => b.count - a.count || b.avgRating - a.avgRating || a.name.localeCompare(b.name));

    if (sortedDirectors.length === 0) return null;

    const targetDirectorCount = Math.min(60, Math.max(30, sortedDirectors.length));
    const selectedDirectors = sortedDirectors.slice(0, targetDirectorCount);

    const years = selectedDirectors
      .flatMap((d) => d.films.map((f) => f.year))
      .filter((year) => Number.isFinite(year));

    const currentYear = new Date().getFullYear();
    const minYear = years.length ? Math.min(...years) : currentYear - 30;
    const maxYear = years.length ? Math.max(...years) : currentYear;
    const yearSpan = Math.max(1, maxYear - minYear);

    const maxCount = Math.max(...selectedDirectors.map((d) => d.count));
    const minCount = Math.min(...selectedDirectors.map((d) => d.count));
    const countSpan = Math.max(1, maxCount - minCount);

    const size = 1100;
    const cx = size / 2;
    const cy = size / 2;
    const innerRadius = 170;
    const maxOuterRadius = 500;

    const hexToRgb = (hex) => {
      const clean = String(hex || '').replace('#', '');
      if (clean.length !== 6) return { r: 107, g: 127, b: 166 };
      return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
      };
    };

    const blendHex = (a, b, t) => {
      const c1 = hexToRgb(a);
      const c2 = hexToRgb(b);
      const mix = Math.max(0, Math.min(1, t));
      const r = Math.round(c1.r + (c2.r - c1.r) * mix);
      const g = Math.round(c1.g + (c2.g - c1.g) * mix);
      const bl = Math.round(c1.b + (c2.b - c1.b) * mix);
      return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
    };

    const resolveGenreColor = (genreName) => {
      const key = String(genreName || '').toLowerCase();
      if (TRACE_GENRE_PALETTE[key]) return TRACE_GENRE_PALETTE[key];
      if (key.includes('sci') && key.includes('fi')) return TRACE_GENRE_PALETTE['sci-fi'];
      return TRACE_GENRE_PALETTE.default;
    };

    const toPolar = (r, a) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const toArcPath = (r, startAngle, endAngle) => {
      const start = toPolar(r, startAngle);
      const end = toPolar(r, endAngle);
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      return 'M ' + start.x.toFixed(2) + ' ' + start.y.toFixed(2) + ' A ' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 ' + largeArc + ' 1 ' + end.x.toFixed(2) + ' ' + end.y.toFixed(2);
    };

    // A filled donut-sector path (used for reliable hover/click hit testing).
    // Covers the whole director segment from inner->outer radius.
    const toRingSectorPath = (rInner, rOuter, startAngle, endAngle) => {
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const oStart = toPolar(rOuter, startAngle);
      const oEnd = toPolar(rOuter, endAngle);
      const iStart = toPolar(rInner, startAngle);
      const iEnd = toPolar(rInner, endAngle);
      // Outer arc: sweep=1, Inner arc: sweep=0 (reverse) to close the ring sector.
      return (
        'M ' + oStart.x.toFixed(2) + ' ' + oStart.y.toFixed(2) +
        ' A ' + rOuter.toFixed(2) + ' ' + rOuter.toFixed(2) + ' 0 ' + largeArc + ' 1 ' + oEnd.x.toFixed(2) + ' ' + oEnd.y.toFixed(2) +
        ' L ' + iEnd.x.toFixed(2) + ' ' + iEnd.y.toFixed(2) +
        ' A ' + rInner.toFixed(2) + ' ' + rInner.toFixed(2) + ' 0 ' + largeArc + ' 0 ' + iStart.x.toFixed(2) + ' ' + iStart.y.toFixed(2) +
        ' Z'
      );
    };

    const anglePerDirector = (Math.PI * 2) / selectedDirectors.length;

    const directors = selectedDirectors.map((director, index) => {
      const segmentStart = index * anglePerDirector;
      const segmentEnd = segmentStart + anglePerDirector;
      const segmentPadding = anglePerDirector * 0.12;
      const arcStart = segmentStart + segmentPadding;
      const arcEnd = segmentEnd - segmentPadding;

      const countNorm = (director.count - minCount) / countSpan;
      const segmentOuter = innerRadius + (0.62 + countNorm * 0.22) * (maxOuterRadius - innerRadius);

      const filmsSorted = [...director.films].sort((a, b) => {
        const yearA = Number.isFinite(a.year) ? a.year : minYear;
        const yearB = Number.isFinite(b.year) ? b.year : minYear;
        return yearA - yearB;
      });

      const genreCounts = {};
      filmsSorted.forEach((film) => {
        (film.genres || []).forEach((genre) => {
          const key = String(genre || '').toLowerCase();
          if (!key) return;
          genreCounts[key] = (genreCounts[key] || 0) + 1;
        });
      });

      const rankedGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
      const dominantGenreKey = rankedGenres[0]?.[0] || 'default';
      const secondaryGenreKey = rankedGenres[1]?.[0] || dominantGenreKey;
      const dominantGenreColor = resolveGenreColor(dominantGenreKey);
      const secondaryGenreColor = resolveGenreColor(secondaryGenreKey);

      const lines = filmsSorted.map((film, filmIdx) => {
        const filmYear = Number.isFinite(film.year) ? film.year : minYear;
        const yearNorm = (filmYear - minYear) / yearSpan;
        const baseRadius = innerRadius + yearNorm * (segmentOuter - innerRadius);
        const localJitter = ((filmIdx % 4) - 1.5) * 0.9;
        const radius = Math.max(innerRadius + 4, baseRadius + localJitter);

        const ratingNorm = Math.max(0, Math.min(1, ((Number(film.rating) || 0) - 5) / 5));
        const blendT = filmsSorted.length > 1 ? filmIdx / (filmsSorted.length - 1) : 0;
        const stroke = blendHex(dominantGenreColor, secondaryGenreColor, blendT * 0.6);
        const opacity = Number((0.28 + ratingNorm * 0.62).toFixed(2));
        const radiusNorm = (radius - innerRadius) / Math.max(1, maxOuterRadius - innerRadius);
        const revealAt = Number((radiusNorm * 0.7 + (index / selectedDirectors.length) * 0.3).toFixed(3));

        return {
          key: director.name + '_' + film.title + '_' + (film.year || 'na') + '_' + filmIdx,
          path: toArcPath(radius, arcStart, arcEnd),
          stroke,
          opacity,
          strokeWidth: 0.9,
          director: director.name,
          title: film.title,
          year: film.year,
          rating: Number(film.rating) || 0,
          radiusNorm,
          revealAt,
        };
      });

      const clusterRadius = (innerRadius + segmentOuter) / 2;

      return {
        ...director,
        segmentStart,
        segmentEnd,
        arcStart,
        arcEnd,
        segmentOuter,
        clusterPath: toArcPath(clusterRadius, arcStart, arcEnd),
        // Reliable hover/click hit area covering the entire director segment (all half rings).
        hitPath: toRingSectorPath(innerRadius, segmentOuter, arcStart, arcEnd),
        dominantGenre: dominantGenreKey,
        secondaryGenre: secondaryGenreKey,
        dominantColor: dominantGenreColor,
        secondaryColor: secondaryGenreColor,
        lines,
      };
    });

    const watchDates = films
      .map((film) => film.watchedDate)
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);

    const spanStart = watchDates.length ? watchDates[0].toISOString().slice(0, 10) : String(minYear);
    const spanEnd = watchDates.length ? watchDates[watchDates.length - 1].toISOString().slice(0, 10) : String(maxYear);

    return {
      title: 'Director Fingerprint',
      subtitle: 'The Directors That Shaped My Cinema',
      size,
      cx,
      cy,
      innerRadius,
      maxOuterRadius,
      yearMin: minYear,
      yearMax: maxYear,
      totalFilms: films.length,
      sourceFilms: data.length,
      metadataReady: metadataStatus.ready,
      metadataTotal: metadataStatus.total,
      metadataLoading: metadataStatus.loading,
      spanStart,
      spanEnd,
      topDirectors: selectedDirectors.slice(0, 6).map((d) => d.name),
      genreLegend: Object.entries(TRACE_GENRE_PALETTE)
        .filter(([key]) => key !== 'default' && key !== 'sci_fi' && key !== 'scifi')
        .map(([key, color]) => ({ key, color }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      directors,
    };
  }, [data]);

  const downloadDirectorFingerprintSvg = () => {
    if (!directorFingerprintData) return;

    const svgLines = directorFingerprintData.directors
      .flatMap((director) => director.lines.map((line) =>
        '<path d="' + line.path + '" fill="none" stroke="' + line.stroke + '" stroke-opacity="' + line.opacity + '" stroke-width="' + line.strokeWidth + '" stroke-linecap="round" />'
      ))
      .join('');

    const ringCount = 14;
    const rings = Array.from({ length: ringCount }, (_, index) => {
      const t = index / (ringCount - 1);
      const radius = directorFingerprintData.innerRadius + t * (directorFingerprintData.maxOuterRadius - directorFingerprintData.innerRadius);
      return '<circle cx="' + directorFingerprintData.cx + '" cy="' + directorFingerprintData.cy + '" r="' + radius.toFixed(2) + '" fill="none" stroke="rgba(148,163,184,0.08)" stroke-width="0.8" />';
    }).join('');

    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + directorFingerprintData.size + ' ' + directorFingerprintData.size + '" width="' + directorFingerprintData.size + '" height="' + directorFingerprintData.size + '">\n'
      + '  <defs>\n'
      + '    <radialGradient id="bgGlow" cx="50%" cy="45%" r="65%">\n'
      + '      <stop offset="0%" stop-color="#132042" />\n'
      + '      <stop offset="55%" stop-color="#0d152c" />\n'
      + '      <stop offset="100%" stop-color="#070b16" />\n'
      + '    </radialGradient>\n'
      + '  </defs>\n'
      + '  <rect width="100%" height="100%" fill="url(#bgGlow)"/>\n'
      + '  ' + rings + '\n'
      + '  <circle cx="' + directorFingerprintData.cx + '" cy="' + directorFingerprintData.cy + '" r="' + (directorFingerprintData.innerRadius - 14).toFixed(2) + '" fill="#070b16" opacity="0.9"/>\n'
      + '  ' + svgLines + '\n'
      + '  <text x="' + directorFingerprintData.cx + '" y="84" text-anchor="middle" fill="#f8fafc" style="font: 700 36px Georgia, Times New Roman, serif; letter-spacing: 0.5px;">' + directorFingerprintData.title + '</text>\n'
      + '  <text x="' + directorFingerprintData.cx + '" y="122" text-anchor="middle" fill="#93c5fd" style="font: 500 18px Segoe UI, Arial, sans-serif;">' + directorFingerprintData.subtitle + '</text>\n'
      + '  <text x="' + directorFingerprintData.cx + '" y="' + (directorFingerprintData.size - 74) + '" text-anchor="middle" fill="#cbd5e1" style="font: 500 16px Segoe UI, Arial, sans-serif;">Films Logged: ' + directorFingerprintData.totalFilms + ' | Time Span: ' + directorFingerprintData.spanStart + ' to ' + directorFingerprintData.spanEnd + '</text>\n'
      + '  <text x="' + directorFingerprintData.cx + '" y="' + (directorFingerprintData.size - 42) + '" text-anchor="middle" fill="#93c5fd" style="font: 500 14px Segoe UI, Arial, sans-serif;">Top Directors: ' + directorFingerprintData.topDirectors.join(', ') + '</text>\n'
      + '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'director-fingerprint.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadDirectorFingerprintPng = async () => {
    if (!traceSvgRef.current || !directorFingerprintData) return;
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(traceSvgRef.current);
    if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
      source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = directorFingerprintData.size * scale;
      canvas.height = directorFingerprintData.size * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = 'director-fingerprint-poster.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(svgUrl);
    };

    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
    };

    image.src = svgUrl;
  };

  const consistentlyLovedDirectors = getMostConsistentlyLovedDirectors();
  const hiddenTreasures = getHiddenTreasures();
  const mostWatchedGenres = getMostWatchedGenres();
  const countryPreference = getCountryPreference(countryRatingThreshold, countryTimeRange);
  const fallbackCountryPreference = countryPreference.length
    ? countryPreference
    : getCountryPreference(0, countryTimeRange);
  const usingCountryPreferenceFallback = countryPreference.length === 0 && fallbackCountryPreference.length > 0;
  const isWatchedFilmsMode = countryRatingThreshold === 0;
  const mapCountLabel = isWatchedFilmsMode
    ? 'films watched'
    : (usingCountryPreferenceFallback ? 'films watched' : `films rated >= ${countryRatingThreshold}`);
  const countryPreferenceLookup = fallbackCountryPreference.reduce((acc, item) => {
    getCountryMatchKeys(item.country).forEach((key) => {
      acc[key] = Math.max(acc[key] || 0, item.count);
    });
    return acc;
  }, {});
  const countryDataCount = data
    ? data.filter((movie) => hasUsableCountryName(getMovieCountry(movie))).length
    : 0;
  const countryHighlightCount = fallbackCountryPreference.reduce((sum, item) => sum + (Number(item?.count) || 0), 0);

  const watchedDecades = data
    ? Array.from(new Set(data.map((movie) => Number(movie?.year)).filter((year) => year >= 1900).map((year) => Math.floor(year / 10) * 10))).sort((a, b) => b - a)
    : [];

  const watchedYears = data
    ? Array.from(new Set(data.map((movie) => Number(movie?.year)).filter((year) => year >= 1900))).sort((a, b) => b - a)
    : [];

  const watchedGenres = data
    ? Array.from(new Set(data.flatMap((movie) => String(movie?.genres || '').split(',').map((genre) => genre.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b))
    : [];
  const watchedCountries = data
    ? Array.from(
      new Set(
        data
          .map((movie) => normalizeCountryName(String(getMovieCountry(movie)).split(',')[0]?.trim()))
          .filter(hasUsableCountryName)
      )
    ).sort((a, b) => a.localeCompare(b))
    : [];
  const watchedDirectors = data
    ? Array.from(
      new Set(
        data.flatMap((movie) =>
          String(movie?.directors || '')
            .split(',')
            .map((director) => director.trim())
            .filter(Boolean)
        )
      )
    ).sort((a, b) => a.localeCompare(b))
    : [];

  const watchedYearOptions = watchedYears.filter((year) => {
    if (watchedDecadeFilter === 'all') return true;
    const decadeStart = Number(watchedDecadeFilter);
    return year >= decadeStart && year <= decadeStart + 9;
  });

  const watchedFilteredFilms = (data || []).filter((movie) => {
    if (movie?.titleType && movie.titleType !== 'movie') return false;

    const year = Number(movie?.year) || 0;
    const rating = Number(movie?.yourRating) || 0;
    const genresText = String(movie?.genres || '').toLowerCase();
    const titleText = String(movie?.title || '').toLowerCase();
    const query = watchedSearchQuery.trim().toLowerCase();

    if (watchedDecadeFilter !== 'all') {
      const decadeStart = Number(watchedDecadeFilter);
      if (year < decadeStart || year > decadeStart + 9) return false;
    }

    if (watchedYearFilter !== 'all' && year !== Number(watchedYearFilter)) return false;

    if (watchedRatingFilter === '9plus' && rating < 9) return false;
    if (watchedRatingFilter === '8plus' && rating < 8) return false;
    if (watchedRatingFilter === '7plus' && rating < 7) return false;
    if (watchedRatingFilter === '6plus' && rating < 6) return false;
    if (watchedRatingFilter === 'below6' && rating >= 6) return false;

    if (watchedGenreFilter !== 'all' && !genresText.includes(watchedGenreFilter.toLowerCase())) return false;
    if (watchedCountryFilter !== 'all') {
      const country = normalizeCountryName(String(getMovieCountry(movie)).split(',')[0]?.trim());
      if (country !== watchedCountryFilter) return false;
    }
    if (watchedDirectorFilter !== 'all') {
      const directors = String(movie?.directors || '').toLowerCase();
      if (!directors.split(',').map((d) => d.trim()).includes(watchedDirectorFilter.toLowerCase())) return false;
    }
    if (query && !titleText.includes(query)) return false;

    return true;
  }).sort((a, b) => {
    if (watchedSortBy === 'year_asc') return (Number(a?.year) || 0) - (Number(b?.year) || 0);
    if (watchedSortBy === 'rating_desc') return (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0);
    if (watchedSortBy === 'rating_asc') return (Number(a?.yourRating) || 0) - (Number(b?.yourRating) || 0);
    if (watchedSortBy === 'imdb_desc') return (Number(b?.imdbRating) || 0) - (Number(a?.imdbRating) || 0);
    if (watchedSortBy === 'imdb_asc') return (Number(a?.imdbRating) || 0) - (Number(b?.imdbRating) || 0);
    if (watchedSortBy === 'title_az') return String(a?.title || '').localeCompare(String(b?.title || ''));
    if (watchedSortBy === 'title_za') return String(b?.title || '').localeCompare(String(a?.title || ''));
    return (Number(b?.year) || 0) - (Number(a?.year) || 0) || (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0);
  });

  const watchedTotalPages = Math.max(1, Math.ceil(watchedFilteredFilms.length / watchedFilmsPerPage));
  const watchedSafePage = Math.min(watchedPage, watchedTotalPages);
  const watchedPageFilms = watchedFilteredFilms.slice(
    (watchedSafePage - 1) * watchedFilmsPerPage,
    watchedSafePage * watchedFilmsPerPage
  );

  const timelineStyleScore = (movie) => {
    const weights = {
      action: 0.72,
      adventure: 0.66,
      comedy: 0.48,
      thriller: 0.34,
      horror: 0.4,
      'sci-fi': 0.74,
      fantasy: 0.62,
      animation: 0.58,
      family: 0.42,
      romance: 0.15,
      mystery: 0.18,
      crime: 0.08,
      musical: 0.2,
      western: -0.1,
      war: -0.22,
      history: -0.45,
      biography: -0.52,
      drama: -0.42,
      documentary: -0.82,
      short: -0.2,
    };

    const genres = String(movie?.genres || '')
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
    if (!genres.length) return 0;

    const genreScore = genres.reduce((sum, g) => sum + (weights[g] ?? 0), 0) / genres.length;
    const votes = Number(movie?.imdbVotes || movie?.numVotes) || 0;
    const runtime = Number(movie?.runtime) || 0;

    let audienceSignal = 0;
    if (votes >= 300000) audienceSignal += 0.26;
    else if (votes >= 100000) audienceSignal += 0.16;
    else if (votes < 5000) audienceSignal -= 0.32;
    else if (votes < 20000) audienceSignal -= 0.2;

    if (runtime >= 150) audienceSignal -= 0.12;
    else if (runtime > 0 && runtime <= 95) audienceSignal += 0.08;

    const score = genreScore + audienceSignal;
    return Math.max(-1, Math.min(1, Number(score.toFixed(3))));
  };

  const timelineMovies = React.useMemo(() => {
    const favoritesByYear = getFavoriteFilmPerYear();
    if (!Array.isArray(favoritesByYear) || !favoritesByYear.length) return [];

    const source = favoritesByYear
      .flatMap((yearGroup) => yearGroup?.films || [])
      .filter((m) => Number(m?.year) >= 1900 && Number(m?.year) <= 2035 && String(m?.title || '').trim())
      .map((m) => {
        const styleScore = timelineStyleScore(m);
        return {
          ...m,
          styleScore,
          timelineCategory:
            styleScore >= 0.28
              ? 'Mainstream'
              : styleScore <= -0.28
                ? 'Arthouse'
                : 'Hybrid',
        };
      })
      .sort((a, b) => (Number(a?.year) || 0) - (Number(b?.year) || 0));
    return source;
  }, [data]);

  const timelineStartYear = React.useMemo(() => {
    if (!timelineMovies.length) return 1950;
    const minYear = Math.floor(Math.min(...timelineMovies.map((m) => Number(m.year) || 1950)) / 10) * 10;
    return Math.max(1950, minYear);
  }, [timelineMovies]);

  const timelineEndYear = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (!timelineMovies.length) return currentYear;
    const maxMovieYear = Math.max(...timelineMovies.map((m) => Number(m.year) || currentYear));
    return Math.min(currentYear, maxMovieYear);
  }, [timelineMovies]);

  const timelineYearClusters = React.useMemo(() => {
    if (!timelineMovies.length) return [];
    const years = [];
    const map = new Map();
    for (let y = timelineStartYear; y <= timelineEndYear; y += 1) {
      map.set(y, []);
      years.push(y);
    }

    timelineMovies.forEach((movie, idx) => {
      const year = Number(movie?.year) || timelineStartYear;
      if (!map.has(year)) return;
      const style = Number(movie?.styleScore || 0);
      let lane = 'Hybrid';
      if (style >= 0.42) lane = 'Mainstream';
      else if (style <= -0.18) lane = 'Arthouse';

      map.get(year).push({
        ...movie,
        lane,
        timelineKey: `${String(movie?.title || '').toLowerCase()}_${year}_${idx}`,
      });
    });

    return years.map((year) => {
      const films = (map.get(year) || []).sort((a, b) =>
        (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0) ||
        (Number(b?.imdbVotes || b?.numVotes) || 0) - (Number(a?.imdbVotes || a?.numVotes) || 0)
      );
      const cappedFilms = films.slice(0, 10);
      const lanes = {
        Mainstream: cappedFilms.filter((f) => f.lane === 'Mainstream'),
        Hybrid: cappedFilms.filter((f) => f.lane === 'Hybrid'),
        Arthouse: cappedFilms.filter((f) => f.lane === 'Arthouse'),
      };
      return { year, films: cappedFilms, lanes };
    });
  }, [timelineMovies, timelineStartYear, timelineEndYear]);

  const timelineMaxLaneCount = React.useMemo(() => {
    if (!timelineYearClusters.length) return 1;
    let maxCount = 1;
    timelineYearClusters.forEach((cluster) => {
      maxCount = Math.max(
        maxCount,
        cluster?.lanes?.Mainstream?.length || 0,
        cluster?.lanes?.Hybrid?.length || 0,
        cluster?.lanes?.Arthouse?.length || 0
      );
    });
    return maxCount;
  }, [timelineYearClusters]);
  const timelineColumnWidth = Math.max(96, Math.round(108 * timelineZoom));
  const timelineRailWidth = Math.max(1320, timelineYearClusters.length * Math.round(118 * timelineZoom));

  const timelineRelated = React.useMemo(() => {
    if (!timelineHoverKey) return new Set();
    const active = timelineMovies.find((m, idx) => `${String(m?.title || '').toLowerCase()}_${Number(m?.year) || 0}_${idx}` === timelineHoverKey);
    if (!active) return new Set();
    const activeYear = Number(active.year) || 0;
    const activeScore = Number(active.styleScore) || 0;
    const rel = new Set();
    timelineMovies.forEach((m, idx) => {
      if (Math.abs((Number(m.year) || 0) - activeYear) <= 2 && Math.abs((Number(m.styleScore) || 0) - activeScore) <= 0.3) {
        rel.add(`${String(m?.title || '').toLowerCase()}_${Number(m?.year) || 0}_${idx}`);
      }
    });
    return rel;
  }, [timelineHoverKey, timelineMovies]);

  const worldFeatures = Array.isArray(worldGeoJson?.features) ? worldGeoJson.features : [];
  const mapFeatures = worldFeatures.filter((feature) => {
    const countryName = normalizeCountryName(getFeatureCountryName(feature));
    return countryName && countryName !== 'Antarctica';
  });
    const mapWidth = 1040;
    const mapHeight = 740;
    const mapProjection = mapFeatures.length
      ? d3.geoMercator().fitExtent([[8, 8], [mapWidth - 8, mapHeight - 8]], { type: 'FeatureCollection', features: mapFeatures })
      : null;
  const mapPathGenerator = mapProjection ? d3.geoPath(mapProjection) : null;

  const clampZoom = (z) => Math.max(1, Math.min(4, z));

  const zoomMap = (delta) => {
    setMapZoom((prev) => clampZoom(Number((prev + delta).toFixed(2))));
  };

  const resetMapView = () => {
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
  };

  const handleMapWheel = (event) => {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    if (event.nativeEvent?.stopImmediatePropagation) {
      event.nativeEvent.stopImmediatePropagation();
    }
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;

    const pointerX = ((event.clientX - rect.left) / rect.width) * mapWidth;
    const pointerY = ((event.clientY - rect.top) / rect.height) * mapHeight;
    const delta = event.deltaY < 0 ? 0.15 : -0.15;

    setMapZoom((prevZoom) => {
      const nextZoom = clampZoom(Number((prevZoom + delta).toFixed(2)));
      const ratio = nextZoom / prevZoom;
      setMapPan((prevPan) => ({
        x: Number((pointerX - (pointerX - prevPan.x) * ratio).toFixed(2)),
        y: Number((pointerY - (pointerY - prevPan.y) * ratio).toFixed(2)),
      }));
      return nextZoom;
    });
  };


  const handleMapMouseDown = (event) => {
    setIsMapDragging(true);
    setMapDragStart({
      x: event.clientX - mapPan.x,
      y: event.clientY - mapPan.y,
    });
  };

  const handleMapMouseMove = (event) => {
    if (isMapDragging && mapDragStart) {
      setMapPan({
        x: event.clientX - mapDragStart.x,
        y: event.clientY - mapDragStart.y,
      });
    }

    if (hoveredMapCountry) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMapTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }
  };

  const stopMapDragging = () => {
    setIsMapDragging(false);
    setMapDragStart(null);
  };

  const handleMainScrollWheelCapture = (event) => {
    const wheelTarget = event.target;
    const insideMapWheelSurface =
      wheelTarget instanceof Element && wheelTarget.closest('.flickd-map-wheel-surface');
    const insideDeepDiveRail =
      wheelTarget instanceof Element && wheelTarget.closest('.cinematic-rail');
    const insideTimelineWheelSurface =
      wheelTarget instanceof Element && wheelTarget.closest('.flickd-timeline-wheel-surface');

    if (insideMapWheelSurface || insideDeepDiveRail || insideTimelineWheelSurface) {
      // Prevent the app container from vertically scrolling while allowing
      // the inner interactive surface to handle wheel behavior.
      if (event.cancelable) event.preventDefault();
      return;
    }

    if (!mapWheelLock && !deepDiveWheelLock) return;
    if (deepDiveWheelLock) {
      if (wheelTarget instanceof Element && wheelTarget.closest('.cinematic-rail')) {
        // Let the rail consume wheel and translate it to horizontal scroll.
        return;
      }
    }
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    if (event.nativeEvent?.stopImmediatePropagation) {
      event.nativeEvent.stopImmediatePropagation();
    }
  };

  useEffect(() => {
    const el = mapWheelSurfaceRef.current;
    if (!el) return undefined;
    const wheelLockHandler = (event) => {
      handleMapWheel(event);
    };
    el.addEventListener('wheel', wheelLockHandler, { passive: false });
    return () => {
      el.removeEventListener('wheel', wheelLockHandler);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'overview') {
      setMapWheelLock(false);
    }
    if (activeTab !== 'deepdive') {
      setDeepDiveWheelLock(false);
    }
  }, [activeTab]);

  const handleMapTouchStart = (event) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      mapTouchGestureRef.current = {
        mode: 'pinch',
        startDistance: getTouchDistance(event.touches),
        startZoom: mapZoom,
        startPan: mapPan,
        startCenter: getTouchCenter(event.touches),
      };
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      mapTouchGestureRef.current = {
        mode: 'pan',
        startZoom: mapZoom,
        startPan: mapPan,
        startCenter: { x: touch.clientX, y: touch.clientY },
      };
    }
  };

  const handleMapTouchMove = (event) => {
    const gesture = mapTouchGestureRef.current;
    if (!gesture?.mode) return;

    if (gesture.mode === 'pinch' && event.touches.length === 2) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const nextDistance = getTouchDistance(event.touches);
      const nextCenter = getTouchCenter(event.touches);
      const nextZoom = clampZoom(Number((gesture.startZoom * (nextDistance / Math.max(1, gesture.startDistance))).toFixed(2)));
      const ratio = nextZoom / Math.max(0.01, gesture.startZoom);
      const startSvgX = ((gesture.startCenter.x - rect.left) / rect.width) * mapWidth;
      const startSvgY = ((gesture.startCenter.y - rect.top) / rect.height) * mapHeight;
      const nextSvgX = ((nextCenter.x - rect.left) / rect.width) * mapWidth;
      const nextSvgY = ((nextCenter.y - rect.top) / rect.height) * mapHeight;

      setMapZoom(nextZoom);
      setMapPan({
        x: Number((nextSvgX - (startSvgX - gesture.startPan.x) * ratio).toFixed(2)),
        y: Number((nextSvgY - (startSvgY - gesture.startPan.y) * ratio).toFixed(2)),
      });
      return;
    }

    if (gesture.mode === 'pan' && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      setMapPan({
        x: gesture.startPan.x + (touch.clientX - gesture.startCenter.x),
        y: gesture.startPan.y + (touch.clientY - gesture.startCenter.y),
      });
    }
  };

  const handleMapTouchEnd = () => {
    mapTouchGestureRef.current = { mode: null };
    stopMapDragging();
  };

  const _atlasNodes = [
    {
      id: 'pattern_seekers',
      label: 'Pattern Seekers',
      icon: 'PS',
      short: 'View cinema through symbolism and philosophical meaning.',
      directors: ['Andrei Tarkovsky', 'Ingmar Bergman', 'Krzysztof Kieslowski'],
      films: ['Stalker', 'Persona', 'The Double Life of Veronique'],
      x: 22,
      y: 20,
      weight: 82,
    },
    {
      id: 'visualists',
      label: 'Visualists',
      icon: 'VI',
      short: 'Drawn to composition, color palettes, and visual design.',
      directors: ['Wong Kar-wai', 'Stanley Kubrick', 'Satoshi Kon'],
      films: ['In the Mood for Love', 'Barry Lyndon', 'Perfect Blue'],
      x: 44,
      y: 16,
      weight: 75,
    },
    {
      id: 'emotion_divers',
      label: 'Emotion Divers',
      icon: 'ED',
      short: 'Seek films that move between tenderness, grief, and wonder.',
      directors: ['Celine Sciamma', 'Hirokazu Kore-eda', 'Mike Leigh'],
      films: ['Portrait of a Lady on Fire', 'After Life', 'Secrets & Lies'],
      x: 63,
      y: 26,
      weight: 72,
    },
    {
      id: 'film_analysts',
      label: 'Film Analysts',
      icon: 'FA',
      short: 'Analyze editing, screenplay structure, and camera technique.',
      directors: ['David Fincher', 'Michael Haneke', 'Sidney Lumet'],
      films: ['Zodiac', 'Cache', '12 Angry Men'],
      x: 28,
      y: 42,
      weight: 76,
    },
    {
      id: 'atmosphere_wanderers',
      label: 'Atmosphere Wanderers',
      icon: 'AW',
      short: 'Absorb mood, texture, silence, and cinematic weather.',
      directors: ['Apichatpong Weerasethakul', 'Terrence Malick', 'Bi Gan'],
      films: ['Uncle Boonmee', 'The Tree of Life', 'Long Days Journey Into Night'],
      x: 52,
      y: 43,
      weight: 88,
    },
    {
      id: 'story_seekers',
      label: 'Story Seekers',
      icon: 'SS',
      short: 'Love coherent arcs, character journeys, and narrative payoff.',
      directors: ['Asghar Farhadi', 'Bong Joon-ho', 'Greta Gerwig'],
      films: ['A Separation', 'Parasite', 'Little Women'],
      x: 73,
      y: 46,
      weight: 74,
    },
    {
      id: 'myth_seekers',
      label: 'Myth Seekers',
      icon: 'MS',
      short: 'Read cinema through archetypes, legend, and ritual.',
      directors: ['Akira Kurosawa', 'Hayao Miyazaki', 'Guillermo del Toro'],
      films: ['Ran', 'Princess Mononoke', 'Pans Labyrinth'],
      x: 18,
      y: 66,
      weight: 66,
    },
    {
      id: 'reality_explorers',
      label: 'Reality Explorers',
      icon: 'RE',
      short: 'Prefer grounded worlds, social context, and lived detail.',
      directors: ['Ken Loach', 'Chloe Zhao', 'Abbas Kiarostami'],
      films: ['I, Daniel Blake', 'Nomadland', 'Close-Up'],
      x: 40,
      y: 72,
      weight: 70,
    },
    {
      id: 'sensory_seekers',
      label: 'Sensory Seekers',
      icon: 'SE',
      short: 'Chase sound, rhythm, movement, and visceral immersion.',
      directors: ['Gaspar Noe', 'Nicolas Winding Refn', 'Darren Aronofsky'],
      films: ['Climax', 'Drive', 'Black Swan'],
      x: 61,
      y: 73,
      weight: 68,
    },
    {
      id: 'memory_collectors',
      label: 'Memory Collectors',
      icon: 'MC',
      short: 'Curate films that linger as personal memory fragments.',
      directors: ['Edward Yang', 'Hou Hsiao-hsien', 'Yasujiro Ozu'],
      films: ['Yi Yi', 'A City of Sadness', 'Tokyo Story'],
      x: 79,
      y: 67,
      weight: 71,
    },
  ];


  const buildAtlasScores = () => {
    const topGenre = (stats?.mostRatedGenre || '').toLowerCase();
    const avg = Number(stats?.avgYourRating || 0);

    const score = {
      pattern_seekers: patterns ? Math.round((patterns.explorationScore + patterns.nicheScore) / 2) : 50,
      visualists: topGenre.includes('animation') || topGenre.includes('sci') ? 78 : 62,
      emotion_divers: avg >= 8 ? 74 : 58,
      film_analysts: patterns ? Math.round((patterns.loyaltyScore + patterns.ratingConsistency) / 2) : 55,
      atmosphere_wanderers: patterns ? Math.round((patterns.nicheScore + 60) / 2) : 60,
      story_seekers: topGenre.includes('drama') || topGenre.includes('crime') ? 76 : 61,
      myth_seekers: topGenre.includes('fantasy') || topGenre.includes('adventure') ? 72 : 54,
      reality_explorers: topGenre.includes('documentary') || topGenre.includes('biography') ? 73 : 57,
      sensory_seekers: topGenre.includes('horror') || topGenre.includes('thriller') ? 72 : 56,
      memory_collectors: avg >= 7.5 ? 68 : 52,
    };

    return score;
  };

  const _atlasScores = buildAtlasScores();
  const stableProfileUpdatedAt = React.useMemo(
    () => lastDataSyncAt || (fileName ? new Date().toISOString() : null),
    [lastDataSyncAt, fileName]
  );

  const currentMemberSnapshot = React.useMemo(() => {
    if (!data || !stats) return null;

        return {
          stats: {
            totalFilms: Number(stats?.totalFilms || 0),
            avgYourRating: Number(stats?.avgYourRating || 0),
            mostRatedGenre: String(stats?.mostRatedGenre || 'N/A'),
          },
          followings: Array.isArray(followedMemberIds) ? followedMemberIds : [],
          aboutMe: aboutMe || '',
          publicIdentity: getPublicIdentityPayload(),
          profileLinks: {
            instagram: socialLinks.instagram || '',
            x: socialLinks.x || '',
            facebook: socialLinks.facebook || '',
          },
          personality: personality
            ? {
                archetype: personality.archetype,
                description: personality.description,
                traits: personality.traits || [],
              }
          : null,
        ratingDist: Array.isArray(ratingDist) ? ratingDist : [],
        topGenres: Array.isArray(mostWatchedGenres?.genres) ? mostWatchedGenres.genres.slice(0, 10) : [],
        eraPreference: Array.isArray(eraPreference) ? eraPreference : [],
        countryPreference: Array.isArray(countryPreference) ? countryPreference.slice(0, 20) : [],
        cinemaMind: Array.isArray(cinemaMindProfile?.archetypes) ? cinemaMindProfile.archetypes : [],
        cinemaSignals: Array.isArray(cinemaMindProfile?.signals) ? cinemaMindProfile.signals : [],
        patterns: patterns || null,
        moodboards: Array.isArray(moodboards) ? moodboards : [],
        dataset: Array.isArray(data) ? toShareableRows(data) : [],
        updatedAt: stableProfileUpdatedAt,
      };
    }, [data, stats, personality, ratingDist, mostWatchedGenres, eraPreference, countryPreference, cinemaMindProfile, patterns, socialLinks, followedMemberIds, aboutMe, moodboards, stableProfileUpdatedAt, getPublicIdentityPayload]);

  const minimalMemberSnapshot = React.useMemo(() => ({
    stats: {
      totalFilms: Number(stats?.totalFilms || 0),
      avgYourRating: Number(stats?.avgYourRating || 0),
      mostRatedGenre: String(stats?.mostRatedGenre || 'N/A'),
    },
    followings: Array.isArray(followedMemberIds) ? followedMemberIds : [],
    aboutMe: aboutMe || '',
    publicIdentity: getPublicIdentityPayload(),
    profileLinks: {
      instagram: socialLinks.instagram || '',
      x: socialLinks.x || '',
      facebook: socialLinks.facebook || '',
    },
    personality: personality
      ? {
          archetype: personality.archetype,
          description: personality.description,
          traits: personality.traits || [],
        }
      : null,
    ratingDist: Array.isArray(ratingDist) ? ratingDist : [],
    topGenres: Array.isArray(mostWatchedGenres?.genres) ? mostWatchedGenres.genres.slice(0, 10) : [],
    eraPreference: Array.isArray(eraPreference) ? eraPreference : [],
    countryPreference: Array.isArray(countryPreference) ? countryPreference.slice(0, 20) : [],
    cinemaMind: Array.isArray(cinemaMindProfile?.archetypes) ? cinemaMindProfile.archetypes : [],
    cinemaSignals: Array.isArray(cinemaMindProfile?.signals) ? cinemaMindProfile.signals : [],
    patterns: patterns || null,
    moodboards: Array.isArray(moodboards) ? moodboards : [],
    dataset: Array.isArray(data) ? toShareableRows(data) : [],
    updatedAt: stableProfileUpdatedAt,
  }), [data, stats, personality, ratingDist, mostWatchedGenres, eraPreference, countryPreference, cinemaMindProfile, patterns, socialLinks, followedMemberIds, aboutMe, moodboards, stableProfileUpdatedAt, getPublicIdentityPayload]);

  const tasteResonance = React.useMemo(() => {
    if (!memberViewUserId) return null;
    const ownFilms = Array.isArray(ownDashboardDataRef.current) ? ownDashboardDataRef.current : [];
    const otherFilms = Array.isArray(data) ? data : [];
    if (!ownFilms.length || !otherFilms.length) return null;

    const ownSnapshot = currentMemberSnapshot || minimalMemberSnapshot || {};
    const otherSnapshot = memberViewSnapshot || {};

    const ownByKey = new Map(ownFilms.map((f) => [toFilmKey(f), f]));
    const otherByKey = new Map(otherFilms.map((f) => [toFilmKey(f), f]));
    const sharedKeys = [...ownByKey.keys()].filter((k) => otherByKey.has(k));

    const sharedRatings = sharedKeys
      .map((k) => {
        const a = Number(ownByKey.get(k)?.yourRating || 0);
        const b = Number(otherByKey.get(k)?.yourRating || 0);
        if (!a || !b) return null;
        return Math.abs(a - b);
      })
      .filter((v) => Number.isFinite(v));
    const avgDiff = sharedRatings.length
      ? sharedRatings.reduce((s, n) => s + n, 0) / sharedRatings.length
      : 5;
    const ratingSimilarity = Math.max(0, 100 - (avgDiff / 5) * 100);

    const ownGenres = new Set();
    const otherGenres = new Set();
    ownFilms.forEach((f) => (f.genres || '').split(',').map((g) => g.trim().toLowerCase()).filter(Boolean).forEach((g) => ownGenres.add(g)));
    otherFilms.forEach((f) => (f.genres || '').split(',').map((g) => g.trim().toLowerCase()).filter(Boolean).forEach((g) => otherGenres.add(g)));
    const genreOverlap = jaccard(ownGenres, otherGenres) * 100;

    const ownDirectors = new Set();
    const otherDirectors = new Set();
    ownFilms.forEach((f) => (f.directors || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean).forEach((d) => ownDirectors.add(d)));
    otherFilms.forEach((f) => (f.directors || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean).forEach((d) => otherDirectors.add(d)));
    const directorOverlap = jaccard(ownDirectors, otherDirectors) * 100;

    const ownMindMap = Object.fromEntries((ownSnapshot?.cinemaMind || []).map((a) => [String(a?.archetype || a?.name || '').toLowerCase(), Number(a?.score || a?.value || 0)]));
    const otherMindMap = Object.fromEntries((otherSnapshot?.cinemaMind || []).map((a) => [String(a?.archetype || a?.name || '').toLowerCase(), Number(a?.score || a?.value || 0)]));
    const archetypeSimilarity = cosineFromMaps(ownMindMap, otherMindMap) * 100;

    const ownSpectrums = calculateSpectrums(ownFilms) || [];
    const otherSpectrums = calculateSpectrums(otherFilms) || [];
    const targetAxes = [
      'Light|Dark',
      'Slow Burn|Fast Paced',
      'Mainstream|Niche',
      'Dialogue|Visual',
      'Indie|Big Budget',
      'Realistic|Surreal',
    ];
    const ownSpecMap = Object.fromEntries(ownSpectrums.map((s) => [`${s.left}|${s.right}`, Number(s.value || 50)]));
    const otherSpecMap = Object.fromEntries(otherSpectrums.map((s) => [`${s.left}|${s.right}`, Number(s.value || 50)]));
    const spectrumDiffs = targetAxes.map((k) => ({ key: k, diff: Math.abs((ownSpecMap[k] ?? 50) - (otherSpecMap[k] ?? 50)) }));
    const spectrumSimilarity = Math.max(0, 100 - (spectrumDiffs.reduce((s, x) => s + x.diff, 0) / (spectrumDiffs.length * 100)) * 100);

    const ownMoodWords = new Set((ownSnapshot?.moodboards || []).flatMap((m) => uniqueWords(m?.title)));
    const otherMoodWords = new Set((otherSnapshot?.moodboards || []).flatMap((m) => uniqueWords(m?.title)));
    const moodboardSimilarity = jaccard(ownMoodWords, otherMoodWords) * 100;

    const ownDecades = new Set((calculateDecadeDistribution(ownFilms) || []).slice(0, 5).map((d) => Number(d.decade)));
    const otherDecades = new Set((calculateDecadeDistribution(otherFilms) || []).slice(0, 5).map((d) => Number(d.decade)));
    const decadeOverlap = jaccard(ownDecades, otherDecades) * 100;

    const ownPopularity = calculatePopularityBuckets(ownFilms);
    const otherPopularity = calculatePopularityBuckets(otherFilms);
    const ownNiche = Number((ownPopularity.find((p) => p.label === 'Niche') || {}).percentage || 0);
    const otherNiche = Number((otherPopularity.find((p) => p.label === 'Niche') || {}).percentage || 0);
    const nicheAlignment = Math.max(0, 100 - Math.abs(ownNiche - otherNiche));

    const weighted =
      ratingSimilarity * 0.24 +
      genreOverlap * 0.13 +
      directorOverlap * 0.13 +
      archetypeSimilarity * 0.14 +
      spectrumSimilarity * 0.14 +
      moodboardSimilarity * 0.08 +
      decadeOverlap * 0.07 +
      nicheAlignment * 0.07;
    const score = Math.round(Math.max(0, Math.min(100, weighted)));

    const ownTopGenres = (ownSnapshot?.topGenres || []).map((g) => String(g?.genre || '').toLowerCase()).filter(Boolean);
    const otherTopGenres = (otherSnapshot?.topGenres || []).map((g) => String(g?.genre || '').toLowerCase()).filter(Boolean);
    const sharedGenreTags = [...new Set(ownTopGenres.filter((g) => otherTopGenres.includes(g)))].slice(0, 5).map((g) => g.replace(/\b\w/g, (m) => m.toUpperCase()));

    const ownTopDirectors = [...ownDirectors].slice(0, 20);
    const otherTopDirectors = new Set([...otherDirectors].slice(0, 20));
    const sharedDirectorTags = ownTopDirectors.filter((d) => otherTopDirectors.has(d)).slice(0, 5).map((d) => d.replace(/\b\w/g, (m) => m.toUpperCase()));

    const ownArchetypes = (ownSnapshot?.cinemaMind || []).slice(0, 4).map((x) => String(x?.archetype || x?.name || ''));
    const otherArchetypes = new Set((otherSnapshot?.cinemaMind || []).slice(0, 4).map((x) => String(x?.archetype || x?.name || '')));
    const sharedArchetypeTags = ownArchetypes.filter((x) => otherArchetypes.has(x)).slice(0, 4);

    const sharedMoodTags = [...new Set([...ownMoodWords].filter((w) => otherMoodWords.has(w)))].slice(0, 5).map((w) => w.replace(/\b\w/g, (m) => m.toUpperCase()));

    const sharedCanon = sharedKeys
      .map((k) => {
        const a = ownByKey.get(k);
        const b = otherByKey.get(k);
        const ar = Number(a?.yourRating || 0);
        const br = Number(b?.yourRating || 0);
        if (ar < 8 || br < 8) return null;
        return {
          title: a?.title || b?.title,
          year: Number(a?.year || b?.year || 0),
          imdbId: a?.imdbId || b?.imdbId || '',
          yourRating: ar,
          memberRating: br,
          sharedAvg: ((ar + br) / 2).toFixed(1),
        };
      })
      .filter(Boolean)
      .sort((x, y) => Number(y.sharedAvg) - Number(x.sharedAvg))
      .slice(0, 18);

    const spectrumComparison = targetAxes.map((key) => {
      const [left, right] = key.split('|');
      return {
        left,
        right,
        mine: ownSpecMap[key] ?? 50,
        theirs: otherSpecMap[key] ?? 50,
        diff: Math.abs((ownSpecMap[key] ?? 50) - (otherSpecMap[key] ?? 50)),
      };
    });

    const differences = [];
    const mostDifferent = [...spectrumComparison].sort((a, b) => b.diff - a.diff).slice(0, 3);
    mostDifferent.forEach((d) => {
      if (d.diff < 14) return;
      const mineSide = d.mine > 50 ? d.right : d.left;
      const theirSide = d.theirs > 50 ? d.right : d.left;
      differences.push(`You lean ${mineSide.toLowerCase()}, while ${memberViewName || 'they'} lean ${theirSide.toLowerCase()}.`);
    });
    if (Math.abs(ownNiche - otherNiche) > 18) {
      differences.push(ownNiche > otherNiche
        ? 'You champion niche cinema more consistently, while they gravitate slightly more mainstream.'
        : 'They champion niche cinema more consistently, while you stay closer to widely loved titles.');
    }
    if (!differences.length) differences.push('Your taste differences are subtle: you diverge in tone and pacing more than in core cinematic values.');

    const relationshipType = (() => {
      if (score >= 84) return { name: 'Mirror Souls', line: 'Two cinematic minds moving through the same emotional weather.' };
      if (score >= 74) return { name: 'Parallel Dreamers', line: 'Different paths, same horizon of feeling and form.' };
      if (score >= 64) return { name: 'Neon & Dust', line: 'A vivid blend of overlap and friction that keeps discovery alive.' };
      if (score >= 54) return { name: 'Chaos and Stillness', line: 'One heart seeks velocity, the other seeks still frames.' };
      return { name: 'Opposite Lenses', line: 'Contrasting film souls that challenge each other\'s cinematic comfort zone.' };
    })();

    const poetic = score >= 75
      ? 'Your cinematic worlds overlap through introspective storytelling, emotional ambiguity, and atmospheric realism.'
      : score >= 60
      ? 'You share several emotional coordinates, but diverge in how intensity and narrative momentum should unfold.'
      : 'Your film languages are different, yet that contrast can unlock unexpected discoveries.';

    return {
      score,
      poetic,
      relationshipType,
      metricBreakdown: {
        ratingSimilarity: Math.round(ratingSimilarity),
        genreOverlap: Math.round(genreOverlap),
        directorOverlap: Math.round(directorOverlap),
        archetypeSimilarity: Math.round(archetypeSimilarity),
        spectrumSimilarity: Math.round(spectrumSimilarity),
        moodboardSimilarity: Math.round(moodboardSimilarity),
        decadeOverlap: Math.round(decadeOverlap),
        nicheAlignment: Math.round(nicheAlignment),
      },
      sharedTags: {
        genres: sharedGenreTags,
        directors: sharedDirectorTags,
        moods: sharedMoodTags,
        archetypes: sharedArchetypeTags,
        patterns: (ownSnapshot?.personality?.traits || []).filter((t) => (otherSnapshot?.personality?.traits || []).includes(t)).slice(0, 5),
      },
      spectrumComparison,
      sharedCanon,
      sharedCanonAvg: sharedCanon.length ? (sharedCanon.reduce((s, m) => s + Number(m.sharedAvg), 0) / sharedCanon.length).toFixed(1) : '0.0',
      differences,
    };
  }, [memberViewUserId, data, memberViewSnapshot, currentMemberSnapshot, minimalMemberSnapshot, memberViewName]);

  useEffect(() => {
    if (!showTasteResonance || !tasteResonance?.sharedCanon?.length) return;
    loadPostersForFilms(tasteResonance.sharedCanon.slice(0, 18));
  }, [showTasteResonance, tasteResonance]);

  const currentMemberRecord = React.useMemo(() => {
    if (!user) return null;

    return {
      id: `self_${user.id}`,
      userId: user.id,
      name: resolvedOwnPublicName || 'You',
      email: user.email || '',
      avatarUrl: user.user_metadata?.avatar_url || '',
      joinedAt: user.created_at || null,
      updatedAt: currentMemberSnapshot?.updatedAt || minimalMemberSnapshot?.updatedAt || stableProfileUpdatedAt || null,
      snapshot: currentMemberSnapshot || minimalMemberSnapshot,
      isCurrentUser: true,
    };
  }, [user, resolvedOwnPublicName, currentMemberSnapshot, minimalMemberSnapshot, stableProfileUpdatedAt]);

  const publicMemberSnapshot = React.useMemo(
    () => toPublicMemberSnapshot(currentMemberSnapshot || minimalMemberSnapshot),
    [currentMemberSnapshot, minimalMemberSnapshot]
  );
  const publicMemberSnapshotKey = React.useMemo(
    () => stableStringify(publicMemberSnapshot),
    [publicMemberSnapshot]
  );
  useEffect(() => {
    if (!currentMemberRecord || memberViewUserId) return;

    try {
      const existing = JSON.parse(localStorage.getItem(MEMBERS_LOCAL_CACHE_KEY) || '[]');
      const list = Array.isArray(existing) ? existing : [];
      const record = {
        ...currentMemberRecord,
        isCurrentUser: false,
      };

      const next = [
        ...list.filter((item) => String(item?.userId || item?.user_id || '') !== String(record.userId)),
        record,
      ].slice(-200);

      localStorage.setItem(MEMBERS_LOCAL_CACHE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Failed to cache local members directory:', e);
    }
  }, [currentMemberRecord, data, fileName, lastDataSyncAt, memberViewUserId]);

  useEffect(() => {
    if (!user || !membersEnabled || memberViewUserId || !hasHydratedCurrentUserData) return;

    let cancelled = false;
    (async () => {
      const snapshotToSave = toPublicMemberSnapshot({
        ...(publicMemberSnapshot || {}),
        publicIdentity: getPublicIdentityPayload(),
      });
      const payload = {
        user_id: user.id,
        display_name: resolvedOwnPublicName,
        email: user.email || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        snapshot: snapshotToSave,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('member_profiles')
        .upsert(payload, { onConflict: 'user_id' });

      if (cancelled) return;
      if (error) {
        console.error('member_profiles upsert failed:', error);
        if (error?.code === 'PGRST205' || error?.status === 404) {
          setMembersEnabled(false);
          setMembersError('Member directory table not configured yet.');
        } else {
          setMembersError(`Member sync failed (${error?.code || 'ERR'}): ${error?.message || 'Unknown error'}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, membersEnabled, memberViewUserId, publicMemberSnapshotKey, hasHydratedCurrentUserData]);

  const fetchMemberList = async ({ page = 0, pageSize = 30, publicOnly = false } = {}) => {
    const from = Math.max(0, Number(page) || 0) * (Number(pageSize) || 30);
    const to = from + (Number(pageSize) || 30) - 1;
    const publicColumns = `
      id,
      user_id,
      display_name,
      avatar_url,
      created_at,
      updated_at,
      stats,
      followings,
      aboutMe,
      profileLinks
    `;
    if (publicOnly) {
      const viewResult = await runSupabaseResilient('member_profiles:list_public_view', () =>
        supabase
          .from('public_member_profiles')
          .select('*')
          .order('updated_at', { ascending: false })
          .range(from, to)
      , { timeoutMs: 18000, retries: 2, baseDelayMs: 450 });
      if (!viewResult?.error) return viewResult;

      return runSupabaseResilient('member_profiles:list_public', () =>
        supabase.rpc('get_public_member_profiles', {
          page_limit: Number(pageSize) || 200,
          page_offset: from,
        })
      , { timeoutMs: 18000, retries: 2, baseDelayMs: 450 });
    }
    const source = publicOnly ? 'public_member_profiles' : 'member_profiles';
    const columns = publicOnly
      ? publicColumns
      : `
          id,
          user_id,
          display_name,
          avatar_url,
          created_at,
          updated_at,
          stats:snapshot->stats,
          followings:snapshot->followings,
          aboutMe:snapshot->aboutMe,
          profileLinks:snapshot->profileLinks
        `;
    return runSupabaseResilient('member_profiles:list', () =>
      supabase
        .from(source)
        .select(columns)
        .order('updated_at', { ascending: false })
        .range(from, to)
    , { timeoutMs: 18000, retries: 2, baseDelayMs: 450 });
  };

  const fetchMemberProfile = async (memberUserId, { publicOnly = false } = {}) => {
    if (!memberUserId) return { data: null, error: null };
    if (publicOnly) {
      const viewResult = await runSupabaseResilient('member_profiles:profile_public_view', () =>
        supabase
          .from('public_member_profiles')
          .select('*')
          .eq('user_id', String(memberUserId))
          .maybeSingle()
      , { timeoutMs: 12000, retries: 2, baseDelayMs: 350 });
      if (!viewResult?.error) return viewResult;

      return runSupabaseResilient('member_profiles:profile_public', () =>
        supabase.rpc('get_public_member_profile', {
          profile_user_id: String(memberUserId),
        })
      , { timeoutMs: 12000, retries: 2, baseDelayMs: 350 });
    }
    return runSupabaseResilient('member_profiles:profile', () =>
      supabase
        .from('member_profiles')
        .select(`
          id,
          user_id,
          display_name,
          avatar_url,
          created_at,
          updated_at,
          stats:snapshot->stats,
          aboutMe:snapshot->aboutMe,
          profileLinks:snapshot->profileLinks
        `)
        .eq('user_id', String(memberUserId))
        .maybeSingle()
    , { timeoutMs: 12000, retries: 2, baseDelayMs: 350 });
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  useEffect(() => {
    if (activeTab !== 'members' && activeTab !== 'following' && activeTab !== 'followers') return;
    if (membersFetchInFlightRef.current) return;

    let cancelled = false;
    const hydrateMembers = async () => {
      membersFetchInFlightRef.current = true;
      setMembersLoading(true);
      setMembersError('');

      const localFallback = (() => {
        try {
          const cached = JSON.parse(localStorage.getItem(MEMBERS_LOCAL_CACHE_KEY) || '[]');
          if (!Array.isArray(cached)) return [];

          return cached
            .map((row, idx) => {
              const userId = row?.userId || row?.user_id || `local_${idx}`;
              let snapshot = row?.snapshot || null;
              if (!snapshot || (!Array.isArray(snapshot?.dataset) && !Array.isArray(snapshot?.rows) && !Array.isArray(snapshot?.data))) {
                try {
                  const perUserRaw = localStorage.getItem(memberDatasetKey(userId));
                  const perUserParsed = perUserRaw ? JSON.parse(perUserRaw) : null;
                  if (Array.isArray(perUserParsed) && perUserParsed.length) {
                    snapshot = {
                      ...(snapshot || {}),
                      dataset: perUserParsed,
                    };
                  }
                } catch {
                  // ignore per-user cache parse errors
                }
              }
              return {
                id: String(row?.id || userId || idx),
                userId: String(userId),
                name: row?.name || row?.display_name || row?.email || `Member ${idx + 1}`,
                email: row?.email || '',
                avatarUrl: row?.avatarUrl || row?.avatar_url || '',
                joinedAt: row?.joinedAt || row?.created_at || null,
                updatedAt: row?.updatedAt || row?.updated_at || null,
                snapshot,
                isCurrentUser: user && String(userId) === String(user.id),
              };
            })
            .filter((item) => item?.userId);
        } catch {
          return [];
        }
      })();

      const localBase = [...localFallback, ...(currentMemberRecord ? [currentMemberRecord] : [])].reduce((acc, item) => {
        if (!item?.userId) return acc;
        const index = acc.findIndex((m) => String(m.userId) === String(item.userId));
        if (index === -1) {
          acc.push(item);
        } else {
          acc[index] = item;
        }
        return acc;
      }, []);

      // Always show local/cache members immediately so UI never appears empty/stuck.
      setMembersDirectory(localBase);

      if (!membersEnabled) {
        setMembersLoading(false);
        return;
      }
      let slowNoticeTimer = null;
      let fetchTimeoutTimer = null;
      try {
        // Keep directory fetch lightweight while staying robust on slower networks.
        let slowNoticeShown = false;
        slowNoticeTimer = setTimeout(() => {
          slowNoticeShown = true;
          if (!cancelled) {
            setMembersError('Refreshing members is taking longer than usual...');
          }
        }, 12000);

        console.time('member_profiles:list');
        const timeoutMs = 18000;
        let rows = [];
        let error = null;
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const publicDirectoryPageSize = publicCommunityMode && !user ? 200 : 30;
          const queryPromise = fetchMemberList({
            page: membersPage,
            pageSize: publicDirectoryPageSize,
            publicOnly: publicCommunityMode && !user,
          });
          const timeoutPromise = new Promise((resolve) => {
            fetchTimeoutTimer = setTimeout(() => {
              resolve({
                data: [],
                error: { code: 'CLIENT_TIMEOUT', message: `Members request exceeded ${timeoutMs}ms` },
              });
            }, timeoutMs);
          });

          const result = await Promise.race([queryPromise, timeoutPromise]);
          if (fetchTimeoutTimer) clearTimeout(fetchTimeoutTimer);
          rows = result?.data || [];
          error = result?.error || null;

          if (!error) break;
          const publicAccessMissing = publicCommunityMode && !user && (
            error?.code === 'PGRST202' ||
            error?.code === 'PGRST205' ||
            /public_member_profiles|get_public_member_profiles/i.test(String(error?.message || ''))
          );
          if (publicAccessMissing) break;
          if (attempt < maxRetries) {
            const base = 400 * (attempt + 1);
            const jitter = Math.floor(Math.random() * 220);
            if (!cancelled) {
              setMembersError(`Refreshing members failed. Retrying (${attempt + 1}/${maxRetries})...`);
            }
            await sleep(base + jitter);
          }
        }
        console.timeEnd('member_profiles:list');

        clearTimeout(slowNoticeTimer);
        if (!cancelled && slowNoticeShown) {
          setMembersError('');
        }
        if (cancelled) return;

        if (error) {
          console.error('member_profiles select failed:', error);
          const publicAccessMissing = publicCommunityMode && !user && (
            error?.code === 'PGRST202' ||
            error?.code === 'PGRST205' ||
            /public_member_profiles|get_public_member_profiles/i.test(String(error?.message || ''))
          );
          if (publicAccessMissing) {
            setMembersError('Public community access is not configured in Supabase yet. Showing cached members.');
          } else if (error?.code === 'PGRST205' || error?.status === 404) {
            setMembersEnabled(false);
            setMembersError('Member directory table not configured yet.');
          } else if (error?.code === 'CLIENT_TIMEOUT') {
            setMembersError('Member directory request timed out. Showing cached members.');
          } else {
            setMembersError(`Could not load members (${error?.code || 'ERR'}): ${error?.message || 'Unknown error'}`);
          }
          return;
        }

        const normalized = (rows || []).map((row, idx) => {
          const lightweightSnapshot = {
            stats: row?.stats || null,
            followings: Array.isArray(row?.followings) ? row.followings : [],
            aboutMe: row?.aboutMe || '',
            profileLinks: row?.profileLinks || { instagram: '', x: '', facebook: '' },
          };

          const userId = row?.user_id || row?.id || `member_${idx}`;
          return {
            id: String(row?.id || userId || idx),
            userId: String(userId),
            name: row?.display_name || row?.name || row?.email || `Member ${idx + 1}`,
            email: row?.email || '',
            avatarUrl: row?.avatar_url || '',
            joinedAt: row?.created_at || null,
            updatedAt: row?.updated_at || null,
            snapshot: lightweightSnapshot,
            isCurrentUser: user && String(userId) === String(user.id),
          };
        });

        const mergedByUser = new Map();
        [...localBase, ...normalized].forEach((item) => {
          if (!item?.userId) return;
          const key = String(item.userId);
          const existing = mergedByUser.get(key);
          if (!existing) {
            mergedByUser.set(key, item);
            return;
          }

          const existingUpdated = new Date(existing?.updatedAt || 0).getTime();
          const candidateUpdated = new Date(item?.updatedAt || 0).getTime();
          if (candidateUpdated >= existingUpdated) {
            mergedByUser.set(key, item);
          }
        });

        const merged = Array.from(mergedByUser.values());
        setMembersDirectory(merged);
      } catch (err) {
        console.timeEnd('member_profiles:list');
        if (cancelled) return;
        if (String(err?.message || '').toLowerCase().includes('timeout')) {
          setMembersError('Member directory request timed out. Showing cached members.');
        } else {
          setMembersError('Could not refresh members right now. Showing cached members.');
        }
      } finally {
        if (slowNoticeTimer) clearTimeout(slowNoticeTimer);
        if (fetchTimeoutTimer) clearTimeout(fetchTimeoutTimer);
        membersFetchInFlightRef.current = false;
        if (!cancelled) setMembersLoading(false);
      }
    };

    hydrateMembers();

  return () => {
      cancelled = true;
      membersFetchInFlightRef.current = false;
    };
  }, [activeTab, membersEnabled, user?.id, currentMemberRecord?.updatedAt, membersPage, membersRetryNonce, publicCommunityMode]);

  useEffect(() => {
    if (!membersEnabled || !user) return;
    const channel = supabase
      .channel('member_profiles_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_profiles' },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (!row) return;
          let snapshot = row?.snapshot || null;
          if (typeof snapshot === 'string') {
            try {
              snapshot = JSON.parse(snapshot);
            } catch {
              snapshot = null;
            }
          }
          const userId = row?.user_id || row?.id;
          if (!userId) return;
          const nextRecord = {
            id: String(row?.id || userId),
            userId: String(userId),
            name: row?.display_name || row?.name || row?.email || 'Cinephile',
            email: row?.email || '',
            avatarUrl: row?.avatar_url || '',
            joinedAt: row?.created_at || null,
            updatedAt: row?.updated_at || null,
            snapshot,
            isCurrentUser: String(userId) === String(user.id),
          };
          setMembersDirectory((prev) => {
            const list = Array.isArray(prev) ? prev.slice() : [];
            const index = list.findIndex((item) => String(item.userId) === String(nextRecord.userId));
            if (payload.eventType === 'DELETE') {
              return index >= 0 ? list.filter((_, idx) => idx !== index) : list;
            }
            if (index >= 0) {
              list[index] = nextRecord;
              return list;
            }
            return [nextRecord, ...list].slice(0, 200);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [membersEnabled, user]);

  const refreshFollowsState = React.useCallback(async () => {
    if (!user || !followsTableEnabled) return;
    try {
      const [followingRes, followersRes] = await Promise.all([
        runSupabaseResilient(
          'follows:following',
          () => supabase
            .from('follows')
            .select('followed_user_id')
            .eq('follower_user_id', user.id)
            .limit(500),
          { timeoutMs: 10000, retries: 2, baseDelayMs: 300 }
        ),
        runSupabaseResilient(
          'follows:followers',
          () => supabase
            .from('follows')
            .select('follower_user_id,created_at')
            .eq('followed_user_id', user.id)
            .limit(500),
          { timeoutMs: 10000, retries: 2, baseDelayMs: 300 }
        ),
      ]);
      if (!followingRes.error) {
        const followingIds = (followingRes.data || [])
          .map((row) => String(row?.followed_user_id || '').trim())
          .filter(Boolean);
        setFollowedMemberIds((prev) => (sameStringList(prev, followingIds) ? prev : followingIds));
      }
      if (!followersRes.error) {
        const followerRows = Array.isArray(followersRes.data) ? followersRes.data : [];
        const followerIds = followerRows
          .map((row) => String(row?.follower_user_id || '').trim())
          .filter(Boolean);
        setFollowerUserIds((prev) => (sameStringList(prev, followerIds) ? prev : followerIds));
        const followerKeys = followerRows
          .map((row) => {
            const idVal = String(row?.follower_user_id || '').trim();
            if (!idVal) return '';
            const atVal = row?.created_at ? String(row.created_at) : '';
            return `${idVal}|${atVal}`;
          })
          .filter(Boolean);
        setFollowerFollowKeys((prev) => (sameStringList(prev, followerKeys) ? prev : followerKeys));
      }
    } catch {
      // keep last known local state
    }
  }, [user, followsTableEnabled]);

  useEffect(() => {
    if (!user || !followsTableEnabled) return;
    let cancelled = false;
    const safeRefresh = async () => {
      if (cancelled) return;
      await refreshFollowsState();
    };

    const onVisibilityOrFocus = () => {
      safeRefresh();
    };

    const intervalId = window.setInterval(safeRefresh, 12000);
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [user, followsTableEnabled, refreshFollowsState]);

  useEffect(() => {
    if (!user || !followsTableEnabled) return;
    const refresh = async () => {
      try {
        await refreshFollowsState();
      } catch {
        // keep last known local state
      }
    };

    refresh();

    const channel = supabase
      .channel('follows_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'follows' },
        () => {
          refresh();
        }
      )
      .subscribe();

    const refreshInterval = setInterval(() => {
      refresh();
    }, 12000);

    const onWindowFocus = () => {
      refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [user?.id, followsTableEnabled, refreshFollowsState]);

  const followedMembersList = React.useMemo(
    () => membersDirectory.filter((member) => followedMemberIds.includes(String(member.userId))),
    [membersDirectory, followedMemberIds]
  );

  const followersMembersList = React.useMemo(() => {
    if (!user) return [];
    if (followsTableEnabled) {
      const followerSet = new Set((followerUserIds || []).map((id) => String(id)));
      return membersDirectory.filter((member) => followerSet.has(String(member?.userId || '')));
    }
    const userId = String(user.id);
    return membersDirectory.filter((member) => {
      if (!member?.snapshot?.followings) return false;
      return Array.isArray(member.snapshot.followings)
        ? member.snapshot.followings.map((id) => String(id)).includes(userId)
        : false;
    });
  }, [membersDirectory, user, followerUserIds, followsTableEnabled]);

  useEffect(() => {
    if (!membersEnabled || !followsTableEnabled) return;
    const followerIds = (Array.isArray(followerUserIds) ? followerUserIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    if (!followerIds.length) return;

    const existing = new Set(
      (Array.isArray(membersDirectory) ? membersDirectory : [])
        .map((member) => String(member?.userId || '').trim())
        .filter(Boolean)
    );
    const missingIds = followerIds.filter((id) => !existing.has(id));
    if (!missingIds.length) return;

    let cancelled = false;
    (async () => {
      try {
        const fetched = await Promise.all(missingIds.map((id) => fetchMemberProfile(id).catch(() => ({ data: null }))));
        if (cancelled) return;
        const nextRecords = fetched
          .map((result, idx) => {
            const row = result?.data;
            const userId = String(missingIds[idx] || '');
            if (!userId) return null;
            return {
              id: String(row?.id || userId),
              userId,
              name: row?.display_name || row?.name || row?.email || 'Cinephile',
              email: row?.email || '',
              avatarUrl: row?.avatar_url || '',
              joinedAt: row?.created_at || null,
              updatedAt: row?.updated_at || null,
              snapshot: row?.snapshot || null,
              isCurrentUser: String(userId) === String(user?.id || ''),
            };
          })
          .filter(Boolean);
        if (!nextRecords.length) return;

        setMembersDirectory((prev) => {
          const base = Array.isArray(prev) ? prev.slice() : [];
          nextRecords.forEach((record) => {
            const idx = base.findIndex((entry) => String(entry?.userId || '') === String(record.userId));
            if (idx >= 0) base[idx] = { ...base[idx], ...record };
            else base.push(record);
          });
          return base;
        });
      } catch {
        // ignore follower profile hydration failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [membersEnabled, followsTableEnabled, followerUserIds, membersDirectory, user?.id]);

  const followerFollowKeyByUserId = React.useMemo(() => {
    const map = new Map();
    (followerFollowKeys || []).forEach((entry) => {
      const raw = String(entry || '');
      if (!raw) return;
      const sep = raw.indexOf('|');
      if (sep <= 0) return;
      const id = raw.slice(0, sep);
      if (!id) return;
      map.set(id, raw);
    });
    return map;
  }, [followerFollowKeys]);

  const filterMembersByQuery = React.useCallback((list, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return list;
    return (Array.isArray(list) ? list : []).filter((member) => {
      const name = String(member?.name || '').toLowerCase();
      return name.includes(q);
    });
  }, []);

  const hasSyncedMemberData = React.useCallback((member) => {
    if (!member) return false;
    const statsTotal = Number(member?.snapshot?.stats?.totalFilms || member?.stats?.totalFilms || 0);
    if (statsTotal > 0) return true;

    const snapshotRows = Array.isArray(member?.snapshot?.dataset)
      ? member.snapshot.dataset
      : Array.isArray(member?.snapshot?.rows)
      ? member.snapshot.rows
      : Array.isArray(member?.snapshot?.data)
      ? member.snapshot.data
      : null;
    if (Array.isArray(snapshotRows) && snapshotRows.length > 0) return true;

    const userId = String(member?.userId || '');
    if (!userId) return false;
    try {
      const cachedRaw = localStorage.getItem(memberDatasetKey(userId));
      const cachedRows = cachedRaw ? JSON.parse(cachedRaw) : null;
      return Array.isArray(cachedRows) && cachedRows.length > 0;
    } catch {
      return false;
    }
  }, []);

  const filteredMembersDirectory = React.useMemo(() => {
    const base = filterMembersByQuery(membersDirectory, membersSearchQuery)
      .filter(hasSyncedMemberData);
    const selfId = String(user?.id || '');
    const selfEmail = String(user?.email || '').trim().toLowerCase();
    if (!selfId && !selfEmail) return base;
    return (Array.isArray(base) ? base : []).filter((member) => {
      if (member?.isCurrentUser) return false;
      const memberId = String(member?.userId || '');
      const memberEmail = String(member?.email || '').trim().toLowerCase();
      if (selfId && memberId === selfId) return false;
      if (selfEmail && memberEmail && memberEmail === selfEmail) return false;
      return true;
    });
  }, [membersDirectory, membersSearchQuery, filterMembersByQuery, hasSyncedMemberData, user?.id, user?.email]);
  const filteredFollowedMembersList = React.useMemo(
    () => filterMembersByQuery(followedMembersList, followingSearchQuery).filter(hasSyncedMemberData),
    [followedMembersList, followingSearchQuery, filterMembersByQuery, hasSyncedMemberData]
  );
  const filteredFollowersMembersList = React.useMemo(
    () => filterMembersByQuery(followersMembersList, followersSearchQuery).filter(hasSyncedMemberData),
    [followersMembersList, followersSearchQuery, filterMembersByQuery, hasSyncedMemberData]
  );

  const memberCardStatsByUserId = React.useMemo(() => {
    const map = new Map();
    const allMembers = Array.isArray(membersDirectory) ? membersDirectory : [];

    allMembers.forEach((member) => {
      const userId = String(member?.userId || '');
      if (!userId) return;

      let resolvedStats = member?.snapshot?.stats || null;

      const snapshotRows = Array.isArray(member?.snapshot?.dataset)
        ? member.snapshot.dataset
        : Array.isArray(member?.snapshot?.rows)
        ? member.snapshot.rows
        : Array.isArray(member?.snapshot?.data)
        ? member.snapshot.data
        : null;

      if (Array.isArray(snapshotRows) && snapshotRows.length) {
        resolvedStats = deriveMemberStatsFromRows(fromShareableRows(snapshotRows));
      } else {
        try {
          const cachedRaw = localStorage.getItem(memberDatasetKey(userId));
          if (cachedRaw) {
            const cachedRows = JSON.parse(cachedRaw);
            if (Array.isArray(cachedRows) && cachedRows.length) {
              resolvedStats = deriveMemberStatsFromRows(fromShareableRows(cachedRows));
            }
          }
        } catch {
          // ignore local cache parse failures
        }
      }

      map.set(userId, {
        totalFilms: Number(resolvedStats?.totalFilms || 0),
        avgYourRating: Number(resolvedStats?.avgYourRating || 0),
        mostRatedGenre: String(resolvedStats?.mostRatedGenre || 'N/A'),
      });
    });

    return map;
  }, [membersDirectory]);

  const newFollowersList = React.useMemo(() => {
    const seen = new Set((lastSeenFollowerIds || []).map((id) => String(id)));
    return followersMembersList.filter((member) => {
      const userId = String(member?.userId || '');
      if (!userId) return false;
      const followKey = followerFollowKeyByUserId.get(userId) || userId; // fallback supports legacy seen format
      return !seen.has(followKey);
    });
  }, [followersMembersList, lastSeenFollowerIds, followerFollowKeyByUserId]);

  const previousTopTabRef = React.useRef(activeTab);
  const resetMainScroll = React.useCallback(() => {
    requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      requestAnimationFrame(() => {
        mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const prevTab = previousTopTabRef.current;
    previousTopTabRef.current = activeTab;
    const leftFollowersTab = prevTab === 'followers' && activeTab !== 'followers';
    if (!leftFollowersTab) return;
    if (!newFollowersList.length) return;
    const seenKeys = followersMembersList
      .map((member) => {
        const userId = String(member?.userId || '');
        if (!userId) return '';
        return followerFollowKeyByUserId.get(userId) || userId;
      })
      .filter(Boolean);
    setLastSeenFollowerIds(seenKeys);
    try {
      localStorage.setItem(`imdb-followers-seen-${user.id}`, JSON.stringify(seenKeys));
    } catch {
      // ignore storage errors
    }
  }, [activeTab, followersMembersList, newFollowersList.length, user, followerFollowKeyByUserId]);

  const fetchMemberSnapshot = async (memberUserId) => {
    if (!memberUserId || !membersEnabled) return { snapshot: null, updatedAt: null, error: null };
    console.time('member_profiles:snapshot');
    try {
      if (publicCommunityMode && !user) {
        const { data: profileResult, error } = await fetchMemberProfile(memberUserId, { publicOnly: true });
        if (error) return { snapshot: null, updatedAt: null, error };
        const profileRow = Array.isArray(profileResult) ? profileResult[0] : profileResult;
        const snapshot = {
          stats: profileRow?.stats || null,
          aboutMe: profileRow?.aboutMe || '',
          profileLinks: profileRow?.profileLinks || { instagram: '', x: '', facebook: '' },
          dataset: Array.isArray(profileRow?.dataset) ? profileRow.dataset : [],
        };
        return { snapshot, updatedAt: profileRow?.updated_at || null, error: null };
      }
      const { data: remoteRow, error } = await runSupabaseResilient(
        'member_profiles:snapshot',
        () => supabase
          .from('member_profiles')
          .select('snapshot,updated_at')
          .eq('user_id', String(memberUserId))
          .maybeSingle(),
        { timeoutMs: 15000, retries: 2, baseDelayMs: 400 }
      );

      if (error) {
        return { snapshot: null, updatedAt: null, error };
      }
      let snapshot = remoteRow?.snapshot || null;
      if (typeof snapshot === 'string') {
        try {
          snapshot = JSON.parse(snapshot);
        } catch {
          snapshot = null;
        }
      }
      return { snapshot, updatedAt: remoteRow?.updated_at || null, error: null };
    } finally {
      console.timeEnd('member_profiles:snapshot');
    }
  };

  const openMemberDashboard = async (member) => {
    if (!member) return;

    let memberRecord = member;
    if (member?.userId) {
      try {
        const { data: profileResult } = await fetchMemberProfile(member.userId, { publicOnly: publicCommunityMode && !user });
        const profileRow = Array.isArray(profileResult) ? profileResult[0] : profileResult;
        if (profileRow) {
          memberRecord = {
            ...memberRecord,
            name: profileRow?.display_name || memberRecord?.name,
            email: profileRow?.email || memberRecord?.email,
            avatarUrl: profileRow?.avatar_url || memberRecord?.avatarUrl,
            updatedAt: profileRow?.updated_at || memberRecord?.updatedAt,
            snapshot: {
              ...(memberRecord?.snapshot || {}),
              stats: profileRow?.stats || memberRecord?.snapshot?.stats || null,
              aboutMe: profileRow?.aboutMe || memberRecord?.snapshot?.aboutMe || '',
              profileLinks: profileRow?.profileLinks || memberRecord?.snapshot?.profileLinks || { instagram: '', x: '', facebook: '' },
              dataset: profileRow?.dataset || memberRecord?.snapshot?.dataset || [],
            },
          };
        }
      } catch {
        // keep opening with existing cached member payload
      }
    }

    const snapshot = memberRecord?.snapshot || {};
    let resolvedSnapshot = snapshot;
    let sharedDatasetRaw = [];

    if (user && String(memberRecord?.userId) === String(user?.id) && Array.isArray(data) && data.length) {
      sharedDatasetRaw = data;
    }

    if (!sharedDatasetRaw.length) {
      try {
        const userDatasetRaw = localStorage.getItem(memberDatasetKey(memberRecord?.userId));
        if (userDatasetRaw) {
          const parsedUserDataset = JSON.parse(userDatasetRaw);
          if (Array.isArray(parsedUserDataset) && parsedUserDataset.length) {
            sharedDatasetRaw = parsedUserDataset;
          }
        }

        if (!sharedDatasetRaw.length) {
          sharedDatasetRaw = Array.isArray(snapshot?.dataset)
            ? snapshot.dataset
            : Array.isArray(snapshot?.rows)
            ? snapshot.rows
            : Array.isArray(snapshot?.data)
            ? snapshot.data
            : [];
        }

        if (!sharedDatasetRaw.length) {
          const cachedMembers = JSON.parse(localStorage.getItem(MEMBERS_LOCAL_CACHE_KEY) || '[]');
          const cachedMember = Array.isArray(cachedMembers)
            ? cachedMembers.find((m) => String(m?.userId || m?.user_id || '') === String(memberRecord?.userId || ''))
            : null;
          const cachedSnapshot = cachedMember?.snapshot || {};
          if (Array.isArray(cachedSnapshot?.dataset)) sharedDatasetRaw = cachedSnapshot.dataset;
          else if (Array.isArray(cachedSnapshot?.rows)) sharedDatasetRaw = cachedSnapshot.rows;
          else if (Array.isArray(cachedSnapshot?.data)) sharedDatasetRaw = cachedSnapshot.data;
        }
      } catch {
        // ignore local cache parse errors
      }
    }

    if (!sharedDatasetRaw.length && membersEnabled && memberRecord?.userId) {
      try {
        const { snapshot: remoteSnapshot, updatedAt: remoteUpdatedAt, error } = await fetchMemberSnapshot(memberRecord.userId);

        if (!error && remoteSnapshot) {

          const remoteDataset = Array.isArray(remoteSnapshot?.dataset)
            ? remoteSnapshot.dataset
            : Array.isArray(remoteSnapshot?.rows)
            ? remoteSnapshot.rows
            : Array.isArray(remoteSnapshot?.data)
            ? remoteSnapshot.data
            : [];

          if (remoteDataset.length) {
            sharedDatasetRaw = remoteDataset;
            resolvedSnapshot = remoteSnapshot || resolvedSnapshot;

            try {
              localStorage.setItem(memberDatasetKey(memberRecord.userId), JSON.stringify(remoteDataset));
            } catch {
              // ignore local storage failures
            }

            setMembersDirectory((prev) =>
              prev.map((entry) =>
                String(entry?.userId) === String(memberRecord.userId)
                  ? {
                      ...entry,
                      snapshot: remoteSnapshot,
                      updatedAt: remoteUpdatedAt || entry?.updatedAt,
                    }
                  : entry
              )
            );
          }
        }
      } catch {
        // ignore network/fetch issues, handled by final empty-state check below
      }
    }

    if (!sharedDatasetRaw.length) {
      setMembersError('This member has not synced full dashboard data yet. Ask them to open the latest app and refresh once.');
      return;
    }

    const sharedDataset = fromShareableRows(sharedDatasetRaw);

    if (!sharedDataset.length) {
      setMembersError('Shared dashboard data is present but invalid for this member.');
      return;
    }

    const normalizedMemberStats = deriveMemberStatsFromRows(sharedDataset);
    resolvedSnapshot = {
      ...(resolvedSnapshot || {}),
      stats: normalizedMemberStats,
    };

    setMembersDirectory((prev) =>
      (Array.isArray(prev) ? prev : []).map((entry) =>
        String(entry?.userId || '') === String(memberRecord?.userId || '')
          ? {
              ...entry,
              snapshot: {
                ...(entry?.snapshot || {}),
                ...(resolvedSnapshot || {}),
                stats: normalizedMemberStats,
              },
            }
          : entry
      )
    );

    if (!memberViewUserId) {
      ownDashboardDataRef.current = data;
      ownDashboardMetaRef.current = {
        fileName,
        loadedFromCache,
        lastDataSyncAt,
      };
    }

    setMembersError('');
    setMemberViewUserId(String(memberRecord.userId));
      setMemberViewName(memberRecord.name || 'Cinephile');
      setMemberViewAvatarUrl(memberRecord.avatarUrl || '');
      setMemberViewSocials({
        instagram: resolvedSnapshot?.profileLinks?.instagram || '',
        x: resolvedSnapshot?.profileLinks?.x || '',
        facebook: resolvedSnapshot?.profileLinks?.facebook || '',
      });
      setMemberViewSnapshot(resolvedSnapshot || null);
      setMemberViewAboutMe(resolvedSnapshot?.aboutMe || '');
      setMemberViewMoodboards(Array.isArray(resolvedSnapshot?.moodboards) ? resolvedSnapshot.moodboards : []);
      setData(sharedDataset);
      setFileName(`${member.name || 'Cinephile'} (shared profile)`);
      setLoadedFromCache(false);
      setLastDataSyncAt(member.updatedAt || null);
      setActiveTab('overview');
      resetMainScroll();
    };

  const exitMemberDashboard = () => {
    if (!memberViewUserId) return;

    const originalData = ownDashboardDataRef.current;
    const originalMeta = ownDashboardMetaRef.current || {};

      setMemberViewUserId(null);
      setMemberViewName('');
      setMemberViewAvatarUrl('');
      setMemberViewSocials({ instagram: '', x: '', facebook: '' });
      setMemberViewSnapshot(null);
      setMemberViewAboutMe('');
      setMemberViewMoodboards([]);
      setShowTasteResonance(false);
      if (publicCommunityMode && !user) {
        setData(null);
        setFileName('');
        setLoadedFromCache(false);
        setLastDataSyncAt(null);
        resetMainScroll();
        return;
      }
      if (originalData) {
        setData(originalData);
      }
      setFileName(originalMeta.fileName || '');
      setLoadedFromCache(Boolean(originalMeta.loadedFromCache));
    setLastDataSyncAt(originalMeta.lastDataSyncAt || null);
    resetMainScroll();
  };

  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'personality', label: 'Identity' },
    { id: 'allwatched', label: 'Film Archive' },
    { id: 'tastetimeline', label: 'Timeline Map' },
    { id: 'mytrace', label: "Director's Fingerprint" },
    { id: 'moodboard', label: 'Filmboards' },
    { id: 'deepdive', label: 'Deep Dive' },
  ];
  const isViewingOtherMember = Boolean(user) && Boolean(memberViewUserId) && String(memberViewUserId) !== String(user?.id || '');
  const isHomeActive = !memberViewUserId && navItems.some((item) => item.id === activeTab);
  const isMembersTopActive =
    activeTab === 'members' ||
    (Boolean(memberViewUserId) && !['following', 'followers', 'settings'].includes(activeTab));
  const handleTabChange = (tabId) => {
    if (publicCommunityMode && !user && !memberViewUserId) {
      if (tabId === 'members') {
        if (memberViewUserId) exitMemberDashboard();
        setActiveTab('members');
      }
      return;
    }
    if (tabId === 'settings' && memberViewUserId) {
      exitMemberDashboard();
    }
    setActiveTab(tabId);
    if (tabId === 'discoveries') {
      // Backward compat (older local state): Discoveries now lives inside Deep Dive.
      setActiveTab('deepdive');
      tabId = 'deepdive';
    }

    if (tabId === 'deepdive') {
      const filmsToLoad = [];
      hiddenGems.allFilms?.slice(0, 10).forEach((f) => filmsToLoad.push(f));
      hiddenTreasures.allFilms?.slice(0, 10).forEach((f) => filmsToLoad.push(f));
      favoriteFilmPerYear.slice(0, 5).forEach((y) => y.films?.slice(0, 3).forEach((f) => filmsToLoad.push(f)));
      personalCanon.slice(-3).forEach((d) => d.films?.slice(0, 3).forEach((f) => filmsToLoad.push(f)));
      topFilmPerGenre.slice(0, 5).forEach((g) => g.films?.slice(0, 3).forEach((f) => filmsToLoad.push(f)));

      const unique = [...new Map(filmsToLoad.map((f) => [`${f.title}_${f.year}`, f])).values()];
      loadPostersForFilms(unique.slice(0, 20));
    }

    if (tabId === 'allwatched') {
      loadPostersForFilms(watchedPageFilms);
    }

    if (tabId === 'moodboard') {
      const board = displayedMoodboards.find((b) => b.id === activeMoodboard);
      if (board?.films) {
        loadPostersForFilms(board.films.slice(0, 20));
      }
    }
  };

  React.useEffect(() => {
    if (!data || data.length === 0) return;
    
    // Load posters for first 30 films immediately
    const initialFilms = data.slice(0, 30);
    loadPostersForFilms(initialFilms);
  }, [data]);

  React.useEffect(() => {
    if (!traceSelectedDirector?.films?.length) return;
    loadPostersForFilms(traceSelectedDirector.films.slice(0, 30));
  }, [traceSelectedDirector]);

  React.useEffect(() => {
    setWatchedPage(1);
  }, [watchedDecadeFilter, watchedYearFilter, watchedRatingFilter, watchedGenreFilter, watchedCountryFilter, watchedDirectorFilter, watchedSearchQuery, watchedSortBy]);

  React.useEffect(() => {
    if (watchedPage > watchedTotalPages) {
      setWatchedPage(watchedTotalPages);
    }
  }, [watchedPage, watchedTotalPages]);

  React.useEffect(() => {
    if (activeTab !== 'allwatched' || watchedPageFilms.length === 0) return;
    loadPostersForFilms(watchedPageFilms);
  }, [activeTab, watchedSafePage, watchedDecadeFilter, watchedYearFilter, watchedRatingFilter, watchedGenreFilter, watchedCountryFilter, watchedDirectorFilter, watchedSearchQuery, watchedSortBy, data]);

  React.useEffect(() => {
    if (activeTab !== 'moodboard' || !displayedMoodboards?.length) return;
    const filmsToLoad = [];
    displayedMoodboards.forEach((board) => {
      (board?.films || []).slice(0, 8).forEach((film) => filmsToLoad.push(film));
    });
    const selectedBoard = displayedMoodboards.find((b) => b.id === activeMoodboard);
    (selectedBoard?.films || []).slice(0, 40).forEach((film) => filmsToLoad.push(film));
    loadPostersForFilms(filmsToLoad);
  }, [activeTab, displayedMoodboards, activeMoodboard, data]);

  React.useEffect(() => {
    if (!showFilmPicker || activeTab !== 'moodboard' || filteredMoodboardFilms.length === 0) return;
    loadPostersForFilms(filteredMoodboardFilms.slice(0, 60));
  }, [showFilmPicker, activeTab, filteredMoodboardFilms]);

  React.useEffect(() => {
    if (activeTab !== 'deepdive' || !topFilmPerGenre?.length) return;
    const selectedGroup =
      topFilmPerGenre.find((group) => group.genre === selectedTopGenre) || topFilmPerGenre[0];
    if (!selectedGroup?.films?.length) return;

    if (topGenreView === 'horizontal') {
      loadPostersForFilms(selectedGroup.films.slice(0, 40));
      return;
    }

    const totalPages = Math.max(1, Math.ceil(selectedGroup.films.length / topGenreFilmsPerPage));
    const safePage = Math.min(Math.max(1, topGenrePage), totalPages);
    const start = (safePage - 1) * topGenreFilmsPerPage;
    const end = start + topGenreFilmsPerPage;
    loadPostersForFilms(selectedGroup.films.slice(start, end));
  }, [activeTab, selectedTopGenre, topGenrePage, topFilmPerGenre, data, topGenreView]);

  React.useEffect(() => {
    if (activeTab !== 'deepdive' || personalCanonView !== 'horizontal' || !personalCanon?.length) return;
    const selectedDec = expandedDecades[0] || personalCanon[personalCanon.length - 1].decade;
    const selected = personalCanon.find((d) => d.decade === selectedDec) || personalCanon[personalCanon.length - 1];
    if (!selected?.films?.length) return;
    loadPostersForFilms(selected.films.slice(0, 40));
  }, [activeTab, personalCanonView, personalCanon, expandedDecades, data]);

  React.useEffect(() => {
    if (activeTab !== 'deepdive') return undefined;
    const rails = Array.from(document.querySelectorAll('.cinematic-rail'));
    if (!rails.length) return undefined;

    const handleDeepDiveRailWheel = (event) => {
      const el = event.currentTarget;
      if (!el || el.scrollWidth <= el.clientWidth + 1) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      el.scrollLeft += delta;
    };

    rails.forEach((rail) => {
      rail.addEventListener('wheel', handleDeepDiveRailWheel, { passive: false });
    });

    return () => {
      rails.forEach((rail) => {
        rail.removeEventListener('wheel', handleDeepDiveRailWheel);
      });
    };
  }, [activeTab, favoriteYearView, personalCanonView, topGenreView, hiddenGemsView, hiddenTreasuresView]);

  React.useEffect(() => {
    if (activeTab !== 'tastetimeline' || !timelineMovies.length) return;
    loadPostersForFilms(timelineMovies, {
      batchSize: 3,
      retryPasses: 2,
      retryDelayMs: 250,
    });
  }, [activeTab, timelineMovies]);

  React.useEffect(() => {
    const onFullscreenChange = () => {
      setTimelineFullscreen(document.fullscreenElement === tasteTimelineFullscreenRef.current);
      setMapFullscreen(document.fullscreenElement === mapFullscreenRef.current);
      setTraceFullscreen(document.fullscreenElement === traceFullscreenRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleTimelineFullscreen = async () => {
    const container = tasteTimelineFullscreenRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // ignore fullscreen failures
    }
  };

  const clampTimelineZoom = React.useCallback((value) => Math.max(0.75, Math.min(2.5, value)), []);
  const zoomTimeline = React.useCallback((delta) => {
    setTimelineZoom((prev) => clampTimelineZoom(Number((prev + delta).toFixed(2))));
  }, [clampTimelineZoom]);
  const resetTimelineZoom = React.useCallback(() => setTimelineZoom(1), []);

  const toggleMapFullscreen = async () => {
    const container = mapFullscreenRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // ignore fullscreen failures
    }
  };

  const toggleTraceFullscreen = async () => {
    const container = traceFullscreenRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      // ignore fullscreen failures
    }
  };

  const onTimelineWheelCapture = (e) => {
    const el = tasteTimelineRef.current;
    if (!el) return;
    // Zoom gesture stays explicit (modifier keys).
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (e.nativeEvent?.stopImmediatePropagation) {
        e.nativeEvent.stopImmediatePropagation();
      }
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      zoomTimeline(step);
      return;
    }

    // In timeline card area, wheel should always drive horizontal rail movement.
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent?.stopImmediatePropagation) {
      e.nativeEvent.stopImmediatePropagation();
    }
    if (el.scrollWidth <= el.clientWidth + 1) return;
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    el.scrollLeft += delta * 1.15;
    setTimelineScrollLeft(el.scrollLeft || 0);
  };

  useEffect(() => {
    const el = timelineWheelSurfaceRef.current;
    if (!el) return undefined;
    const nativeTimelineWheelHandler = (event) => {
      const rail = tasteTimelineRef.current;
      if (!rail) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        const step = event.deltaY < 0 ? 0.08 : -0.08;
        zoomTimeline(step);
        return;
      }

      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      rail.scrollLeft += delta * 1.15;
      setTimelineScrollLeft(rail.scrollLeft || 0);
    };

    el.addEventListener('wheel', nativeTimelineWheelHandler, { passive: false });
    return () => {
      el.removeEventListener('wheel', nativeTimelineWheelHandler);
    };
  }, [zoomTimeline]);

  useEffect(() => {
    const hardWheelGuard = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const inBlockedZone =
        target.closest('.flickd-map-wheel-surface') ||
        target.closest('.cinematic-rail');
      if (!inBlockedZone) return;
      if (event.cancelable) event.preventDefault();
    };

    // Capture-phase + non-passive to reliably block page vertical scroll.
    window.addEventListener('wheel', hardWheelGuard, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', hardWheelGuard, true);
    };
  }, []);

  const handlePosterRenderError = React.useCallback((posterKey) => {
    if (!posterKey) return;
    posterFailedAtRef.current[posterKey] = Date.now();
    markPosterUnavailable(posterKey);
    setPosters((prev) => {
      if (!prev?.[posterKey]) return prev;
      const next = { ...prev };
      delete next[posterKey];
      return next;
    });
  }, [markPosterUnavailable]);

  const onTimelineRailScroll = () => {
    const el = tasteTimelineRef.current;
    if (!el) return;
    const next = el.scrollLeft || 0;
    const nextMax = Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
    setTimelineScrollLeft((prev) => (prev === next ? prev : next));
    setTimelineMaxScroll((prev) => (prev === nextMax ? prev : nextMax));
  };

  const onTimelineBottomScrubChange = (nextValue) => {
    const topEl = tasteTimelineRef.current;
    const next = Number(nextValue) || 0;
    if (!topEl) {
      setTimelineScrollLeft(next);
      return;
    }
    topEl.scrollLeft = next;
    setTimelineScrollLeft(next);
  };

  useEffect(() => {
    const el = tasteTimelineRef.current;
    if (!el) return;
    const recalc = () => {
      const nextMax = Math.max(0, (el.scrollWidth || 0) - (el.clientWidth || 0));
      const nextLeft = el.scrollLeft || 0;
      setTimelineMaxScroll((prev) => (prev === nextMax ? prev : nextMax));
      setTimelineScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    };
    recalc();
    const raf = requestAnimationFrame(recalc);
    window.addEventListener('resize', recalc);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', recalc);
    };
  }, [timelineRailWidth, timelineZoom, timelineFullscreen, activeTab]);

  const onTimelineMouseDown = (e) => {
    const el = tasteTimelineRef.current;
    if (!el) return;
    tasteTimelineDraggingRef.current = true;
    setTimelineDragging(true);
    tasteTimelineDragStartRef.current = {
      x: e.clientX,
      left: el.scrollLeft,
    };
  };

  const onTimelineMouseMove = (e) => {
    if (!tasteTimelineDraggingRef.current) return;
    const el = tasteTimelineRef.current;
    if (!el) return;
    const delta = e.clientX - tasteTimelineDragStartRef.current.x;
    el.scrollLeft = tasteTimelineDragStartRef.current.left - delta;
  };

  const stopTimelineDrag = () => {
    tasteTimelineDraggingRef.current = false;
    setTimelineDragging(false);
  };

  const onTimelineTouchStart = (event) => {
    const el = tasteTimelineRef.current;
    if (!el) return;

    if (event.touches.length === 2) {
      event.preventDefault();
      timelineTouchGestureRef.current = {
        mode: 'pinch',
        startDistance: getTouchDistance(event.touches),
        startZoom: timelineZoom,
        startLeft: el.scrollLeft,
      };
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      timelineTouchGestureRef.current = {
        mode: 'pan',
        startX: touch.clientX,
        startY: touch.clientY,
        startLeft: el.scrollLeft,
      };
    }
  };

  const onTimelineTouchMove = (event) => {
    const el = tasteTimelineRef.current;
    const gesture = timelineTouchGestureRef.current;
    if (!el || !gesture?.mode) return;

    if (gesture.mode === 'pinch' && event.touches.length === 2) {
      event.preventDefault();
      const nextDistance = getTouchDistance(event.touches);
      const nextZoom = clampTimelineZoom(Number((gesture.startZoom * (nextDistance / Math.max(1, gesture.startDistance))).toFixed(2)));
      setTimelineZoom(nextZoom);
      return;
    }

    if (gesture.mode === 'pan' && event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (Math.abs(deltaX) > Math.abs(deltaY) + 4) {
        event.preventDefault();
        el.scrollLeft = gesture.startLeft - deltaX;
      }
    }
  };

  const onTimelineTouchEnd = () => {
    timelineTouchGestureRef.current = { mode: null };
    stopTimelineDrag();
  };

  const clampTraceZoom = React.useCallback((value) => Math.max(1, Math.min(4, value)), []);

  const handleTraceTouchStart = (event) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      traceTouchGestureRef.current = {
        mode: 'pinch',
        startDistance: getTouchDistance(event.touches),
        startZoom: traceZoom,
        startPan: tracePan,
      };
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      traceTouchGestureRef.current = {
        mode: 'pan',
        startZoom: traceZoom,
        startPan: tracePan,
        startPoint: { x: touch.clientX, y: touch.clientY },
      };
    }
  };

  const handleTraceTouchMove = (event) => {
    const gesture = traceTouchGestureRef.current;
    if (!gesture?.mode) return;

    if (gesture.mode === 'pinch' && event.touches.length === 2) {
      event.preventDefault();
      const nextDistance = getTouchDistance(event.touches);
      setTraceZoom(clampTraceZoom(Number((gesture.startZoom * (nextDistance / Math.max(1, gesture.startDistance))).toFixed(2))));
      return;
    }

    if (gesture.mode === 'pan' && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      setTracePan({
        x: gesture.startPan.x + (touch.clientX - gesture.startPoint.x),
        y: gesture.startPan.y + (touch.clientY - gesture.startPoint.y),
      });
    }
  };

  const handleTraceTouchEnd = () => {
    traceTouchGestureRef.current = { mode: null };
  };

  useEffect(() => {
    if (!mobileTopNavOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [mobileTopNavOpen]);

  const handleDownloadPdfBook = async () => {
    if (isBookExporting) return;
    setIsBookExporting(true);

    const originalTab = activeTab;
    const tabsToExport = [
      { id: 'overview', title: 'Overview' },
      { id: 'personality', title: 'Identity' },
    ];

    const waitForRender = async (delay = 900) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => setTimeout(resolve, delay));
    };

    const encodeSvgToDataUrl = (svgText) => {
      try {
        const encoded = window.btoa(unescape(encodeURIComponent(svgText)));
        return `data:image/svg+xml;base64,${encoded}`;
      } catch {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      }
    };

    const getLiveChartSnapshotMap = (root) => {
      const titles = [
        'Rating Distribution',
        'Dominant Genres',
        'Yearly Rating Activity',
        'Genre Affinity',
        'Era Preference',
        'Most Consistently Loved Directors',
      ];
      const out = {};
      if (!root) return out;
      titles.forEach((title) => {
        const headings = Array.from(root.querySelectorAll('h2, h3'));
        const heading = headings.find((h) => String(h.textContent || '').trim().toLowerCase() === title.toLowerCase());
        if (!heading) return;
        let card = heading;
        for (let i = 0; i < 8 && card?.parentElement; i += 1) {
          if (card.querySelector?.('.recharts-responsive-container')) break;
          card = card.parentElement;
        }
        const host = card?.querySelector?.('.recharts-responsive-container');
        const svg = host?.querySelector?.('svg.recharts-surface');
        if (!svg) return;
        try {
          const rect = host.getBoundingClientRect();
          const w = Math.max(300, Math.round(rect.width || 980));
          const h = Math.max(220, Math.round(rect.height || 340));
          const cloned = svg.cloneNode(true);
          cloned.setAttribute('width', String(w));
          cloned.setAttribute('height', String(h));
          if (!cloned.getAttribute('viewBox')) {
            cloned.setAttribute('viewBox', `0 0 ${w} ${h}`);
          }
          cloned.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          const raw = new XMLSerializer().serializeToString(cloned);
          out[title] = encodeSvgToDataUrl(raw);
        } catch {
          // ignore this chart snapshot failure
        }
      });
      return out;
    };

    try {
      const sections = [];

      for (const tab of tabsToExport) {
        setActiveTab(tab.id);
        await waitForRender(tab.id === 'overview' ? 1300 : 900);

        if (mainContentRef.current) {
          const liveChartSnapshotMap = tab.id === 'overview' ? getLiveChartSnapshotMap(mainContentRef.current) : {};
          const clone = mainContentRef.current.cloneNode(true);
          clone.querySelectorAll('button').forEach((btn) => {
            btn.style.pointerEvents = 'none';
          });

          const replaceOverviewChart = (titleText, snapshotDataUrl) => {
            if (!snapshotDataUrl) return;
            const headings = Array.from(clone.querySelectorAll('h2, h3'));
            const heading = headings.find((h) => String(h.textContent || '').trim().toLowerCase() === titleText.toLowerCase());
            if (!heading) return;
            let card = heading;
            for (let i = 0; i < 8 && card?.parentElement; i += 1) {
              if (card.querySelector?.('.recharts-responsive-container')) break;
              card = card.parentElement;
            }
            const host = card?.querySelector?.('.recharts-responsive-container');
            if (!host) return;
            const img = document.createElement('img');
            img.src = snapshotDataUrl;
            img.alt = titleText;
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.maxWidth = '100%';
            img.style.display = 'block';
            img.style.objectFit = 'fill';
            host.innerHTML = '';
            host.style.height = 'auto';
            host.style.minHeight = '0';
            host.appendChild(img);
          };

          if (tab.id === 'overview') {
            [
              'Rating Distribution',
              'Dominant Genres',
              'Yearly Rating Activity',
              'Genre Affinity',
              'Era Preference',
              'Most Consistently Loved Directors',
            ].forEach((title) => replaceOverviewChart(title, liveChartSnapshotMap[title]));
          }

          // Recharts can lose clipPath/defs references in print windows.
          // Convert chart SVGs to static images so PDF output stays stable.
          clone.querySelectorAll('svg.recharts-surface').forEach((svgNode) => {
            try {
              const svg = svgNode;
              const widthAttr = Number(svg.getAttribute('width'));
              const heightAttr = Number(svg.getAttribute('height'));
              const viewBox = String(svg.getAttribute('viewBox') || '').trim();
              let width = Number.isFinite(widthAttr) && widthAttr > 0 ? widthAttr : 0;
              let height = Number.isFinite(heightAttr) && heightAttr > 0 ? heightAttr : 0;
              if ((!width || !height) && viewBox) {
                const parts = viewBox.split(/\s+/).map(Number);
                if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
                  width = width || parts[2];
                  height = height || parts[3];
                }
              }
              if (!width) width = 900;
              if (!height) height = 320;

              svg.setAttribute('width', String(width));
              svg.setAttribute('height', String(height));
              svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

              const rawSvg = new XMLSerializer().serializeToString(svg);
              const encoded = window.btoa(unescape(encodeURIComponent(rawSvg)));
              const dataUri = `data:image/svg+xml;base64,${encoded}`;

              const img = document.createElement('img');
              img.src = dataUri;
              img.alt = 'chart';
              img.style.width = '100%';
              img.style.height = '100%';
              img.style.display = 'block';
              img.style.objectFit = 'contain';

              svg.replaceWith(img);
            } catch (_e) {
              // Keep original svg if serialization fails.
            }
          });

          // PDF-only cleanup: remove heavy/problematic map sections.
          clone.querySelectorAll('h2, h3').forEach((heading) => {
            const text = String(heading.textContent || '').trim().toLowerCase();
            if (
              text.includes('global cinema preference map')
              || text.includes('cinematic timeline map')
              || text.includes('cinema mind profile')
            ) {
              let card = heading;
              for (let i = 0; i < 6 && card?.parentElement; i += 1) {
                card = card.parentElement;
                const cls = String(card?.className || '');
                if (cls.includes('rounded-xl') || cls.includes('rounded-2xl')) {
                  break;
                }
              }
              if (card && card.parentNode) {
                card.parentNode.removeChild(card);
              }
            }
          });

          const hasRenderableNodes = clone.querySelectorAll('svg, img, canvas').length > 0;
          const textLen = String(clone.textContent || '').trim().length;
          if (hasRenderableNodes || textLen > 40) {
            sections.push({ title: tab.title, html: clone.innerHTML });
          }
        }
      }

      setActiveTab(originalTab);

      const styleNodes = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((node) => {
          if (node.tagName?.toLowerCase() === 'link') {
            const href = node.getAttribute('href') || '';
            const absoluteHref = href
              ? new URL(href, window.location.origin).href
              : href;
            return `<link rel="stylesheet" href="${absoluteHref}" />`;
          }
          return node.outerHTML;
        })
        .join('\n');

      const printWindow = window.open('', '_blank', 'width=1400,height=900');
      if (!printWindow) {
        alert('Pop-up blocked. Please allow pop-ups to export PDF.');
        return;
      }

      let pageHtml = '';
      sections.forEach((section) => {
        pageHtml += '<section class="book-section" data-section="' + section.title + '">'
          + '<div class="book-body">' + section.html + '</div>'
          + '</section>';
      });

      const html = '<!doctype html>'
        + '<html><head><meta charset="utf-8" /><title>IMDb Taste Book</title>'
        + `<base href="${window.location.origin}/" />`
        + styleNodes
        + '<style>'
        + '*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}'
        + 'html,body{background:#050912 !important;color:#e5e7eb !important;}'
        + 'body{margin:0;padding:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}'
        + '.book-section{max-width:100%;margin:0 auto;padding:12px 12px 10px;break-inside:auto !important;page-break-inside:auto !important;}'
        + '.book-body{max-width:100%;margin:0 auto;}'
        + '.book-body [class*="bg-[#111827]"]{background:#0d1626 !important;border-color:#233047 !important;box-shadow:0 6px 20px rgba(0,0,0,.35) !important;}'
        + '.book-body [class*="rounded-xl"],.book-body [class*="rounded-2xl"]{border-radius:14px !important;break-inside:avoid !important;page-break-inside:avoid !important;}'
        + '.book-body [class*="lg:grid-cols-2"]{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}'
        + '.book-body [class*="xl:grid-cols-3"]{grid-template-columns:repeat(2,minmax(0,1fr)) !important;}'
        + '.book-body [class*="gap-4"]{gap:12px !important;}'
        + '.book-body [class*="gap-5"]{gap:14px !important;}'
        + '.book-body .space-y-5 > * + *{margin-top:12px !important;}'
        + '[class*="lg:hidden"]{display:none !important;}'
        + 'button{box-shadow:none !important;}'
        + '.book-body button{display:none !important;}'
        + '.book-body [class*="sticky"]{position:static !important;top:auto !important;}'
        + '.book-body [class*="overflow-x-auto"],.book-body [class*="overflow-y-auto"]{overflow:visible !important;}'
        + '.book-body .recharts-responsive-container{width:100% !important;min-width:0 !important;height:auto !important;min-height:0 !important;}'
        + '.book-body .recharts-wrapper{width:100% !important;max-width:100% !important;}'
        + '.book-body .recharts-surface{width:100% !important;height:100% !important;}'
        + '.book-body .recharts-legend-wrapper{position:static !important;}'
        + '.book-body svg{max-width:100% !important;}'
        + '.book-body img{max-width:100% !important;height:auto !important;}'
        + '.book-body [style*="height: 0"],.book-body [style*="height:0"]{height:auto !important;}'
        + '@media print{@page{size:A4 landscape;margin:7mm;}html,body{background:#050912 !important;}body{padding:0;}}'
        + '</style></head><body>'
        + pageHtml
        + '</body></html>';

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();

      const printWhenReady = () => {
        const images = Array.from(printWindow.document.images || []);
        const waitForImage = (img) => (
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              })
        );
        Promise.all(images.map(waitForImage)).then(() => {
          setTimeout(() => {
            try {
              printWindow.print();
            } catch {
              // noop
            }
          }, 500);
        });
      };

      if (printWindow.document.readyState === 'complete') {
        printWhenReady();
      } else {
        printWindow.addEventListener('load', printWhenReady, { once: true });
        setTimeout(printWhenReady, 1800);
      }
    } catch (error) {
      console.error('Book export failed:', error);
      alert('Could not generate the PDF book. Please try again.');
      setActiveTab(originalTab);
    } finally {
      setTimeout(() => setIsBookExporting(false), 500);
    }
  };
  React.useEffect(() => {
    if (activeTab !== 'mytrace' || !directorFingerprintData) return;

    setTraceHover(null);
    setTraceTooltip(null);
    setTraceZoom(1);
    setTracePan({ x: 0, y: 0 });
    setTraceRevealProgress(0);

    let rafId = null;
    const duration = 2200;
    const start = performance.now();

    const animate = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setTraceRevealProgress(eased);
      if (t < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeTab, directorFingerprintData]);

  React.useEffect(() => {
    if (!shareCardOpen || !shareCardTop10Films.length) return;
    loadPostersForFilms(shareCardTop10Films);
  }, [shareCardOpen, shareCardTop10Films]);

  const buildFavoriteYearShareCardBlob = async () => {
    if (!shareCardConfig) return null;
    const title = shareCardConfig.title || 'My Top 10';
    const subtitle = shareCardConfig.subtitle || 'Personal Card';
    const films = shareCardTop10Films;

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0b1220');
    grad.addColorStop(1, '#050913');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const panelX = 130;
    const panelY = 70;
    const panelW = 820;
    const panelH = 1300;
    ctx.fillStyle = '#0f1628';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '700 64px Segoe UI';
    ctx.fillText(title, canvas.width / 2, 184);
    ctx.font = '600 28px Segoe UI';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(subtitle, canvas.width / 2, 232);

    const listBoxX = panelX + 76;
    const listBoxW = panelW - 152;
    const listBoxY = 262;
    const listBoxH = 920;
    ctx.fillStyle = 'rgba(10,15,28,0.9)';
    ctx.fillRect(listBoxX, listBoxY, listBoxW, listBoxH);

    const startY = listBoxY + 48;
    const rowH = 86;
    const thumbW = 48;
    const thumbH = 68;
    const rowX = listBoxX + 24;
    const rowW = listBoxW - 48;
    const rankX = rowX + 22;
    const thumbX = rowX + 54;
    const textX = thumbX + thumbW + 22;

    const loadImage = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    for (let i = 0; i < films.length; i += 1) {
      const film = films[i];
      const y = startY + i * rowH;
      const key = `${film.title}_${film.year}`;
      const posterUrl = posters[key] || '';

      ctx.fillStyle = i % 2 === 0 ? 'rgba(17,24,39,0.70)' : 'rgba(17,24,39,0.45)';
      ctx.fillRect(rowX, y - 18, rowW, rowH - 8);

      if (posterUrl) {
        const loaded = await loadImage(posterUrl);
        if (loaded) {
          ctx.drawImage(loaded, thumbX, y - 6, thumbW, thumbH);
        } else {
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(thumbX, y - 6, thumbW, thumbH);
        }
      } else {
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(thumbX, y - 6, thumbW, thumbH);
      }

      ctx.fillStyle = '#60a5fa';
      ctx.font = '700 24px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, rankX, y + 28);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 27px Segoe UI';
      const titleText = String(film.title || '');
      const trimmed = titleText.length > 36 ? `${titleText.slice(0, 33)}...` : titleText;
      ctx.textAlign = 'left';
      ctx.fillText(trimmed, textX, y + 26);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 20px Segoe UI';
      ctx.fillText(`${film.year} | ${film.yourRating}`, textX, y + 54);
    }

    const footerY = panelY + panelH - 72;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px Segoe UI';
    const footerText = 'stats generated by';
    const textWidth = ctx.measureText(footerText).width;
    const logoTargetW = 146;
    const logoTargetH = 36;
    const gap = 14;
    const totalFooterW = textWidth + gap + logoTargetW;
    const footerStartX = Math.round((canvas.width - totalFooterW) / 2);
    ctx.fillText(footerText, footerStartX, footerY);

    const logo = await loadImage('/flickd-brand.png');
    if (logo) {
      ctx.drawImage(logo, footerStartX + textWidth + gap, footerY - 27, logoTargetW, logoTargetH);
    }

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95));
  };

  const downloadFavoriteYearShareCard = async () => {
    if (shareCardBusy) return;
    setShareCardBusy(true);
    try {
      const blob = await buildFavoriteYearShareCardBlob();
      if (!blob) {
        alert('Could not create share card image.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${shareCardConfig?.filenameBase || 'flickd-share'}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setShareCardBusy(false);
    }
  };

  const shareFavoriteYearCard = async () => {
    if (shareCardBusy) return;
    setShareCardBusy(true);
    try {
      const blob = await buildFavoriteYearShareCardBlob();
      const shareTitle = shareCardConfig?.title || 'My Top 10';
      const text = `My top 10 picks on Flickd: ${shareTitle}`;
      if (!blob) {
        if (navigator.share) await navigator.share({ title: shareTitle, text });
        return;
      }

      const file = new File([blob], `${(shareCardConfig?.filenameBase || 'flickd-share')}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ title: shareTitle, text, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: shareTitle, text });
      } else {
        await downloadFavoriteYearShareCard();
      }
    } catch {
      // user cancelled or share unavailable
    } finally {
      setShareCardBusy(false);
    }
  };

  React.useEffect(() => {
    if (!publicCommunityMode || user || memberViewUserId || activeTab === 'members') return;
    setActiveTab('members');
  }, [publicCommunityMode, user, memberViewUserId, activeTab]);

  const renderLoginPanel = ({ showExplore = true, compact = false } = {}) => (
    <div className={`w-full max-w-md bg-[#111827] border border-gray-800 rounded-2xl px-7 sm:px-8 ${compact ? 'py-7' : 'py-8 sm:py-9'} text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)]`}>
      <img
        src="/flickd-brand.png"
        alt="Flickd"
        className="h-7 sm:h-8 w-auto mx-auto mb-6 object-contain"
      />
      <div className="mb-8 w-full flex items-start justify-center">
        <div className="rounded-2xl border border-gray-700/70 bg-[#0b1220]/45 p-2.5 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
          <img
            src="/login-posters-strip.png"
            alt="Featured film posters"
            className="w-[300px] sm:w-[420px] h-auto rounded-xl object-contain"
            loading="eager"
          />
        </div>
      </div>
      <h1 className="text-3xl md:text-4xl leading-tight font-bold tracking-tight text-white">Welcome</h1>
      <p className="mt-3 text-sm md:text-base leading-relaxed text-gray-400 max-w-[330px] mx-auto">
        A living editorial portrait of your cinema taste, shaped through what you watch and rate.
      </p>
      <p className="text-sm text-gray-400 mt-6">Sign in with Google to continue.</p>
      <div className="mt-7 space-y-3">
        <button
          type="button"
          onClick={handleSignIn}
          className="w-full px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          Continue with Google
        </button>
        {showExplore && (
          <button
            type="button"
            onClick={() => {
              setPublicCommunityMode(true);
              setActiveTab('members');
              setMembersPage(0);
              setShowCreateProfileModal(false);
            }}
            className="w-full px-4 py-3.5 bg-[#0b1220] hover:bg-[#141b28] border border-gray-700 text-gray-100 text-sm font-medium rounded-xl transition-colors"
          >
            Explore the community
          </button>
        )}
      </div>
    </div>
  );

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-gray-100 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 border-4 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Checking your session...</p>
        </div>
      </div>
    );
  }

  if (!user && !publicCommunityMode) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-gray-100 flex items-center justify-center px-4 py-8">
        {renderLoginPanel()}
      </div>
    );
  }

  if (!hasDashboardData && !publicCommunityMode) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-gray-100 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-end mb-5">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-3 py-1.5 bg-[#111827] hover:bg-[#1f2937] border border-gray-700 text-gray-200 text-sm rounded-lg transition-colors disabled:opacity-60"
            >
              {signingOut ? 'Signing Out...' : 'Sign Out'}
            </button>
          </div>
          <div className="bg-[#111827] border border-gray-800 rounded-2xl p-6 sm:p-8">
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-white">Add your film ratings</h2>
            <p className="text-sm text-gray-400 mt-2">Start with an IMDb export, Letterboxd ratings.csv, or the full Letterboxd export zip.</p>

            <div className="mt-6">
              <div className="rounded-xl border border-gray-700 bg-[#0f172a] p-4">
                <p className="text-sm font-semibold text-gray-100">IMDb or Letterboxd Export</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">Upload an IMDb ratings export, Letterboxd ratings.csv, or the full Letterboxd export zip. Missing metadata is filled from OMDb.</p>
                <label className="mt-4 flex flex-col items-center justify-center h-32 border border-dashed border-gray-600 rounded-xl cursor-pointer bg-[#0b1220] hover:bg-[#141b28] transition-colors">
                  <p className="text-base font-semibold leading-tight text-gray-100">Drop ratings file here</p>
                  <p className="mt-1 text-xs text-gray-400">or browse .csv .xlsx .xls .zip</p>
                  <input type="file" className="hidden" accept=".csv,.xlsx,.xls,.zip" onChange={handleFileUpload} onClick={(e) => { e.target.value = null; }} />
                </label>

                {letterboxdError && (
                  <p className="mt-3 text-xs text-red-300">{letterboxdError}</p>
                )}
                {letterboxdImporting && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{letterboxdProgress.phase || 'Importing'}</span>
                      <span>{letterboxdProgress.total ? `${letterboxdProgress.current} / ${letterboxdProgress.total}` : ''}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1f2937]">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${letterboxdProgress.total ? (letterboxdProgress.current / letterboxdProgress.total) * 100 : 15}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-700 bg-[#0f172a] p-4">
              <p className="text-xs md:text-sm font-medium tracking-normal text-gray-400">Export paths</p>
              <ol className="mt-2 space-y-1.5 text-sm text-gray-300 list-decimal list-inside">
                <li>Open IMDb and go to <span className="text-gray-100 font-medium">Your Ratings</span>.</li>
                <li>Click <span className="text-gray-100 font-medium">Export</span> on the ratings page.</li>
                <li>For Letterboxd, export your data and upload either the zip or <span className="text-gray-100 font-medium">ratings.csv</span>.</li>
              </ol>
            </div>

            <button
              type="button"
              onClick={() => {
                setPublicCommunityMode(true);
                setActiveTab('members');
                setMembersPage(0);
              }}
              className="mt-4 w-full rounded-xl border border-blue-500/40 bg-blue-600/15 px-4 py-3 text-sm font-semibold text-blue-100 transition-colors hover:bg-blue-600/25"
            >
              Explore the community
            </button>

            {fileName && (
              <div className="mt-4 p-3 bg-[#0f172a] border border-gray-700 rounded-xl">
                <p className="text-sm text-gray-200">Loaded: <span className="text-blue-400 font-semibold">{fileName}</span></p>
                <p className="text-xs text-gray-400 mt-1">
                  {loadedFromCache ? 'Restored from local cache' : 'Updated from latest upload'}
                  {lastDataSyncAt ? `  Synced ${new Date(lastDataSyncAt).toLocaleString()}` : ''}
                </p>
              </div>
            )}

            {fetchingCountries && (
              <div className="mt-4 p-4 bg-[#0f172a] border border-gray-700 rounded-xl">
                <p className="text-sm text-gray-200 mb-2">Mapping countries...</p>
                <div className="w-full bg-[#1f2937] rounded-full h-2.5 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${fetchProgress.total ? (fetchProgress.current / fetchProgress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-2">{fetchProgress.current} / {fetchProgress.total} complete</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-gray-100">
      <style>{`
        .scroll-area {
          scrollbar-width: thin;
          scrollbar-color: #3b4456 transparent;
        }
        .scroll-area::-webkit-scrollbar {
          width: 10px;
        }
        .scroll-area::-webkit-scrollbar-track {
          background: transparent;
        }
        .scroll-area::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #394559, #2a3344);
          border-radius: 999px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .scroll-area::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #46546b, #323d52);
          background-clip: padding-box;
        }
      `}</style>
      {selectedMovie && !traceSelectedDirector && !timelineFullscreen && renderMovieDetailsModal('z-[100]')}
      {showCreateProfileModal && !user && (() => {
        const createProfileModal = (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close create profile"
              onClick={() => setShowCreateProfileModal(false)}
            />
            <div className="relative w-full max-w-md">
              <button
                type="button"
                onClick={() => setShowCreateProfileModal(false)}
                className="absolute -right-2 -top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-[#0b1220] text-gray-300 hover:bg-[#1f2937]"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              {renderLoginPanel({ showExplore: false, compact: true })}
            </div>
          </div>
        );
        const modalHost = typeof document !== 'undefined' ? document.body : null;
        return modalHost ? createPortal(createProfileModal, modalHost) : createProfileModal;
      })()}

      {showTasteResonance && (
        <div className="fixed inset-0 z-[110] bg-[#050912]/95 backdrop-blur-sm overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
            <div className="rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-[#0f172a] via-[#0b1220] to-[#111827] p-5 sm:p-6 shadow-[0_0_40px_rgba(168,85,247,0.15)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-300/80">Cinematic Resonance</p>
                  <h2 className="text-3xl sm:text-4xl font-bold mt-1 text-white">{tasteResonance?.score ?? 0}%</h2>
                  <p className="text-sm sm:text-base text-blue-100/90 mt-2 max-w-3xl">{tasteResonance?.poetic || 'Calculating your cinematic resonance...'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTasteResonance(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 hover:bg-gray-800"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(tasteResonance?.metricBreakdown || {}).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-gray-700/60 bg-[#0b1220]/80 p-3">
                    <div className="text-[11px] text-gray-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
                    <div className="text-xl font-semibold text-blue-300 mt-1">{v}%</div>
                  </div>
                ))}
              </div>
            </div>

            {tasteResonanceLoading ? (
              <div className="rounded-xl border border-gray-700 bg-[#111827] p-6 text-center text-gray-300">Composing resonance map...</div>
            ) : (
              <>
                <div className="rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-[#131b2f] to-[#1a1a33] p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-300/80">Cinematic Relationship Type</p>
                  <h3 className="text-2xl font-bold text-white mt-2">{tasteResonance?.relationshipType?.name || 'Parallel Dreamers'}</h3>
                  <p className="text-sm text-blue-100/90 mt-2">{tasteResonance?.relationshipType?.line || ''}</p>
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1 text-xs text-fuchsia-200">
                    Resonance Signature  {(tasteResonance?.score ?? 0) >= 75 ? 'High' : (tasteResonance?.score ?? 0) >= 60 ? 'Layered' : 'Contrasting'}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-700 bg-[#111827] p-5">
                  <h3 className="text-xl font-semibold text-white mb-3">Shared Taste DNA</h3>
                  <div className="space-y-3">
                    {Object.entries(tasteResonance?.sharedTags || {}).map(([key, tags]) => (
                      <div key={key}>
                        <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">{key}</p>
                        <div className="flex flex-wrap gap-2">
                          {(tags || []).length ? (tags || []).map((tag, idx) => (
                            <span key={`${key}_${idx}`} className="px-2.5 py-1 rounded-full text-xs border border-fuchsia-500/30 text-fuchsia-200 bg-fuchsia-500/10">
                              {tag}
                            </span>
                          )) : <span className="text-xs text-gray-500">No strong overlap yet</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-700 bg-[#111827] p-5">
                  <h3 className="text-xl font-semibold text-white mb-4">Taste Spectrum Comparison</h3>
                  <div className="space-y-3">
                    {(tasteResonance?.spectrumComparison || []).map((axis) => (
                      <div key={`${axis.left}_${axis.right}`} className="rounded-lg border border-gray-800 bg-[#0b1220] p-3">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                          <span>{axis.left}</span><span>{axis.right}</span>
                        </div>
                        <div className="relative h-2 rounded-full bg-gray-800 overflow-hidden">
                          <div className="absolute h-full bg-gradient-to-r from-blue-500/30 via-purple-500/35 to-pink-500/30 w-full" />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-300 shadow-[0_0_12px_rgba(96,165,250,0.7)]" style={{ left: `calc(${axis.mine}% - 6px)` }} />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-fuchsia-300 shadow-[0_0_12px_rgba(232,121,249,0.7)]" style={{ left: `calc(${axis.theirs}% - 6px)` }} />
                        </div>
                        <div className="flex justify-between mt-2 text-[11px] text-gray-400">
                          <span>You: {Math.round(axis.mine)}</span>
                          <span>{memberViewName || 'Cinephile'}: {Math.round(axis.theirs)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-700 bg-[#111827] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-semibold text-white">Shared Canon</h3>
                    <p className="text-sm text-blue-200">{tasteResonance?.sharedCanon?.length || 0} overlaps  Avg {tasteResonance?.sharedCanonAvg || '0.0'}</p>
                  </div>
                  {(tasteResonance?.sharedCanon || []).length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                      {tasteResonance.sharedCanon.map((film, idx) => (
                        <div key={`res_${film.title}_${film.year}_${idx}`} className="rounded-lg border border-gray-800 bg-[#0b1220] p-2">
                          {posters[`${film.title}_${film.year}`] ? (
                            <button
                              type="button"
                              onClick={() => handleMovieClick(film)}
                              className="block w-full rounded"
                              aria-label={`View details for ${film.title}`}
                            >
                              <img
                                src={posters[`${film.title}_${film.year}`]}
                                alt={film.title}
                                className="w-full aspect-[2/3] rounded object-cover"
                                onError={() => handlePosterRenderError(`${film.title}_${film.year}`)}
                              />
                            </button>
                          ) : (
                            <button
                              onClick={() => fetchPoster(film.title, film.year, film.imdbId)}
                              className="w-full aspect-[2/3] rounded bg-gray-800 text-xs text-gray-400"
                            >
                              {renderPosterStatus(`${film.title}_${film.year}`)}
                            </button>
                          )}
                          <button onClick={() => handleMovieClick(film)} className="flickd-poster-title mt-2 text-left w-full">{film.title}</button>
                          <div className="flickd-poster-meta">{film.year}  Avg {film.sharedAvg}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No 8+ overlap yet. Your resonance comes more from style than shared canon.</p>
                  )}
                </div>

                <div className="rounded-xl border border-gray-700 bg-[#111827] p-5">
                  <h3 className="text-xl font-semibold text-white mb-3">Where You Diverge</h3>
                  <ul className="space-y-2">
                    {(tasteResonance?.differences || []).map((line, i) => (
                      <li key={`diff_${i}`} className="text-sm text-gray-300 leading-relaxed border-l-2 border-fuchsia-500/40 pl-3">{line}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {followToast && (
        <div className="fixed bottom-6 right-6 z-[120] max-w-md w-[92vw] sm:w-auto">
          <div className="rounded-2xl border border-blue-400/30 bg-[#0b1220]/95 backdrop-blur shadow-[0_0_30px_rgba(59,130,246,0.25)] p-4">
            <p className="text-sm text-blue-100 font-medium">
              ?? You&apos;re now following &quot;{followToast.name}&quot;
            </p>
            <p className="text-xs text-blue-200/90 mt-2 leading-relaxed">
              Their cinematic world has been added to your orbit.
              Explore their taste profile, filmboards, and cinematic trace.
            </p>
          </div>
        </div>
      )}

      {shareCardOpen && shareCardConfig && (() => {
        const shareModal = (
          <div className="share-card-overlay fixed inset-0 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
            <div className="share-card-panel w-full max-w-md bg-[#111827] border border-gray-700 rounded-2xl p-4 sm:p-5 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">{shareCardConfig.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">Share a cinematic snapshot from Flickd.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareCardOpen(false)}
                  className="h-10 w-10 rounded-xl border border-white/10 bg-[#0b1220]/95 text-2xl leading-none text-gray-200 shadow-lg hover:bg-[#1f2937]"
                  aria-label="Close"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-gray-700 bg-[#0b1220] p-3">
                <div className="space-y-2">
                  {shareCardTop10Films.map((film, idx) => {
                    const key = `${film.title}_${film.year}`;
                    return (
                      <div key={`share_card_${film.title}_${film.year}_${idx}`} className="flex items-center gap-3 rounded-lg bg-[#0f172a] border border-gray-800 p-2">
                        {posters[key] ? (
                          <button
                            type="button"
                            onClick={() => handleMovieClick(film)}
                            className="block w-10 h-14 shrink-0 rounded"
                            aria-label={`View details for ${film.title}`}
                          >
                            <img src={posters[key]} alt={film.title} className="w-10 h-14 rounded object-cover" />
                          </button>
                        ) : (
                          <div className="w-10 h-14 rounded bg-gray-800 flex items-center justify-center text-[8px] leading-tight text-center text-gray-500">No poster available</div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-100 truncate">
                            <span className="text-blue-300 mr-1">{idx + 1}.</span>{film.title}
                          </p>
                          <p className="flickd-poster-meta">{film.year} | ? {Number(film?.yourRating || film?.rating || 0).toFixed(1)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={downloadFavoriteYearShareCard}
                  disabled={shareCardBusy}
                  className="px-3 py-2 rounded-xl border border-gray-700 bg-[#0b1220] text-gray-100 hover:bg-[#1f2937] disabled:opacity-60"
                >
                  {shareCardBusy ? 'Preparing...' : 'Export Card'}
                </button>
                <button
                  type="button"
                  onClick={shareFavoriteYearCard}
                  disabled={shareCardBusy}
                  className="px-3 py-2 rounded-xl border border-blue-500/40 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {shareCardBusy ? 'Preparing...' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        );

        const portalHost = typeof document !== 'undefined' ? document.body : null;
        return portalHost ? createPortal(shareModal, portalHost) : shareModal;
      })()}
<div className={`flickd-immersive-shell ${user && !memberViewUserId ? 'flickd-immersive-shell--own-profile' : ''} ${publicCommunityMode && !user ? 'flickd-immersive-shell--guest-public' : ''} ${mobileTopNavOpen ? 'flickd-mobile-menu-open' : ''}`}>
        <header className="flickd-shell-header">
            <div className="flickd-shell-header__inner">
              <div className="flex h-full w-full items-center justify-between md:justify-start gap-3 md:gap-4">
                <div className="flickd-brand-lockup md:w-[286px] md:flex-none md:justify-center">
                  <img
                    src="/flickd-brand.png"
                    alt="Flickd"
                    className="h-8 md:h-7 w-auto object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMobileTopNavOpen((prev) => !prev)}
                  className="flickd-mobile-menu-toggle md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-700 bg-[#111827] text-gray-200 hover:bg-[#1f2937]"
                  aria-label="Toggle menu"
                  aria-expanded={mobileTopNavOpen}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="flickd-primary-nav hidden md:flex md:ml-auto">
                  {publicCommunityMode && !user ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (memberViewUserId) exitMemberDashboard();
                          setActiveTab('members');
                        }}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                          isMembersTopActive
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                        }`}
                      >
                        Cinephiles
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateProfileModal(true)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-blue-500/40 text-blue-100 bg-blue-600/15 hover:bg-blue-600/25 transition-colors"
                      >
                        Join Now
                      </button>
                    </>
                  ) : (
                    <>
                  <button
                    type="button"
                    onClick={() => { if (memberViewUserId) exitMemberDashboard(); handleTabChange('overview'); }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      isHomeActive
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('members')}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      isMembersTopActive
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Cinephiles
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('following')}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      activeTab === 'following'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Following
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('followers')}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      activeTab === 'followers'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    <span className="relative inline-flex items-center gap-2">
                      Followers
                      {newFollowersList.length > 0 && (
                        <span className="inline-flex items-center justify-center">
                          <span className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]" />
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('settings')}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      activeTab === 'settings'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Preferences
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 text-gray-200 bg-[#111827] hover:bg-[#1f2937] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {signingOut ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  )}
                    </>
                  )}
                </div>
              </div>
              {mobileTopNavOpen && (() => {
                const mobileMenu = (
                <div className="flickd-mobile-menu-overlay md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
                  <button
                    type="button"
                    className="flickd-mobile-menu-backdrop"
                    aria-label="Close navigation menu"
                    onClick={() => setMobileTopNavOpen(false)}
                  />
                  <div className="flickd-mobile-menu-panel">
                  <div className="flickd-mobile-menu-header">
                    <img src="/flickd-brand.png" alt="Flickd" className="flickd-mobile-menu-brand-logo" />
                    <button
                      type="button"
                      className="flickd-mobile-menu-close"
                      onClick={() => setMobileTopNavOpen(false)}
                      aria-label="Close menu"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <div className="flickd-mobile-menu-list">
                  {publicCommunityMode && !user ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (memberViewUserId) exitMemberDashboard();
                          setActiveTab('members');
                          setMobileTopNavOpen(false);
                        }}
                        className={`flickd-mobile-menu-item flickd-mobile-menu-item--members ${
                          isMembersTopActive
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                        }`}
                      >
                        Cinephiles
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateProfileModal(true);
                          setMobileTopNavOpen(false);
                        }}
                        className="flickd-mobile-menu-item bg-blue-600/15 text-blue-100 border-blue-500/40 hover:bg-blue-600/25"
                      >
                        Join Now
                      </button>
                    </>
                  ) : (
                    <>
                  <button
                    type="button"
                    onClick={() => {
                      if (memberViewUserId) exitMemberDashboard();
                      handleTabChange('overview');
                      setMobileTopNavOpen(false);
                    }}
                    className={`flickd-mobile-menu-item flickd-mobile-menu-item--home ${
                      isHomeActive
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleTabChange('members'); setMobileTopNavOpen(false); }}
                    className={`flickd-mobile-menu-item flickd-mobile-menu-item--members ${
                      isMembersTopActive
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Cinephiles
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleTabChange('following'); setMobileTopNavOpen(false); }}
                    className={`flickd-mobile-menu-item flickd-mobile-menu-item--following ${
                      activeTab === 'following'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Following
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleTabChange('followers'); setMobileTopNavOpen(false); }}
                    className={`flickd-mobile-menu-item flickd-mobile-menu-item--followers ${
                      activeTab === 'followers'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Followers {newFollowersList.length > 0 ? `(${newFollowersList.length} new)` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleTabChange('settings'); setMobileTopNavOpen(false); }}
                    className={`flickd-mobile-menu-item flickd-mobile-menu-item--settings ${
                      activeTab === 'settings'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Preferences
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={() => { handleSignOut(); setMobileTopNavOpen(false); }}
                      disabled={signingOut}
                      className="flickd-mobile-menu-item flickd-mobile-menu-item--danger disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {signingOut ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  )}
                    </>
                  )}
                </div>
                </div>
                </div>
                );
                const mobileMenuHost = typeof document !== 'undefined' ? document.body : null;
                return mobileMenuHost ? createPortal(mobileMenu, mobileMenuHost) : mobileMenu;
              })()}
            </div>
        </header>

        {publicCommunityMode && !user && (
          <section className="flickd-guest-join-banner mx-3 sm:mx-5 mt-4 rounded-2xl border border-blue-500/20 bg-[#111827] px-5 py-5 sm:px-6 shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-3xl">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">Become part of the Flickd community</h2>
                <p className="mt-2 text-sm sm:text-base leading-relaxed text-gray-400">
                  Share your cinema taste, discover people with similar film instincts, and build a profile that reflects what you love.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateProfileModal(true)}
                className="inline-flex w-full md:w-auto items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Join Flickd
              </button>
            </div>
          </section>
        )}

        {((hasDashboardData && stats) || (publicCommunityMode && activeTab === 'members' && !memberViewUserId)) ? (

          <>
            {activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' && (
              <div className="hidden lg:grid fixed top-16 left-0 right-0 bottom-0 grid-cols-[292px_minmax(0,1fr)] z-40 pointer-events-none flickd-shell-body-desktop">
                <div className="contents">
                  <div className="h-full pointer-events-auto">
                    <aside className="flickd-sidebar-rail profile-scroll overflow-y-auto overflow-x-hidden flex flex-col h-full">
                  <div className="flickd-profile-identity">
                {(currentProfileAvatarUrl && !profileAvatarFailed) ? (
                  <img
                    src={currentProfileAvatarUrl}
                    alt="Profile"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={() => {
                      // Retry once with cache-bust; if it still fails we show the fallback.
                      if (profileAvatarBust === 0) {
                        setProfileAvatarBust(Date.now());
                      } else {
                        setProfileAvatarFailed(true);
                      }
                    }}
                    className="flickd-profile-avatar object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileAvatarFailed(false);
                      setProfileAvatarBust(Date.now());
                    }}
                    className="flickd-profile-avatar flickd-profile-avatar--fallback"
                    title="Retry loading avatar"
                  >
                    {String(currentProfileAvatarLabel || 'U').charAt(0)}
                  </button>
                )}
                <h2 className="flickd-profile-name">
                  {memberViewUserId ? (memberViewName || 'Cinephile') : (resolvedOwnPublicName || 'Flickd')}
                </h2>
                  <p className="flickd-profile-subtitle">
                    {memberViewUserId ? 'Shared cinematic dashboard' : 'Your cinematic dashboard'}
                  </p>
                  {currentProfileAboutMeCapped && (
                    <div className="flickd-profile-about">
                      <p className="flickd-profile-about__label">About</p>
                      <p className="flickd-profile-about__text">
                        {currentProfileAboutMeCapped}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flickd-profile-stats">
                <SidebarStat label="Films Logged" value={stats.totalFilms} />
                <SidebarStat label="Critical Average" value={stats.avgYourRating} />
                <SidebarStat label="Dominant Genre" value={stats.mostRatedGenre} />
                <SidebarStat
                  label="Peak Era"
                  value={
                    eraPreference.length > 0
                      ? ([...eraPreference].sort((a, b) => b.count - a.count)[0]?.decade ?? 'N/A')
                      : 'N/A'
                  }
                />
              </div>
              {(memberViewUserId ? Object.values(memberViewSocials) : Object.values(socialLinks)).some((value) => value) && (
                <div className="flickd-profile-socials">
                  {(memberViewUserId ? memberViewSocials.instagram : socialLinks.instagram) && (
                    <a
                      href={(memberViewUserId ? memberViewSocials.instagram : socialLinks.instagram)}
                      target="_blank"
                      rel="noreferrer"
                      className="flickd-profile-social-link"
                    >
                      Instagram
                    </a>
                  )}
                  {(memberViewUserId ? memberViewSocials.x : socialLinks.x) && (
                    <a
                      href={(memberViewUserId ? memberViewSocials.x : socialLinks.x)}
                      target="_blank"
                      rel="noreferrer"
                      className="flickd-profile-social-link"
                    >
                      X
                    </a>
                  )}
                  {(memberViewUserId ? memberViewSocials.facebook : socialLinks.facebook) && (
                    <a
                      href={(memberViewUserId ? memberViewSocials.facebook : socialLinks.facebook)}
                      target="_blank"
                      rel="noreferrer"
                      className="flickd-profile-social-link"
                    >
                      Facebook
                    </a>
                  )}
                </div>
              )}
              {isViewingOtherMember && (
                <div className="flickd-profile-actions">
                  <button
                    type="button"
                    onClick={() => toggleFollowMember(memberViewUserId, memberViewName)}
                    className={`flickd-profile-action flickd-profile-action--primary ${
                      followedMemberIds.includes(String(memberViewUserId))
                        ? 'flickd-profile-action--following'
                        : ''
                    }`}
                  >
                    {followedMemberIds.includes(String(memberViewUserId)) ? 'Unfollow' : 'Follow'}
                  </button>
                  <button
                    type="button"
                    onClick={openTasteResonance}
                    className="flickd-profile-action flickd-profile-action--resonance"
                  >
                    {tasteResonanceLoading ? 'Loading...' : 'Taste Resonance'}
                  </button>
                </div>
              )}
            </aside>
                  </div>
                <div className="flex min-w-0 flex-col gap-0 pointer-events-none">
                  {memberViewUserId && (
                    <div className="flex items-center border-b border-gray-800 bg-[#070b12]/95 px-6 py-3 pointer-events-auto">
                      <button
                        type="button"
                        onClick={() => { exitMemberDashboard(); handleTabChange('members'); }}
                        className="px-3 py-1.5 bg-[#0b1220] border border-blue-500/30 text-blue-200 text-xs rounded-lg hover:bg-[#101a2d]"
                      >
                        Back
                      </button>
                    </div>
                  )}
                <div className="flickd-secondary-nav pointer-events-auto">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <PremiumTabs
                      className="w-full lg:w-auto"
                      items={navItems.map((tab) => ({ value: tab.id, label: tab.label }))}
                      value={activeTab}
                      onChange={handleTabChange}
                    />
                    {activeTab === 'overview' && null}
                  </div>
                </div>
                </div>
                </div>
              </div>
            )}

          <div
            ref={mainScrollRef}
            className={`flickd-main-scroll flickd-tab-${activeTab} h-[calc(100vh-64px)] overflow-y-auto ${(activeTab === 'members' || activeTab === 'settings' || activeTab === 'following' || activeTab === 'followers') ? 'flickd-main-scroll--directory px-3 sm:px-5 py-4' : 'px-3 sm:px-5 py-4 lg:py-0 lg:pr-4 lg:pl-[300px]'}`}
            onWheelCapture={handleMainScrollWheelCapture}
          >
            {activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' && (
              <>
                <div className="hidden" />
                <aside className="profile-scroll lg:hidden flickd-mobile-profile-rail flickd-sidebar-rail bg-[#111827] border border-gray-700 rounded-2xl p-4 pt-5 overflow-hidden flex flex-col h-auto pointer-events-auto">
                  <div className="flickd-profile-identity">
                    {(currentProfileAvatarUrl && !profileAvatarFailed) ? (
                      <img
                        src={currentProfileAvatarUrl}
                        alt="Profile"
                        loading="eager"
                        referrerPolicy="no-referrer"
                        onError={() => {
                          if (profileAvatarBust === 0) {
                            setProfileAvatarBust(Date.now());
                          } else {
                            setProfileAvatarFailed(true);
                          }
                        }}
                        className="flickd-profile-avatar object-cover"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileAvatarFailed(false);
                          setProfileAvatarBust(Date.now());
                        }}
                        className="flickd-profile-avatar flickd-profile-avatar--fallback"
                        title="Retry loading avatar"
                      >
                        {String(currentProfileAvatarLabel || 'U').charAt(0)}
                      </button>
                    )}
                    <h2 className="flickd-profile-name">
                      {memberViewUserId ? (memberViewName || 'Cinephile') : (resolvedOwnPublicName || 'Flickd')}
                    </h2>
                      <p className="flickd-profile-subtitle">
                        {memberViewUserId ? 'Shared cinematic dashboard' : 'Your cinematic dashboard'}
                      </p>
                      {currentProfileAboutMeCapped && (
                        <div className="flickd-profile-about">
                          <p className="flickd-profile-about__label">About</p>
                          <p className="flickd-profile-about__text">
                            {currentProfileAboutMeCapped}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flickd-profile-stats">
                    <SidebarStat label="Films Logged" value={stats.totalFilms} />
                    <SidebarStat label="Critical Average" value={stats.avgYourRating} />
                    <SidebarStat label="Dominant Genre" value={stats.mostRatedGenre} />
                    <SidebarStat
                      label="Peak Era"
                      value={
                        eraPreference.length > 0
                          ? ([...eraPreference].sort((a, b) => b.count - a.count)[0]?.decade ?? 'N/A')
                          : 'N/A'
                      }
                    />
                  </div>
                  {isViewingOtherMember && (
                    <div className="flickd-profile-actions">
                      <button
                        type="button"
                        onClick={() => toggleFollowMember(memberViewUserId, memberViewName)}
                        className={`flickd-profile-action flickd-profile-action--primary ${
                          followedMemberIds.includes(String(memberViewUserId))
                            ? 'flickd-profile-action--following'
                            : ''
                        }`}
                      >
                        {followedMemberIds.includes(String(memberViewUserId)) ? 'Unfollow' : 'Follow'}
                      </button>
                      <button
                        type="button"
                        onClick={openTasteResonance}
                        className="flickd-profile-action flickd-profile-action--resonance"
                      >
                        {tasteResonanceLoading ? 'Loading...' : 'Taste Resonance'}
                      </button>
                    </div>
                  )}
                </aside>
              </>
            )}

            <div ref={mainContentRef} className={`min-w-0 flex flex-col ${activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' ? 'lg:pt-[132px] flickd-profile-content-shell' : ''}`}>
              {activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' && (
                <>
                  <div className="flickd-mobile-tab-spacer lg:hidden" />
                  <div className="lg:hidden flickd-mobile-secondary-nav rounded-2xl border border-gray-800 bg-[#0b0f17]/95 px-2 pt-2 pb-2 backdrop-blur">
                    <div className="flex items-center justify-between gap-2">
                      <PremiumTabs
                        className="w-full overflow-x-auto"
                        items={navItems.map((tab) => ({ value: tab.id, label: tab.label }))}
                        value={activeTab}
                        onChange={handleTabChange}
                      />
                    </div>
                  </div>
                </>
              )}
              <div className="flickd-content-stack space-y-5 pb-5 pt-2">
              {activeTab === 'overview' && (
                <div className="flickd-overview-composition">
                  <Motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
                  <Card className="flickd-overview-hero overflow-hidden border-blue-500/20">
                    <CardContent className="p-0">
                      <div className="flickd-overview-hero__content">
                        <div className="flickd-overview-hero__eyebrow">
                          <Sparkles className="h-4 w-4 text-blue-300" />
                          Taste Snapshot
                        </div>
                        <div>
                          <CardTitle className="flickd-overview-hero__title">
                            Cinematic Overview
                          </CardTitle>
                          <CardDescription className="flickd-overview-hero__description">
                            Your viewing history distilled into patterns of emotion, authorship, and cinematic identity.
                          </CardDescription>
                        </div>
                        <div className="flickd-overview-hero__stats">
                          <div>
                            <span>Films Logged</span>
                            <strong>{stats?.totalFilms ?? 0}</strong>
                          </div>
                          <div>
                            <span>Critical Average</span>
                            <strong>{stats?.avgYourRating ?? 0}</strong>
                          </div>
                          <div>
                            <span>Dominant Genre</span>
                            <strong>{stats?.mostRatedGenre ?? 'N/A'}</strong>
                          </div>
                          <div>
                            <span>Peak Era</span>
                            <strong>{eraPreference.length > 0 ? ([...eraPreference].sort((a, b) => b.count - a.count)[0]?.decade ?? 'N/A') : 'N/A'}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="flickd-overview-hero__side">
                        <span className="text-xs md:text-sm font-medium text-blue-200/80">Cinematic Signals</span>
                        <p>
                          Your ratings lean toward emotionally weighty cinema, with recurring attraction to morally complex storytelling and auteur-driven worlds.
                        </p>
                        <div className="flickd-overview-hero__chips">
                          <span>Ratings</span>
                          <span>Genres</span>
                          <span>Eras</span>
                          <span>Directors</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  </Motion.div>

                  <div className="flickd-overview-section-heading">
                    <div>
                      <span>Watching Patterns</span>
                      <h2>The emotional rhythm of your ratings.</h2>
                    </div>
                    <p>Patterns shaped through genre loyalty, emotional intensity, and cinematic eras.</p>
                  </div>

                  {metadataStatus.loading && (
                    <DashboardCard className="p-4 border border-blue-500/20 bg-blue-950/10">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-blue-100 font-medium">OMDb metadata is still loading</span>
                          <span className="text-blue-200/80">{metadataStatus.ready} / {metadataStatus.total}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#1f2937]">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${metadataStatus.percent}%` }}
                          />
                        </div>
                        <p className="text-xs text-blue-100/70">Rating and year charts are ready. Genre, director, country, and personality charts will settle as metadata fills in.</p>
                      </div>
                    </DashboardCard>
                  )}

                  <div className="flickd-overview-primary-grid">
                    <ChartCard title={<span className="inline-flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-300" /> Rating Distribution</span>} className="flickd-overview-feature-chart h-full" bodyClassName="flickd-chart-stage flickd-chart-stage--feature">
                        <ResponsiveContainer width="100%" height={390}>
                          <BarChart data={ratingDist} margin={CHART_THEME.margin.vertical}>
                            <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} />
                            <XAxis dataKey="rating" stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                            <YAxis stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                            <Tooltip {...CHART_THEME.tooltip} />
                            <Bar dataKey="count" fill={ACCENT_COLOR} radius={CHART_THEME.barRadius.vertical} activeBar={false} isAnimationActive={false}>
                              {ratingDist.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
                              <LabelList dataKey="count" position="top" formatter={formatCompactChartValue} fill="rgba(226, 232, 240, 0.94)" fontSize={11} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                    </ChartCard>

                    {mostWatchedGenres.genres.length > 0 ? (
                      <ChartCard title={<span className="inline-flex items-center gap-2"><Clapperboard className="h-4 w-4 text-violet-300" /> Dominant Genres</span>} className="flickd-overview-support-chart h-full" bodyClassName="flickd-chart-stage">
                        <div className="mb-4 text-sm text-gray-300">
                          Total: <span className="text-blue-400 font-bold">{mostWatchedGenres.totalGenres}</span>
                          {mostWatchedGenres.topGenre && (
                            <span className="ml-3 text-blue-200">
                              {mostWatchedGenres.topGenre.count} {mostWatchedGenres.topGenre.genre} ({mostWatchedGenres.topGenre.percentage}%)
                            </span>
                          )}
                        </div>
                        <div>
                          <ResponsiveContainer width="100%" height={340}>
                            <BarChart data={mostWatchedGenres.genres} layout="vertical" margin={CHART_THEME.margin.horizontal}>
                              <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} />
                              <XAxis type="number" stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                              <YAxis type="category" dataKey="genre" width={120} stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                              <Tooltip
                                {...CHART_THEME.tooltip}
                                formatter={(v, name, props) => [`${v} films (${props.payload.percentage}%)`, 'Count']}
                              />
                              <Bar dataKey="count" fill={ACCENT_COLOR} radius={CHART_THEME.barRadius.horizontal} activeBar={false} isAnimationActive={false}>
                                {mostWatchedGenres.genres.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
                                <LabelList dataKey="count" position="right" formatter={formatCompactChartValue} fill="rgba(226, 232, 240, 0.94)" fontSize={11} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </ChartCard>
                    ) : metadataStatus.loading ? (
                      <ChartCard title={<span className="inline-flex items-center gap-2"><Clapperboard className="h-4 w-4 text-violet-300" /> Dominant Genres</span>} className="flickd-overview-support-chart h-full" bodyClassName="flickd-chart-stage">
                        <div className="flex h-[340px] items-center justify-center text-center text-sm text-gray-400">
                          Fetching genres from OMDb...
                        </div>
                      </ChartCard>
                    ) : null}
                  </div>

                  {yearlyHighlight.length > 0 && (
                    <DashboardCard className="flickd-overview-wide-panel p-4">
                      <div className="flickd-overview-card-heading">
                        <div>
                          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><Activity className="h-4 w-4 text-pink-300" /> Yearly Rating Activity</h2>
                          <p>How your ratings distribute across cinema history.</p>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart
                          data={yearlyHighlight}
                          margin={CHART_THEME.margin.vertical}
                          onClick={(state) => showYearlyChartTooltip(state?.activePayload, state?.activeCoordinate)}
                          onMouseMove={(state) => {
                            if (state?.isTooltipActive) showYearlyChartTooltip(state.activePayload, state.activeCoordinate);
                          }}
                          onMouseLeave={() => setYearlyChartTooltip(null)}
                        >
                          <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} />
                          <XAxis dataKey="year" stroke={CHART_THEME.axis.stroke} interval="preserveStartEnd" tick={CHART_THEME.axis.tick} />
                          <YAxis stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                          <Tooltip
                            {...CHART_THEME.tooltip}
                            active={yearlyChartTooltip ? true : undefined}
                            payload={yearlyChartTooltip?.payload}
                            label={yearlyChartTooltip?.label}
                            coordinate={yearlyChartTooltip?.coordinate}
                            formatter={(v) => [`${v} films`, 'Count']}
                          />
                          <Bar
                            dataKey="filmCount"
                            fill={ACCENT_COLOR}
                            radius={CHART_THEME.barRadius.vertical}
                            activeBar={false}
                            onClick={(point, index, event) => {
                              showYearlyChartTooltip(point, event ? { x: event.clientX, y: event.clientY } : null);
                            }}
                            onTouchStart={(point, index, event) => {
                              event?.stopPropagation?.();
                              showYearlyChartTooltip(point, null);
                            }}
                          >
                            {yearlyHighlight.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </DashboardCard>
                  )}

                  <div className="flickd-overview-section-heading">
                    <div>
                      <span>Taste Landscape</span>
                      <h2>Where your preferences settle</h2>
                    </div>
                    <p>Genre, era, and director signals arranged as deeper context.</p>
                  </div>

                  <div className="flickd-overview-support-grid">
                    {genreAffinity.length > 0 ? (
                      <ChartCard title={<span className="inline-flex items-center gap-2"><Blend className="h-4 w-4 text-emerald-300" /> Genre Affinity</span>} className="h-full" bodyClassName="flickd-chart-stage">
                        <div>
                          <ResponsiveContainer width="100%" height={340}>
                            <BarChart data={genreAffinity} layout="vertical" margin={CHART_THEME.margin.horizontal}>
                              <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} />
                              <XAxis type="number" domain={[0, 10]} stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                              <YAxis type="category" dataKey="genre" width={120} stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                              <Tooltip
                                {...CHART_THEME.tooltip}
                                formatter={(value, name, props) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [`${value} avg (${count} films)`, 'Avg Rating'];
                                }}
                              />
                              <Bar dataKey="avgRating" fill={ACCENT_COLOR} radius={CHART_THEME.barRadius.horizontal} activeBar={false} isAnimationActive={false}>
                                {genreAffinity.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
                                <LabelList dataKey="avgRating" position="right" formatter={formatOneDecimalChartValue} fill="rgba(226, 232, 240, 0.94)" fontSize={11} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </ChartCard>
                    ) : metadataStatus.loading ? (
                      <ChartCard title={<span className="inline-flex items-center gap-2"><Blend className="h-4 w-4 text-emerald-300" /> Genre Affinity</span>} className="h-full" bodyClassName="flickd-chart-stage">
                        <div className="flex h-[340px] items-center justify-center text-center text-sm text-gray-400">
                          Fetching genres from OMDb...
                        </div>
                      </ChartCard>
                    ) : null}

                    {eraPreference.length > 0 && (
                      <ChartCard title={<span className="inline-flex items-center gap-2"><CalendarRange className="h-4 w-4 text-amber-300" /> Era Preference</span>} className="h-full" bodyClassName="flickd-chart-stage">
                        <div>
                          <ResponsiveContainer width="100%" height={340}>
                            <BarChart data={eraPreference} margin={CHART_THEME.margin.vertical}>
                              <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} />
                              <XAxis dataKey="decade" stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                              <YAxis domain={[eraChartMin, 10]} stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                              <Tooltip
                                {...CHART_THEME.tooltip}
                                formatter={(value, name, props) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [`${value} avg (${count} films)`, 'Avg Rating'];
                                }}
                              />
                              <Bar dataKey="avgRating" fill={ACCENT_COLOR} radius={CHART_THEME.barRadius.vertical} activeBar={false} isAnimationActive={false}>
                                {eraPreference.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
                                <LabelList dataKey="avgRating" position="top" formatter={formatOneDecimalChartValue} fill="rgba(226, 232, 240, 0.94)" fontSize={11} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </ChartCard>
                    )}
                    {consistentlyLovedDirectors.length > 0 && (
                      <ChartCard title={<span className="inline-flex items-center gap-2"><HeartHandshake className="h-4 w-4 text-fuchsia-300" /> Most Consistently Loved Directors</span>} className="flickd-overview-director-panel">
                        <ResponsiveContainer width="100%" height={380}>
                          <BarChart data={consistentlyLovedDirectors} layout="vertical" margin={CHART_THEME.margin.horizontal}>
                            <CartesianGrid strokeDasharray={CHART_THEME.grid.strokeDasharray} stroke={CHART_THEME.grid.stroke} />
                            <XAxis type="number" stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                            <YAxis type="category" dataKey="director" width={140} stroke={CHART_THEME.axis.stroke} tick={CHART_THEME.axis.tick} />
                            <Tooltip
                              {...CHART_THEME.tooltip}
                              formatter={(value, name, props) => {
                                const payload = props?.payload || {};
                                const moviesRated = payload.highRatedCount ?? value ?? 0;
                                const totalFilms = payload.totalFilms ?? 0;
                                return [`${moviesRated} (of ${totalFilms})`, 'Movies rated 8+'];
                              }}
                            />
                            <Bar dataKey="highRatedCount" fill={ACCENT_COLOR} radius={CHART_THEME.barRadius.horizontal} activeBar={false} isAnimationActive={false}>
                              {consistentlyLovedDirectors.map((_, i) => <Cell key={i} fill={getChartColor(i)} />)}
                              <LabelList dataKey="highRatedCount" position="right" formatter={formatCompactChartValue} fill="rgba(226, 232, 240, 0.94)" fontSize={11} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    )}
                    <div
                      ref={mapFullscreenRef}
                      className={`flickd-overview-map-panel bg-[#111827] border border-gray-800 rounded-xl p-4 ${mapFullscreen ? 'h-screen overflow-auto' : ''}`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                          <h2 className="text-lg font-semibold">Global Cinema Preference Map</h2>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Films grouped by country of origin from your ratings data.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={String(countryRatingThreshold)}
                              onValueChange={(value) => setCountryRatingThreshold(Number(value))}
                            >
                              <SelectTrigger className="h-10 w-full sm:w-56">
                                <SelectValue placeholder="Rating scope" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="8">My Top-Rated Films (8+)</SelectItem>
                                <SelectItem value="0">All My Films</SelectItem>
                              </SelectContent>
                            </Select>
                            {null}
                            <Button type="button" size="sm" variant="subtle" onClick={() => zoomMap(-0.2)}>-</Button>
                            <Button type="button" size="sm" variant="subtle" onClick={() => zoomMap(0.2)}>+</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={resetMapView}>Reset</Button>
                            <button
                              type="button"
                              onClick={toggleMapFullscreen}
                              className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 transition-colors hover:bg-[#1f2937] hover:border-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                              title={mapFullscreen ? 'Exit full screen' : 'Full screen'}
                              aria-label={mapFullscreen ? 'Exit full screen' : 'Full screen'}
                            >
                              {mapFullscreen ? (
                                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="9 3 3 3 3 9" />
                                  <line x1="3" y1="3" x2="10" y2="10" />
                                  <polyline points="15 21 21 21 21 15" />
                                  <line x1="14" y1="14" x2="21" y2="21" />
                                  <polyline points="21 9 21 3 15 3" />
                                  <line x1="14" y1="10" x2="21" y2="3" />
                                  <polyline points="3 15 3 21 9 21" />
                                  <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="15 3 21 3 21 9" />
                                  <polyline points="9 21 3 21 3 15" />
                                  <line x1="21" y1="3" x2="14" y2="10" />
                                  <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                              )}
                            </button>
                          </div>
                      </div>

                      <div
                        ref={mapWheelSurfaceRef}
                        className="flickd-map-wheel-surface rounded-lg border border-gray-800 bg-[#0b1220] p-2 relative overscroll-contain"
                        style={{ overscrollBehavior: 'contain' }}
                        onMouseEnter={() => setMapWheelLock(true)}
                        onMouseLeave={() => setMapWheelLock(false)}
                        onWheel={handleMapWheel}
                        onWheelCapture={handleMapWheel}
                      >
                        {(countryDataCount === 0 || countryHighlightCount === 0 || usingCountryPreferenceFallback) && (
                          <div className="absolute left-4 top-4 z-10 max-w-xs rounded-lg border border-gray-700 bg-[#050a14]/90 px-3 py-2 text-xs text-gray-300 shadow-lg">
                            <p>
                              {countryDataCount === 0
                                ? (fetchingCountries ? 'Mapping countries from OMDb...' : 'Country data is not available yet.')
                                : countryHighlightCount === 0
                                  ? 'No mapped countries match this rating scope yet.'
                                  : 'Showing all mapped countries until the 8+ country set is ready.'}
                            </p>
                            {countryDataCount === 0 && !fetchingCountries && (
                              <button
                                type="button"
                                onClick={retryCountryMapping}
                                className="mt-2 rounded-md border border-blue-500/40 bg-blue-600/20 px-2 py-1 text-[11px] text-blue-200 hover:bg-blue-600/30"
                              >
                                Retry country mapping
                              </button>
                            )}
                          </div>
                        )}
                        
                          {mapFeatures.length > 0 && mapPathGenerator ? (
                            <svg
                              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                              className={`flickd-gesture-surface w-full ${mapFullscreen ? 'h-[82vh]' : 'h-[580px]'} ${isMapDragging ? "cursor-grabbing" : ""}`}
                              onMouseDown={handleMapMouseDown}
                              onMouseMove={handleMapMouseMove}
                              onMouseUp={stopMapDragging}
                              onTouchStart={handleMapTouchStart}
                              onTouchMove={handleMapTouchMove}
                              onTouchEnd={handleMapTouchEnd}
                              onTouchCancel={handleMapTouchEnd}
                              onMouseLeave={() => {
                                stopMapDragging();
                                setHoveredMapCountry(null);
                                setMapTooltip(null);
                              }}
                            >
                              <g transform={`translate(${mapPan.x} ${mapPan.y}) scale(${mapZoom})`}>
                                {mapFeatures.map((feature, idx) => {
                                  const rawName = getFeatureCountryName(feature);
                                  const normalizedName = normalizeCountryName(rawName);
                                  const count = getCountryMatchKeys(normalizedName)
                                    .reduce((max, key) => Math.max(max, countryPreferenceLookup[key] || 0), 0);
                                  const pathData = mapPathGenerator(feature);
                                  if (!pathData) return null;
  return (
                                    <path
                                      key={`country-${idx}`}
                                      d={pathData}
                                      fill={getMapIntensityColor(count)}
                                      stroke={count > 0 ? "#1f2937" : "#4b5f85"}
                                      strokeWidth={0.6 / mapZoom}
                                      opacity={count > 0 ? 0.95 : 0.7}
                                      className="cursor-pointer"
                                      onMouseEnter={(event) => {
                                        const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
                                        setHoveredMapCountry({ country: rawName, count });
                                        setMapTooltip({
                                          x: event.clientX - rect.left,
                                          y: event.clientY - rect.top,
                                        });
                                      }}
                                      onMouseLeave={() => {
                                        setHoveredMapCountry(null);
                                        setMapTooltip(null);
                                      }}
                                    />
                                  );
                                })}
                              </g>
                            </svg>
                          ) : (
                            <div className="h-[500px] flex items-center justify-center text-sm text-gray-400">Loading world map...</div>
                          )}
                          {hoveredMapCountry && mapTooltip && (
                            <div
                              className="pointer-events-none absolute z-20 px-2.5 py-2 rounded-lg bg-[#0f172a]/95 border border-gray-700 text-xs text-gray-200 shadow-xl"
                              style={{ left: `${mapTooltip.x + 14}px`, top: `${Math.max(mapTooltip.y - 36, 8)}px` }}
                            >
                              <div className="font-semibold text-gray-100">{hoveredMapCountry.country}</div>
                              <div className="text-blue-300 mt-0.5">{hoveredMapCountry.count} {mapCountLabel}</div>
                            </div>
                          )}
                        </div>
                    </div>
                  </div>
                </div>
              )}
{activeTab === 'allwatched' && (
                <div className="space-y-4">
                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Film Archive</h2>
                        <p className="text-xs text-gray-400 mt-1">Every rated film, organized as a living archive of taste.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={watchedSearchQuery}
                          onChange={(e) => setWatchedSearchQuery(e.target.value)}
                          placeholder="Search title..."
                          className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2.5 py-1.5 w-40 sm:w-52"
                        />
                        <Select value={watchedSortBy} onValueChange={setWatchedSortBy}>
                          <SelectTrigger className="h-10 w-full sm:w-64">
                            <SelectValue placeholder="Sort by" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="year_desc">Year (Newest first)</SelectItem>
                            <SelectItem value="year_asc">Year (Oldest first)</SelectItem>
                            <SelectItem value="rating_desc">Your Rating (High to low)</SelectItem>
                            <SelectItem value="rating_asc">Your Rating (Low to high)</SelectItem>
                            <SelectItem value="imdb_desc">IMDb Rating (High to low)</SelectItem>
                            <SelectItem value="imdb_asc">IMDb Rating (Low to high)</SelectItem>
                            <SelectItem value="title_az">Title (A-Z)</SelectItem>
                            <SelectItem value="title_za">Title (Z-A)</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() => setWatchedMoreFiltersOpen((prev) => !prev)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:bg-[#101a2d]"
                        >
                          {watchedMoreFiltersOpen ? 'Hide filters' : 'More filters'}
                        </button>
                      </div>
                    </div>
                    {watchedMoreFiltersOpen && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2">
                        <Select
                          value={watchedDecadeFilter}
                          onValueChange={(value) => { setWatchedDecadeFilter(value); setWatchedYearFilter('all'); }}
                        >
                          <SelectTrigger className="h-10 w-full sm:w-44">
                            <SelectValue placeholder="All Decades" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Decades</SelectItem>
                            {watchedDecades.map((decade) => (
                              <SelectItem key={decade} value={decade}>{decade}s</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={watchedYearFilter} onValueChange={setWatchedYearFilter}>
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="All Years" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Years</SelectItem>
                            {watchedYearOptions.map((year) => (
                              <SelectItem key={year} value={year}>{year}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={watchedRatingFilter} onValueChange={setWatchedRatingFilter}>
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="All Ratings" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Ratings</SelectItem>
                            <SelectItem value="9plus">Rating 9+</SelectItem>
                            <SelectItem value="8plus">Rating 8+</SelectItem>
                            <SelectItem value="7plus">Rating 7+</SelectItem>
                            <SelectItem value="6plus">Rating 6+</SelectItem>
                            <SelectItem value="below6">Rating Below 6</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={watchedGenreFilter} onValueChange={setWatchedGenreFilter}>
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="All Genres" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Genres</SelectItem>
                            {watchedGenres.map((genre) => (
                              <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={watchedCountryFilter} onValueChange={setWatchedCountryFilter}>
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder="All Countries" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Countries</SelectItem>
                            {watchedCountries.map((country) => (
                              <SelectItem key={country} value={country}>{country}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={watchedDirectorFilter} onValueChange={setWatchedDirectorFilter}>
                          <SelectTrigger className="h-10 w-full sm:col-span-2">
                            <SelectValue placeholder="All Directors" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Directors</SelectItem>
                            {watchedDirectors.map((director) => (
                              <SelectItem key={director} value={director}>{director}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-3">
                      Showing {watchedFilteredFilms.length === 0 ? 0 : (watchedSafePage - 1) * watchedFilmsPerPage + 1} - {Math.min(watchedSafePage * watchedFilmsPerPage, watchedFilteredFilms.length)} of {watchedFilteredFilms.length} films
                    </p>
                  </div>

                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                    {watchedPageFilms.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {watchedPageFilms.map((movie, idx) => (
                          <div key={`${movie.title}_${movie.year}_${idx}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                            {posters[`${movie.title}_${movie.year}`] ? (
                              <button
                                type="button"
                                onClick={() => handleMovieClick(movie)}
                                className="block w-full rounded"
                                aria-label={`View details for ${movie.title}`}
                              >
                                <img
                                  src={posters[`${movie.title}_${movie.year}`]}
                                  alt={movie.title}
                                  className="w-full aspect-[2/3] object-cover rounded"
                                  onError={() => handlePosterRenderError(`${movie.title}_${movie.year}`)}
                                />
                              </button>
                            ) : (
                              <button
                                onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                title="Load poster"
                              >
                                {renderPosterStatus(`${movie.title}_${movie.year}`)}
                              </button>
                            )}
                            <button
                              onClick={() => handleMovieClick(movie)}
                              className="flickd-poster-title mt-2 w-full text-left"
                            >
                              {movie.title}
                            </button>
                            <div className="flickd-poster-meta">{movie.year} {"\u2605"} {movie.yourRating}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 py-6 text-center">Your cinematic profile will begin to take shape once ratings are imported.</div>
                    )}

                    {watchedTotalPages > 1 && (
                      <div className="flex justify-center gap-3 mt-4">
                        <button
                          onClick={() => setWatchedPage(Math.max(1, watchedSafePage - 1))}
                          disabled={watchedSafePage === 1}
                          className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                        >
                          Prev
                        </button>
                        <span className="py-1.5 text-xs text-gray-400">Page {watchedSafePage} / {watchedTotalPages}</span>
                        <button
                          onClick={() => setWatchedPage(Math.min(watchedTotalPages, watchedSafePage + 1))}
                          disabled={watchedSafePage === watchedTotalPages}
                          className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
{activeTab === 'mytrace' && (
                <div className="space-y-4">
                  <div
                    ref={traceFullscreenRef}
                    className={`flickd-trace-shell bg-[#111827] border border-gray-800 rounded-xl p-4 ${traceFullscreen ? 'h-screen overflow-auto' : ''}`}
                  >
                    {!traceFullscreen && (
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold text-white">Director Fingerprint</h2>
                          <div className="text-xs text-gray-400 mt-2 leading-relaxed max-w-4xl space-y-2">
                            <p>This artwork visualizes your cinematic identity.</p>
                            <p>
                              Each segment represents a film director from your viewing history, and every arc represents a film you watched.
                              The distance from the center reflects the film&apos;s release year, while color indicates the director&apos;s dominant genre.
                              Brighter arcs represent films you rated more highly.
                            </p>
                            <p>
                              Together these arcs form a unique fingerprint of the directors and films that shaped your taste in cinema.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                     {directorFingerprintData ? (
                        <>
                         {!traceFullscreen && (
                         <div className="mt-4 mb-3 rounded-lg border border-gray-800 bg-[#0b1220] p-3 text-xs">
                           <div className="text-gray-200">
                             <span className="text-gray-400">Films Fingerprinted:</span> {directorFingerprintData.totalFilms}
                             <span className="text-gray-500"> {' / '} </span>
                             <span className="text-gray-400">Total Films:</span> {directorFingerprintData.sourceFilms}
                             <span className="text-gray-500"> {' | '} </span>
                             <span className="text-gray-400">Time Span:</span> {directorFingerprintData.spanStart} to {directorFingerprintData.spanEnd}
                           </div>
                           {directorFingerprintData.metadataLoading && (
                             <div className="mt-3">
                               <div className="flex items-center justify-between text-[11px] text-blue-100/80">
                                 <span>Director metadata still loading from OMDb</span>
                                 <span>{directorFingerprintData.metadataReady} / {directorFingerprintData.metadataTotal}</span>
                               </div>
                               <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1f2937]">
                                 <div
                                   className="h-full rounded-full bg-blue-500 transition-all duration-500"
                                   style={{ width: `${metadataStatus.percent}%` }}
                                 />
                               </div>
                             </div>
                           )}
                           <div className="text-blue-300 mt-1 break-words">
                             <span className="text-gray-400">Top Directors:</span> {directorFingerprintData.topDirectors.join(', ')}
                           </div>
                         </div>
                         )}

                         {/* Trace summary (keep above the main visualization) */}
                         {!traceFullscreen && (
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                           <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                             <div className="text-gray-400 text-xs">Directors Fingerprinted</div>
                             <div className="text-white font-semibold text-sm mt-1">{directorFingerprintData.directors.length}</div>
                           </div>
                           <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                             <div className="text-gray-400 text-xs">Release Year Span</div>
                             <div className="text-white font-semibold text-sm mt-1">{directorFingerprintData.yearMin + ' to ' + directorFingerprintData.yearMax}</div>
                           </div>
                           <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                             <div className="text-gray-400 text-xs">Top Signature</div>
                             <div className="text-white font-semibold text-sm mt-1 break-words">{directorFingerprintData.topDirectors.slice(0, 2).join(' + ')}</div>
                           </div>
                         </div>
                         )}

                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                           <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                             {directorFingerprintData.genreLegend.map((item) => (
                               <span key={item.key} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-gray-800 bg-[#0b1220]">
                                 <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                 {item.key.replace('-', ' ')}
                               </span>
                             ))}
                           </div>

                           <div className="flex flex-wrap justify-start sm:justify-end gap-2">
                             <button
                               type="button"
                               onClick={toggleTraceFullscreen}
                               className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                               title={traceFullscreen ? 'Exit full screen' : 'Full screen'}
                               aria-label={traceFullscreen ? 'Exit full screen' : 'Full screen'}
                             >
                               {traceFullscreen ? (
                                 <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                   <polyline points="9 3 3 3 3 9" />
                                   <line x1="3" y1="3" x2="10" y2="10" />
                                   <polyline points="15 21 21 21 21 15" />
                                   <line x1="14" y1="14" x2="21" y2="21" />
                                   <polyline points="21 9 21 3 15 3" />
                                   <line x1="14" y1="10" x2="21" y2="3" />
                                   <polyline points="3 15 3 21 9 21" />
                                   <line x1="3" y1="21" x2="10" y2="14" />
                                 </svg>
                               ) : (
                                 <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                   <polyline points="15 3 21 3 21 9" />
                                   <polyline points="9 21 3 21 3 15" />
                                   <line x1="21" y1="3" x2="14" y2="10" />
                                   <line x1="3" y1="21" x2="10" y2="14" />
                                 </svg>
                               )}
                             </button>
                             <button
                               type="button"
                               onClick={downloadDirectorFingerprintSvg}
                               className="px-3 py-1.5 text-xs rounded-lg bg-[#0b1220] border border-gray-700 text-gray-200 hover:bg-gray-800"
                             >
                               Export SVG
                             </button>
                             <button
                               type="button"
                               onClick={downloadDirectorFingerprintPng}
                               className="px-3 py-1.5 text-xs rounded-lg bg-[#0b1220] border border-gray-700 text-gray-200 hover:bg-gray-800"
                             >
                               Export PNG Poster
                             </button>
                           </div>
                         </div>

                         <div className="flickd-trace-canvas rounded-lg border border-gray-800 bg-transparent p-3 overflow-x-auto overflow-y-visible md:overflow-visible relative">
                         <svg
                              ref={traceSvgRef}
                              viewBox={'0 0 ' + directorFingerprintData.size + ' ' + directorFingerprintData.size}
                              className={`flickd-gesture-surface flickd-trace-svg w-full h-auto ${traceFullscreen ? 'max-h-[86vh]' : 'max-h-[840px]'}`}
                             role="img"
                             aria-label="Director Fingerprint generative poster"
                             onWheel={(event) => {
                              // Prevent accidental "auto zoom" while scrolling the page.
                              // Zoom only when the user intentionally holds Ctrl + scroll.
                              if (!event.ctrlKey) return;
                              event.preventDefault();
                              const delta = event.deltaY < 0 ? 0.14 : -0.14;
                              setTraceZoom((prev) => Math.max(1, Math.min(4, Number((prev + delta).toFixed(2)))));
                             }}
                            onMouseLeave={() => {
                              setTraceHover(null);
                              setTraceTooltip(null);
                            }}
                            onTouchStart={handleTraceTouchStart}
                            onTouchMove={handleTraceTouchMove}
                            onTouchEnd={handleTraceTouchEnd}
                            onTouchCancel={handleTraceTouchEnd}
                            >
                              <defs>
                              {/* Solid background so the title area matches the visualization (no gradient strip). */}

                               {/* Keep a clean header area for the title so arcs never overlap it */}
                               <clipPath id="traceClip">
                                 <rect
                                   x="0"
                                   y="160"
                                   width={directorFingerprintData.size}
                                   height={directorFingerprintData.size - 160}
                                 />
                               </clipPath>
                              </defs>
                             <rect width="100%" height="100%" fill="transparent" />

                             {/* Title inside the visualization (not zoomed) */}
                             <rect x="0" y="0" width="100%" height="160" fill="transparent" />
                             <text
                               x={directorFingerprintData.cx}
                               y={78}
                               textAnchor="middle"
                               fill="#f8fafc"
                               className="flickd-trace-title"
                               style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 800, fontSize: 44, letterSpacing: '0.6px' }}
                             >
                               {directorFingerprintData.title}
                             </text>
                             <text
                               x={directorFingerprintData.cx}
                               y={118}
                               textAnchor="middle"
                               fill="#93c5fd"
                               className="flickd-trace-subtitle"
                               style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontWeight: 500, fontSize: 18 }}
                             >
                               {directorFingerprintData.subtitle}
                             </text>

                            <g clipPath="url(#traceClip)">
                              <g transform={'translate(' + tracePan.x + ' ' + tracePan.y + ') translate(' + (directorFingerprintData.cx * (1 - traceZoom)) + ' ' + (directorFingerprintData.cy * (1 - traceZoom)) + ') scale(' + traceZoom + ')'}>
                              {Array.from({ length: 14 }).map((_, index) => {
                                const t = index / 13;
                                const radius = directorFingerprintData.innerRadius + t * (directorFingerprintData.maxOuterRadius - directorFingerprintData.innerRadius);
   return (
                                  <circle
                                    key={'trace-ring-' + index}
                                    cx={directorFingerprintData.cx}
                                    cy={directorFingerprintData.cy}
                                    r={radius}
                                    fill="none"
                                    stroke="rgba(148,163,184,0.08)"
                                    strokeWidth="0.8"
                                  />
                                );
                              })}

                              <circle
                                cx={directorFingerprintData.cx}
                                cy={directorFingerprintData.cy}
                                r={directorFingerprintData.innerRadius - 14}
                                fill="#070b16"
                                opacity="0.9"
                              />

                              {directorFingerprintData.directors.map((director) => {
                                const hasAnyHover = Boolean(traceHover?.director);
  return (
                                  <g key={director.name}>
                                    <path
                                      d={director.hitPath}
                                      // Use a barely-visible fill so SVG hit testing is reliable everywhere in the wedge.
                                      fill="rgba(255,255,255,0.001)"
                                      stroke="transparent"
                                      pointerEvents="all"
                                      style={{ cursor: 'pointer' }}
                                      onMouseEnter={(event) => {
                                        const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
                                        setTraceHover({ type: 'director', director: director.name });
                                        setTraceTooltip({
                                          x: event.clientX - rect.left + 12,
                                          y: event.clientY - rect.top - 12,
                                          type: 'director',
                                          director: director.name,
                                          count: director.count,
                                          avgRating: director.avgRating,
                                        });
                                      }}
                                      onClick={() => {
                                        // Ensure the director modal always starts in list view.
                                        setTraceDirectorModalView('list');
                                        closeMovieModal();
                                        setTraceSelectedDirector({
                                          name: director.name,
                                          count: director.count,
                                          avgRating: director.avgRating,
                                          films: Array.isArray(director.films) ? director.films : [],
                                        });
                                      }}
                                      onMouseLeave={() => {
                                        // Clear director hover when leaving this segment.
                                        setTraceHover((prev) =>
                                          prev?.type === 'director' && prev?.director === director.name ? null : prev
                                        );
                                        setTraceTooltip((prev) =>
                                          prev?.type === 'director' && prev?.director === director.name ? null : prev
                                        );
                                      }}
                                      onMouseMove={(event) => {
                                        const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
                                        setTraceTooltip((prev) => prev ? { ...prev, x: event.clientX - rect.left + 12, y: event.clientY - rect.top - 12 } : prev);
                                      }}
                                    />

                                    {director.lines.map((line, lineIdx) => {
                                      const isSameDirector = traceHover?.director === line.director;
                                      const revealWindow = Math.max(0, Math.min(1, (traceRevealProgress - line.revealAt) * 9));
                                      // Keep other directors visible enough while still emphasizing the hovered cluster.
                                      const fadeFactor = hasAnyHover ? (isSameDirector ? 1 : 0.28) : 1;
                                      const strokeOpacity = line.opacity * fadeFactor * revealWindow;
                                      const strokeWidth = line.strokeWidth * (isSameDirector ? 1.35 : 1);

  return (
                                        <path
                                          key={director.name + '-' + lineIdx}
                                          d={line.path}
                                          fill="none"
                                          stroke={line.stroke}
                                          strokeOpacity={strokeOpacity}
                                          strokeWidth={strokeWidth}
                                          strokeLinecap="round"
                                          pointerEvents="none"
                                        />
                                      );
                                    })}
                                  </g>
                                );
                              })}
                              </g>
                            </g>
                          </svg>

                          {traceTooltip && traceTooltip.type === 'director' && (
                            <div
                              className="pointer-events-none absolute z-20 px-3 py-2 rounded-lg bg-[#0f172a]/95 border border-gray-700 text-xs text-gray-200 shadow-xl"
                              style={{ left: traceTooltip.x + 'px', top: Math.max(8, traceTooltip.y) + 'px' }}
                            >
                              <>
                                <div className="font-semibold text-gray-100">{traceTooltip.director}</div>
                                <div className="text-gray-300 mt-0.5">{traceTooltip.count + ' films watched'}</div>
                                <div className="text-blue-300 mt-0.5">{'Avg rating ' + Number(traceTooltip.avgRating || 0).toFixed(2)}</div>
                                <div className="text-gray-400 mt-1">Click to view films</div>
                              </>
                            </div>
                          )}

                          {traceSelectedDirector && (
                            <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70">
                              <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl bg-[#0b1220] border border-gray-700 shadow-2xl">
                                <div className="flex items-start justify-between gap-4 p-4 border-b border-gray-800">
                                  <div className="min-w-0">
                                    {traceDirectorModalView === 'details' && selectedMovie ? (
                                      <>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setTraceDirectorModalView('list');
                                              closeMovieModal();
                                            }}
                                            className="px-3 py-2 text-xs rounded-lg bg-[#111827] border border-gray-700 text-gray-200 hover:bg-gray-800"
                                          >
                                            Back
                                          </button>
                                          <div className="text-white font-semibold text-lg truncate">{selectedMovie?.title || 'Movie Details'}</div>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1 truncate">
                                          {traceSelectedDirector.name}
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="flex items-center gap-2">
                                          <div className="text-white font-semibold text-lg">{traceSelectedDirector.name}</div>
                                          <button
                                            type="button"
                                            onClick={() => openShareCard({
                                              title: `Top ${Math.min(10, traceSelectedDirector.films?.length || 0)} of ${traceSelectedDirector.name}`,
                                              subtitle: 'Director Signature Card',
                                              filenameBase: `flickd-director-${String(traceSelectedDirector.name || 'director').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                                              films: (traceSelectedDirector.films || []).map((film) => ({
                                                title: film.title,
                                                year: film.year,
                                                yourRating: Number(film.rating || 0),
                                              })),
                                            })}
                                            className="px-2.5 py-1 text-[11px] rounded-lg border border-gray-700 bg-[#111827] text-gray-200 hover:bg-gray-800"
                                          >
                                            Share
                                          </button>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                          {traceSelectedDirector.count} films watched - Avg rating {Number(traceSelectedDirector.avgRating || 0).toFixed(2)}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTraceDirectorModalView('list');
                                      setTraceSelectedDirector(null);
                                      closeMovieModal();
                                    }}
                                    className="px-3 py-2 text-xs rounded-lg bg-[#111827] border border-gray-700 text-gray-200 hover:bg-gray-800"
                                  >
                                    Close
                                  </button>
                                </div>
 
                                <div className="p-4 overflow-auto max-h-[75vh]">
                                  {traceDirectorModalView === 'details' && selectedMovie ? (
                                    <div className="max-w-4xl mx-auto">
                                      {fetchingMovieDetails ? (
                                        <div className="flex flex-col items-center justify-center py-10">
                                          <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-blue-500 mb-3"></div>
                                          <p className="text-gray-400 text-sm">Fetching movie details...</p>
                                        </div>
                                      ) : safeMovieDetails ? (
                                        safeMovieDetails.Error ? (
                                          <div className="text-center py-8 text-red-400">{safeMovieDetails.Error}</div>
                                        ) : (
                                          <div className="space-y-4">
                                            {safeMovieDetails.Poster && safeMovieDetails.Poster !== 'N/A' && (
                                              <div className="flex justify-center">
                                                <img src={safeMovieDetails.Poster} alt={safeMovieDetails.Title} className="max-h-72 rounded-lg shadow-lg" />
                                              </div>
                                            )}

                                            <div className="text-center">
                                              <h3 className="text-2xl font-bold text-white">{safeMovieDetails.Title}</h3>
                                              <div className="text-xs text-gray-400 mt-2 flex flex-wrap justify-center gap-2">
                                                {safeMovieDetails.Year && <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">{safeMovieDetails.Year}</span>}
                                                {safeMovieDetails.Rated && safeMovieDetails.Rated !== 'N/A' && <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">{safeMovieDetails.Rated}</span>}
                                                {safeMovieDetails.Runtime && safeMovieDetails.Runtime !== 'N/A' && <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">{safeMovieDetails.Runtime}</span>}
                                              </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                              <div className="bg-gray-800 p-3 rounded-lg text-center">
                                                <p className="text-gray-400 text-xs">IMDb Rating</p>
                                                <p className="text-2xl font-bold text-yellow-400">{safeMovieDetails.imdbRating}</p>
                                              </div>
                                              <div className="bg-gray-800 p-3 rounded-lg text-center">
                                                <p className="text-gray-400 text-xs">Your Rating</p>
                                                <p className="text-2xl font-bold text-green-400">{selectedMovie?.yourRating ?? '-'}</p>
                                              </div>
                                            </div>

                                            {typeof safeMovieDetails.Genre === 'string' && safeMovieDetails.Genre.length > 0 && (
                                              <div>
                                                <h4 className="text-gray-400 text-xs mb-1">Genres</h4>
                                                <div className="flex flex-wrap gap-1.5">
                                                  {safeMovieDetails.Genre.split(', ').map((g, i) => (
                                                    <span key={i} className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full text-xs">{g}</span>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {safeMovieDetails.Plot && safeMovieDetails.Plot !== 'N/A' && (
                                              <div>
                                                <h4 className="text-gray-400 text-xs mb-1">Plot</h4>
                                                <p className="text-gray-300 text-sm leading-relaxed">{safeMovieDetails.Plot}</p>
                                              </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                              {safeMovieDetails.Director && safeMovieDetails.Director !== 'N/A' && (
                                                <div>
                                                  <p className="text-gray-400">Director</p>
                                                  <p className="text-white font-medium">{safeMovieDetails.Director}</p>
                                                </div>
                                              )}
                                              {safeMovieDetails.Writer && safeMovieDetails.Writer !== 'N/A' && (
                                                <div>
                                                  <p className="text-gray-400">Writer</p>
                                                  <p className="text-white font-medium">{safeMovieDetails.Writer}</p>
                                                </div>
                                              )}
                                              {safeMovieDetails.Actors && safeMovieDetails.Actors !== 'N/A' && (
                                                <div className="col-span-2">
                                                  <p className="text-gray-400">Cast</p>
                                                  <p className="text-white font-medium">{safeMovieDetails.Actors}</p>
                                                </div>
                                              )}
                                              {safeMovieDetails.Country && safeMovieDetails.Country !== 'N/A' && (
                                                <div>
                                                  <p className="text-gray-400">Country</p>
                                                  <p className="text-white font-medium">{safeMovieDetails.Country}</p>
                                                </div>
                                              )}
                                              {safeMovieDetails.Language && safeMovieDetails.Language !== 'N/A' && (
                                                <div>
                                                  <p className="text-gray-400">Language</p>
                                                  <p className="text-white font-medium">{safeMovieDetails.Language}</p>
                                                </div>
                                              )}
                                              {safeMovieDetails.BoxOffice && safeMovieDetails.BoxOffice !== 'N/A' && (
                                                <div>
                                                  <p className="text-gray-400">Box Office</p>
                                                  <p className="text-white font-medium">{safeMovieDetails.BoxOffice}</p>
                                                </div>
                                              )}
                                              {safeMovieDetails.Awards && safeMovieDetails.Awards !== 'N/A' && (
                                                <div>
                                                  <p className="text-gray-400">Awards</p>
                                                  <p className="text-yellow-300 font-medium">{safeMovieDetails.Awards}</p>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                      {traceSelectedDirector.films
                                        .slice()
                                        .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
                                        .map((film, idx) => (
                                          <div key={`${film.title || 'film'}_${film.year || 'na'}_${idx}`} className="bg-[#111827] border border-gray-800 rounded-lg p-2">
                                            {posters[`${film.title}_${film.year}`] ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setTraceDirectorModalView('details');
                                                  handleMovieClick({
                                                    title: film.title,
                                                    year: film.year,
                                                    imdbId: film.imdbId || null,
                                                    yourRating: film.rating,
                                                    genres: Array.isArray(film.genres) ? film.genres.join(', ') : (film.genres || ''),
                                                    director: traceSelectedDirector.name,
                                                  });
                                                }}
                                                className="block w-full rounded"
                                                aria-label={`View details for ${film.title}`}
                                              >
                                                <img
                                                  src={posters[`${film.title}_${film.year}`]}
                                                  alt={film.title}
                                                  className="w-full aspect-[2/3] object-cover rounded"
                                                  onError={() => handlePosterRenderError(`${film.title}_${film.year}`)}
                                                />
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => fetchPoster(film.title, film.year, film.imdbId || null)}
                                                className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                              >
                                                {renderPosterStatus(`${film.title}_${film.year}`)}
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setTraceDirectorModalView('details');
                                                handleMovieClick({
                                                  title: film.title,
                                                  year: film.year,
                                                  imdbId: film.imdbId || null,
                                                  yourRating: film.rating,
                                                  genres: Array.isArray(film.genres) ? film.genres.join(', ') : (film.genres || ''),
                                                  directors: traceSelectedDirector.name,
                                                });
                                              }}
                                              className="flickd-poster-title mt-2 w-full text-left"
                                            >
                                              {film.title}
                                            </button>
                                            <div className="flickd-poster-meta">
                                              {(film.year || '-') + ' | ' + "\u2605" + ' ' + Number(film.rating || 0).toFixed(1)}
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                         </div>
                       </>
                     ) : (
                       <div className="text-sm text-gray-400 py-8 text-center">Upload an IMDb ratings file with directors to generate your trace.</div>
                     )}
                   </div>
                </div>
              )}
              {activeTab === 'members' && (
                <div className="space-y-4">
                  {(membersLoading || membersError) && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      {membersLoading && (
                        <div className="space-y-3">
                          <p className="text-xs text-blue-300">Loading members...</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {[0, 1, 2].map((s) => (
                              <div key={`members_skeleton_${s}`} className="bg-[#0b1220] border border-gray-700 rounded-xl p-3 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-700/70" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3 w-28 bg-gray-700/70 rounded" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                </div>
                                <div className="h-9 rounded-lg bg-blue-900/50" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {membersError && (
                        <p className="text-xs text-amber-300 mt-2">{membersError}</p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111827] border border-gray-800 rounded-xl p-3">
                    <p className="text-xs text-gray-400">
                      {publicCommunityMode && !user
                        ? `Showing ${filteredMembersDirectory.length} cinephiles`
                        : `Page ${membersPage + 1} • Showing up to 30 cinephiles`}
                    </p>
                    <div className="flex items-center gap-2">
                      {!(publicCommunityMode && !user) && (
                        <>
                          <button
                            type="button"
                            onClick={() => setMembersPage((p) => Math.max(0, p - 1))}
                            disabled={membersPage === 0 || membersLoading}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-200 bg-[#0b1220] hover:bg-[#1f2937] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() => setMembersPage((p) => p + 1)}
                            disabled={membersLoading}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-200 bg-[#0b1220] hover:bg-[#1f2937] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setMembersRetryNonce((n) => n + 1)}
                        disabled={membersLoading}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-blue-500/40 text-blue-200 bg-blue-600/10 hover:bg-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Retry
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-3">
                    <input
                      type="text"
                      value={membersSearchQuery}
                      onChange={(e) => setMembersSearchQuery(e.target.value)}
                      placeholder="Search cinephiles by name..."
                      className="w-full bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {filteredMembersDirectory
                      .filter((member) => {
                        const selfId = String(user?.id || '');
                        const selfEmail = String(user?.email || '').trim().toLowerCase();
                        const memberId = String(member?.userId || '');
                        const memberEmail = String(member?.email || '').trim().toLowerCase();
                        if (member?.isCurrentUser) return false;
                        if (selfId && memberId && memberId === selfId) return false;
                        if (selfEmail && memberEmail && selfEmail === memberEmail) return false;
                        return true;
                      })
                      .map((member) => (
                      <div key={member.id} className="bg-[#111827] border border-gray-800 rounded-xl p-3">
                        {(() => {
                          const cardStats = memberCardStatsByUserId.get(String(member?.userId || '')) || {
                            totalFilms: 0,
                            avgYourRating: 0,
                            mostRatedGenre: 'N/A',
                          };
                          return (
                            <>
                        <div className="flex items-center gap-2.5 mb-3">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm text-blue-200">
                              {String(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Films</div>
                            <div className="text-sm font-semibold text-white">{cardStats.totalFilms || 0}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Avg</div>
                            <div className="text-sm font-semibold text-white">{Number(cardStats.avgYourRating || 0).toFixed(1)}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Genre</div>
                            <div className="text-xs font-semibold text-white truncate">{cardStats.mostRatedGenre || 'N/A'}</div>
                          </div>
                        </div>

                          <button
                            type="button"
                            onClick={() => openMemberDashboard(member)}
                          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                        >
                          View Profile
                        </button>
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>

                  {!membersLoading && filteredMembersDirectory.length === 0 && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-400">
                      No cinephiles found.
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'following' && (
                <div className="space-y-4">
                  {(membersLoading || membersError) && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      {membersLoading && (
                        <div className="space-y-3">
                          <p className="text-xs text-blue-300">Loading members...</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {[0, 1, 2].map((s) => (
                              <div key={`following_skeleton_${s}`} className="bg-[#0b1220] border border-gray-700 rounded-xl p-3 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-700/70" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3 w-28 bg-gray-700/70 rounded" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                </div>
                                <div className="h-9 rounded-lg bg-blue-900/50" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {membersError && (
                        <p className="text-xs text-amber-300 mt-2">{membersError}</p>
                      )}
                    </div>
                  )}

                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-3">
                    <input
                      type="text"
                      value={followingSearchQuery}
                      onChange={(e) => setFollowingSearchQuery(e.target.value)}
                      placeholder="Search followed cinephiles by name..."
                      className="w-full bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {filteredFollowedMembersList.map((member) => (
                      <div key={member.id} className="bg-[#111827] border border-gray-800 rounded-xl p-3">
                        {(() => {
                          const cardStats = memberCardStatsByUserId.get(String(member?.userId || '')) || {
                            totalFilms: 0,
                            avgYourRating: 0,
                            mostRatedGenre: 'N/A',
                          };
                          return (
                            <>
                        <div className="flex items-center gap-2.5 mb-3">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm text-blue-200">
                              {String(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Films</div>
                            <div className="text-sm font-semibold text-white">{cardStats.totalFilms || 0}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Avg</div>
                            <div className="text-sm font-semibold text-white">{Number(cardStats.avgYourRating || 0).toFixed(1)}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Genre</div>
                            <div className="text-xs font-semibold text-white truncate">{cardStats.mostRatedGenre || 'N/A'}</div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openMemberDashboard(member)}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                          >
                            View Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFollowMember(member.userId, member.name)}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-700 text-gray-200 hover:bg-[#1f2937]"
                          >
                            Unfollow
                          </button>
                        </div>
                            </>
                          );
                        })()}
                      </div>
                    ))}
                  </div>

                  {!membersLoading && filteredFollowedMembersList.length === 0 && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-400">
                      No matching followed cinephiles.
                    </div>
                  )}
                </div>
              )}
                {activeTab === 'followers' && (
                  <div className="space-y-4">
                  {(membersLoading || membersError) && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      {membersLoading && (
                        <div className="space-y-3">
                          <p className="text-xs text-blue-300">Loading members...</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                            {[0, 1, 2].map((s) => (
                              <div key={`followers_skeleton_${s}`} className="bg-[#0b1220] border border-gray-700 rounded-xl p-3 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-700/70" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3 w-28 bg-gray-700/70 rounded" />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                  <div className="h-12 rounded-lg bg-gray-800" />
                                </div>
                                <div className="h-9 rounded-lg bg-blue-900/50" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {membersError && (
                        <p className="text-xs text-amber-300 mt-2">{membersError}</p>
                      )}
                    </div>
                  )}

                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-3">
                    <input
                      type="text"
                      value={followersSearchQuery}
                      onChange={(e) => setFollowersSearchQuery(e.target.value)}
                      placeholder="Search your audience by name..."
                      className="w-full bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {filteredFollowersMembersList.map((member) => {
                      const isNewFollower = newFollowersList.some((item) => String(item.userId) === String(member.userId));
                      const cardStats = memberCardStatsByUserId.get(String(member?.userId || '')) || {
                        totalFilms: 0,
                        avgYourRating: 0,
                        mostRatedGenre: 'N/A',
                      };
                      return (
                      <div
                        key={member.id}
                        className={`relative bg-[#111827] border rounded-xl p-3 overflow-hidden ${isNewFollower ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]' : 'border-gray-800'}`}
                      >
                        {isNewFollower && (
                          <>
                            <div className="absolute top-3 right-3 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              New
                            </div>
                            <div className="mb-3 text-[10px] uppercase tracking-wide text-emerald-300 font-semibold">
                              New audience member
                            </div>
                          </>
                        )}
                        <div className="flex items-center gap-2.5 mb-3">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="w-9 h-9 rounded-full object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm text-blue-200">
                              {String(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Films</div>
                            <div className="text-sm font-semibold text-white">{cardStats.totalFilms || 0}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Avg</div>
                            <div className="text-sm font-semibold text-white">{Number(cardStats.avgYourRating || 0).toFixed(1)}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Genre</div>
                            <div className="text-xs font-semibold text-white truncate">{cardStats.mostRatedGenre || 'N/A'}</div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openMemberDashboard(member)}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                          >
                            View Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFollowMember(member.userId, member.name)}
                            className={`px-3 py-2 text-sm rounded-lg border ${
                              followedMemberIds.includes(String(member.userId))
                                ? 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/15'
                                : 'border-gray-700 text-gray-200 hover:bg-[#1f2937]'
                            }`}
                          >
                            {followedMemberIds.includes(String(member.userId)) ? 'Following' : 'Follow'}
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>

                  {!membersLoading && filteredFollowersMembersList.length === 0 && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-400">
                      No matching audience members.
                    </div>
                  )}
                  </div>
                )}
                {activeTab === 'tastetimeline' && (
                  <div
                    ref={tasteTimelineFullscreenRef}
                    className={`space-y-5 ${timelineFullscreen ? 'bg-[#030712] p-4 h-screen overflow-auto' : ''}`}
                  >
                    {timelineFullscreen && selectedMovie && !traceSelectedDirector && renderMovieDetailsModal('z-[2147483647]')}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-white">Timeline Map</h2>
                          <p className="text-xs text-gray-400 mt-1">
                            Your films positioned between mainstream storytelling and auteur-driven cinema across decades.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => zoomTimeline(-0.1)} className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]" title="Zoom out" aria-label="Zoom out">-</button>
                          <button type="button" onClick={() => zoomTimeline(0.1)} className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]" title="Zoom in" aria-label="Zoom in">+</button>
                          <button type="button" onClick={resetTimelineZoom} className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]" title="Reset zoom" aria-label="Reset zoom">Reset</button>
                          <button
                            type="button"
                            onClick={toggleTimelineFullscreen}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                            title={timelineFullscreen ? 'Exit full screen' : 'Full screen'}
                            aria-label={timelineFullscreen ? 'Exit full screen' : 'Full screen'}
                          >
                            {timelineFullscreen ? (
                              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="9 3 3 3 3 9" />
                                <line x1="3" y1="3" x2="10" y2="10" />
                                <polyline points="15 21 21 21 21 15" />
                                <line x1="14" y1="14" x2="21" y2="21" />
                                <polyline points="21 9 21 3 15 3" />
                                <line x1="14" y1="10" x2="21" y2="3" />
                                <polyline points="3 15 3 21 9 21" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <line x1="21" y1="3" x2="14" y2="10" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      ref={timelineWheelSurfaceRef}
                      className="flickd-timeline-wheel-surface bg-[#111827] border border-gray-800 rounded-xl p-3"
                      style={timelineFullscreen ? { height: 'calc(100vh - 150px)' } : undefined}
                    >
                      <div
                        className="relative rounded-xl border border-gray-800 bg-gradient-to-b from-[#060c1b] via-[#050811] to-[#04070f] overflow-hidden flex flex-col h-full overscroll-contain"
                        style={{ overscrollBehavior: 'contain' }}
                        onWheel={onTimelineWheelCapture}
                        onWheelCapture={onTimelineWheelCapture}
                      >
                        <div className="absolute left-0 top-0 bottom-0 z-20 w-24 border-r border-gray-800/80 bg-[#050811]/95 backdrop-blur-sm">
                          <span className="absolute top-[14%] left-3 text-[10px] text-gray-300 tracking-wide uppercase">Mainstream</span>
                          <span className="absolute top-[42%] left-3 text-[10px] text-gray-400 tracking-wide uppercase">Hybrid</span>
                          <span className="absolute top-[70%] left-3 text-[10px] text-gray-400 tracking-wide uppercase">Arthouse</span>
                        </div>

                        <div className="timeline-y-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden" onWheel={onTimelineWheelCapture} onWheelCapture={onTimelineWheelCapture}>
                          <div
                            ref={tasteTimelineRef}
                            className="cinematic-rail timeline-x-hidden overflow-x-hidden overflow-y-visible scroll-smooth"
                            style={{
                              overscrollBehaviorX: 'contain',
                              overscrollBehaviorY: 'auto',
                              WebkitOverflowScrolling: 'touch',
                              cursor: timelineDragging ? 'grabbing' : 'grab',
                            }}
                            onWheelCapture={onTimelineWheelCapture}
                            onScroll={onTimelineRailScroll}
                            onMouseDown={onTimelineMouseDown}
                            onMouseMove={onTimelineMouseMove}
                            onMouseUp={stopTimelineDrag}
                            onTouchStart={onTimelineTouchStart}
                            onTouchMove={onTimelineTouchMove}
                            onTouchEnd={onTimelineTouchEnd}
                            onTouchCancel={onTimelineTouchEnd}
                            onMouseLeave={() => {
                              stopTimelineDrag();
                              setTimelineHoverKey(null);
                            }}
                          >
                            <div
                              className="relative ml-24 px-3 pt-3 pb-3"
                              style={{
                                minWidth: `${timelineRailWidth}px`,
                                minHeight: `${Math.max(460, 210 + (timelineMaxLaneCount * (Math.max(52, Math.round(60 * timelineZoom)) + 0)))}px`,
                              }}
                            >
                              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                                <path d="M0 20% C15% 14%, 35% 22%, 50% 18% C65% 14%, 85% 24%, 100% 19%" stroke="rgba(96,165,250,0.14)" fill="none" />
                                <path d="M0 62% C20% 58%, 40% 70%, 60% 64% C78% 60%, 92% 72%, 100% 66%" stroke="rgba(147,51,234,0.12)" fill="none" />
                              </svg>

                              <div className="absolute inset-x-3 top-[28%] border-t border-gray-700/40" />
                              <div className="absolute inset-x-3 top-[56%] border-t border-gray-700/40" />

                              <div className="relative z-10 flex gap-4">
                                {timelineYearClusters.map((cluster) => {
                                  const columnWidth = timelineColumnWidth;
                                  const posterW = Math.max(78, Math.min(columnWidth - 6, Math.round(88 * timelineZoom)));
                                  const posterH = Math.max(92, Math.round(posterW * 1.5));
                                  const laneRows = ['Mainstream', 'Hybrid', 'Arthouse'];

                                  return (
                                    <div key={`year-cluster-${cluster.year}`} className="relative shrink-0 border-l border-gray-800/40" style={{ width: `${columnWidth}px` }}>
                                      <div className="pt-1 pb-3 flex flex-col gap-1">
                                        {laneRows.map((laneName) => {
                                          const laneFilms = cluster.lanes?.[laneName] || [];
                                          return (
                                            <div key={`${cluster.year}-${laneName}`} className="min-h-[56px] flex justify-center">
                                              <div className="space-y-0">
                                                {laneFilms.map((movie) => {
                                                  const posterKey = `${movie.title}_${movie.year}`;
                                                  const hoverKey = movie.timelineKey;
                                                  const isHovered = timelineHoverKey === hoverKey;
                                                  const isRelated = timelineRelated.has(hoverKey);
                                                  const faded = timelineHoverKey && !isHovered && !isRelated;
                                                  const primary = Number(movie?.yourRating || 0) >= 9;

                                                  return (
                                                    <div
                                                      key={hoverKey}
                                                      className={`group timeline-poster-frame rounded-md transition-all duration-200 ${faded ? 'opacity-55 grayscale-[0.2]' : primary ? 'opacity-100' : 'opacity-85'} ${isHovered ? 'scale-[1.07] shadow-[0_0_0_1px_rgba(59,130,246,0.65),0_0_24px_rgba(59,130,246,0.25)]' : ''}`}
                                                      style={{ width: `${posterW}px` }}
                                                      onMouseEnter={() => setTimelineHoverKey(hoverKey)}
                                                      onMouseLeave={() => setTimelineHoverKey(null)}
                                                    >
                                                      {posters[posterKey] ? (
                                                        <button type="button" onClick={() => handleMovieClick(movie)} className="timeline-poster-trigger block w-full">
                                                          <img
                                                            src={posters[posterKey]}
                                                            alt={movie.title}
                                                            loading="lazy"
                                                            className="timeline-poster-image w-full object-cover"
                                                            style={{ height: `${posterH}px` }}
                                                            onError={() => handlePosterRenderError(posterKey)}
                                                          />
                                                        </button>
                                                      ) : (
                                                        <button
                                                          type="button"
                                                          onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                                          className="timeline-poster-trigger timeline-poster-image w-full bg-[#1f2937] text-[9px] text-gray-400 hover:text-gray-200 hover:bg-[#374151] flex items-center justify-center"
                                                          style={{ height: `${posterH}px` }}
                                                          title="Load poster"
                                                        >
                                                          {renderPosterStatus(posterKey)}
                                                        </button>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-gray-800 bg-[#050811]/95 backdrop-blur-sm px-3 py-1 shrink-0">
                          <div
                            className="flex gap-4"
                            style={{
                              minWidth: `${timelineRailWidth}px`,
                              transform: `translateX(-${timelineScrollLeft}px)`,
                              transition: timelineDragging ? 'none' : 'transform 80ms linear',
                            }}
                          >
                            {timelineYearClusters.map((cluster) => (
                              <div
                                key={`timeline-bottom-year-${cluster.year}`}
                                className={`shrink-0 text-center text-[10px] ${cluster.year % 10 === 0 ? 'text-blue-300 font-semibold' : 'text-gray-500'}`}
                                style={{ width: `${timelineColumnWidth}px` }}
                              >
                                {cluster.year}
                              </div>
                            ))}
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(1, Math.floor(timelineMaxScroll))}
                            value={Math.min(Math.floor(timelineScrollLeft), Math.max(1, Math.floor(timelineMaxScroll)))}
                            onChange={(e) => onTimelineBottomScrubChange(e.target.value)}
                            className="timeline-blue-range mt-1 w-full"
                            aria-label="Timeline horizontal scrubber"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'personality' && personality && (
                  <Motion.div
                    className="space-y-6"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <Card className="relative overflow-hidden border-blue-500/20 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,26,0.98))]">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-xl">
                          <Brain className="h-5 w-5 text-blue-300" />
                          Your Cinema Persona
                        </CardTitle>
                        <CardDescription>An editorial interpretation of the themes, emotions, and cinematic instincts behind your ratings.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div>
                          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                            {personality.archetype}
                          </h2>
                          <p className="text-slate-300 mt-4 text-base sm:text-lg leading-relaxed max-w-5xl">
                            {personality.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {personality.traits.map((trait, idx) => (
                            <Motion.span
                              key={trait}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.035, duration: 0.25 }}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 border border-blue-400/20 text-blue-100"
                            >
                              {trait}
                            </Motion.span>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <MetricCard label="Dominant Genre" value={personality.topGenres[0]} />
                          <MetricCard label="Era" value={`${personality.mostWatchedDecade}s`} />
                          <MetricCard label="Preferred Runtime" value={`${personality.avgRuntime} min`} />
                          <MetricCard label="Obscurity Index" value={`${personality.nichePercentage}%`} />
                          <MetricCard className="col-span-2 sm:col-span-1" label="Your Avg" value={`? ${personality.avgRating}`} />
                        </div>
                      </CardContent>
                    </Card>
                  </Motion.div>
              )}

              {activeTab === 'personality' && patterns && (() => {
                const patternCards = [
                  {
                    title: 'Exploration',
                    subtitle: 'New directors discovered',
                    value: `${patterns.explorationScore}%`,
                    progress: patterns.explorationScore,
                    detail: 'How often your library opens a new cinematic doorway.',
                    Icon: Compass,
                    accent: 'from-purple-500 to-pink-500',
                  },
                  {
                    title: 'Loyalty',
                    subtitle: 'Repeat director visits',
                    value: `${patterns.loyaltyScore}%`,
                    progress: patterns.loyaltyScore,
                    detail: 'The pull of familiar filmmakers and recurring sensibilities.',
                    Icon: Repeat,
                    accent: 'from-blue-500 to-cyan-400',
                  },
                  {
                    title: 'Era Bias',
                    subtitle: 'Most watched decade',
                    value: `${patterns.dominantDecade}s`,
                    progress: patterns.eraPercentage,
                    detail: `${patterns.eraPercentage}% of your library lives in this era.`,
                    Icon: CalendarRange,
                    accent: 'from-yellow-400 to-orange-500',
                  },
                  {
                    title: 'Genre Breadth',
                    subtitle: 'Distinct genres explored',
                    value: patterns.genreBreadth,
                    progress: Math.min(100, (patterns.genreBreadth / 30) * 100),
                    detail: 'A measure of how wide your viewing vocabulary stretches.',
                    Icon: Layers,
                    accent: 'from-emerald-400 to-green-500',
                  },
                  {
                    title: 'Rating Consistency',
                    subtitle: 'How steady your ratings are',
                    value: patterns.ratingConsistency,
                    progress: patterns.ratingConsistency,
                    detail: `Std dev: ${patterns.ratingStdDev}`,
                    Icon: Gauge,
                    accent: 'from-rose-500 to-red-500',
                  },
                  {
                    title: 'Obscurity Index',
                    subtitle: 'Films with <50k votes',
                    value: `${patterns.nicheScore}%`,
                    progress: patterns.nicheScore,
                    detail: `${patterns.mainstreamCount} mainstream  ${data?.length - patterns.mainstreamCount} niche`,
                    Icon: Star,
                    accent: 'from-indigo-500 to-violet-500',
                  },
                ];

                return (
                  <Motion.div
                    className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                    initial="hidden"
                    animate="show"
                    variants={{
                      hidden: {},
                      show: { transition: { staggerChildren: 0.055 } },
                    }}
                  >
                    {patternCards.map(({ title, subtitle, value, progress, detail, Icon, accent }) => (
                      <Motion.div
                        key={title}
                        variants={{
                          hidden: { opacity: 0, y: 14 },
                          show: { opacity: 1, y: 0 },
                        }}
                        transition={{ duration: 0.32, ease: 'easeOut' }}
                        whileHover={{ y: -4 }}
                      >
                        <Card className="h-full overflow-hidden border-slate-700/70 bg-slate-950/60">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3">
                                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-blue-200">
                                  {React.createElement(Icon, { className: 'h-4 w-4' })}
                                </div>
                                <div>
                                  <div className="font-semibold text-white">{title}</div>
                                  <div className="text-xs text-slate-400">{subtitle}</div>
                                </div>
                              </div>
                              <div className="text-2xl font-black tracking-tight text-white">{value}</div>
                            </div>
                            <div className="mt-4 h-2 rounded-full bg-slate-800/90 overflow-hidden">
                              <Motion.div
                                className={`h-full rounded-full bg-gradient-to-r ${accent}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.9, ease: 'easeOut' }}
                              />
                            </div>
                            <p className="mt-3 text-xs leading-relaxed text-slate-400">{detail}</p>
                          </CardContent>
                        </Card>
                      </Motion.div>
                    ))}
                  </Motion.div>
                );
              })()}

              {/* CINEMATIC TASTE CARD */}
              {/* CINEMATIC TASTE CARD */}
              {activeTab === 'personality' && data && data.length > 0 && (() => {
                const spectrums = calculateSpectrums(data);
                const popularity = calculatePopularityBuckets(data);
                const decades = calculateDecadeDistribution(data);
                const runtime = calculateRuntimeDistribution(data);
                
  return (
                  <Motion.div
                    className="space-y-6 mt-8"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <Card className="overflow-hidden border-slate-700/70 bg-slate-950/60">
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-xl">
                          <Palette className="h-5 w-5 text-fuchsia-300" />
                          Taste Spectrum
                        </CardTitle>
                        <CardDescription>How your viewing instincts move across cinematic opposites.</CardDescription>
                      </CardHeader>
                      <CardContent>
                      <div className="space-y-4">
                        {spectrums?.map((item, idx) => (
                          <Motion.div
                            key={idx}
                            className="flex items-center gap-4"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.035, duration: 0.25 }}
                          >
                            <span className="text-gray-400 text-sm w-24 text-right flex-shrink-0">{item.left}</span>
                            <div className="flex-1 relative h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div 
                                className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/40 to-pink-500/20"
                              />
                              <div 
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg shadow-purple-500/50 transition-all duration-1000"
                                style={{ left: `calc(${item.value}% - 6px)` }}
                              />
                              <div 
                                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-1000"
                                style={{ width: `${item.value}%` }}
                              />
                            </div>
                            <span className="text-gray-400 text-sm w-24 flex-shrink-0">{item.right}</span>
                          </Motion.div>
                        ))}
                      </div>
                      </CardContent>
                    </Card>

                    {/* SECTIONS 2-4: Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* By Popularity */}
                      <Card className="border-slate-700/70 bg-slate-950/60">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Film className="h-4 w-4 text-blue-300" />
                            By Popularity
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                        <div className="space-y-3">
                          {popularity.map((item, idx) => (
                            <div key={idx}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-300">{item.label}</span>
                                <span className="text-white font-medium">{item.percentage}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-700"
                                  style={{ width: `${item.percentage}%`, animationDelay: `${idx * 0.1}s` }}
                                />
                              </div>
                              <span className="text-gray-400 text-xs">{item.count} films</span>
                            </div>
                          ))}
                        </div>
                        </CardContent>
                      </Card>

                      {/* By Decade */}
                      <Card className="border-slate-700/70 bg-slate-950/60">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <CalendarRange className="h-4 w-4 text-violet-300" />
                            By Era
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                        <div className="space-y-3">
                          {decades.slice(0, 6).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <span className="text-gray-400 text-sm w-12">{item.decade}s</span>
                              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                                  style={{ width: `${item.percentage}%`, animationDelay: `${idx * 0.08}s` }}
                                />
                              </div>
                              <span className="text-white text-sm font-medium w-10 text-right">{item.percentage}%</span>
                            </div>
                          ))}
                        </div>
                        </CardContent>
                      </Card>

                      {/* By Runtime */}
                      <Card className="border-slate-700/70 bg-slate-950/60">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Clock3 className="h-4 w-4 text-cyan-300" />
                            By Runtime
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                        <div className="space-y-3">
                          {runtime.buckets.map((item, idx) => (
                            <div key={idx}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-300">{item.label}</span>
                                <span className="text-white font-medium">{item.percentage}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-700"
                                  style={{ width: `${item.percentage}%`, animationDelay: `${idx * 0.1}s` }}
                                />
                              </div>
                            </div>
                          ))}
                          <div className="pt-2 border-t border-gray-800 mt-3">
                            <span className="text-gray-400 text-xs">Total watched: </span>
                            <span className="text-white font-medium text-sm">{runtime.totalHours.toLocaleString()} hours</span>
                          </div>
                        </div>
                        </CardContent>
                      </Card>
                    </div>
                  </Motion.div>
                );
              })()}
              {activeTab === 'personality' && cinemaMindProfile && (
                <Motion.div
                  className="space-y-6 mt-8"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                >
                  <Card className="overflow-hidden border-slate-700/70 bg-slate-950/60">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-xl">
                        <Brain className="h-5 w-5 text-blue-300" />
                        Cinema Mind Profile
                      </CardTitle>
                      <CardDescription>
                        Calculated from your movie ratings, preferred genres, and the storytelling styles of the films you like.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                    {cinemaMindProfile.archetypes.length > 0 ? (
                      <div>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <h4 className="flex items-center gap-2 text-base font-semibold text-white">
                            <BarChart3 className="h-4 w-4 text-blue-300" />
                            Cinema Mind
                          </h4>
                          {metadataStatus.loading && (
                            <span className="text-xs text-blue-200/80">Metadata {metadataStatus.ready} / {metadataStatus.total}</span>
                          )}
                        </div>
                        <div className="h-[460px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cinemaMindProfile.archetypes} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                              <CartesianGrid {...CHART_THEME.grid} horizontal={false} />
                              <XAxis type="number" domain={[0, 100]} tick={CHART_THEME.axis.tick} axisLine={false} tickLine={false} />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={130}
                                tick={{ ...CHART_THEME.axis.tick, fill: '#cbd5e1' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                                contentStyle={CHART_THEME.tooltip.contentStyle}
                                labelStyle={CHART_THEME.tooltip.labelStyle}
                                itemStyle={CHART_THEME.tooltip.itemStyle}
                                formatter={(value) => [`${value}%`, 'Affinity']}
                              />
                              <Bar dataKey="value" radius={[0, 8, 8, 0]} activeBar={false}>
                                {cinemaMindProfile.archetypes.map((item, i) => (
                                  <Cell
                                    key={`cinema-mind-${i}`}
                                    fill={item.value >= 70 ? '#60a5fa' : item.value >= 40 ? '#3b82f6' : '#1d4ed8'}
                                    fillOpacity={item.value >= 50 ? 1 : 0.7}
                                  />
                                ))}
                                <LabelList dataKey="value" position="right" formatter={(v) => `${v}%`} fill="#cbd5e1" fontSize={11} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-[360px] items-center justify-center text-center text-sm text-gray-400">
                        Fetching genres and directors from OMDb...
                      </div>
                    )}
                    </CardContent>
                  </Card>
                </Motion.div>
              )}
              {activeTab === 'settings' && (
                <div className="flickd-settings-page space-y-5">
                  <div className="flickd-settings-card bg-[#111827] border border-gray-800 rounded-xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Preferences</h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRetrySupabaseConnection}
                          disabled={supabasePinging}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937] disabled:opacity-60"
                        >
                          {supabasePinging ? 'Checking...' : 'Retry connection'}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-gray-400 leading-relaxed">
                      Manage your social profiles and update your IMDb spreadsheet. Changes save to your profile and refresh the dashboard.
                    </p>
                  </div>

                    <div className="flickd-settings-card bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white leading-tight">Public Identity</h3>
                          <p className="text-sm text-gray-400 leading-relaxed">Control how others see you in the community.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSavePublicIdentity}
                          disabled={savingPublicIdentity || (
                            publicNicknameDraft.trim() === publicNickname.trim()
                            && useNicknamePubliclyDraft === useNicknamePublicly
                          )}
                          className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingPublicIdentity ? 'Saving...' : 'Save Identity'}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-4">
                          <label className="text-sm text-gray-400 font-medium">Real name</label>
                          <input
                            type="text"
                            value={accountRealName || ''}
                            readOnly
                            placeholder="Kinshuk Kujur"
                            className="mt-2.5 w-full bg-[#0b1220] border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2.5 focus:outline-none"
                          />
                          <p className="mt-2 text-xs leading-relaxed text-gray-500">Your account name. You can keep this private.</p>
                        </div>
                        <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-4">
                          <label className="text-sm text-gray-400 font-medium">Nickname / Username</label>
                          <input
                            type="text"
                            value={publicNicknameDraft}
                            onChange={(e) => {
                              setPublicNicknameDraft(e.target.value.slice(0, 60));
                              setPublicIdentityError('');
                            }}
                            placeholder="Choose a public name"
                            className="mt-2.5 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <p className="mt-2 text-xs leading-relaxed text-gray-500">Shown on your profile, community pages, comments, and shared activity.</p>
                        </div>
                      </div>

                      <label className="mt-4 flex items-start gap-3 rounded-xl border border-gray-700 bg-[#0b1220] p-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useNicknamePubliclyDraft}
                          onChange={(e) => {
                            setUseNicknamePubliclyDraft(e.target.checked);
                            setPublicIdentityError('');
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-600 bg-[#111827] text-blue-600 focus:ring-blue-500/40"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-100">Use nickname instead of real name</span>
                          <span className="mt-1 block text-xs leading-relaxed text-gray-500">Hide my real name and show my nickname across the app.</span>
                        </span>
                      </label>
                      {publicIdentityError && (
                        <p className="mt-3 text-xs text-red-300">{publicIdentityError}</p>
                      )}
                    </div>

                    <div className="flickd-settings-card bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white leading-tight">Social Links</h3>
                          <p className="text-sm text-gray-400 leading-relaxed">Add your social profiles to show on your profile card.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveSocialLinks}
                        disabled={savingSocialLinks || (
                          socialLinksDraft.instagram === socialLinks.instagram
                          && socialLinksDraft.x === socialLinks.x
                          && socialLinksDraft.facebook === socialLinks.facebook
                        )}
                        className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingSocialLinks ? 'Saving...' : 'Save Links'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-4">
                        <label className="text-sm text-gray-400 font-medium">Instagram Link</label>
                        <input
                          type="url"
                          value={socialLinksDraft.instagram}
                          onChange={(e) => setSocialLinksDraft((prev) => ({ ...prev, instagram: e.target.value }))}
                          placeholder="https://instagram.com/username"
                          className="mt-2.5 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-4">
                        <label className="text-sm text-gray-400 font-medium">X (Twitter) Link</label>
                        <input
                          type="url"
                          value={socialLinksDraft.x}
                          onChange={(e) => setSocialLinksDraft((prev) => ({ ...prev, x: e.target.value }))}
                          placeholder="https://x.com/username"
                          className="mt-2.5 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-4">
                        <label className="text-sm text-gray-400 font-medium">Facebook Link</label>
                        <input
                          type="url"
                          value={socialLinksDraft.facebook}
                          onChange={(e) => setSocialLinksDraft((prev) => ({ ...prev, facebook: e.target.value }))}
                          placeholder="https://facebook.com/username"
                          className="mt-2.5 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                      </div>
                    </div>

                    <div className="flickd-settings-card bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold text-white leading-tight">About Me</h3>
                          <p className="text-sm text-gray-400 leading-relaxed">A short bio shown on your profile card.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveAboutMe}
                          disabled={savingAboutMe || aboutMeDraft.trim() === aboutMe.trim()}
                          className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingAboutMe ? 'Saving...' : 'Save Bio'}
                        </button>
                      </div>
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-4">
                        <label className="text-sm text-gray-400 font-medium">About me</label>
                        <textarea
                          value={aboutMeDraft}
                          onChange={(e) => setAboutMeDraft(String(e.target.value || '').slice(0, 250))}
                          placeholder="Write a few lines about your cinema taste..."
                          rows={4}
                          maxLength={250}
                          className="mt-2.5 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                        />
                        <div className="mt-2.5 text-xs text-gray-500 font-medium flex items-center justify-between">
                          <span>Tip: keep it short. Line breaks are supported.</span>
                          <span>{String(aboutMeDraft || '').length}/250</span>
                        </div>
                      </div>
                    </div>

                    <div className="flickd-settings-card bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-lg font-semibold text-white leading-tight">Ratings Import</h3>
                      </div>
                    <p className="text-sm md:text-base text-gray-400 leading-relaxed">
                      Replace your ratings anytime with an IMDb export, Letterboxd ratings.csv, or a Letterboxd export zip. Your charts refresh automatically after import.
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="flex flex-col items-center justify-center h-28 border border-dashed border-gray-600 rounded-xl cursor-pointer bg-[#0f172a] hover:bg-[#141b28] transition-colors group">
                        <p className="text-lg font-semibold text-gray-100 leading-tight">Drop your ratings file here</p>
                        <p className="mt-1 text-xs text-gray-400">IMDb export, Letterboxd ratings.csv, or Letterboxd zip</p>
                        <input type="file" className="hidden" accept=".csv,.xlsx,.xls,.zip" onChange={handleFileUpload} onClick={(e) => { e.target.value = null; }} />
                      </label>

                      {letterboxdError && (
                        <p className="text-xs text-red-300">{letterboxdError}</p>
                      )}
                      {letterboxdImporting && (
                        <div className="rounded-xl border border-gray-700 bg-[#0f172a] p-4">
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{letterboxdProgress.phase || 'Importing'}</span>
                            <span>{letterboxdProgress.total ? `${letterboxdProgress.current} / ${letterboxdProgress.total}` : ''}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1f2937]">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${letterboxdProgress.total ? (letterboxdProgress.current / letterboxdProgress.total) * 100 : 15}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {fileName && (
                        <div className="p-3 bg-[#0f172a] border border-gray-700 rounded-xl">
                          <p className="text-sm text-gray-200">
                            Loaded: <span className="text-blue-400 font-semibold">{fileName}</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {loadedFromCache ? 'Restored from local cache' : 'Updated from latest upload'}
                            {lastDataSyncAt ? `  Synced ${new Date(lastDataSyncAt).toLocaleString()}` : ''}
                          </p>
                        </div>
                      )}

                      {fetchingCountries && (
                        <div className="p-4 bg-[#0f172a] border border-gray-700 rounded-xl">
                          <p className="text-sm text-gray-200 mb-2">Mapping your film universe</p>
                          <div className="w-full bg-[#1f2937] rounded-full h-2.5 overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${fetchProgress.total ? (fetchProgress.current / fetchProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-2">{fetchProgress.current} / {fetchProgress.total} complete</p>
                        </div>
                      )}

                      {(data?.length > 0 || fileName) && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleRemoveUploadedFile}
                            className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 transition-colors"
                          >
                            Remove file
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

                            {activeTab === 'moodboard' && (
                <div className="space-y-5">
                  {(() => {
                    const canEditMoodboards = !memberViewUserId;
                    return (
                      <>
                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">Cinema Filmboard</h2>
                      <p className="text-gray-400 text-sm mt-1">Curate and revisit your film collections.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:block text-right text-xs text-gray-400">
                        <div>{displayedMoodboards.length} filmboards</div>
                        <div>{displayedMoodboards.reduce((sum, b) => sum + (b.films?.length || 0), 0)} films saved</div>
                      </div>
                      {canEditMoodboards && (
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors"
                        >
                          + Create Filmboard
                        </button>
                      )}
                    </div>
                  </div>

                  {showCreateModal && canEditMoodboards && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                      <div className="bg-[#111827] border border-gray-700 rounded-xl p-5 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-white mb-4">Create Filmboard</h3>
                        <input
                          type="text"
                          placeholder="Enter filmboard title"
                          value={newMoodboardTitle}
                          onChange={(e) => setNewMoodboardTitle(e.target.value)}
                          className="w-full px-4 py-3 bg-[#0b1220] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
                          onKeyDown={(e) => e.key === 'Enter' && newMoodboardTitle.trim() && createMoodboard(newMoodboardTitle.trim())}
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => setShowCreateModal(false)}
                            className="flex-1 px-4 py-2 bg-[#0b1220] border border-gray-700 text-gray-300 rounded-lg hover:bg-[#101a2d]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => newMoodboardTitle.trim() && createMoodboard(newMoodboardTitle.trim())}
                            disabled={!newMoodboardTitle.trim()}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                          >
                            Create
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {showFilmPicker && canEditMoodboards && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                      <div className="bg-[#111827] border border-gray-700 rounded-xl p-4 sm:p-5 w-full max-w-5xl max-h-[86vh] overflow-hidden flex flex-col">
                        <div className="sticky top-0 z-20 bg-[#111827] pb-3 border-b border-gray-700/70">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <h3 className="text-lg font-semibold text-white">Add Films</h3>
                            <button
                              onClick={() => {
                                setPendingMoodboardFilmKeys([]);
                                setShowFilmPicker(false);
                              }}
                              className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:bg-[#101a2d]"
                            >
                              Close
                            </button>
                          </div>
                          <div className="flex flex-col gap-2">
                            <input
                              type="text"
                              value={moodboardFilmSearch}
                              onChange={(e) => setMoodboardFilmSearch(e.target.value)}
                              placeholder="Search by title..."
                              className="w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setMoodboardFiltersExpanded((prev) => !prev)}
                                className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-300 hover:bg-[#101a2d]"
                              >
                                {moodboardFiltersExpanded ? 'Hide filters' : 'Show filters'}
                              </button>
                              <div className="text-xs text-gray-400">
                                Showing {filteredMoodboardFilms.length} films
                              </div>
                            </div>
                          </div>
                          {moodboardFiltersExpanded && (
                            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-3">
                              <Select value={moodboardGenreFilter} onValueChange={setMoodboardGenreFilter}>
                                <SelectTrigger className="w-full min-w-0 h-10">
                                  <SelectValue placeholder="All genres" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All genres</SelectItem>
                                  {moodboardGenreOptions.map((genre) => (
                                    <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={moodboardDecadeFilter} onValueChange={setMoodboardDecadeFilter}>
                                <SelectTrigger className="w-full min-w-0 h-10">
                                  <SelectValue placeholder="All decades" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All decades</SelectItem>
                                  {moodboardDecadeOptions.map((decade) => (
                                    <SelectItem key={decade} value={decade}>{decade}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={moodboardYearFilter} onValueChange={setMoodboardYearFilter}>
                                <SelectTrigger className="w-full min-w-0 h-10">
                                  <SelectValue placeholder="All years" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All years</SelectItem>
                                  {moodboardYearOptions.map((year) => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={moodboardCountryFilter} onValueChange={setMoodboardCountryFilter}>
                                <SelectTrigger className="w-full min-w-0 h-10">
                                  <SelectValue placeholder="All countries" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All countries</SelectItem>
                                  {moodboardCountryOptions.map((country) => (
                                    <SelectItem key={country} value={country}>{country}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={moodboardDirectorFilter} onValueChange={setMoodboardDirectorFilter}>
                                <SelectTrigger className="w-full min-w-0 h-10">
                                  <SelectValue placeholder="All directors" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All directors</SelectItem>
                                  {moodboardDirectorOptions.map((director) => (
                                    <SelectItem key={director} value={director}>{director}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={moodboardMinRatingFilter} onValueChange={setMoodboardMinRatingFilter}>
                                <SelectTrigger className="w-full min-w-0 h-10">
                                  <SelectValue placeholder="Any rating" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">Any rating</SelectItem>
                                  <SelectItem value="7">7+</SelectItem>
                                  <SelectItem value="8">8+</SelectItem>
                                  <SelectItem value="9">9+</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                        <div className="py-2">
                          <div className="rounded-lg border border-gray-700 bg-[#0b1220] px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm text-gray-200">
                                Selected: <span className="text-blue-300 font-semibold">{pendingMoodboardFilms.length}</span>
                              </div>
                              {pendingMoodboardFilms.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPendingMoodboardFilmKeys([])}
                                  className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:bg-[#111827]"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {pendingMoodboardFilms.length > 0 && (
                              <div className="mt-2 flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1">
                                {pendingMoodboardFilms.slice(0, 10).map((film, i) => (
                                  <span key={`${film.title}_${film.year}_${i}`} className="text-[11px] px-2 py-1 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-200">
                                    {film.title}
                                  </span>
                                ))}
                                {pendingMoodboardFilms.length > 10 && (
                                  <span className="text-[11px] px-2 py-1 rounded-full border border-gray-600 text-gray-300">
                                    +{pendingMoodboardFilms.length - 10} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-2">
                          {filteredMoodboardFilms.map((film, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                const key = `${String(film?.title || '').toLowerCase()}::${Number(film?.year) || 0}`;
                                setPendingMoodboardFilmKeys((prev) =>
                                  prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                                );
                              }}
                              className={`w-full flex items-center gap-3 p-3 border rounded-lg transition-colors text-left ${
                                pendingMoodboardFilmKeys.includes(`${String(film?.title || '').toLowerCase()}::${Number(film?.year) || 0}`)
                                  ? 'bg-blue-600/10 border-blue-500/60'
                                  : 'bg-[#0b1220] border-gray-700 hover:bg-[#101a2d]'
                              }`}
                            >
                              {posters[`${film.title}_${film.year}`] ? (
                                <img src={posters[`${film.title}_${film.year}`]} alt={film.title} className="w-10 h-14 object-cover rounded" />
                              ) : (
                                <div className="w-10 h-14 bg-gray-800 rounded flex items-center justify-center text-[8px] leading-tight text-center text-gray-500">No poster available</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-white text-sm font-medium truncate">{film.title}</div>
                                <div className="text-gray-400 text-xs">{film.year} | {"\u2605"} {film.yourRating}</div>
                              </div>
                              <span className={`text-sm ${pendingMoodboardFilmKeys.includes(`${String(film?.title || '').toLowerCase()}::${Number(film?.year) || 0}`) ? 'text-emerald-300' : 'text-blue-300'}`}>
                                {pendingMoodboardFilmKeys.includes(`${String(film?.title || '').toLowerCase()}::${Number(film?.year) || 0}`) ? 'Selected' : 'Add'}
                              </span>
                            </button>
                          ))}
                          {filteredMoodboardFilms.length === 0 && (
                            <div className="rounded-lg border border-gray-700 bg-[#0b1220] p-4 text-sm text-gray-400 text-center">
                              No films found for your current search/filters.
                            </div>
                          )}
                        </div>
                        <div className="sticky bottom-0 z-20 bg-[#111827] pt-3 border-t border-gray-700/70">
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setPendingMoodboardFilmKeys([])}
                              className="px-3 py-2 bg-[#0b1220] border border-gray-700 text-gray-300 rounded-lg hover:bg-[#101a2d]"
                            >
                              Clear
                            </button>
                          <button
                            onClick={() => {
                              if (pendingMoodboardFilms.length > 0) {
                                addFilmsToMoodboard(activeMoodboard, pendingMoodboardFilms);
                                setPendingMoodboardFilmKeys([]);
                              }
                            }}
                            disabled={pendingMoodboardFilms.length === 0}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Add Selected
                          </button>
                          <button
                            onClick={() => {
                              setPendingMoodboardFilmKeys([]);
                              setShowFilmPicker(false);
                            }}
                            className="px-4 py-2 bg-[#0b1220] border border-gray-700 text-gray-300 rounded-lg hover:bg-[#101a2d]"
                          >
                            Done
                          </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {displayedMoodboards.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {displayedMoodboards.map((board) => {
                        const isSelectedBoard = String(activeMoodboard) === String(board.id);
                        return (
                          <div
                            key={board.id}
                            onClick={() => setActiveMoodboard(board.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setActiveMoodboard(board.id);
                              }
                            }}
                            role="button"
                            aria-pressed={isSelectedBoard}
                            tabIndex={0}
                            className={`text-left rounded-xl border p-4 transition-all ${
                              isSelectedBoard
                                ? 'bg-blue-500/10 border-blue-400 ring-2 ring-blue-400/45 shadow-[0_0_0_1px_rgba(96,165,250,0.25),0_18px_45px_rgba(37,99,235,0.18)]'
                                : 'bg-[#111827] border-gray-800 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-semibold text-white truncate">{board.title}</h3>
                                  {isSelectedBoard && (
                                    <span className="rounded-full border border-blue-300/50 bg-blue-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-100">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{board.films.length} films</p>
                              </div>
                              {canEditMoodboards && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMoodboard(board.id);
                                  }}
                                  className="text-xs px-2 py-1 rounded-md border border-red-500/30 text-red-300 hover:bg-red-500/10"
                                >
                                  Delete
                                </button>
                              )}
                            </div>

                            {board.films.length > 0 ? (
                              <div className="flex gap-1.5 overflow-hidden">
                                {board.films.slice(0, 6).map((f, i) => (
                                  posters[`${f.title}_${f.year}`] ? (
                                    <img key={i} src={posters[`${f.title}_${f.year}`]} alt="" className="w-10 h-14 object-cover rounded" />
                                  ) : (
                                    <div key={i} className="w-10 h-14 bg-[#0b1220] border border-gray-700 rounded" />
                                  )
                                ))}
                              </div>
                            ) : (
                              <div className="h-14 rounded border border-dashed border-gray-700 bg-[#0b1220] flex items-center justify-center text-xs text-gray-500">
                                No films yet
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {currentMoodboard && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 space-y-5">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-white">{currentMoodboard.title}</h3>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className="px-2.5 py-1 text-xs rounded-full bg-[#0b1220] border border-gray-700 text-gray-300">
                              {currentMoodboard.films.length} films
                            </span>
                            <span className="px-2.5 py-1 text-xs rounded-full bg-[#0b1220] border border-gray-700 text-gray-300">
                              Avg rating: {currentMoodboard.films.length ? (currentMoodboard.films.reduce((sum, f) => sum + (Number(f.yourRating) || 0), 0) / currentMoodboard.films.length).toFixed(1) : '0.0'}
                            </span>
                          </div>
                        </div>
                        {canEditMoodboards && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setMoodboardFilmSearch('');
                                setMoodboardGenreFilter('all');
                                setMoodboardDecadeFilter('all');
                                setMoodboardYearFilter('all');
                                setMoodboardMinRatingFilter('all');
                                setPendingMoodboardFilmKeys([]);
                                setShowFilmPicker(true);
                              }}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                            >
                              + Add Films
                            </button>
                            <button
                              onClick={() => deleteMoodboard(currentMoodboard.id)}
                              className="px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-sm hover:bg-red-500/20"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>

                      {currentMoodboard.films.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {currentMoodboard.films.map((film, idx) => (
                            <div key={idx} className="relative group rounded-lg border border-gray-700 bg-[#0b1220] overflow-hidden">
                              {posters[`${film.title}_${film.year}`] ? (
                                <button
                                  type="button"
                                  onClick={() => handleMovieClick(film)}
                                  className="block w-full"
                                  aria-label={`View details for ${film.title}`}
                                >
                                  <img
                                    src={posters[`${film.title}_${film.year}`]}
                                    alt={film.title}
                                    className="w-full aspect-[2/3] object-cover"
                                    onError={() => handlePosterRenderError(`${film.title}_${film.year}`)}
                                  />
                                </button>
                              ) : (
                                <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center px-3 text-center text-xs font-medium text-gray-500">No poster available</div>
                              )}
                              <div className="p-2">
                                <div className="text-xs text-white truncate">{film.title}</div>
                                <div className="flickd-poster-meta">{film.year}</div>
                              </div>
                              {canEditMoodboards && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFilmFromMoodboard(currentMoodboard.id, idx);
                                  }}
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[10px] rounded bg-black/70 border border-red-400/40 text-red-300"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-gray-700 bg-[#0b1220] py-12 text-center">
                          <p className="text-gray-400 text-sm">No films in this filmboard yet.</p>
                          {canEditMoodboards && (
                            <button
                              onClick={() => {
                                setMoodboardFilmSearch('');
                                setMoodboardGenreFilter('all');
                                setMoodboardDecadeFilter('all');
                                setMoodboardYearFilter('all');
                                setMoodboardMinRatingFilter('all');
                                setPendingMoodboardFilmKeys([]);
                                setShowFilmPicker(true);
                              }}
                              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                            >
                              + Add Films
                            </button>
                          )}
                        </div>
                      )}

                    </div>
                  )}

                  {displayedMoodboards.length === 0 && (
                    <div className="bg-[#111827] border border-dashed border-gray-700 rounded-xl p-10 text-center">
                      <h3 className="text-lg font-semibold text-gray-200">No filmboards yet</h3>
                      <p className="mt-2 text-sm text-gray-400">
                        {canEditMoodboards
                          ? 'Create your first collection and start saving films by vibe.'
                          : 'This member has not created any filmboards yet.'}
                      </p>
                      {canEditMoodboards && (
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="mt-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                          + Create Filmboard
                        </button>
                      )}
                    </div>
                  )}
                      </>
                    );
                  })()}
                </div>
              )}


              {activeTab === 'deepdive' && (
                <div className="flex flex-col gap-6">
                  <div className="flickd-discovery-sections order-last grid grid-cols-1 gap-4">
                    {hiddenGems.allFilms?.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h2 className="text-lg font-semibold">Hidden Gems</h2>
                          <button
                            type="button"
                            onClick={() => openShareCard({ title: 'Hidden Gems', subtitle: 'Personal Discovery Card', filenameBase: 'flickd-hidden-gems', films: hiddenGems.allFilms })}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                          >
                            Share
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Films you valued far more deeply than the wider audience.</p>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-xs text-gray-400">
                            Showing {(hiddenGemsPage - 1) * hiddenGemsPerPage + 1} - {Math.min(hiddenGemsPage * hiddenGemsPerPage, hiddenGems.allFilms.length)} of {hiddenGems.allFilms.length}
                          </div>
                          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]">
                            <button
                              type="button"
                              onClick={() => setHiddenGemsView('grid')}
                              className={`px-2.5 py-1.5 transition-colors ${
                                hiddenGemsView === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                              }`}
                              aria-label="Grid view"
                              title="Grid view"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                                <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                                <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                                <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHiddenGemsView('horizontal');
                                loadPostersForFilms(hiddenGems.allFilms.slice(0, 40));
                              }}
                              className={`px-2.5 py-1.5 transition-colors ${
                                hiddenGemsView === 'horizontal' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                              }`}
                              aria-label="Horizontal view"
                              title="Horizontal view"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                <rect x="1.5" y="3" width="3.2" height="10" rx="1" />
                                <rect x="6.4" y="3" width="3.2" height="10" rx="1" />
                                <rect x="11.3" y="3" width="3.2" height="10" rx="1" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {hiddenGemsView === 'grid' ? (
                          <div className="flickd-discovery-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-5">
                            {hiddenGems.allFilms.slice((hiddenGemsPage - 1) * hiddenGemsPerPage, hiddenGemsPage * hiddenGemsPerPage).map((movie, idx) => (
                              <div key={`${movie.title}_${movie.year}_${idx}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                {posters[`${movie.title}_${movie.year}`] ? (
                                  <button
                                    type="button"
                                    onClick={() => handleMovieClick(movie)}
                                    className="block w-full rounded"
                                    aria-label={`View details for ${movie.title}`}
                                  >
                                    <img
                                      src={posters[`${movie.title}_${movie.year}`]}
                                      alt={movie.title}
                                      className="w-full aspect-[2/3] object-cover rounded"
                                      onError={() => handlePosterRenderError(`${movie.title}_${movie.year}`)}
                                    />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                    className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                    title="Load poster"
                                  >
                                    {renderPosterStatus(`${movie.title}_${movie.year}`)}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleMovieClick(movie)}
                                  className="flickd-poster-title mt-2 w-full text-left"
                                >
                                  {movie.title}
                                </button>
                                <div className="flickd-poster-meta">{movie.year} | {"\u2605"} {movie.yourRating}</div>
                                <div className="flickd-poster-meta flickd-poster-meta--accent">IMDb {movie.imdbRating} | +{movie.difference}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3 mb-5">
                            <div
                              className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                              style={{ overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}
                              onMouseEnter={() => setDeepDiveWheelLock(true)}
                              onMouseLeave={() => setDeepDiveWheelLock(false)}
                              onWheelCapture={(e) => {
                                const el = e.currentTarget;
                                e.preventDefault();
                                e.stopPropagation();
                                const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                                el.scrollLeft += delta;
                              }}
                            >
                              <div className="flex gap-3 min-w-max pr-3">
                                {hiddenGems.allFilms.map((movie, idx) => (
                                  <div
                                    key={`${movie.title}_${movie.year}_rail_${idx}`}
                                    className="w-[180px] snap-start bg-[#101827] border border-gray-800 rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-1 hover:border-blue-500/30"
                                  >
                                    {posters[`${movie.title}_${movie.year}`] ? (
                                      <button
                                        type="button"
                                        onClick={() => handleMovieClick(movie)}
                                        className="block w-full rounded-lg"
                                        aria-label={`View details for ${movie.title}`}
                                      >
                                        <img
                                          src={posters[`${movie.title}_${movie.year}`]}
                                          alt={movie.title}
                                          className="w-full h-[250px] object-cover rounded-lg"
                                          onError={() => handlePosterRenderError(`${movie.title}_${movie.year}`)}
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                        className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        {renderPosterStatus(`${movie.title}_${movie.year}`)}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(movie)}
                                      className="flickd-poster-title mt-2 w-full text-left"
                                    >
                                      {movie.title}
                                    </button>
                                    <div className="flickd-poster-meta">{movie.year} | {"\u2605"} {movie.yourRating}</div>
                                    <div className="flickd-poster-meta flickd-poster-meta--accent">IMDb {movie.imdbRating} | +{movie.difference}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="pointer-events-none absolute inset-y-3 left-3 w-8 bg-gradient-to-r from-[#0b1220] to-transparent rounded-l-xl" />
                            <div className="pointer-events-none absolute inset-y-3 right-3 w-8 bg-gradient-to-l from-[#0b1220] to-transparent rounded-r-xl" />
                          </div>
                        )}
                        {hiddenGemsView === 'grid' && hiddenGems.allFilms.length > hiddenGemsPerPage && (
                          <div className="flex justify-center gap-3">
                            <button
                              onClick={() => {
                                const newPage = Math.max(1, hiddenGemsPage - 1);
                                setHiddenGemsPage(newPage);
                                loadPostersForFilms(hiddenGems.allFilms.slice((newPage - 1) * hiddenGemsPerPage, newPage * hiddenGemsPerPage));
                              }}
                              disabled={hiddenGemsPage === 1}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >Prev</button>
                            <span className="py-1.5 text-xs text-gray-400">Page {hiddenGemsPage}</span>
                            <button
                              onClick={() => {
                                const newPage = hiddenGemsPage + 1;
                                setHiddenGemsPage(newPage);
                                loadPostersForFilms(hiddenGems.allFilms.slice((newPage - 1) * hiddenGemsPerPage, newPage * hiddenGemsPerPage));
                              }}
                              disabled={hiddenGemsPage * hiddenGemsPerPage >= hiddenGems.allFilms.length}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >Next</button>
                          </div>
                        )}
                      </div>
                    )}

                    {hiddenTreasures.allFilms?.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h2 className="text-lg font-semibold">Hidden Treasures</h2>
                          <button
                            type="button"
                            onClick={() => openShareCard({ title: 'Hidden Treasures', subtitle: 'Undiscovered Favorites', filenameBase: 'flickd-hidden-treasures', films: hiddenTreasures.allFilms })}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                          >
                            Share
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Rare films buried beneath the algorithm that still left a lasting imprint on you.</p>

                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-xs text-gray-400">
                            Showing {(hiddenTreasuresPage - 1) * hiddenTreasuresPerPage + 1} - {Math.min(hiddenTreasuresPage * hiddenTreasuresPerPage, hiddenTreasures.allFilms.length)} of {hiddenTreasures.allFilms.length}
                          </div>
                          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]">
                            <button
                              type="button"
                              onClick={() => setHiddenTreasuresView('grid')}
                              className={`px-2.5 py-1.5 transition-colors ${
                                hiddenTreasuresView === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                              }`}
                              aria-label="Grid view"
                              title="Grid view"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                                <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                                <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                                <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHiddenTreasuresView('horizontal');
                                loadPostersForFilms(hiddenTreasures.allFilms.slice(0, 40));
                              }}
                              className={`px-2.5 py-1.5 transition-colors ${
                                hiddenTreasuresView === 'horizontal' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                              }`}
                              aria-label="Horizontal view"
                              title="Horizontal view"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                <rect x="1.5" y="3" width="3.2" height="10" rx="1" />
                                <rect x="6.4" y="3" width="3.2" height="10" rx="1" />
                                <rect x="11.3" y="3" width="3.2" height="10" rx="1" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {hiddenTreasuresView === 'grid' ? (
                          <div className="flickd-discovery-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {hiddenTreasures.allFilms.slice((hiddenTreasuresPage - 1) * hiddenTreasuresPerPage, hiddenTreasuresPage * hiddenTreasuresPerPage).map((m, i) => (
                              <div key={`${m.title}_${m.year}_${i}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                {posters[`${m.title}_${m.year}`] ? (
                                  <button
                                    type="button"
                                    onClick={() => handleMovieClick(m)}
                                    className="block w-full rounded"
                                    aria-label={`View details for ${m.title}`}
                                  >
                                    <img
                                      src={posters[`${m.title}_${m.year}`]}
                                      alt={m.title}
                                      className="w-full aspect-[2/3] object-cover rounded"
                                      onError={() => handlePosterRenderError(`${m.title}_${m.year}`)}
                                    />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => fetchPoster(m.title, m.year, m.imdbId)}
                                    className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                    title="Load poster"
                                  >
                                    {renderPosterStatus(`${m.title}_${m.year}`)}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleMovieClick(m)}
                                  className="flickd-poster-title mt-2 w-full text-left"
                                >
                                  {m.title}
                                </button>
                                <div className="flickd-poster-meta">{m.year} | {"\u2605"} {m.yourRating}</div>
                                <div className="flickd-poster-meta">IMDb {m.imdbRating} | {(m.numVotes || 0).toLocaleString()} votes</div>
                                <div className={`text-[11px] font-semibold mt-0.5 ${m.difference >= 2 ? 'text-blue-400' : 'text-green-400'}`}>
                                  +{m.difference}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3">
                            <div
                              className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                              style={{ overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}
                              onMouseEnter={() => setDeepDiveWheelLock(true)}
                              onMouseLeave={() => setDeepDiveWheelLock(false)}
                              onWheelCapture={(e) => {
                                const el = e.currentTarget;
                                e.preventDefault();
                                e.stopPropagation();
                                const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                                el.scrollLeft += delta;
                              }}
                            >
                              <div className="flex gap-3 min-w-max pr-3">
                                {hiddenTreasures.allFilms.map((m, i) => (
                                  <div
                                    key={`${m.title}_${m.year}_rail_${i}`}
                                    className="w-[180px] snap-start bg-[#101827] border border-gray-800 rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-1 hover:border-blue-500/30"
                                  >
                                    {posters[`${m.title}_${m.year}`] ? (
                                      <button
                                        type="button"
                                        onClick={() => handleMovieClick(m)}
                                        className="block w-full rounded-lg"
                                        aria-label={`View details for ${m.title}`}
                                      >
                                        <img
                                          src={posters[`${m.title}_${m.year}`]}
                                          alt={m.title}
                                          className="w-full h-[250px] object-cover rounded-lg"
                                          onError={() => handlePosterRenderError(`${m.title}_${m.year}`)}
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(m.title, m.year, m.imdbId)}
                                        className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        {renderPosterStatus(`${m.title}_${m.year}`)}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(m)}
                                      className="flickd-poster-title mt-2 w-full text-left"
                                    >
                                      {m.title}
                                    </button>
                                    <div className="flickd-poster-meta">{m.year} | {"\u2605"} {m.yourRating}</div>
                                    <div className="flickd-poster-meta">IMDb {m.imdbRating} | {(m.numVotes || 0).toLocaleString()} votes</div>
                                    <div className={`text-[11px] font-semibold mt-0.5 ${m.difference >= 2 ? 'text-blue-400' : 'text-green-400'}`}>
                                      +{m.difference}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="pointer-events-none absolute inset-y-3 left-3 w-8 bg-gradient-to-r from-[#0b1220] to-transparent rounded-l-xl" />
                            <div className="pointer-events-none absolute inset-y-3 right-3 w-8 bg-gradient-to-l from-[#0b1220] to-transparent rounded-r-xl" />
                          </div>
                        )}

                        {hiddenTreasuresView === 'grid' && hiddenTreasures.allFilms.length > hiddenTreasuresPerPage && (
                          <div className="flex justify-center gap-3 mt-5">
                            <button
                              onClick={() => {
                                const newPage = Math.max(1, hiddenTreasuresPage - 1);
                                setHiddenTreasuresPage(newPage);
                                loadPostersForFilms(hiddenTreasures.allFilms.slice((newPage - 1) * hiddenTreasuresPerPage, newPage * hiddenTreasuresPerPage));
                              }}
                              disabled={hiddenTreasuresPage === 1}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >Prev</button>
                            <span className="py-1.5 text-xs text-gray-400">Page {hiddenTreasuresPage} / {Math.ceil(hiddenTreasures.allFilms.length / hiddenTreasuresPerPage)}</span>
                            <button
                              onClick={() => {
                                const newPage = hiddenTreasuresPage + 1;
                                setHiddenTreasuresPage(newPage);
                                loadPostersForFilms(hiddenTreasures.allFilms.slice((newPage - 1) * hiddenTreasuresPerPage, newPage * hiddenTreasuresPerPage));
                              }}
                              disabled={hiddenTreasuresPage * hiddenTreasuresPerPage >= hiddenTreasures.allFilms.length}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >Next</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {favoriteFilmPerYear.length > 0 && (() => {
                    const latest = selectedFavoriteYear || favoriteFilmPerYear[0].year;
                    const selected = favoriteFilmPerYear.find(y => y.year === latest) || favoriteFilmPerYear[0];
  return (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h2 className="text-lg font-semibold"> Favorites by Year</h2>
                          <button
                            type="button"
                            onClick={() => openShareCard({
                              title: `My Top 10 of ${selected.year}`,
                              subtitle: 'Personal Year Card',
                              filenameBase: `flickd-favorites-${selected.year}`,
                              films: selected.films,
                            })}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                          >
                            Share
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Top-rated films grouped by release year from your watched history.</p>
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <label className="block text-gray-300 mb-1 text-xs">Select Year</label>
                          <Select
                            value={String(latest)}
                            onValueChange={(value) => {
                              setSelectedFavoriteYear(Number(value));
                              setFavoriteYearPage(1);
                              const sel = favoriteFilmPerYear.find((y) => y.year === Number(value));
                              if (sel) loadPostersForFilms(sel.films.slice(0, favoriteYearView === 'horizontal' ? 40 : deepDiveFilmsPerPage));
                            }}
                          >
                            <SelectTrigger className="w-full sm:w-56 h-10">
                              <SelectValue placeholder="Select Year" />
                            </SelectTrigger>
                            <SelectContent>
                              {favoriteFilmPerYear.map((y) => (
                                <SelectItem key={y.year} value={String(y.year)}>
                                  {y.year} ({y.filmCount})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          </div>
                          <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220]">
                            <button
                              type="button"
                              onClick={() => setFavoriteYearView('grid')}
                              className={`px-2.5 py-1.5 transition-colors ${
                                favoriteYearView === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                              }`}
                              aria-label="Grid view"
                              title="Grid view"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                                <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                                <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                                <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFavoriteYearView('horizontal');
                                loadPostersForFilms(selected.films.slice(0, 40));
                              }}
                              className={`px-2.5 py-1.5 transition-colors ${
                                favoriteYearView === 'horizontal' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                              }`}
                              aria-label="Horizontal view"
                              title="Horizontal view"
                            >
                              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                <rect x="1.5" y="3" width="3.2" height="10" rx="1" />
                                <rect x="6.4" y="3" width="3.2" height="10" rx="1" />
                                <rect x="11.3" y="3" width="3.2" height="10" rx="1" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {favoriteYearView === 'grid' ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {selected.films.slice((favoriteYearPage - 1) * deepDiveFilmsPerPage, favoriteYearPage * deepDiveFilmsPerPage).map((f, i) => (
                              <div key={`${f.title}_${f.year}_${i}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                {posters[`${f.title}_${f.year}`] ? (
                                  <button
                                    type="button"
                                    onClick={() => handleMovieClick(f)}
                                    className="block w-full rounded"
                                    aria-label={`View details for ${f.title}`}
                                  >
                                    <img
                                      src={posters[`${f.title}_${f.year}`]}
                                      alt={f.title}
                                      className="w-full aspect-[2/3] object-cover rounded"
                                      onError={() => handlePosterRenderError(`${f.title}_${f.year}`)}
                                    />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                    className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                    title="Load poster"
                                  >
                                    {renderPosterStatus(`${f.title}_${f.year}`)}
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleMovieClick(f)}
                                  className="flickd-poster-title mt-2 w-full text-left"
                                >
                                  {f.title}
                                </button>
                                <div className="flickd-poster-meta">{f.year} | {"\u2605"} {f.yourRating}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3">
                            <div
                              className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                              style={{ overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}
                              onMouseEnter={() => setDeepDiveWheelLock(true)}
                              onMouseLeave={() => setDeepDiveWheelLock(false)}
                              onWheelCapture={(e) => {
                                const el = e.currentTarget;
                                e.preventDefault();
                                e.stopPropagation();
                                const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                                el.scrollLeft += delta;
                              }}
                            >
                              <div className="flex gap-3 min-w-max pr-3">
                                {selected.films.map((f, i) => (
                                  <div
                                    key={`${selected.year}_rail_${f.title}_${f.year}_${i}`}
                                    className="w-[180px] snap-start bg-[#101827] border border-gray-800 rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-1 hover:border-blue-500/30"
                                  >
                                    {posters[`${f.title}_${f.year}`] ? (
                                      <button
                                        type="button"
                                        onClick={() => handleMovieClick(f)}
                                        className="block w-full rounded-lg"
                                        aria-label={`View details for ${f.title}`}
                                      >
                                        <img
                                          src={posters[`${f.title}_${f.year}`]}
                                          alt={f.title}
                                          className="w-full h-[250px] object-cover rounded-lg"
                                          onError={() => handlePosterRenderError(`${f.title}_${f.year}`)}
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                        className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        {renderPosterStatus(`${f.title}_${f.year}`)}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(f)}
                                      className="flickd-poster-title mt-2 w-full text-left"
                                    >
                                      {f.title}
                                    </button>
                                    <div className="flickd-poster-meta">{f.year} | {"\u2605"} {f.yourRating}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="pointer-events-none absolute inset-y-3 left-3 w-8 bg-gradient-to-r from-[#0b1220] to-transparent rounded-l-xl" />
                            <div className="pointer-events-none absolute inset-y-3 right-3 w-8 bg-gradient-to-l from-[#0b1220] to-transparent rounded-r-xl" />
                          </div>
                        )}
                        {favoriteYearView === 'grid' && selected.films.length > deepDiveFilmsPerPage && (
                          <div className="flex justify-center gap-3 mt-4">
                            <button
                              onClick={() => {
                                const newPage = Math.max(1, favoriteYearPage - 1);
                                setFavoriteYearPage(newPage);
                                loadPostersForFilms(selected.films.slice((newPage - 1) * deepDiveFilmsPerPage, newPage * deepDiveFilmsPerPage));
                              }}
                              disabled={favoriteYearPage === 1}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >Prev</button>
                            <span className="py-1.5 text-xs text-gray-400">Page {favoriteYearPage} / {Math.ceil(selected.films.length / deepDiveFilmsPerPage)}</span>
                            <button
                              onClick={() => {
                                const newPage = favoriteYearPage + 1;
                                setFavoriteYearPage(newPage);
                                loadPostersForFilms(selected.films.slice((newPage - 1) * deepDiveFilmsPerPage, newPage * deepDiveFilmsPerPage));
                              }}
                              disabled={favoriteYearPage * deepDiveFilmsPerPage >= selected.films.length}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >Next</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                    {personalCanon.length > 0 && (() => {
                      const selectedDec = expandedDecades[0] || personalCanon[personalCanon.length - 1].decade;
                      const selected = personalCanon.find(d => d.decade === selectedDec) || personalCanon[personalCanon.length - 1];
    return (
                        <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h2 className="text-lg font-semibold">Personal Canon</h2>
                            <button
                              type="button"
                              onClick={() => openShareCard({ title: `${selected.decade} Personal Canon`, subtitle: 'Films That Define Your Taste', filenameBase: `flickd-personal-canon-${selected.decade}`, films: selected.films })}
                              className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                            >
                              Share
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mb-4">The films that define your taste, organized decade by decade.</p>
                          <div className="mb-4 flex flex-wrap items-center gap-3">
                            <label className="block text-gray-300 text-xs">Select Decade</label>
                            <Select
                              value={selectedDec}
                              onValueChange={(value) => {
                                setExpandedDecades([value]);
                                setPersonalCanonPage(1);
                                const sel = personalCanon.find((d) => d.decade === value);
                                if (sel) loadPostersForFilms(sel.films.slice(0, personalCanonView === 'horizontal' ? 40 : deepDiveFilmsPerPage));
                              }}
                            >
                              <SelectTrigger className="w-full sm:w-56 h-10">
                                <SelectValue placeholder="Select Decade" />
                              </SelectTrigger>
                              <SelectContent>
                                {personalCanon.map((d) => (
                                  <SelectItem key={d.decade} value={d.decade}>
                                    {d.decade} ({d.filmCount})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220] ml-auto">
                              <button
                                type="button"
                                onClick={() => setPersonalCanonView('grid')}
                                className={`px-2.5 py-1.5 transition-colors ${
                                  personalCanonView === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                                }`}
                                aria-label="Grid view"
                                title="Grid view"
                              >
                                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                  <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                                  <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                                  <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                                  <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPersonalCanonView('horizontal')}
                                className={`px-2.5 py-1.5 transition-colors ${
                                  personalCanonView === 'horizontal' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#1f2937]'
                                }`}
                                aria-label="Horizontal view"
                                title="Horizontal view"
                              >
                                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                  <rect x="1.5" y="3" width="3.2" height="10" rx="1" />
                                  <rect x="6.4" y="3" width="3.2" height="10" rx="1" />
                                  <rect x="11.3" y="3" width="3.2" height="10" rx="1" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {personalCanonView === 'grid' ? (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {selected.films.slice((personalCanonPage - 1) * deepDiveFilmsPerPage, personalCanonPage * deepDiveFilmsPerPage).map((f, i) => (
                                  <div key={`${f.title}_${f.year}_${i}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                    {posters[`${f.title}_${f.year}`] ? (
                                      <button
                                        type="button"
                                        onClick={() => handleMovieClick(f)}
                                        className="block w-full rounded"
                                        aria-label={`View details for ${f.title}`}
                                      >
                                        <img
                                          src={posters[`${f.title}_${f.year}`]}
                                          alt={f.title}
                                          className="w-full aspect-[2/3] object-cover rounded"
                                          onError={() => handlePosterRenderError(`${f.title}_${f.year}`)}
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                        className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        {renderPosterStatus(`${f.title}_${f.year}`)}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(f)}
                                      className="flickd-poster-title mt-2 w-full text-left"
                                    >
                                      {f.title}
                                    </button>
                                    <div className="flickd-poster-meta">{f.year} | {"\u2605"} {f.yourRating}</div>
                                  </div>
                                ))}
                              </div>
                              {selected.films.length > deepDiveFilmsPerPage && (
                                <div className="flex justify-center gap-3 mt-4">
                                  <button
                                    onClick={() => {
                                      const newPage = Math.max(1, personalCanonPage - 1);
                                      setPersonalCanonPage(newPage);
                                      loadPostersForFilms(selected.films.slice((newPage - 1) * deepDiveFilmsPerPage, newPage * deepDiveFilmsPerPage));
                                    }}
                                    disabled={personalCanonPage === 1}
                                    className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                                  >Prev</button>
                                  <span className="py-1.5 text-xs text-gray-400">Page {personalCanonPage} / {Math.ceil(selected.films.length / deepDiveFilmsPerPage)}</span>
                                  <button
                                    onClick={() => {
                                      const newPage = personalCanonPage + 1;
                                      setPersonalCanonPage(newPage);
                                      loadPostersForFilms(selected.films.slice((newPage - 1) * deepDiveFilmsPerPage, newPage * deepDiveFilmsPerPage));
                                    }}
                                    disabled={personalCanonPage * deepDiveFilmsPerPage >= selected.films.length}
                                    className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                                  >Next</button>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3">
                              <div
                                className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                                style={{ overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}
                                onMouseEnter={() => setDeepDiveWheelLock(true)}
                                onMouseLeave={() => setDeepDiveWheelLock(false)}
                                onWheelCapture={(e) => {
                                  const el = e.currentTarget;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                                  el.scrollLeft += delta;
                                }}
                              >
                                <div className="flex gap-3 min-w-max pr-3">
                                  {selected.films.map((f, i) => (
                                    <div
                                      key={`${selected.decade}_rail_${f.title}_${f.year}_${i}`}
                                      className="w-[180px] snap-start bg-[#101827] border border-gray-800 rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-1 hover:border-blue-500/30"
                                    >
                                      {posters[`${f.title}_${f.year}`] ? (
                                        <button
                                          type="button"
                                          onClick={() => handleMovieClick(f)}
                                          className="block w-full rounded-lg"
                                          aria-label={`View details for ${f.title}`}
                                        >
                                          <img
                                            src={posters[`${f.title}_${f.year}`]}
                                            alt={f.title}
                                            className="w-full h-[250px] object-cover rounded-lg"
                                            onError={() => handlePosterRenderError(`${f.title}_${f.year}`)}
                                          />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                          className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                          title="Load poster"
                                        >
                                          {renderPosterStatus(`${f.title}_${f.year}`)}
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleMovieClick(f)}
                                        className="flickd-poster-title mt-2 w-full text-left"
                                      >
                                        {f.title}
                                      </button>
                                      <div className="flickd-poster-meta">{f.year} | {"\u2605"} {f.yourRating}</div>
                                      <div className="flickd-poster-meta">IMDb {f.imdbRating}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="pointer-events-none absolute inset-y-3 left-3 w-8 bg-gradient-to-r from-[#0b1220] to-transparent rounded-l-xl" />
                              <div className="pointer-events-none absolute inset-y-3 right-3 w-8 bg-gradient-to-l from-[#0b1220] to-transparent rounded-r-xl" />
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {topFilmPerGenre.length > 0 && (() => {
                    const selectedGenreName = topFilmPerGenre.some((g) => g.genre === selectedTopGenre)
                      ? selectedTopGenre
                      : topFilmPerGenre[0].genre;
                    const selectedGenreGroup =
                      topFilmPerGenre.find((g) => g.genre === selectedGenreName) || topFilmPerGenre[0];
                    const topGenreTotalPages = Math.max(1, Math.ceil(selectedGenreGroup.films.length / topGenreFilmsPerPage));
                    const topGenreSafePage = Math.min(topGenrePage, topGenreTotalPages);
                    const topGenrePageFilms = selectedGenreGroup.films.slice((topGenreSafePage - 1) * topGenreFilmsPerPage, topGenreSafePage * topGenreFilmsPerPage);
  return (
                        <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <h2 className="text-lg font-semibold">Top Films by Genre</h2>
                            <button
                              type="button"
                              onClick={() => openShareCard({ title: `Top 10 ${selectedGenreGroup.genre} Films`, subtitle: 'Genre Signature Card', filenameBase: `flickd-top-genre-${selectedGenreGroup.genre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, films: selectedGenreGroup.films })}
                              className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                            >
                              Share
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mb-4">
                            The defining films across the genres that shape your cinematic identity. Avg {selectedGenreGroup.avgGenreRating.toFixed(2)}
                          </p>
                          <div className="mb-4 flex flex-wrap items-center gap-3">
                            <label className="text-xs text-gray-300">Genre</label>
                            <Select
                              value={selectedGenreName}
                              onValueChange={(nextGenre) => {
                                setSelectedTopGenre(nextGenre);
                                setTopGenrePage(1);
                                const nextGroup = topFilmPerGenre.find((g) => g.genre === nextGenre);
                                if (nextGroup) loadPostersForFilms(nextGroup.films.slice(0, topGenreView === 'horizontal' ? 40 : topGenreFilmsPerPage));
                              }}
                            >
                              <SelectTrigger className="w-full sm:w-56 h-10">
                                <SelectValue placeholder="Genre" />
                              </SelectTrigger>
                              <SelectContent>
                                {topFilmPerGenre.map((g) => (
                                  <SelectItem key={g.genre} value={g.genre}>
                                    {g.genre} ({g.films.length})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden bg-[#0b1220] ml-auto">
                              <button
                                type="button"
                                onClick={() => setTopGenreView('grid')}
                                className={`px-2.5 py-1.5 transition-colors ${
                                  topGenreView === 'grid'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-300 hover:bg-[#1f2937]'
                                }`}
                                aria-label="Grid view"
                                title="Grid view"
                              >
                                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                  <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
                                  <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
                                  <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
                                  <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => setTopGenreView('horizontal')}
                                className={`px-2.5 py-1.5 transition-colors ${
                                  topGenreView === 'horizontal'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-300 hover:bg-[#1f2937]'
                                }`}
                                aria-label="Horizontal view"
                                title="Horizontal view"
                              >
                                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current" aria-hidden="true">
                                  <rect x="1.5" y="3" width="3.2" height="10" rx="1" />
                                  <rect x="6.4" y="3" width="3.2" height="10" rx="1" />
                                  <rect x="11.3" y="3" width="3.2" height="10" rx="1" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {topGenreView === 'grid' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                              {topGenrePageFilms.map((f, fi) => (
                                <div key={`${selectedGenreGroup.genre}_${f.title}_${f.year}_${fi}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                  {posters[`${f.title}_${f.year}`] ? (
                                    <button
                                      type="button"
                                      onClick={() => handleMovieClick(f)}
                                      className="block w-full rounded"
                                      aria-label={`View details for ${f.title}`}
                                    >
                                      <img
                                        src={posters[`${f.title}_${f.year}`]}
                                        alt={f.title}
                                        className="w-full aspect-[2/3] object-cover rounded"
                                        onError={() => handlePosterRenderError(`${f.title}_${f.year}`)}
                                      />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                      className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                      title="Load poster"
                                    >
                                      {renderPosterStatus(`${f.title}_${f.year}`)}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleMovieClick(f)}
                                    className="flickd-poster-title mt-2 w-full text-left"
                                  >
                                    {f.title}
                                  </button>
                                  <div className="flickd-poster-meta">{f.year} | {"\u2605"} {f.yourRating}</div>
                                  <div className="flickd-poster-meta">IMDb {f.imdbRating}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3">
                              <div
                                className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                                style={{ overscrollBehaviorX: 'contain', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}
                                onMouseEnter={() => setDeepDiveWheelLock(true)}
                                onMouseLeave={() => setDeepDiveWheelLock(false)}
                                onWheelCapture={(e) => {
                                  const el = e.currentTarget;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                                  el.scrollLeft += delta;
                                }}
                              >
                                <div className="flex gap-3 min-w-max pr-3">
                                  {selectedGenreGroup.films.map((f, fi) => (
                                    <div
                                      key={`${selectedGenreGroup.genre}_rail_${f.title}_${f.year}_${fi}`}
                                      className="w-[180px] snap-start bg-[#101827] border border-gray-800 rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-1 hover:border-blue-500/30"
                                    >
                                      {posters[`${f.title}_${f.year}`] ? (
                                        <button
                                          type="button"
                                          onClick={() => handleMovieClick(f)}
                                          className="block w-full rounded-lg"
                                          aria-label={`View details for ${f.title}`}
                                        >
                                          <img
                                            src={posters[`${f.title}_${f.year}`]}
                                            alt={f.title}
                                            className="w-full h-[250px] object-cover rounded-lg"
                                            onError={() => handlePosterRenderError(`${f.title}_${f.year}`)}
                                          />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                          className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                          title="Load poster"
                                        >
                                          {renderPosterStatus(`${f.title}_${f.year}`)}
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleMovieClick(f)}
                                        className="flickd-poster-title mt-2 w-full text-left"
                                      >
                                        {f.title}
                                      </button>
                                      <div className="flickd-poster-meta">{f.year} | {"\u2605"} {f.yourRating}</div>
                                      <div className="flickd-poster-meta">IMDb {f.imdbRating}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="pointer-events-none absolute inset-y-3 left-3 w-8 bg-gradient-to-r from-[#0b1220] to-transparent rounded-l-xl" />
                              <div className="pointer-events-none absolute inset-y-3 right-3 w-8 bg-gradient-to-l from-[#0b1220] to-transparent rounded-r-xl" />
                            </div>
                          )}
                          {topGenreView === 'grid' && topGenreTotalPages > 1 && (
                            <div className="flex justify-center gap-3 mt-4">
                              <button
                                onClick={() => {
                                  const newPage = Math.max(1, topGenreSafePage - 1);
                                setTopGenrePage(newPage);
                                loadPostersForFilms(selectedGenreGroup.films.slice((newPage - 1) * topGenreFilmsPerPage, newPage * topGenreFilmsPerPage));
                              }}
                              disabled={topGenreSafePage === 1}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >
                              Prev
                            </button>
                            <span className="py-1.5 text-xs text-gray-400">Page {topGenreSafePage} / {topGenreTotalPages}</span>
                            <button
                              onClick={() => {
                                const newPage = Math.min(topGenreTotalPages, topGenreSafePage + 1);
                                setTopGenrePage(newPage);
                                loadPostersForFilms(selectedGenreGroup.films.slice((newPage - 1) * topGenreFilmsPerPage, newPage * topGenreFilmsPerPage));
                              }}
                              disabled={topGenreSafePage === topGenreTotalPages}
                              className="px-4 py-1.5 bg-gray-800 rounded text-xs disabled:opacity-50 hover:bg-gray-700"
                            >
                              Next
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>
              )}
            </div>
          </div>
        </div>
        </>
        ) : null}
        
        {(!fetchingCountries && !hasDashboardData && !publicCommunityMode) && (
          <div className="text-center py-24">
            <div className="text-8xl mb-8"></div>
            <h3 className="text-3xl font-semibold mb-6 text-gray-100">Import Your Cinema History</h3>
            <p className="text-xl text-gray-300 mb-8">Upload your IMDb ratings export to generate a living editorial portrait of your cinematic taste.</p>
            <p className="text-gray-400">
              Get the file here {' '}
              <a
                href="https://www.imdb.com/list/ratings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                imdb.com  Ratings  Export
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


































































































































































