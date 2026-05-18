import React, { useState, useEffect, useMemo } from 'react';
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

const ACCENT_COLOR = '#3b82f6';
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
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
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [traceFullscreen, setTraceFullscreen] = useState(false);
  const [expandedDecades, setExpandedDecades] = useState([]);
  const [selectedFavoriteYear, setSelectedFavoriteYear] = useState(null);
  const [favoriteYearPage, setFavoriteYearPage] = useState(1);
  const [favoriteYearShareOpen, setFavoriteYearShareOpen] = useState(false);
  const [favoriteYearShareBusy, setFavoriteYearShareBusy] = useState(false);
  const [personalCanonPage, setPersonalCanonPage] = useState(1);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieDetails, setMovieDetails] = useState(null);
  const [fetchingMovieDetails, setFetchingMovieDetails] = useState(false);
  const [posters, setPosters] = useState({});
  const [fetchingCountries, setFetchingCountries] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0 });
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [lastDataSyncAt, setLastDataSyncAt] = useState(null);
  const [moodboards, setMoodboards] = useState(() => {
    const saved = localStorage.getItem('imdb-moodboards');
    return saved ? JSON.parse(saved) : [];
  });
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
  const [moodboardMinRatingFilter, setMoodboardMinRatingFilter] = useState('all');
  const [signingOut, setSigningOut] = useState(false);
  const [directorArchetypeMap, setDirectorArchetypeMap] = useState({});
  const [worldGeoJson, setWorldGeoJson] = useState(null);
  const [countryRatingThreshold, setCountryRatingThreshold] = useState(8);
  const [countryTimeRange] = useState('all');
  const [hoveredMapCountry, setHoveredMapCountry] = useState(null);
  const [mapTooltip, setMapTooltip] = useState(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapDragStart, setMapDragStart] = useState(null);
  const [traceHover, setTraceHover] = useState(null);
  const [traceTooltip, setTraceTooltip] = useState(null);
  const [traceZoom, setTraceZoom] = useState(1);
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
  const [membersEnabled, setMembersEnabled] = useState(true);
  const [memberViewUserId, setMemberViewUserId] = useState(null);
  const [memberViewName, setMemberViewName] = useState('');
  const [memberViewAvatarUrl, setMemberViewAvatarUrl] = useState('');
  const [memberViewSocials, setMemberViewSocials] = useState({ instagram: '', x: '', facebook: '' });
  const [memberViewAboutMe, setMemberViewAboutMe] = useState('');
  const [memberViewMoodboards, setMemberViewMoodboards] = useState([]);
  const [memberViewSnapshot, setMemberViewSnapshot] = useState(null);
  const [hasHydratedCurrentUserData, setHasHydratedCurrentUserData] = useState(false);
  const [showTasteResonance, setShowTasteResonance] = useState(false);
  const [tasteResonanceLoading, setTasteResonanceLoading] = useState(false);
  const [followedMemberIds, setFollowedMemberIds] = useState([]);
  const [followerUserIds, setFollowerUserIds] = useState([]);
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
  const tasteTimelineFullscreenRef = React.useRef(null);
  const mapFullscreenRef = React.useRef(null);
  const traceFullscreenRef = React.useRef(null);
  const tasteTimelineRef = React.useRef(null);
  const tasteTimelineDraggingRef = React.useRef(false);
  const tasteTimelineDragStartRef = React.useRef({ x: 0, left: 0 });
  const timelinePanelLoadRafRef = React.useRef(null);
  const timelineLastLoadedPanelRef = React.useRef(-1);
  const posterLoadInFlightRef = React.useRef(new Set());
  const posterFailedAtRef = React.useRef({});
  const omdbCacheAvailableRef = React.useRef(true);
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
    }

    lastAuthUserIdRef.current = nextUserId;
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `imdb-followers-seen-${user.id}` : 'imdb-followers-seen-guest';
    const saved = localStorage.getItem(key);
    setLastSeenFollowerIds(saved ? JSON.parse(saved) : []);
  }, [user?.id]);

  useEffect(() => {
    const key = user?.id ? `imdb-aboutme-${user.id}` : 'imdb-aboutme-guest';
    const saved = localStorage.getItem(key);
    const value = saved ? String(saved).slice(0, 250) : '';
    setAboutMe(value);
    setAboutMeDraft(value);
  }, [user?.id]);

  const currentProfileAvatarUrlRaw = memberViewUserId ? memberViewAvatarUrl : user?.user_metadata?.avatar_url;
  const currentProfileAvatarLabel = memberViewUserId
    ? (memberViewName || 'Member')
    : (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'User');

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
      localStorage.removeItem('imdb-moodboards');
      setFollowedMemberIds([]);
      setSocialLinks({ instagram: '', x: '', facebook: '' });
      if (user?.id) {
        localStorage.removeItem(`imdb-following-${user.id}`);
      }
      setHasHydratedCurrentUserData(false);
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
            .upsert(
              {
                follower_user_id: user.id,
                followed_user_id: id,
              },
              { onConflict: 'follower_user_id,followed_user_id' }
            );
          if (error) throw error;
        }
      } catch (error) {
        if (error?.code === 'PGRST205' || error?.status === 404) {
          setFollowsTableEnabled(false);
        }
        setFollowedMemberIds(previous);
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
    if (!user || !supabaseDataEnabled) return;
    try {
      const { data, error } = await supabase
        .from('user_data')
        .select('moodboards, followings, social_links')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error?.code === 'PGRST205' || error?.status === 404) {
          setSupabaseDataEnabled(false);
        }
        return;
      }

      if (data?.moodboards) {
        setMoodboards(data.moodboards);
        localStorage.setItem('imdb-moodboards', JSON.stringify(data.moodboards));
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
    } catch (error) {
      if (isSupabaseNetworkError(error)) {
        console.warn('Supabase temporarily unreachable while loading user data.');
      } else {
        console.error('loadMoodboardsFromSupabase failed:', error);
      }
    }
  };
  
  useEffect(() => {
    if (user && supabaseDataEnabled) loadMoodboardsFromSupabase();
  }, [user, supabaseDataEnabled, followsTableEnabled]);

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
    if (!user || !supabaseDataEnabled) return;
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
  }, [followedMemberIds, moodboards, user, supabaseDataEnabled]);

  const handleSaveSocialLinks = async () => {
    if (!user || !supabaseDataEnabled || savingSocialLinks) return;
    setSavingSocialLinks(true);
    try {
      const payload = {
        user_id: user.id,
        social_links: {
          instagram: socialLinksDraft.instagram || '',
          x: socialLinksDraft.x || '',
          facebook: socialLinksDraft.facebook || '',
        },
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('user_data')
        .upsert(payload, { onConflict: 'user_id' });
      if (!error) {
        setSocialLinks(payload.social_links);
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
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Member',
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

    const hasMissingCountry = data.some((movie) => !movie?.country);
    if (!hasMissingCountry) return;

    let cancelled = false;
    (async () => {
      const enriched = await fetchCountryData(data, OMDB_API_KEY);
      if (!cancelled && enriched?.length) {
        setData(enriched);
        persistDataset(enriched, fileName || 'IMDb Ratings');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, fetchingCountries, fileName]);

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
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Member',
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
    const keys = availableKeys.length ? availableKeys : OMDB_API_KEYS;
    if (!keys.length) return null;
    let lastPayload = null;

    for (const key of keys) {
      try {
        const url = buildUrlForKey(key);
        if (!url) continue;
        const res = await fetch(url);
        if (res.status === 401) {
          invalidOmdbKeysRef.current.add(key);
          continue;
        }
        const json = await res.json();
        if (json?.Response === 'True') return json;
        if (json?.Error && /invalid api key|unauthorized|request limit reached/i.test(String(json.Error))) {
          invalidOmdbKeysRef.current.add(key);
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

    if (!data?.data) return null;
    return {
      payload: data.data,
      poster: data.poster || null,
      country: data.country || null,
    };
  };

  const setOmdbCache = async ({ title, year, imdbId, payload }) => {
    if (!omdbCacheAvailableRef.current || !payload) return;
    const cacheKey = buildOmdbCacheKey(title, year, imdbId);
    if (!cacheKey) return;

    const record = {
      cache_key: cacheKey,
      imdb_id: imdbId || payload?.imdbID || payload?.imdbId || null,
      title: title || payload?.Title || null,
      year: Number(year) || Number(payload?.Year) || null,
      poster: payload?.Poster && payload.Poster !== 'N/A' ? payload.Poster : null,
      country: payload?.Country && payload.Country !== 'N/A' ? payload.Country : null,
      data: payload,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from(OMDB_CACHE_TABLE)
      .upsert(record, { onConflict: 'cache_key' });

    if (error && (error?.code === 'PGRST205' || error?.status === 404)) {
      omdbCacheAvailableRef.current = false;
    }
  };

  const fetchMovieDetails = async (movie) => {
    if (!movie) return;

    setFetchingMovieDetails(true);
    setMovieDetails(null);

    try {
      const imdbId = String(movie?.imdbId || movie?.imdbID || '').trim();
      const title = String(movie?.title || '').trim();
      const year = Number(movie?.year) || '';

      const cached = await getOmdbCache({ title, year, imdbId });
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
      const cached = await getOmdbCache({ title: safeTitle, year: safeYear, imdbId });
      if (cached?.poster) {
        setPosters((prev) => ({ ...prev, [key]: cached.poster }));
        delete posterFailedAtRef.current[key];
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
        setPosters((prev) => ({ ...prev, [key]: json.Poster }));
        setOmdbCache({ title: safeTitle, year: safeYear, imdbId, payload: json });
        delete posterFailedAtRef.current[key];
        return json.Poster;
      }

      posterFailedAtRef.current[key] = Date.now();
      return null;
    } finally {
      inFlight.delete(key);
    }
  };

  const loadPostersForFilms = async (films = []) => {
    if (!Array.isArray(films) || films.length === 0) return;

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

    if (unique.length === 0) return;

    const batchSize = 6;
    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      await Promise.all(
        batch.map((film) => fetchPoster(film?.title, film?.year, film?.imdbId || film?.imdbID || null))
      );
    }
  };
  
  const handleFileUpload = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
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

      const parseVotes = (value) => {
        const cleaned = String(value ?? '').replace(/,/g, '').replace(/[^\d]/g, '');
        const numeric = Number(cleaned);
        return Number.isFinite(numeric) ? numeric : 0;
      };

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
          const imdbVotes = parseVotes(getByAliases(row, ['Num Votes', 'IMDb Votes', 'IMDB Votes', 'Votes']));
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

      setData(parsed);
      setFileName(file.name);
      setLoadedFromCache(false);
      persistDataset(parsed, file.name);
      syncDatasetToMemberProfile(parsed);
      setHiddenGemsPage(1);
      setHiddenTreasuresPage(1);
      setWatchedPage(1);
      setTopGenrePage(1);
      setPersonalCanonPage(1);
      setFavoriteYearPage(1);
      setSelectedMovie(null);
      setMovieDetails(null);
    } catch (error) {
      console.error('File upload failed:', error);
      alert('Could not parse this file. Please upload a valid IMDb CSV/XLSX export.');
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
    setPosters({});
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
    const BATCH_SIZE = 50;

    try {
      for (let i = 0; i < movies.length; i += BATCH_SIZE) {
        const batch = movies.slice(i, i + BATCH_SIZE);

        const promises = batch.map(async (movie) => {
          const key = `${movie.title}_${movie.year}`;
          if (cache[key]) return { ...movie, country: cache[key] };

          const cleanTitle = cleanTitleForOmdb(movie.title);

          try {
            const cached = await getOmdbCache({
              title: movie.title,
              year: movie.year,
              imdbId: movie.imdbId || movie.imdbID || null,
            });
            if (cached?.country) {
              cache[key] = cached.country;
              return { ...movie, country: cached.country };
            }

            const json = await fetchOmdbWithFallback((key) =>
              `https://www.omdbapi.com/?t=${encodeURIComponent(cleanTitle)}&y=${movie.year}&apikey=${key}`
            );

            if (json.Response === 'True' && json.Country) {
              const country = json.Country.split(',')[0].trim();
              cache[key] = country;
              setOmdbCache({ title: movie.title, year: movie.year, imdbId: movie.imdbId || movie.imdbID || null, payload: json });
              return { ...movie, country };
            }
          } catch {
            // Ignore lookup failures and keep country as Unknown.
          }

          cache[key] = 'Unknown';
          return { ...movie, country: 'Unknown' };
        });

        const results = await Promise.all(promises);
        updated.push(...results);
        setFetchProgress({ current: updated.length, total: movies.length });
      }
    } finally {
      localStorage.setItem('countryCache', JSON.stringify(cache));
      setFetchingCountries(false);
    }

    return updated;
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

      if (!movie?.country || movie.country === 'Unknown') return;

      const normalizedCountry = normalizeCountryName(String(movie.country).split(',')[0].trim());
      if (!normalizedCountry) return;

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
      localStorage.setItem('imdb-moodboards', JSON.stringify(next));
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
      (film?.country || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => set.add(c));
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
          const countries = String(film.country || '')
            .split(',')
            .map((c) => c.trim().toLowerCase())
            .filter(Boolean);
          if (!countries.includes(moodboardCountryFilter.toLowerCase())) return false;
        }
        if (minRating !== null && (Number(film.yourRating) || 0) < minRating) return false;
        return true;
      })
      .sort((a, b) => (Number(b.yourRating) || 0) - (Number(a.yourRating) || 0))
      .slice(0, 400);
  }, [data, moodboards, activeMoodboard, moodboardFilmSearch, moodboardGenreFilter, moodboardDecadeFilter, moodboardYearFilter, moodboardCountryFilter, moodboardMinRatingFilter]);

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
      description = "You find beauty in the shadows. While others look away, you stare into the abyss and discover truths too disturbing for mortal eyes. Your film palette is painted in blacks, reds, and the cold blue of nightmares.";
      traits = ["Dark Soul", "Gothic Aesthete", "Fear Embracer", "Isolated Wanderer", "Twilight Seeker"];
    } else if (hasSciFi && isNiche) {
      archetype = "The Future Dreamer";
      description = "The present bores you. You escape into chrome futures, alien worlds, and philosophical paradoxes. Your mind orbits between stars, questioning humanity's place in an indifferent cosmos.";
      traits = ["Cosmic Thinker", "Tech Romantic", "Dystopian Explorer", "AI Sympathizer", "Dimension Hopper"];
    } else if (hasRomance && lovesLong) {
      archetype = "The Romantic Idealist";
      description = "You believe love is worth suffering for. Your films are grand emotional journeys where hearts break beautifully and passion burns eternal. Every story is a love letter to feeling deeply.";
      traits = ["Heart Sleeper", "Grand Gesture Believer", "Emotional Explorer", "Passion Chaser", "Soul Mender"];
    } else if (hasThriller && lovesShort) {
      archetype = "The Adrenaline Minimalist";
      description = "Time is precious. You demand your films move like a freight train: tight, tense, and over before you can exhale. Every second counts, every frame must justify its existence.";
      traits = ["Ticker Counter", "Tension Hunter", "Plot Twister", "Efficiency Expert", "Thrill Seeker"];
    } else if (hasDocumentary && isNiche) {
      archetype = "The Truth Seeker";
      description = "Fiction is escapism. You prefer the raw, unfiltered reality of documentary cinema, true stories that challenge your worldview and expose the beautiful chaos of existence.";
      traits = ["Reality Architect", "Fact Finder", "Human Documenter", "Truth Pursuer", "Complexity Lover"];
    } else if (hasClassic && lovesLong) {
      archetype = "The Classicist";
      description = "You walk the golden halls of cinema's past. The silver screen legends speak to you in black and white, and you understand that true art transcends color, technology, and time.";
      traits = ["Golden Age Walker", "Formalist", "Patience Master", "Cinema Scholar", "Heritage Keeper"];
    } else if (parseInt(mostWatchedDecade) >= 2010 && isNiche) {
      archetype = "The Indie Spirit";
      description = "You reject the mainstream's manufactured emotions. You seek authenticity in shaky cam, naturalistic dialogue, and stories about real people navigating messy lives. Conformity is your enemy.";
      traits = ["Indie Loyalist", "Authenticity Hunter", "Mumblecore Friend", "Micro-Budget Champion", "Underground Dweller"];
    } else if (parseInt(mostWatchedDecade) >= 1980 && parseInt(mostWatchedDecade) < 2010) {
      archetype = "The Neon Realist";
      description = "You came of age when cinema got gritty. Your films blend style with substance: crime sagas, antiheroes, and morally complex tales that reflect a world without easy answers.";
      traits = ["Midnight Moviegoer", "Genre Hybrid", "Morally Gray", "Style Maven", "Nostalgia Keeper"];
    } else if (isGenerous && topGenres.length >= 2) {
      archetype = "The Emotional Explorer";
      description = "You feel intensely and broadly. Your cinematic journey spans genres, but all roads lead to catharsis. You cry, you laugh, you think: you experience films with your whole being.";
      traits = ["Feelings Amplifier", "Genre Polymath", "Emotional Tourist", "Catharsis Seeker", "Open Heart"];
    } else if (nichePercentage < 30) {
      archetype = "The Cultural Connoisseur";
      description = "You walk the balanced path between art and accessibility. You appreciate both the hidden indie masterpiece and the crowd-pleasing blockbuster. Your taste is refined yet inclusive.";
      traits = ["Mainstream Explorer", "Quality Balancer", "Accessibility Advocate", "Pop Corn Philosopher", "Bridge Builder"];
    } else if (lovesShort && isHarsh) {
      archetype = "The Brutalist";
      description = "You have no patience for indulgence. Your films are stripped to their essence, harsh truths delivered without apology. Comfort is overrated; clarity is everything.";
      traits = ["Minimalist", "No-Nonsense Viewer", "Punchy Storyteller", "Efficiency Guru", "Hard Truth Lover"];
    } else if (lovesLong && isGenerous) {
      archetype = "The Epic Dreamer";
      description = "You believe in grand narratives and emotional magnitude. Your films are sprawling journeys across years, galaxies, or generations that demand your full attention and reward it tenfold.";
      traits = ["Marathon Viewer", "Saga Seeker", "World Builder", "Patience Virtuoso", "Grand Narrator"];
    } else {
      archetype = "The Eclectic Soul";
      description = "Your cinematic identity resists categorization. You drift through genres and eras like a curious ghost, finding unexpected treasures in every corner of the film universe.";
      traits = ["Genre Fluid", "Curious Wanderer", "Discovery Addict", "Mood Diver", "Ever-Changing Viewer"];
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
    // Convert it to a 0–100 "consistency" score: lower spread => higher score.
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

    const archetypeTotals = CINEMA_MIND_ARCHETYPES.reduce((acc, archetype) => {
      acc[archetype] = 0;
      return acc;
    }, {});

    let totalWeight = 0;

    data.forEach((movie) => {
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

    return { archetypes, signals };
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

    data.forEach((movie) => {
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
  const ratingDist = getRatingDistribution();
  const genreAffinity = getGenreAffinity();
  const eraPreference = getEraPreference();
  const eraChartMin = eraPreference.length
    ? Math.max(0, Number((Math.min(...eraPreference.map((item) => item.avgRating)) - 0.5).toFixed(1)))
    : 0;
  const hiddenGems = getHiddenGems();
  const favoriteFilmPerYear = getFavoriteFilmPerYear();
  const favoriteShareYear = selectedFavoriteYear || favoriteFilmPerYear?.[0]?.year || null;
  const favoriteShareSelection = favoriteFilmPerYear.find((y) => y.year === favoriteShareYear) || favoriteFilmPerYear?.[0] || null;
  const favoriteShareTop10Films = (favoriteShareSelection?.films || []).slice(0, 10);
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
  const isWatchedFilmsMode = countryRatingThreshold === 0;
  const mapCountLabel = isWatchedFilmsMode
    ? 'films watched'
    : `films rated >= ${countryRatingThreshold}`;
  const countryPreferenceLookup = Object.fromEntries(countryPreference.map((item) => [item.country, item.count]));

  const watchedDecades = data
    ? Array.from(new Set(data.map((movie) => Number(movie?.year)).filter((year) => year >= 1900).map((year) => Math.floor(year / 10) * 10))).sort((a, b) => b - a)
    : [];

  const watchedYears = data
    ? Array.from(new Set(data.map((movie) => Number(movie?.year)).filter((year) => year >= 1900))).sort((a, b) => b - a)
    : [];

  const watchedGenres = data
    ? Array.from(new Set(data.flatMap((movie) => String(movie?.genres || '').split(',').map((genre) => genre.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b))
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
    if (query && !titleText.includes(query)) return false;

    return true;
  }).sort((a, b) => (Number(b?.year) || 0) - (Number(a?.year) || 0) || (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0));

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
    if (!Array.isArray(data) || !data.length) return [];
    const candidates = data
      .filter((m) => Number(m?.year) >= 1900 && Number(m?.year) <= 2035 && String(m?.title || '').trim());

    // Keep timeline readable: no more than 5 films per release year.
    const byYear = new Map();
    candidates.forEach((m) => {
      const y = Number(m?.year) || 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(m);
    });

    const cappedPerYear = [];
    byYear.forEach((films) => {
      films
        .sort((a, b) =>
          (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0) ||
          (Number(b?.imdbVotes || b?.numVotes) || 0) - (Number(a?.imdbVotes || a?.numVotes) || 0)
        )
        .slice(0, 5)
        .forEach((m) => cappedPerYear.push(m));
    });

    // Render only top 100 films overall.
    const source = cappedPerYear
      .sort((a, b) =>
        (Number(b?.yourRating) || 0) - (Number(a?.yourRating) || 0) ||
        (Number(b?.imdbVotes || b?.numVotes) || 0) - (Number(a?.imdbVotes || a?.numVotes) || 0)
      )
      .slice(0, 150)
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
    if (!timelineMovies.length) return 2029;
    const maxYear = Math.ceil(Math.max(...timelineMovies.map((m) => Number(m.year) || 2029)) / 10) * 10 + 9;
    return Math.max(2029, maxYear);
  }, [timelineMovies]);

  const timelineDecades = React.useMemo(() => {
    const list = [];
    for (let d = timelineStartYear; d <= timelineEndYear; d += 10) list.push(d);
    return list;
  }, [timelineStartYear, timelineEndYear]);

  const timelineDecadePanels = React.useMemo(() => {
    return timelineDecades.map((decade) => {
      const films = timelineMovies.filter((m) => Number(m.year) >= decade && Number(m.year) <= decade + 9);
      const bucketCount = {};
      const plotted = films.map((movie) => {
        const year = Number(movie.year) || decade;
        const key = String(year);
        const inYearIndex = bucketCount[key] || 0;
        bucketCount[key] = inYearIndex + 1;
        const localX = ((year - decade) / 9) * 100;
        const baseY = 50 - movie.styleScore * 38;
        const spread = ((inYearIndex % 5) - 2) * 4;
        const y = Math.max(7, Math.min(93, baseY + spread));
        return {
          ...movie,
          localX,
          y,
          key: `${movie.title}_${movie.year}_${inYearIndex}`,
        };
      });
      return { decade, films: plotted };
    });
  }, [timelineDecades, timelineMovies]);

  const timelineRelated = React.useMemo(() => {
    if (!timelineHoverKey) return new Set();
    const active = timelineMovies.find((m) => `${m.title}_${m.year}` === timelineHoverKey);
    if (!active) return new Set();
    const activeYear = Number(active.year) || 0;
    const activeScore = Number(active.styleScore) || 0;
    return new Set(
      timelineMovies
        .filter((m) => Math.abs((Number(m.year) || 0) - activeYear) <= 2 && Math.abs((Number(m.styleScore) || 0) - activeScore) <= 0.3)
        .map((m) => `${m.title}_${m.year}`)
    );
  }, [timelineHoverKey, timelineMovies]);

  const loadTimelinePanelPosters = (panelIndex) => {
    if (!timelineDecadePanels.length) return;
    const safeIndex = Math.max(0, Math.min(timelineDecadePanels.length - 1, panelIndex));
    const indices = [safeIndex - 1, safeIndex, safeIndex + 1]
      .filter((idx) => idx >= 0 && idx < timelineDecadePanels.length);
    const films = [];
    indices.forEach((idx) => {
      const panelFilms = timelineDecadePanels[idx]?.films || [];
      panelFilms.forEach((film) => films.push(film));
    });
    if (films.length) {
      loadPostersForFilms(films.slice(0, 120));
    }
  };

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
    }, [data, stats, personality, ratingDist, mostWatchedGenres, eraPreference, countryPreference, cinemaMindProfile, patterns, socialLinks, followedMemberIds, aboutMe, moodboards, stableProfileUpdatedAt]);

  const minimalMemberSnapshot = React.useMemo(() => ({
    stats: {
      totalFilms: Number(stats?.totalFilms || 0),
      avgYourRating: Number(stats?.avgYourRating || 0),
      mostRatedGenre: String(stats?.mostRatedGenre || 'N/A'),
    },
    followings: Array.isArray(followedMemberIds) ? followedMemberIds : [],
    aboutMe: aboutMe || '',
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
  }), [data, stats, personality, ratingDist, mostWatchedGenres, eraPreference, countryPreference, cinemaMindProfile, patterns, socialLinks, followedMemberIds, aboutMe, moodboards, stableProfileUpdatedAt]);

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
      return { name: 'Opposite Lenses', line: 'Contrasting film souls that challenge each other’s cinematic comfort zone.' };
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
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'You',
      email: user.email || '',
      avatarUrl: user.user_metadata?.avatar_url || '',
      joinedAt: user.created_at || null,
      updatedAt: currentMemberSnapshot?.updatedAt || minimalMemberSnapshot?.updatedAt || stableProfileUpdatedAt || null,
      snapshot: currentMemberSnapshot || minimalMemberSnapshot,
      isCurrentUser: true,
    };
  }, [user, currentMemberSnapshot, minimalMemberSnapshot, stableProfileUpdatedAt]);

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
      const snapshotToSave = publicMemberSnapshot;
      const payload = {
        user_id: user.id,
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Member',
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

  const fetchMemberList = async ({ page = 0, pageSize = 30 } = {}) => {
    const from = Math.max(0, Number(page) || 0) * (Number(pageSize) || 30);
    const to = from + (Number(pageSize) || 30) - 1;
    return runSupabaseResilient('member_profiles:list', () =>
      supabase
        .from('member_profiles')
        .select(`
          id,
          user_id,
          display_name,
          email,
          avatar_url,
          created_at,
          updated_at,
          stats:snapshot->stats,
          followings:snapshot->followings,
          aboutMe:snapshot->aboutMe,
          profileLinks:snapshot->profileLinks
        `)
        .order('updated_at', { ascending: false })
        .range(from, to)
    , { timeoutMs: 18000, retries: 2, baseDelayMs: 450 });
  };

  const fetchMemberProfile = async (memberUserId) => {
    if (!memberUserId) return { data: null, error: null };
    return runSupabaseResilient('member_profiles:profile', () =>
      supabase
        .from('member_profiles')
        .select(`
          id,
          user_id,
          display_name,
          email,
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
          const queryPromise = fetchMemberList({ page: membersPage, pageSize: 30 });
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
          if (error?.code === 'PGRST205' || error?.status === 404) {
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
  }, [activeTab, membersEnabled, user?.id, currentMemberRecord?.updatedAt, membersPage, membersRetryNonce]);

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
            name: row?.display_name || row?.name || row?.email || 'Member',
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

  useEffect(() => {
    if (!user || !followsTableEnabled) return;
    const refresh = async () => {
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
              .select('follower_user_id')
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
          const followerIds = (followersRes.data || [])
            .map((row) => String(row?.follower_user_id || '').trim())
            .filter(Boolean);
          setFollowerUserIds(followerIds);
        }
      } catch {
        // keep last known local state
      }
    };

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, followsTableEnabled]);

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

  const filterMembersByQuery = React.useCallback((list, query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return list;
    return (Array.isArray(list) ? list : []).filter((member) => {
      const name = String(member?.name || '').toLowerCase();
      const email = String(member?.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, []);

  const filteredMembersDirectory = React.useMemo(
    () => filterMembersByQuery(membersDirectory, membersSearchQuery),
    [membersDirectory, membersSearchQuery, filterMembersByQuery]
  );
  const filteredFollowedMembersList = React.useMemo(
    () => filterMembersByQuery(followedMembersList, followingSearchQuery),
    [followedMembersList, followingSearchQuery, filterMembersByQuery]
  );
  const filteredFollowersMembersList = React.useMemo(
    () => filterMembersByQuery(followersMembersList, followersSearchQuery),
    [followersMembersList, followersSearchQuery, filterMembersByQuery]
  );

  const newFollowersList = React.useMemo(() => {
    const seen = new Set((lastSeenFollowerIds || []).map((id) => String(id)));
    return followersMembersList.filter((member) => !seen.has(String(member.userId)));
  }, [followersMembersList, lastSeenFollowerIds]);

  useEffect(() => {
    if (!user) return;
    if (activeTab === 'followers') return;
    if (!newFollowersList.length) return;
    const ids = followersMembersList.map((member) => String(member.userId));
    setLastSeenFollowerIds(ids);
    try {
      localStorage.setItem(`imdb-followers-seen-${user.id}`, JSON.stringify(ids));
    } catch {
      // ignore storage errors
    }
  }, [activeTab, followersMembersList, newFollowersList.length, user]);

  const fetchMemberSnapshot = async (memberUserId) => {
    if (!memberUserId || !membersEnabled) return { snapshot: null, updatedAt: null, error: null };
    console.time('member_profiles:snapshot');
    try {
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
        const { data: profileRow } = await fetchMemberProfile(member.userId);
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
      setMemberViewName(memberRecord.name || 'Member');
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
      setFileName(`${member.name || 'Member'} (shared dashboard)`);
      setLoadedFromCache(false);
      setLastDataSyncAt(member.updatedAt || null);
      setActiveTab('overview');
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
      if (originalData) {
        setData(originalData);
      }
      setFileName(originalMeta.fileName || '');
      setLoadedFromCache(Boolean(originalMeta.loadedFromCache));
    setLastDataSyncAt(originalMeta.lastDataSyncAt || null);
  };

  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'personality', label: 'Personality' },
    { id: 'allwatched', label: 'All Watched Films' },
    { id: 'tastetimeline', label: 'Taste Timeline' },
    { id: 'mytrace', label: 'My Trace' },
    { id: 'moodboard', label: 'Filmboards' },
    { id: 'deepdive', label: 'Deep Dive' },
  ];
  const isViewingOtherMember = Boolean(memberViewUserId) && String(memberViewUserId) !== String(user?.id || '');
  const isHomeActive = !memberViewUserId && navItems.some((item) => item.id === activeTab);
  const isMembersTopActive =
    activeTab === 'members' ||
    (Boolean(memberViewUserId) && !['following', 'followers', 'settings'].includes(activeTab));
  const handleTabChange = (tabId) => {
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
  }, [watchedDecadeFilter, watchedYearFilter, watchedRatingFilter, watchedGenreFilter, watchedSearchQuery]);

  React.useEffect(() => {
    if (watchedPage > watchedTotalPages) {
      setWatchedPage(watchedTotalPages);
    }
  }, [watchedPage, watchedTotalPages]);

  React.useEffect(() => {
    if (activeTab !== 'allwatched' || watchedPageFilms.length === 0) return;
    loadPostersForFilms(watchedPageFilms);
  }, [activeTab, watchedSafePage, watchedDecadeFilter, watchedYearFilter, watchedRatingFilter, watchedGenreFilter, watchedSearchQuery, data]);

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
    if (activeTab !== 'tastetimeline' || !timelineMovies.length) return;
    timelineLastLoadedPanelRef.current = -1;
    loadPostersForFilms(timelineMovies.slice(0, 80));
    requestAnimationFrame(() => {
      const el = tasteTimelineRef.current;
      if (!el || !timelineDecadePanels.length) return;
      const panelIndex = Math.max(
        0,
        Math.min(
          timelineDecadePanels.length - 1,
          Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
        )
      );
      timelineLastLoadedPanelRef.current = panelIndex;
      loadTimelinePanelPosters(panelIndex);
    });
  }, [activeTab, timelineMovies]);

  React.useEffect(() => () => {
    if (timelinePanelLoadRafRef.current) {
      cancelAnimationFrame(timelinePanelLoadRafRef.current);
      timelinePanelLoadRafRef.current = null;
    }
  }, []);

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
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      zoomTimeline(step);
      return;
    }
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    el.scrollLeft += delta * 1.15;
  };

  const onTimelineRailScroll = () => {
    const el = tasteTimelineRef.current;
    if (!el || !timelineDecadePanels.length) return;
    if (timelinePanelLoadRafRef.current) {
      cancelAnimationFrame(timelinePanelLoadRafRef.current);
    }
    timelinePanelLoadRafRef.current = requestAnimationFrame(() => {
      const panelWidth = Math.max(1, el.clientWidth);
      const panelIndex = Math.max(
        0,
        Math.min(timelineDecadePanels.length - 1, Math.round(el.scrollLeft / panelWidth))
      );
      if (timelineLastLoadedPanelRef.current !== panelIndex) {
        timelineLastLoadedPanelRef.current = panelIndex;
        loadTimelinePanelPosters(panelIndex);
      }
      timelinePanelLoadRafRef.current = null;
    });
  };

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
  const handleDownloadPdfBook = async () => {
    if (isBookExporting) return;
    setIsBookExporting(true);

    const originalTab = activeTab;
    const tabsToExport = [
      { id: 'overview', title: 'Overview' },
      { id: 'personality', title: 'Personality' },
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
        'Most Watched Genres',
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
              'Most Watched Genres',
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
    if (!favoriteYearShareOpen || !favoriteShareTop10Films.length) return;
    loadPostersForFilms(favoriteShareTop10Films);
  }, [favoriteYearShareOpen, favoriteShareTop10Films]);

  const buildFavoriteYearShareCardBlob = async () => {
    if (!favoriteShareSelection) return null;
    const year = favoriteShareSelection.year;
    const films = favoriteShareTop10Films;

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

    ctx.fillStyle = '#e5e7eb';
    ctx.font = '700 56px Segoe UI';
    ctx.fillText(`Favorites of ${year}`, 72, 110);
    ctx.font = '400 26px Segoe UI';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('Top 10 films from your Flickd cinematic year card', 72, 155);

    const startY = 220;
    const rowH = 112;
    const thumbW = 64;
    const thumbH = 92;

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
      ctx.fillRect(64, y - 16, 952, rowH - 10);

      if (posterUrl) {
        const loaded = await loadImage(posterUrl);
        if (loaded) {
          ctx.drawImage(loaded, 82, y - 6, thumbW, thumbH);
        } else {
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(82, y - 6, thumbW, thumbH);
        }
      } else {
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(82, y - 6, thumbW, thumbH);
      }

      ctx.fillStyle = '#60a5fa';
      ctx.font = '700 30px Segoe UI';
      ctx.fillText(`${i + 1}`, 166, y + 38);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 32px Segoe UI';
      const title = String(film.title || '');
      const trimmed = title.length > 42 ? `${title.slice(0, 39)}...` : title;
      ctx.fillText(trimmed, 230, y + 34);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 24px Segoe UI';
      ctx.fillText(`${film.year}  |  ★ ${film.yourRating}`, 230, y + 74);
    }

    ctx.fillStyle = '#93c5fd';
    ctx.font = '500 22px Segoe UI';
    ctx.fillText('Generated with Flickd', 72, canvas.height - 48);

    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png', 0.95));
  };

  const downloadFavoriteYearShareCard = async () => {
    if (favoriteYearShareBusy) return;
    setFavoriteYearShareBusy(true);
    try {
      const blob = await buildFavoriteYearShareCardBlob();
      if (!blob) {
        alert('Could not create share card image.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `flickd-favorites-${favoriteShareYear || 'year'}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setFavoriteYearShareBusy(false);
    }
  };

  const shareFavoriteYearCard = async () => {
    if (favoriteYearShareBusy) return;
    setFavoriteYearShareBusy(true);
    try {
      const blob = await buildFavoriteYearShareCardBlob();
      const year = favoriteShareYear || 'Selected Year';
      const text = `My top films of ${year} on Flickd`;
      if (!blob) {
        if (navigator.share) await navigator.share({ title: `Favorites of ${year}`, text });
        return;
      }
      const file = new File([blob], `flickd-favorites-${year}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ title: `Favorites of ${year}`, text, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: `Favorites of ${year}`, text });
      } else {
        await downloadFavoriteYearShareCard();
      }
    } catch {
      // user cancelled or share unavailable
    } finally {
      setFavoriteYearShareBusy(false);
    }
  };

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

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-gray-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[#111827] border border-gray-800 rounded-2xl px-8 py-9 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <img
            src="/flickd-wordmark.png"
            alt="Flickd"
            className="h-10 w-auto mx-auto mb-6 object-contain"
          />
          <h1 className="text-[32px] leading-none font-semibold tracking-tight text-white">Welcome</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-blue-100/90 max-w-[330px] mx-auto">
            Decode your cinematic taste through powerful, personal film analytics.
          </p>
          <p className="text-sm text-gray-400 mt-6">Sign in with Google to continue.</p>
          <button
            onClick={handleSignIn}
            className="mt-7 w-full px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl transition-colors"
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
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
            <h2 className="text-2xl font-bold text-white">Upload your IMDb ratings sheet</h2>
            <p className="text-sm text-gray-400 mt-2">Please upload your IMDb ratings file from IMDb to view your visualizations.</p>
            <div className="mt-4 rounded-xl border border-gray-700 bg-[#0f172a] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">How to download your IMDb export</p>
              <ol className="mt-2 space-y-1.5 text-sm text-gray-300 list-decimal list-inside">
                <li>Open IMDb and go to <span className="text-gray-100 font-medium">Your Ratings</span>.</li>
                <li>In your rating history page, look at the <span className="text-gray-100 font-medium">top-right corner</span>.</li>
                <li>Click <span className="text-gray-100 font-medium">Export</span> to download the ratings file.</li>
                <li>Upload that exported file here (`.csv`, `.xlsx`, or `.xls`).</li>
              </ol>
            </div>

            <label className="mt-6 flex flex-col items-center justify-center h-36 border border-dashed border-gray-600 rounded-xl cursor-pointer bg-[#0f172a] hover:bg-[#141b28] transition-colors">
              <p className="text-base font-semibold text-gray-100">Drop your IMDb file here</p>
              <p className="mt-1 text-xs text-gray-400">or click to browse .csv .xlsx .xls</p>
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} onClick={(e) => { e.target.value = null; }} />
            </label>

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
      {selectedMovie && !traceSelectedDirector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm" onClick={closeMovieModal}>
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
                        <p className="text-2xl font-bold text-green-400"> {selectedMovie?.yourRating ?? '—'}</p>
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
      )}

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
                          <span>{memberViewName || 'Member'}: {Math.round(axis.theirs)}</span>
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
                            <img
                              src={posters[`${film.title}_${film.year}`]}
                              alt={film.title}
                              className="w-full aspect-[2/3] rounded object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <button
                              onClick={() => fetchPoster(film.title, film.year, film.imdbId)}
                              className="w-full aspect-[2/3] rounded bg-gray-800 text-xs text-gray-400"
                            >
                              Load Poster
                            </button>
                          )}
                          <button onClick={() => handleMovieClick(film)} className="mt-2 text-left w-full text-xs text-blue-300 truncate hover:text-blue-200">{film.title}</button>
                          <div className="text-[11px] text-gray-400 mt-0.5">{film.year}  Avg {film.sharedAvg}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No 8+ overlap yet. Your resonance comes more from style than shared canon.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-700 bg-[#111827] p-5">
                    <h3 className="text-xl font-semibold text-white mb-3">Where You Diverge</h3>
                    <ul className="space-y-2">
                      {(tasteResonance?.differences || []).map((line, i) => (
                        <li key={`diff_${i}`} className="text-sm text-gray-300 leading-relaxed border-l-2 border-fuchsia-500/40 pl-3">{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-[#131b2f] to-[#1a1a33] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-fuchsia-300/80">Cinematic Relationship Type</p>
                    <h3 className="text-2xl font-bold text-white mt-2">{tasteResonance?.relationshipType?.name || 'Parallel Dreamers'}</h3>
                    <p className="text-sm text-blue-100/90 mt-2">{tasteResonance?.relationshipType?.line || ''}</p>
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1 text-xs text-fuchsia-200">
                      Resonance Signature  {(tasteResonance?.score ?? 0) >= 75 ? 'High' : (tasteResonance?.score ?? 0) >= 60 ? 'Layered' : 'Contrasting'}
                    </div>
                  </div>
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
              🎬 You&apos;re now following &quot;{followToast.name}&quot;
            </p>
            <p className="text-xs text-blue-200/90 mt-2 leading-relaxed">
              Their cinematic world has been added to your orbit.
              Explore their taste profile, filmboards, and cinematic trace.
            </p>
          </div>
        </div>
      )}

      {favoriteYearShareOpen && favoriteShareSelection && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#111827] border border-gray-700 rounded-2xl p-4 sm:p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">My Top 10 of {favoriteShareSelection.year}</h3>
                <p className="text-xs text-gray-400 mt-1">Share your year card from Flickd</p>
              </div>
              <button
                type="button"
                onClick={() => setFavoriteYearShareOpen(false)}
                className="h-8 w-8 rounded-lg border border-gray-700 bg-[#0b1220] text-gray-300 hover:bg-[#1f2937]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-700 bg-[#0b1220] p-3">
              <div className="space-y-2">
                {favoriteShareTop10Films.map((film, idx) => {
                  const key = `${film.title}_${film.year}`;
                  return (
                    <div key={`share_year_${film.title}_${film.year}_${idx}`} className="flex items-center gap-3 rounded-lg bg-[#0f172a] border border-gray-800 p-2">
                      {posters[key] ? (
                        <img src={posters[key]} alt={film.title} className="w-10 h-14 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-14 rounded bg-gray-800 flex items-center justify-center text-[10px] text-gray-500">Poster</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-100 truncate">
                          <span className="text-blue-300 mr-1">{idx + 1}.</span>{film.title}
                        </p>
                        <p className="text-[11px] text-gray-400">{film.year} | ★ {film.yourRating}</p>
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
                disabled={favoriteYearShareBusy}
                className="px-3 py-2 rounded-xl border border-gray-700 bg-[#0b1220] text-gray-100 hover:bg-[#1f2937] disabled:opacity-60"
              >
                {favoriteYearShareBusy ? 'Preparing...' : 'Download Card'}
              </button>
              <button
                type="button"
                onClick={shareFavoriteYearCard}
                disabled={favoriteYearShareBusy}
                className="px-3 py-2 rounded-xl border border-blue-500/40 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {favoriteYearShareBusy ? 'Preparing...' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8 py-3 sm:py-6 h-full flex flex-col">
        <div className="md:fixed md:top-0 md:left-1/2 md:-translate-x-1/2 z-50 w-full max-w-7xl px-3 sm:px-5 lg:px-8 pt-2 sm:pt-3 pb-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
            <div className="rounded-2xl border border-gray-700 bg-[#0f172a]/95 px-4 py-3 backdrop-blur w-full">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/flickd-wordmark.png"
                    alt="Flickd"
                    className="h-9 w-auto object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMobileTopNavOpen((prev) => !prev)}
                  className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-700 bg-[#111827] text-gray-200 hover:bg-[#1f2937]"
                  aria-label="Toggle menu"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <div className="hidden md:flex gap-2 overflow-x-auto pb-1 md:overflow-visible md:pb-0 whitespace-nowrap">
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
                    Members
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
                    Settings
                  </button>
                  <button
                    onClick={handleDownloadPdfBook}
                    disabled={isBookExporting}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 text-gray-200 bg-[#111827] hover:bg-[#1f2937] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isBookExporting ? 'Preparing PDF Book...' : 'Download'}
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
                </div>
              </div>
              {mobileTopNavOpen && (
                <div className="md:hidden mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (memberViewUserId) exitMemberDashboard();
                      handleTabChange('overview');
                      setMobileTopNavOpen(false);
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
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
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                      isMembersTopActive
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Members
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleTabChange('following'); setMobileTopNavOpen(false); }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
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
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
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
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                      activeTab === 'settings'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#111827] text-gray-200 border-gray-700 hover:bg-[#1f2937]'
                    }`}
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => { handleDownloadPdfBook(); setMobileTopNavOpen(false); }}
                    disabled={isBookExporting}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-700 text-gray-200 bg-[#111827] hover:bg-[#1f2937] transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-left"
                  >
                    {isBookExporting ? 'Preparing PDF Book...' : 'Download'}
                  </button>
                  {user && (
                    <button
                      type="button"
                      onClick={() => { handleSignOut(); setMobileTopNavOpen(false); }}
                      disabled={signingOut}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-700 text-gray-200 bg-[#111827] hover:bg-[#1f2937] disabled:opacity-60 disabled:cursor-not-allowed text-left"
                    >
                      {signingOut ? 'Signing Out...' : 'Sign Out'}
                    </button>
                  )}
                </div>
              )}
            </div>
        </div>
        <div className="hidden md:block" style={{ height: '96px' }} />

        {(!fetchingCountries && data && stats) ? (

          <>
            {activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' && (
              <div className="hidden lg:block fixed top-[96px] left-1/2 -translate-x-1/2 w-full max-w-7xl px-4 sm:px-6 lg:px-8 z-40 pointer-events-none">
                <div className="grid grid-cols-[320px_1fr] gap-4 items-start">
                  <div style={{ height: '768px' }}>
                    <aside className="bg-[#111827] border border-gray-700 rounded-2xl p-4 pt-6 space-y-4 overflow-hidden flex flex-col h-full pointer-events-auto">
                  <div className="flex flex-col items-center text-center">
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
                    className="w-24 h-24 rounded-2xl border border-gray-600 object-cover"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileAvatarFailed(false);
                      setProfileAvatarBust(Date.now());
                    }}
                    className="w-24 h-24 rounded-2xl border border-gray-600 bg-[#4b5f78] text-gray-100 flex items-center justify-center text-3xl font-semibold uppercase"
                    title="Retry loading avatar"
                  >
                    {String(currentProfileAvatarLabel || 'U').charAt(0)}
                  </button>
                )}
                <h2 className="mt-3 text-lg font-semibold text-gray-100">
                  {memberViewUserId ? (memberViewName || 'Member') : (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Flickd')}
                </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {memberViewUserId ? 'Shared cinematic dashboard' : 'Your cinematic dashboard'}
                  </p>
                  {currentProfileAboutMeCapped && (
                    <div className="mt-3 w-full text-left bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                      <p className="text-xs text-gray-400">About</p>
                      <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                        {currentProfileAboutMeCapped}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Total Films</p>
                  <p className="text-2xl font-semibold text-gray-100 mt-1">{stats.totalFilms}</p>
                </div>
                <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Avg Rating</p>
                  <p className="text-2xl font-semibold text-gray-100 mt-1">{stats.avgYourRating}</p>
                </div>
                <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Favorite Genre</p>
                  <p className="text-2xl font-semibold text-gray-100 mt-1 truncate">{stats.mostRatedGenre}</p>
                </div>
                <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Most Active Era</p>
                  <p className="text-2xl font-semibold text-gray-100 mt-1">
                    {eraPreference.length > 0
                      ? ([...eraPreference].sort((a, b) => b.count - a.count)[0]?.decade ?? 'N/A')
                      : 'N/A'}
                  </p>
                </div>
              </div>
              {(memberViewUserId ? Object.values(memberViewSocials) : Object.values(socialLinks)).some((value) => value) && (
                <div className="flex items-center justify-center gap-2">
                  {(memberViewUserId ? memberViewSocials.instagram : socialLinks.instagram) && (
                    <a
                      href={(memberViewUserId ? memberViewSocials.instagram : socialLinks.instagram)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-200 hover:bg-[#1f2937]"
                    >
                      Instagram
                    </a>
                  )}
                  {(memberViewUserId ? memberViewSocials.x : socialLinks.x) && (
                    <a
                      href={(memberViewUserId ? memberViewSocials.x : socialLinks.x)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-200 hover:bg-[#1f2937]"
                    >
                      X
                    </a>
                  )}
                  {(memberViewUserId ? memberViewSocials.facebook : socialLinks.facebook) && (
                    <a
                      href={(memberViewUserId ? memberViewSocials.facebook : socialLinks.facebook)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 text-gray-200 hover:bg-[#1f2937]"
                    >
                      Facebook
                    </a>
                  )}
                </div>
              )}
              {isViewingOtherMember && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFollowMember(memberViewUserId, memberViewName)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      followedMemberIds.includes(String(memberViewUserId))
                        ? 'bg-emerald-600/15 text-emerald-200 border-emerald-500/40 hover:bg-emerald-600/25'
                        : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700'
                    }`}
                  >
                    {followedMemberIds.includes(String(memberViewUserId)) ? 'Unfollow' : 'Follow'}
                  </button>
                  <button
                    type="button"
                    onClick={openTasteResonance}
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-fuchsia-500/40 text-fuchsia-200 bg-fuchsia-600/10 hover:bg-fuchsia-600/20 transition-colors"
                  >
                    {tasteResonanceLoading ? 'Loading...' : 'Taste Resonance'}
                  </button>
                </div>
              )}
            </aside>
                  </div>
                <div className="flex flex-col gap-2 pointer-events-auto">
                  {memberViewUserId && (
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => { exitMemberDashboard(); handleTabChange('members'); }}
                        className="px-3 py-1.5 bg-[#0b1220] border border-blue-500/30 text-blue-200 text-xs rounded-lg hover:bg-[#101a2d]"
                      >
                        Back
                      </button>
                    </div>
                  )}
                <div className="rounded-2xl border border-gray-800 bg-[#0b0f17]/95 px-2 pt-2 pb-3 backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <nav className="flex flex-wrap gap-2 w-full lg:w-auto">
                          {navItems.map((tab) => (
                            <button
                              key={tab.id}
                              onClick={() => handleTabChange(tab.id)}
                              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                activeTab === tab.id
                                  ? 'bg-blue-600 text-white shadow-md border-blue-500/40 hover:bg-blue-700'
                                  : 'text-gray-300 bg-[#111827] border-gray-700 hover:bg-[#1f2937] hover:border-gray-500 hover:text-gray-100'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                    </nav>
                    {activeTab === 'overview' && null}
                  </div>
                </div>
                </div>
                </div>
              </div>
            )}

          <div className={`mt-2 md:mt-0 grid grid-cols-1 ${(activeTab === 'members' || activeTab === 'settings' || activeTab === 'following' || activeTab === 'followers') ? '' : 'lg:grid-cols-[320px_1fr]'} gap-3 sm:gap-4`}>
            {activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' && (
              <>
                <div className="hidden lg:block w-[320px]" />
                <aside className="lg:hidden bg-[#111827] border border-gray-700 rounded-2xl p-4 pt-5 space-y-4 overflow-hidden flex flex-col h-auto pointer-events-auto">
                  <div className="flex flex-col items-center text-center">
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
                        className="w-24 h-24 rounded-2xl border border-gray-600 object-cover"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileAvatarFailed(false);
                          setProfileAvatarBust(Date.now());
                        }}
                        className="w-24 h-24 rounded-2xl border border-gray-600 bg-[#4b5f78] text-gray-100 flex items-center justify-center text-3xl font-semibold uppercase"
                        title="Retry loading avatar"
                      >
                        {String(currentProfileAvatarLabel || 'U').charAt(0)}
                      </button>
                    )}
                    <h2 className="mt-3 text-lg font-semibold text-gray-100">
                      {memberViewUserId ? (memberViewName || 'Member') : (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Flickd')}
                    </h2>
                      <p className="text-sm text-gray-400 mt-1">
                        {memberViewUserId ? 'Shared cinematic dashboard' : 'Your cinematic dashboard'}
                      </p>
                      {currentProfileAboutMeCapped && (
                        <div className="mt-3 w-full text-left bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                          <p className="text-xs text-gray-400">About</p>
                          <p className="mt-1 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                            {currentProfileAboutMeCapped}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                    <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                      <p className="text-xs text-gray-400">Total Films</p>
                      <p className="text-2xl font-semibold text-gray-100 mt-1">{stats.totalFilms}</p>
                    </div>
                    <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                      <p className="text-xs text-gray-400">Avg Rating</p>
                      <p className="text-2xl font-semibold text-gray-100 mt-1">{stats.avgYourRating}</p>
                    </div>
                    <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                      <p className="text-xs text-gray-400">Favorite Genre</p>
                      <p className="text-2xl font-semibold text-gray-100 mt-1 truncate">{stats.mostRatedGenre}</p>
                    </div>
                    <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                      <p className="text-xs text-gray-400">Most Active Era</p>
                      <p className="text-2xl font-semibold text-gray-100 mt-1">
                        {eraPreference.length > 0
                          ? ([...eraPreference].sort((a, b) => b.count - a.count)[0]?.decade ?? 'N/A')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {isViewingOtherMember && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFollowMember(memberViewUserId, memberViewName)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          followedMemberIds.includes(String(memberViewUserId))
                            ? 'bg-emerald-600/15 text-emerald-200 border-emerald-500/40 hover:bg-emerald-600/25'
                            : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700'
                        }`}
                      >
                        {followedMemberIds.includes(String(memberViewUserId)) ? 'Unfollow' : 'Follow'}
                      </button>
                      <button
                        type="button"
                        onClick={openTasteResonance}
                        className="px-3 py-2 rounded-lg text-sm font-medium border border-fuchsia-500/40 text-fuchsia-200 bg-fuchsia-600/10 hover:bg-fuchsia-600/20 transition-colors"
                      >
                        {tasteResonanceLoading ? 'Loading...' : 'Taste Resonance'}
                      </button>
                    </div>
                  )}
                </aside>
              </>
            )}

            <div ref={mainContentRef} className={`min-w-0 flex flex-col ${activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' ? 'lg:pt-[48px]' : ''}`}>
              {activeTab !== 'members' && activeTab !== 'settings' && activeTab !== 'following' && activeTab !== 'followers' && (
                <>
                  <div className="h-[64px] lg:hidden" />
                  <div className="lg:hidden rounded-2xl border border-gray-800 bg-[#0b0f17]/95 px-2 pt-2 pb-2 backdrop-blur">
                    <div className="flex items-center justify-between gap-2">
                      <nav className="flex gap-2 w-full overflow-x-auto pb-1 whitespace-nowrap">
                        {navItems.map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all shrink-0 ${
                              activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-md border-blue-500/40 hover:bg-blue-700'
                                : 'text-gray-300 bg-[#111827] border-gray-700 hover:bg-[#1f2937] hover:border-gray-500 hover:text-gray-100'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </nav>
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-4 sm:space-y-5 pb-6 pt-3 sm:pt-2">
              {activeTab === 'overview' && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 h-full flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-lg font-semibold">Rating Distribution</h2>
                      </div>
                      <div className="flex-1 min-h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={ratingDist}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2f3643" />
                            <XAxis dataKey="rating" stroke="#6b7280" tick={{fontSize: 12}} />
                            <YAxis stroke="#6b7280" tick={{fontSize: 12}} />
                            <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px' }} labelStyle={{ color: '#f3f4f6' }} />
                            <Bar dataKey="count" fill={ACCENT_COLOR} radius={[4, 4, 0, 0]}>
                              {ratingDist.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {mostWatchedGenres.genres.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                          <h2 className="text-lg font-semibold">Most Watched Genres</h2>
                        </div>
                        <div className="mb-4 text-sm text-gray-300">
                          Total: <span className="text-blue-400 font-bold">{mostWatchedGenres.totalGenres}</span>
                          {mostWatchedGenres.topGenre && (
                            <span className="ml-3 text-blue-200">
                              {mostWatchedGenres.topGenre.count} {mostWatchedGenres.topGenre.genre} ({mostWatchedGenres.topGenre.percentage}%)
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-h-[340px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mostWatchedGenres.genres} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="#2f3643" />
                              <XAxis type="number" stroke="#6b7280" tick={{fontSize: 11}} />
                              <YAxis type="category" dataKey="genre" width={120} stroke="#6b7280" tick={{fontSize: 11}} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(v, name, props) => [`${v} films (${props.payload.percentage}%)`, 'Count']}
                              />
                              <Bar dataKey="count" fill={ACCENT_COLOR} radius={[0, 6, 6, 0]}>
                                {mostWatchedGenres.genres.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>

                  {yearlyHighlight.length > 0 && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-lg font-semibold">Yearly Rating Activity</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={320}>
                        <BarChart data={yearlyHighlight}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2f3643" />
                          <XAxis dataKey="year" stroke="#6b7280" interval="preserveStartEnd" tick={{fontSize: 11}} />
                          <YAxis stroke="#6b7280" tick={{fontSize: 11}} />
                          <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px' }} labelStyle={{ color: '#f3f4f6' }} />
                          <Bar dataKey="filmCount" fill={ACCENT_COLOR} radius={[4, 4, 0, 0]}>
                            {yearlyHighlight.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {genreAffinity.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                          <h2 className="text-lg font-semibold">Genre Affinity</h2>
                        </div>
                        <div className="flex-1 min-h-[340px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={genreAffinity} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="#2f3643" />
                              <XAxis type="number" domain={[0, 10]} stroke="#6b7280" tick={{fontSize: 11}} />
                              <YAxis type="category" dataKey="genre" width={120} stroke="#6b7280" tick={{fontSize: 11}} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px' }}
                                labelStyle={{ color: '#f3f4f6' }}
                                formatter={(value, name, props) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [`${value} avg (${count} films)`, 'Avg Rating'];
                                }}
                              />
                              <Bar dataKey="avgRating" fill={ACCENT_COLOR} radius={[0, 6, 6, 0]}>
                                {genreAffinity.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {eraPreference.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 h-full flex flex-col">
                        <div className="flex items-center gap-2 mb-4">
                          <h2 className="text-lg font-semibold">Era Preference</h2>
                        </div>
                        <div className="flex-1 min-h-[340px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={eraPreference}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#2f3643" />
                              <XAxis dataKey="decade" stroke="#6b7280" tick={{fontSize: 11}} />
                              <YAxis domain={[eraChartMin, 10]} stroke="#6b7280" tick={{fontSize: 11}} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px' }}
                                labelStyle={{ color: '#f3f4f6' }}
                                formatter={(value, name, props) => {
                                  const count = props?.payload?.count ?? 0;
                                  return [`${value} avg (${count} films)`, 'Avg Rating'];
                                }}
                              />
                              <Bar dataKey="avgRating" fill={ACCENT_COLOR} radius={[4, 4, 0, 0]}>
                                {eraPreference.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                    {consistentlyLovedDirectors.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 lg:col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                          <h2 className="text-lg font-semibold">Most Consistently Loved Directors</h2>
                        </div>
                        <ResponsiveContainer width="100%" height={380}>
                          <BarChart data={consistentlyLovedDirectors} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#2f3643" />
                            <XAxis type="number" stroke="#6b7280" tick={{fontSize: 11}} />
                            <YAxis type="category" dataKey="director" width={140} stroke="#6b7280" tick={{fontSize: 11}} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px' }}
                              labelStyle={{ color: '#f3f4f6' }}
                              formatter={(value, name, props) => {
                                const payload = props?.payload || {};
                                const moviesRated = payload.highRatedCount ?? value ?? 0;
                                const totalFilms = payload.totalFilms ?? 0;
                                return [`${moviesRated} (of ${totalFilms})`, 'Movies rated 8+'];
                              }}
                            />
                            <Bar dataKey="highRatedCount" fill={ACCENT_COLOR} radius={[0, 6, 6, 0]}>
                              {consistentlyLovedDirectors.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % 5]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div
                      ref={mapFullscreenRef}
                      className={`bg-[#111827] border border-gray-800 rounded-xl p-4 lg:col-span-2 ${mapFullscreen ? 'h-screen overflow-auto' : ''}`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">Global Cinema Preference Map</h2>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Films grouped by country of origin from your ratings data.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={countryRatingThreshold}
                              onChange={(e) => setCountryRatingThreshold(Number(e.target.value))}
                              className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 transition-colors hover:bg-[#111827] hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            >
                              <option value={8}>My Top-Rated Films (8+)</option>
                              <option value={0}>All My Films</option>
                            </select>
                            {null}
                            <button type="button" onClick={() => zoomMap(-0.2)} className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 transition-colors hover:bg-[#1f2937] hover:border-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40">-</button>
                            <button type="button" onClick={() => zoomMap(0.2)} className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 transition-colors hover:bg-[#1f2937] hover:border-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40">+</button>
                            <button type="button" onClick={resetMapView} className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 transition-colors hover:bg-[#1f2937] hover:border-gray-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40">Reset</button>
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

                      <div className="rounded-lg border border-gray-800 bg-[#0b1220] p-2 relative">
                        
                          {mapFeatures.length > 0 && mapPathGenerator ? (
                            <svg
                              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                                className={`w-full ${mapFullscreen ? 'h-[82vh]' : 'h-[580px]'} ${isMapDragging ? "cursor-grabbing" : ""}`}
                              onMouseDown={handleMapMouseDown}
                              onMouseMove={handleMapMouseMove}
                              onMouseUp={stopMapDragging}
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
                                  const count = countryPreferenceLookup[normalizedName] || 0;
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
                </>
              )}
{activeTab === 'allwatched' && (
                <div className="space-y-4">
                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <h2 className="text-lg font-semibold text-white">All Watched Films</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={watchedSearchQuery}
                          onChange={(e) => setWatchedSearchQuery(e.target.value)}
                          placeholder="Search title..."
                          className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2.5 py-1.5 w-40 sm:w-52"
                        />
                        <select
                          value={watchedDecadeFilter}
                          onChange={(e) => { setWatchedDecadeFilter(e.target.value); setWatchedYearFilter('all'); }}
                          className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5"
                        >
                          <option value="all">All Decades</option>
                          {watchedDecades.map((decade) => (
                            <option key={decade} value={decade}>{decade}s</option>
                          ))}
                        </select>
                        <select
                          value={watchedYearFilter}
                          onChange={(e) => setWatchedYearFilter(e.target.value)}
                          className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5"
                        >
                          <option value="all">All Years</option>
                          {watchedYearOptions.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                        <select
                          value={watchedRatingFilter}
                          onChange={(e) => setWatchedRatingFilter(e.target.value)}
                          className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5"
                        >
                          <option value="all">All Ratings</option>
                          <option value="9plus">Rating 9+</option>
                          <option value="8plus">Rating 8+</option>
                          <option value="7plus">Rating 7+</option>
                          <option value="6plus">Rating 6+</option>
                          <option value="below6">Rating Below 6</option>
                        </select>
                        <select
                          value={watchedGenreFilter}
                          onChange={(e) => setWatchedGenreFilter(e.target.value)}
                          className="bg-[#0b1220] border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5"
                        >
                          <option value="all">All Genres</option>
                          {watchedGenres.map((genre) => (
                            <option key={genre} value={genre}>{genre}</option>
                          ))}
                        </select>
                      </div>
                    </div>
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
                              <img
                                src={posters[`${movie.title}_${movie.year}`]}
                                alt={movie.title}
                                className="w-full aspect-[2/3] object-cover rounded"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <button
                                onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                title="Load poster"
                              >
                                Load Poster
                              </button>
                            )}
                            <button
                              onClick={() => handleMovieClick(movie)}
                              className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                            >
                              {movie.title}
                            </button>
                            <div className="text-[11px] text-gray-400 mt-0.5">{movie.year} {"\u2605"} {movie.yourRating}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 py-6 text-center">No films match the selected filters.</div>
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
                    className={`bg-[#111827] border border-gray-800 rounded-xl p-4 ${traceFullscreen ? 'h-screen overflow-auto' : ''}`}
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
                             <span className="text-gray-400">Films Logged:</span> {directorFingerprintData.totalFilms}
                             <span className="text-gray-500"> {' | '} </span>
                             <span className="text-gray-400">Time Span:</span> {directorFingerprintData.spanStart} to {directorFingerprintData.spanEnd}
                           </div>
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
                             <div className="text-white font-semibold text-sm mt-1 truncate">{directorFingerprintData.topDirectors.slice(0, 2).join(' + ')}</div>
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

                         <div className="rounded-lg border border-gray-800 bg-[#0b1220] p-3 overflow-hidden relative">
                         <svg
                              ref={traceSvgRef}
                              viewBox={'0 0 ' + directorFingerprintData.size + ' ' + directorFingerprintData.size}
                              className={`w-full h-auto ${traceFullscreen ? 'max-h-[86vh]' : 'max-h-[840px]'}`}
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
                             <rect width="100%" height="100%" fill="#0d152c" />

                             {/* Title inside the visualization (not zoomed) */}
                             <rect x="0" y="0" width="100%" height="160" fill="#0d152c" />
                             <text
                               x={directorFingerprintData.cx}
                               y={78}
                               textAnchor="middle"
                               fill="#f8fafc"
                               style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 800, fontSize: 44, letterSpacing: '0.6px' }}
                             >
                               {directorFingerprintData.title}
                             </text>
                             <text
                               x={directorFingerprintData.cx}
                               y={118}
                               textAnchor="middle"
                               fill="#93c5fd"
                               style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontWeight: 500, fontSize: 18 }}
                             >
                               {directorFingerprintData.subtitle}
                             </text>

                            <g clipPath="url(#traceClip)">
                              <g transform={'translate(' + (directorFingerprintData.cx * (1 - traceZoom)) + ' ' + (directorFingerprintData.cy * (1 - traceZoom)) + ') scale(' + traceZoom + ')'}>
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
                                        <div className="text-white font-semibold text-lg">{traceSelectedDirector.name}</div>
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
                                              <img
                                                src={posters[`${film.title}_${film.year}`]}
                                                alt={film.title}
                                                className="w-full aspect-[2/3] object-cover rounded"
                                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => fetchPoster(film.title, film.year, film.imdbId || null)}
                                                className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                              >
                                                Load Poster
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
                                              className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                            >
                                              {film.title}
                                            </button>
                                            <div className="text-[11px] text-gray-400 mt-0.5">
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
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {[0, 1, 2].map((s) => (
                              <div key={`members_skeleton_${s}`} className="bg-[#0b1220] border border-gray-700 rounded-xl p-3 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-700/70" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3 w-28 bg-gray-700/70 rounded" />
                                    <div className="h-2.5 w-40 bg-gray-800 rounded" />
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
                      Page {membersPage + 1}  •  Showing up to 30 members
                    </p>
                    <div className="flex items-center gap-2">
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
                      placeholder="Search members by name or email..."
                      className="w-full bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredMembersDirectory.map((member) => (
                      <div key={member.id} className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm text-blue-200">
                              {String(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                            <div className="text-[11px] text-gray-400 truncate">{member.email || 'Member'}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Films</div>
                            <div className="text-sm font-semibold text-white">{member.snapshot?.stats?.totalFilms || 0}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Avg</div>
                            <div className="text-sm font-semibold text-white">{Number(member.snapshot?.stats?.avgYourRating || 0).toFixed(1)}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Genre</div>
                            <div className="text-xs font-semibold text-white truncate">{member.snapshot?.stats?.mostRatedGenre || 'N/A'}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openMemberDashboard(member)}
                          className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                        >
                          View Full Dashboard
                        </button>
                      </div>
                    ))}
                  </div>

                  {!membersLoading && filteredMembersDirectory.length === 0 && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-400">
                      No members found.
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
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {[0, 1, 2].map((s) => (
                              <div key={`following_skeleton_${s}`} className="bg-[#0b1220] border border-gray-700 rounded-xl p-3 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-700/70" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3 w-28 bg-gray-700/70 rounded" />
                                    <div className="h-2.5 w-40 bg-gray-800 rounded" />
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
                      placeholder="Search following by name or email..."
                      className="w-full bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredFollowedMembersList.map((member) => (
                      <div key={member.id} className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm text-blue-200">
                              {String(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                            <div className="text-[11px] text-gray-400 truncate">{member.email || 'Member'}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Films</div>
                            <div className="text-sm font-semibold text-white">{member.snapshot?.stats?.totalFilms || 0}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Avg</div>
                            <div className="text-sm font-semibold text-white">{Number(member.snapshot?.stats?.avgYourRating || 0).toFixed(1)}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Genre</div>
                            <div className="text-xs font-semibold text-white truncate">{member.snapshot?.stats?.mostRatedGenre || 'N/A'}</div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openMemberDashboard(member)}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                          >
                            View Full Dashboard
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFollowMember(member.userId, member.name)}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-700 text-gray-200 hover:bg-[#1f2937]"
                          >
                            Unfollow
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!membersLoading && filteredFollowedMembersList.length === 0 && (
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-400">
                      No matching following members.
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
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {[0, 1, 2].map((s) => (
                              <div key={`followers_skeleton_${s}`} className="bg-[#0b1220] border border-gray-700 rounded-xl p-3 animate-pulse">
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="w-10 h-10 rounded-full bg-gray-700/70" />
                                  <div className="flex-1 space-y-2">
                                    <div className="h-3 w-28 bg-gray-700/70 rounded" />
                                    <div className="h-2.5 w-40 bg-gray-800 rounded" />
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
                      placeholder="Search followers by name or email..."
                      className="w-full bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredFollowersMembersList.map((member) => {
                      const isNewFollower = newFollowersList.some((item) => String(item.userId) === String(member.userId));
                      return (
                      <div
                        key={member.id}
                        className={`relative bg-[#111827] border rounded-xl p-4 overflow-hidden ${isNewFollower ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]' : 'border-gray-800'}`}
                      >
                        {isNewFollower && (
                          <>
                            <div className="absolute top-3 right-3 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              New
                            </div>
                            <div className="mb-3 text-[10px] uppercase tracking-wide text-emerald-300 font-semibold">
                              New follower
                            </div>
                          </>
                        )}
                        <div className="flex items-center gap-3 mb-3">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sm text-blue-200">
                              {String(member.name || 'M').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate">{member.name}</div>
                            <div className="text-[11px] text-gray-400 truncate">{member.email || 'Member'}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Films</div>
                            <div className="text-sm font-semibold text-white">{member.snapshot?.stats?.totalFilms || 0}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Avg</div>
                            <div className="text-sm font-semibold text-white">{Number(member.snapshot?.stats?.avgYourRating || 0).toFixed(1)}</div>
                          </div>
                          <div className="bg-[#0b1220] border border-gray-700 rounded-lg p-2">
                            <div className="text-[10px] text-gray-400">Genre</div>
                            <div className="text-xs font-semibold text-white truncate">{member.snapshot?.stats?.mostRatedGenre || 'N/A'}</div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openMemberDashboard(member)}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                          >
                            View Full Dashboard
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
                      No matching followers.
                    </div>
                  )}
                  </div>
                )}
                {activeTab === 'tastetimeline' && (
                  <div
                    ref={tasteTimelineFullscreenRef}
                    className={`space-y-5 ${timelineFullscreen ? 'bg-[#030712] p-4 h-screen overflow-auto' : ''}`}
                  >
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-white">Cinematic Timeline Map</h2>
                          <p className="text-xs text-gray-400 mt-1">
                            A horizontal year map of your films from Arthouse to Mainstream storytelling.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => zoomTimeline(-0.1)}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                            title="Zoom out"
                            aria-label="Zoom out"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => zoomTimeline(0.1)}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                            title="Zoom in"
                            aria-label="Zoom in"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={resetTimelineZoom}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                            title="Reset zoom"
                            aria-label="Reset zoom"
                          >
                            Reset
                          </button>
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

                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-3">
                      <div className="relative">
                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 w-16 rounded-l-xl border-r border-gray-800/70 bg-[#050811]/90">
                          <span className="absolute top-4 left-2 text-[10px] text-gray-400 tracking-wide uppercase">Mainstream</span>
                          <span className="absolute top-1/2 left-2 -translate-y-1/2 text-[10px] text-gray-400 tracking-wide uppercase">Hybrid</span>
                          <span className="absolute bottom-6 left-2 text-[10px] text-gray-400 tracking-wide uppercase">Arthouse</span>
                        </div>
                          <div
                            ref={tasteTimelineRef}
                            className="cinematic-rail flex gap-0 overflow-x-auto scroll-smooth rounded-xl border border-gray-800 bg-[#050811]"
                            style={{ overscrollBehavior: 'contain', cursor: timelineDragging ? 'grabbing' : 'grab' }}
                            onWheelCapture={onTimelineWheelCapture}
                            onScroll={onTimelineRailScroll}
                            onMouseDown={onTimelineMouseDown}
                          onMouseMove={onTimelineMouseMove}
                          onMouseUp={stopTimelineDrag}
                          onMouseLeave={() => {
                            stopTimelineDrag();
                            setTimelineHoverKey(null);
                          }}
                        >
                            {timelineDecadePanels.map((panel) => (
                            <section
                              key={`timeline-decade-${panel.decade}`}
                              className="min-w-[95vw] lg:min-w-[980px] xl:min-w-[1080px] px-3"
                            >
                                <div className={`relative overflow-hidden ${timelineFullscreen ? 'h-[78vh]' : 'h-[520px]'}`}>
                                  <div className="absolute left-20 right-6 top-2 z-20 flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-white">{panel.decade}s</h3>
                                    <span className="text-[11px] text-gray-400">{panel.films.length} films</span>
                                  </div>
                                  <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 border-t border-dashed border-gray-700/80" />
                                  <div className="absolute left-20 right-6 bottom-2 flex justify-between text-[10px] text-gray-500">
                                    {Array.from({ length: 10 }).map((_, idx) => (
                                      <span key={`${panel.decade}-year-${idx}`}>{panel.decade + idx}</span>
                                    ))}
                                  </div>
                              {panel.films.map((movie) => {
                                const posterKey = `${movie.title}_${movie.year}`;
                                const hoverKey = `${movie.title}_${movie.year}`;
                                const isHovered = timelineHoverKey === hoverKey;
                                const isRelated = timelineRelated.has(hoverKey);
                                const faded = timelineHoverKey && !isHovered && !isRelated;
                                return (
                                  <button
                                    key={movie.key}
                                    type="button"
                                    onClick={() => handleMovieClick(movie)}
                                    onMouseEnter={() => setTimelineHoverKey(hoverKey)}
                                    onMouseLeave={() => setTimelineHoverKey(null)}
                                    className={`absolute transition-all duration-150 ${isHovered ? 'z-20 scale-[1.08]' : 'z-10'} ${faded ? 'opacity-60' : 'opacity-100'}`}
                                      style={{
                                        left: `calc(14% + ${movie.localX * 0.8 * timelineZoom}%)`,
                                        top: `calc(${movie.y}% - 46px)`,
                                        width: `${Math.max(44, Math.round(56 * timelineZoom))}px`,
                                        boxShadow: isHovered ? '0 8px 20px rgba(37,99,235,.32)' : 'none',
                                    }}
                                  >
                                    {posters[posterKey] ? (
                                      <img
                                        src={posters[posterKey]}
                                        alt={movie.title}
                                        loading="lazy"
                                        className="w-full object-cover rounded-md border border-gray-700"
                                        style={{ height: `${Math.max(68, Math.round(86 * timelineZoom))}px` }}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <div
                                        className="w-full rounded-md border border-gray-700 bg-[#1f2937] text-[9px] text-gray-500 flex items-center justify-center"
                                        style={{ height: `${Math.max(68, Math.round(86 * timelineZoom))}px` }}
                                      >
                                        Poster
                                      </div>
                                    )}
                                    <div className={`mt-1 text-left ${isHovered ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}>
                                      <p className="text-[11px] text-white truncate">{movie.title}</p>
                                      <p className="text-[10px] text-blue-300">{movie.year}</p>
                                      <p className="text-[10px] text-gray-300">{movie.timelineCategory}</p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'personality' && personality && (
                  <div className="space-y-6">

                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-lg font-semibold text-white">Your Cinematic Identity</h3>
                    </div>

                    <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">{personality.archetype}</h2>
                    <p className="text-gray-300 mt-3 text-base leading-relaxed max-w-4xl">
                      {personality.description}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-4">
                      {personality.traits.map((trait, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#0b1220] border border-gray-700 text-gray-200"
                        >
                          {trait}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
                      <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">Top Genre</div>
                        <div className="text-white font-semibold text-sm mt-1 truncate">{personality.topGenres[0]}</div>
                      </div>
                      <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">Era</div>
                        <div className="text-white font-semibold text-sm mt-1">{personality.mostWatchedDecade}s</div>
                      </div>
                      <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">Avg Runtime</div>
                        <div className="text-white font-semibold text-sm mt-1">{personality.avgRuntime} min</div>
                      </div>
                      <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">Niche</div>
                        <div className="text-white font-semibold text-sm mt-1">{personality.nichePercentage}%</div>
                      </div>
                      <div className="bg-[#0b1220] border border-gray-800 rounded-lg p-3 col-span-2 sm:col-span-1">
                        <div className="text-gray-400 text-xs">Your Avg</div>
                        <div className="text-white font-semibold text-sm mt-1">{"\u2605"} {personality.avgRating}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'personality' && patterns && (
                <div className="mt-6">

                  {/* Pattern Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Exploration Score */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 hover:-translate-y-1 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">Exploration</div>
                          <div className="text-gray-400 text-xs">New directors discovered</div>
                        </div>
                        <div className="text-2xl font-bold text-purple-400">{patterns.explorationScore}%</div>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
                          style={{ width: `${patterns.explorationScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Loyalty Score */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 hover:-translate-y-1 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">Loyalty</div>
                          <div className="text-gray-400 text-xs">Repeat director visits</div>
                        </div>
                        <div className="text-2xl font-bold text-blue-400">{patterns.loyaltyScore}%</div>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all duration-1000"
                          style={{ width: `${patterns.loyaltyScore}%` }}
                        />
                      </div>
                    </div>

                    {/* Era Bias */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 hover:-translate-y-1 hover:border-yellow-500/30 hover:shadow-lg hover:shadow-yellow-500/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">Era Bias</div>
                          <div className="text-gray-400 text-xs">Most watched decade</div>
                        </div>
                        <div className="text-2xl font-bold text-yellow-400">{patterns.dominantDecade}s</div>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all duration-1000"
                          style={{ width: `${patterns.eraPercentage}%` }}
                        />
                      </div>
                      <div className="text-right text-xs text-gray-400 mt-1">{patterns.eraPercentage}% of your library</div>
                    </div>

                    {/* Genre Breadth */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 hover:-translate-y-1 hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">Genre Breadth</div>
                          <div className="text-gray-400 text-xs">Distinct genres explored</div>
                        </div>
                        <div className="text-2xl font-bold text-green-400">{patterns.genreBreadth}</div>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min(100, (patterns.genreBreadth / 30) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Rating Consistency */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 hover:-translate-y-1 hover:border-red-500/30 hover:shadow-lg hover:shadow-red-500/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">Rating Consistency</div>
                          <div className="text-gray-400 text-xs">How steady your ratings are</div>
                        </div>
                        <div className="text-2xl font-bold text-red-400">{patterns.ratingConsistency}</div>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all duration-1000"
                          style={{ width: `${patterns.ratingConsistency}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">Std dev: {patterns.ratingStdDev}</div>
                    </div>

                    {/* Mainstream vs Niche */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4 hover:-translate-y-1 hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">Niche Score</div>
                          <div className="text-gray-400 text-xs">Films with &lt;50k votes</div>
                        </div>
                        <div className="text-2xl font-bold text-indigo-400">{patterns.nicheScore}%</div>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000"
                          style={{ width: `${patterns.nicheScore}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{patterns.mainstreamCount} mainstream  {data?.length - patterns.mainstreamCount} niche</div>
                    </div>
                  </div>
                </div>
              )}

              {/* CINEMATIC TASTE CARD */}
              {/* CINEMATIC TASTE CARD */}
              {activeTab === 'personality' && data && data.length > 0 && (() => {
                const spectrums = calculateSpectrums(data);
                const popularity = calculatePopularityBuckets(data);
                const decades = calculateDecadeDistribution(data);
                const runtime = calculateRuntimeDistribution(data);
                
  return (
                  <div className="space-y-6 mt-8">
                    {/* SECTION 1: Taste Sliders */}
                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      <h3 className="text-lg font-semibold text-white mb-6">Taste Spectrum</h3>
                      <div className="space-y-4">
                        {spectrums?.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-4" style={{ animationDelay: `${idx * 0.05}s` }}>
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
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* SECTIONS 2-4: Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* By Popularity */}
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <h4 className="text-base font-semibold text-white mb-4">By Popularity</h4>
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
                      </div>

                      {/* By Decade */}
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <h4 className="text-base font-semibold text-white mb-4">By Era</h4>
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
                      </div>

                      {/* By Runtime */}
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <h4 className="text-base font-semibold text-white mb-4">By Runtime</h4>
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
                      </div>
                    </div>
                  </div>
                );
              })()}
              {activeTab === 'personality' && cinemaMindProfile && (
                <div className="space-y-6 mt-8">
                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                      <h3 className="text-lg font-semibold text-white">Cinema Mind Profile</h3>
                      <p className="text-sm text-gray-400 mt-1">
                        Calculated from your movie ratings, preferred genres, and the storytelling styles of the films you like.
                      </p>

                    <div className="mt-5">
                      <h4 className="text-base font-semibold text-white mb-4">Cinema Mind</h4>
                      <div className="h-[460px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={cinemaMindProfile.archetypes} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={130}
                              tick={{ fill: '#d1d5db', fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '10px' }}
                              labelStyle={{ color: '#e5e7eb' }}
                              itemStyle={{ color: '#93c5fd' }}
                              formatter={(value) => [`${value}%`, 'Affinity']}
                            />
                            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
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
                  </div>
                </div>
              )}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <h2 className="text-lg font-semibold">Settings</h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRetrySupabaseConnection}
                          disabled={supabasePinging}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937] disabled:opacity-60"
                        >
                          {supabasePinging ? 'Checking...' : 'Retry connection'}
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">
                      Manage your social profiles and update your IMDb spreadsheet. Changes save to your profile and refresh the dashboard.
                    </p>
                  </div>

                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-base font-semibold text-white">Social Links</h3>
                          <p className="text-xs text-gray-400">Add your social profiles to show on your profile card.</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveSocialLinks}
                        disabled={savingSocialLinks || (
                          socialLinksDraft.instagram === socialLinks.instagram
                          && socialLinksDraft.x === socialLinks.x
                          && socialLinksDraft.facebook === socialLinks.facebook
                        )}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingSocialLinks ? 'Saving...' : 'Save Links'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                        <label className="text-xs text-gray-400">Instagram Link</label>
                        <input
                          type="url"
                          value={socialLinksDraft.instagram}
                          onChange={(e) => setSocialLinksDraft((prev) => ({ ...prev, instagram: e.target.value }))}
                          placeholder="https://instagram.com/username"
                          className="mt-2 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                        <label className="text-xs text-gray-400">X (Twitter) Link</label>
                        <input
                          type="url"
                          value={socialLinksDraft.x}
                          onChange={(e) => setSocialLinksDraft((prev) => ({ ...prev, x: e.target.value }))}
                          placeholder="https://x.com/username"
                          className="mt-2 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                        <label className="text-xs text-gray-400">Facebook Link</label>
                        <input
                          type="url"
                          value={socialLinksDraft.facebook}
                          onChange={(e) => setSocialLinksDraft((prev) => ({ ...prev, facebook: e.target.value }))}
                          placeholder="https://facebook.com/username"
                          className="mt-2 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                      </div>
                    </div>

                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <h3 className="text-base font-semibold text-white">About Me</h3>
                          <p className="text-xs text-gray-400">A short bio shown on your profile card.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveAboutMe}
                          disabled={savingAboutMe || aboutMeDraft.trim() === aboutMe.trim()}
                          className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {savingAboutMe ? 'Saving...' : 'Save Bio'}
                        </button>
                      </div>
                      <div className="bg-[#0b1220] border border-gray-700 rounded-xl p-3">
                        <label className="text-xs text-gray-400">About me</label>
                        <textarea
                          value={aboutMeDraft}
                          onChange={(e) => setAboutMeDraft(String(e.target.value || '').slice(0, 250))}
                          placeholder="Write a few lines about your cinema taste..."
                          rows={4}
                          maxLength={250}
                          className="mt-2 w-full bg-[#0b1220] border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                        />
                        <div className="mt-2 text-[11px] text-gray-500 flex items-center justify-between">
                          <span>Tip: keep it short. Line breaks are supported.</span>
                          <span>{String(aboutMeDraft || '').length}/250</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#111827] border border-gray-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-base font-semibold text-white">IMDb Spreadsheet</h3>
                      </div>
                    <p className="text-sm text-gray-400">
                      Replace your IMDb spreadsheet anytime from the section below. Your charts refresh automatically after upload.
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="flex flex-col items-center justify-center h-28 border border-dashed border-gray-600 rounded-xl cursor-pointer bg-[#0f172a] hover:bg-[#141b28] transition-colors group">
                        <p className="text-base font-semibold text-gray-100">Drop your IMDb file here</p>
                        <p className="mt-1 text-xs text-gray-400">or click to browse .csv .xlsx .xls</p>
                        <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} onClick={(e) => { e.target.value = null; }} />
                      </label>

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
                      <div className="bg-[#111827] border border-gray-700 rounded-xl p-5 w-full max-w-5xl max-h-[82vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-4">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 mb-3">
                          <input
                            type="text"
                            value={moodboardFilmSearch}
                            onChange={(e) => setMoodboardFilmSearch(e.target.value)}
                            placeholder="Search by title..."
                            className="sm:col-span-2 lg:col-span-2 w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                          <select
                            value={moodboardGenreFilter}
                            onChange={(e) => setMoodboardGenreFilter(e.target.value)}
                            className="w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="all">All genres</option>
                            {moodboardGenreOptions.map((genre) => (
                              <option key={genre} value={genre}>
                                {genre}
                              </option>
                            ))}
                          </select>
                          <select
                            value={moodboardDecadeFilter}
                            onChange={(e) => setMoodboardDecadeFilter(e.target.value)}
                            className="w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="all">All decades</option>
                            {moodboardDecadeOptions.map((decade) => (
                              <option key={decade} value={decade}>
                                {decade}
                              </option>
                            ))}
                          </select>
                          <select
                            value={moodboardYearFilter}
                            onChange={(e) => setMoodboardYearFilter(e.target.value)}
                            className="w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="all">All years</option>
                            {moodboardYearOptions.map((year) => (
                              <option key={year} value={String(year)}>
                                {year}
                              </option>
                              ))}
                            </select>
                          <select
                            value={moodboardCountryFilter}
                            onChange={(e) => setMoodboardCountryFilter(e.target.value)}
                            className="w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="all">All countries</option>
                            {moodboardCountryOptions.map((country) => (
                              <option key={country} value={country}>
                                {country}
                              </option>
                            ))}
                          </select>
                          <select
                            value={moodboardMinRatingFilter}
                            onChange={(e) => setMoodboardMinRatingFilter(e.target.value)}
                            className="w-full min-w-0 bg-[#0b1220] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="all">Any rating</option>
                            <option value="7">7+</option>
                            <option value="8">8+</option>
                            <option value="9">9+</option>
                          </select>
                        </div>
                        <div className="text-xs text-gray-400 mb-3">
                          Showing {filteredMoodboardFilms.length} matching films
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1">
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
                                <div className="w-10 h-14 bg-gray-800 rounded" />
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
                        <div className="mb-3 rounded-lg border border-gray-700 bg-[#0b1220] p-3">
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
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {pendingMoodboardFilms.slice(0, 8).map((film, i) => (
                                <span key={`${film.title}_${film.year}_${i}`} className="text-[11px] px-2 py-1 rounded-full border border-blue-500/40 bg-blue-500/10 text-blue-200">
                                  {film.title}
                                </span>
                              ))}
                              {pendingMoodboardFilms.length > 8 && (
                                <span className="text-[11px] px-2 py-1 rounded-full border border-gray-600 text-gray-300">
                                  +{pendingMoodboardFilms.length - 8} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
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
                  )}

                  {displayedMoodboards.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {displayedMoodboards.map((board) => (
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
                          tabIndex={0}
                          className={`text-left rounded-xl border p-4 transition-all ${
                            activeMoodboard === board.id
                              ? 'bg-[#111827] border-blue-500/70 ring-1 ring-blue-500/40'
                              : 'bg-[#111827] border-gray-800 hover:border-gray-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <h3 className="font-semibold text-white truncate">{board.title}</h3>
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
                      ))}
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
                                setMoodboardCountryFilter('all');
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
                                <img
                                  src={posters[`${film.title}_${film.year}`]}
                                  alt={film.title}
                                  className="w-full aspect-[2/3] object-cover"
                                />
                              ) : (
                                <div className="w-full aspect-[2/3] bg-gray-800" />
                              )}
                              <div className="p-2">
                                <div className="text-xs text-white truncate">{film.title}</div>
                                <div className="text-[11px] text-gray-400">{film.year}</div>
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
                                setMoodboardCountryFilter('all');
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
                  <div className="order-last grid grid-cols-1 gap-4">
                    {hiddenGems.allFilms?.length > 0 && (
                      <div className="bg-[#111827] border border-gray-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-semibold">Hidden Gems</h2>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Films where your rating is significantly higher than IMDb consensus.</p>
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
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
                            {hiddenGems.allFilms.slice((hiddenGemsPage - 1) * hiddenGemsPerPage, hiddenGemsPage * hiddenGemsPerPage).map((movie, idx) => (
                              <div key={`${movie.title}_${movie.year}_${idx}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                {posters[`${movie.title}_${movie.year}`] ? (
                                  <img
                                    src={posters[`${movie.title}_${movie.year}`]}
                                    alt={movie.title}
                                    className="w-full aspect-[2/3] object-cover rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <button
                                    onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                    className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                    title="Load poster"
                                  >
                                    Load Poster
                                  </button>
                                )}
                                <button
                                  onClick={() => handleMovieClick(movie)}
                                  className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                >
                                  {movie.title}
                                </button>
                                <div className="text-[11px] text-gray-400 mt-0.5">{movie.year} | {"\u2605"} {movie.yourRating}</div>
                                <div className="text-[11px] text-blue-400 font-semibold mt-0.5">IMDb {movie.imdbRating} | +{movie.difference}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3 mb-5">
                            <div
                              className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                              style={{ overscrollBehavior: 'contain' }}
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
                                      <img
                                        src={posters[`${movie.title}_${movie.year}`]}
                                        alt={movie.title}
                                        className="w-full h-[250px] object-cover rounded-lg"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(movie.title, movie.year, movie.imdbId)}
                                        className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        Load Poster
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(movie)}
                                      className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                    >
                                      {movie.title}
                                    </button>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{movie.year} | {"\u2605"} {movie.yourRating}</div>
                                    <div className="text-[11px] text-blue-400 font-semibold mt-0.5">IMDb {movie.imdbRating} | +{movie.difference}</div>
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
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-semibold"> Hidden Treasures</h2>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Your highest-rated low-vote films that feel truly undiscovered.</p>

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
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {hiddenTreasures.allFilms.slice((hiddenTreasuresPage - 1) * hiddenTreasuresPerPage, hiddenTreasuresPage * hiddenTreasuresPerPage).map((m, i) => (
                              <div key={`${m.title}_${m.year}_${i}`} className="bg-[#0b1220] border border-gray-800 rounded-lg p-2">
                                {posters[`${m.title}_${m.year}`] ? (
                                  <img
                                    src={posters[`${m.title}_${m.year}`]}
                                    alt={m.title}
                                    className="w-full aspect-[2/3] object-cover rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <button
                                    onClick={() => fetchPoster(m.title, m.year, m.imdbId)}
                                    className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                    title="Load poster"
                                  >
                                    Load Poster
                                  </button>
                                )}
                                <button
                                  onClick={() => handleMovieClick(m)}
                                  className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                >
                                  {m.title}
                                </button>
                                <div className="text-[11px] text-gray-400 mt-0.5">{m.year} | {"\u2605"} {m.yourRating}</div>
                                <div className="text-[11px] text-gray-400 mt-0.5">IMDb {m.imdbRating} | {(m.numVotes || 0).toLocaleString()} votes</div>
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
                              style={{ overscrollBehavior: 'contain' }}
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
                                      <img
                                        src={posters[`${m.title}_${m.year}`]}
                                        alt={m.title}
                                        className="w-full h-[250px] object-cover rounded-lg"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(m.title, m.year, m.imdbId)}
                                        className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        Load Poster
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(m)}
                                      className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                    >
                                      {m.title}
                                    </button>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{m.year} | {"\u2605"} {m.yourRating}</div>
                                    <div className="text-[11px] text-gray-400 mt-0.5">IMDb {m.imdbRating} | {(m.numVotes || 0).toLocaleString()} votes</div>
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
                            onClick={() => setFavoriteYearShareOpen(true)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 bg-[#0b1220] text-gray-200 hover:bg-[#1f2937]"
                          >
                            Share
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4">Top-rated films grouped by release year from your watched history.</p>
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <label className="block text-gray-300 mb-1 text-xs">Select Year</label>
                          <select
                            value={latest}
                            onChange={e => {
                              setSelectedFavoriteYear(Number(e.target.value));
                              setFavoriteYearPage(1);
                              const sel = favoriteFilmPerYear.find(y => y.year === Number(e.target.value));
                              if (sel) loadPostersForFilms(sel.films.slice(0, favoriteYearView === 'horizontal' ? 40 : deepDiveFilmsPerPage));
                            }}
                            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white w-full sm:w-56 text-sm"
                          >
                            {favoriteFilmPerYear.map(y => (
                              <option key={y.year} value={y.year}>
                                {y.year} ({y.filmCount})
                              </option>
                            ))}
                          </select>
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
                                  <img 
                                    src={posters[`${f.title}_${f.year}`]} 
                                    alt={f.title}
                                    className="w-full aspect-[2/3] object-cover rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <button
                                    onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                    className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                    title="Load poster"
                                  >
                                    Load Poster
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleMovieClick(f)}
                                  className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                >
                                  {f.title}
                                </button>
                                <div className="text-[11px] text-gray-400 mt-0.5">{f.year} | {"\u2605"} {f.yourRating}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3">
                            <div
                              className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                              style={{ overscrollBehavior: 'contain' }}
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
                                      <img
                                        src={posters[`${f.title}_${f.year}`]}
                                        alt={f.title}
                                        className="w-full h-[250px] object-cover rounded-lg"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                        className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        Load Poster
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(f)}
                                      className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                    >
                                      {f.title}
                                    </button>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{f.year} | {"\u2605"} {f.yourRating}</div>
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
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-lg font-semibold">Personal Canon</h2>
                          </div>
                          <p className="text-xs text-gray-400 mb-4">The films that define your taste, organized decade by decade.</p>
                          <div className="mb-4 flex flex-wrap items-center gap-3">
                            <label className="block text-gray-300 text-xs">Select Decade</label>
                            <select
                              value={selectedDec}
                              onChange={e => {
                                setExpandedDecades([e.target.value]);
                                setPersonalCanonPage(1);
                                const sel = personalCanon.find(d => d.decade === e.target.value);
                                if (sel) loadPostersForFilms(sel.films.slice(0, personalCanonView === 'horizontal' ? 40 : deepDiveFilmsPerPage));
                              }}
                              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white w-full sm:w-56 text-sm"
                            >
                              {personalCanon.map(d => (
                                <option key={d.decade} value={d.decade}>
                                  {d.decade} ({d.filmCount})
                                </option>
                              ))}
                            </select>
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
                                      <img
                                        src={posters[`${f.title}_${f.year}`]}
                                        alt={f.title}
                                        className="w-full aspect-[2/3] object-cover rounded"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <button
                                        onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                        className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                        title="Load poster"
                                      >
                                        Load Poster
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleMovieClick(f)}
                                      className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                    >
                                      {f.title}
                                    </button>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{f.year} | {"\u2605"} {f.yourRating}</div>
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
                                style={{ overscrollBehavior: 'contain' }}
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
                                        <img
                                          src={posters[`${f.title}_${f.year}`]}
                                          alt={f.title}
                                          className="w-full h-[250px] object-cover rounded-lg"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      ) : (
                                        <button
                                          onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                          className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                          title="Load poster"
                                        >
                                          Load Poster
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleMovieClick(f)}
                                        className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                      >
                                        {f.title}
                                      </button>
                                      <div className="text-[11px] text-gray-400 mt-0.5">{f.year} | {"\u2605"} {f.yourRating}</div>
                                      <div className="text-[11px] text-gray-400 mt-0.5">IMDb {f.imdbRating}</div>
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
                          <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-lg font-semibold">Top Films by Genre</h2>
                          </div>
                          <p className="text-xs text-gray-400 mb-4">
                            Explore your strongest films across each genre. Avg {selectedGenreGroup.avgGenreRating.toFixed(2)}
                          </p>
                          <div className="mb-4 flex flex-wrap items-center gap-3">
                            <label className="text-xs text-gray-300">Genre</label>
                            <select
                              value={selectedGenreName}
                              onChange={(e) => {
                                const nextGenre = e.target.value;
                                setSelectedTopGenre(nextGenre);
                                setTopGenrePage(1);
                                const nextGroup = topFilmPerGenre.find((g) => g.genre === nextGenre);
                                if (nextGroup) loadPostersForFilms(nextGroup.films.slice(0, topGenreView === 'horizontal' ? 40 : topGenreFilmsPerPage));
                              }}
                              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-sm w-full sm:w-56"
                            >
                              {topFilmPerGenre.map((g) => (
                                <option key={g.genre} value={g.genre}>
                                  {g.genre} ({g.films.length})
                                </option>
                              ))}
                            </select>
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
                                    <img
                                      src={posters[`${f.title}_${f.year}`]}
                                      alt={f.title}
                                      className="w-full aspect-[2/3] object-cover rounded"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  ) : (
                                    <button
                                      onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                      className="w-full aspect-[2/3] bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs"
                                      title="Load poster"
                                    >
                                      Load Poster
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleMovieClick(f)}
                                    className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                  >
                                    {f.title}
                                  </button>
                                  <div className="text-[11px] text-gray-400 mt-0.5">{f.year} | {"\u2605"} {f.yourRating}</div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">IMDb {f.imdbRating}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="relative rounded-xl border border-gray-800 bg-[#0b1220] p-3">
                              <div
                                className="cinematic-rail overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                                style={{ overscrollBehavior: 'contain' }}
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
                                        <img
                                          src={posters[`${f.title}_${f.year}`]}
                                          alt={f.title}
                                          className="w-full h-[250px] object-cover rounded-lg"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      ) : (
                                        <button
                                          onClick={() => fetchPoster(f.title, f.year, f.imdbId)}
                                          className="w-full h-[250px] bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 text-xs"
                                          title="Load poster"
                                        >
                                          Load Poster
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleMovieClick(f)}
                                        className="mt-2 w-full text-left text-sm text-blue-400 hover:text-blue-300 truncate"
                                      >
                                        {f.title}
                                      </button>
                                      <div className="text-[11px] text-gray-400 mt-0.5">{f.year} | {"\u2605"} {f.yourRating}</div>
                                      <div className="text-[11px] text-gray-400 mt-0.5">IMDb {f.imdbRating}</div>
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
        
        {(!fetchingCountries && !data) && (
          <div className="text-center py-24">
            <div className="text-8xl mb-8"></div>
            <h3 className="text-3xl font-semibold mb-6 text-gray-100">Ready to analyze your taste?</h3>
            <p className="text-xl text-gray-300 mb-8">Upload your IMDb ratings export file to begin</p>
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















































































































































