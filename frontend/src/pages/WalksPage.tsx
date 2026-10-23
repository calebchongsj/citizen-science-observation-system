import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, Compass, Download, MapPin, Users } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { useViewMode } from '../contexts/useViewMode';
import { RafflesGoService } from '../api';
import { ApiError } from '../api/core/ApiError';
import { RouteMap } from '../components/RouteMap';
import type { RouteCoordinates } from '../components/RouteMap';
import { FilterBar } from '../components/FilterBar';
import type { FilterGroup } from '../components/FilterBar';
import { Tag } from '../components/Tag';
import { formatWalkStatus, getWalkStatusTagVariant } from '../lib/walkStatus';
import { useToast } from '../contexts/useToast';
import { OfflineBanner } from '../components/OfflineBanner';

type Walk = {
  walk_id: string;
  route_info: RouteCoordinates;
  date_time: string;
  max_slots: number;
  current_participant_count?: number;
  group_leader_id: string | null;
  status: string;
  has_sightings: boolean;
  name?: string;
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

const WALKS_FILTER_SIGNUP: FilterGroup = {
  key: 'sign-up-status',
  label: 'Sign-up status',
  options: [
    { key: 'signed-up', label: 'Signed up' },
    { key: 'not-signed-up', label: 'Not signed up' },
    { key: 'walk-full', label: 'Walk full' },
  ],
};

function browseWalkMatchesFilter(
  walk: Walk,
  key: string,
  signedUpWalkIds: Set<string>,
): boolean {
  switch (key) {
    case 'upcoming':
      return walk.status === 'UPCOMING';
    case 'in-progress':
      return walk.status === 'IN_PROGRESS';
    case 'completed':
      return walk.status === 'COMPLETED' || walk.status === 'ABANDONED';
    case 'signed-up':
      return signedUpWalkIds.has(walk.walk_id);
    case 'not-signed-up':
      return !signedUpWalkIds.has(walk.walk_id);
    case 'walk-full':
      return (walk.current_participant_count ?? 0) >= walk.max_slots;
    default:
      return false;
  }
}

export default function WalksPage({ user }: { user: User }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useViewMode();
  const { showToast } = useToast();
  const [walks, setWalks] = useState<Walk[] | null>(null);
  const [signedUpWalkIds, setSignedUpWalkIds] = useState<Set<string>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [activeAdminTab, setActiveAdminTab] = useState<'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'>('UPCOMING');
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const loading = walks === null && error === null;

  useEffect(() => {
    let cancelled = false;
    const walksPromise = RafflesGoService.listWalks().then((list) => {
      const withTypedRoutes = list.map((w) => ({
        ...w,
        route_info: w.route_info as RouteCoordinates,
      }));

      withTypedRoutes.sort(
        (a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime(),
      );

      return withTypedRoutes;
    });
    const myWalksPromise = isAdmin
      ? Promise.resolve([])
      : RafflesGoService.getMyWalks().catch(() => []);

    Promise.all([walksPromise, myWalksPromise])
      .then(([list, myWalks]) => {
        if (!cancelled) {
          setWalks(list);
          setSignedUpWalkIds(new Set(myWalks.map((p) => p.walk_id)));
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Failed to load walks.';
          setError(message);
          showToast({ message, variant: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, showToast]);

  useEffect(() => {
    const state = location.state as { successMessage?: string } | null;
    if (!state?.successMessage) return;
    showToast({ message: state.successMessage, variant: 'success' });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, showToast]);

  const filterGroups = useMemo(
    () => (isAdmin ? [] : [WALKS_FILTER_SIGNUP]),
    [isAdmin],
  );

  const toggleFilter = useCallback((key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    if (!isAdmin || exportLoading) {
      return;
    }

    setExportLoading(true);

    try {
      const csv = await RafflesGoService.exportSurveyData();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'survey_data.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      showToast({ message: 'Download started.', variant: 'success' });
    } catch (e) {
      let message: string;
      if (e instanceof ApiError) {
        const body = e.body as { error?: string } | string | undefined;
        if (body && typeof body === 'object' && typeof body.error === 'string') {
          message = body.error;
        } else if (typeof body === 'string' && body.trim() !== '') {
          message = body;
        } else {
          message = `Failed to export survey data (${e.status}).`;
        }
      } else {
        message = e instanceof Error ? e.message : 'Failed to export survey data.';
      }
      showToast({ message, variant: 'error' });
    } finally {
      setExportLoading(false);
    }
  }, [exportLoading, isAdmin, showToast]);

  const filteredWalks = useMemo(() => {
    if (!walks) return [];
    const baseWalks = isAdmin
      ? walks.filter((walk) => walk.status === activeAdminTab)
      : walks.filter((walk) => walk.status === 'UPCOMING');
    if (isAdmin) return baseWalks;
    if (activeFilters.size === 0) return baseWalks;
    return baseWalks.filter((walk) =>
      [...activeFilters].some((key) =>
        browseWalkMatchesFilter(walk, key, signedUpWalkIds),
      ),
    );
  }, [walks, activeAdminTab, activeFilters, isAdmin, signedUpWalkIds]);

  const totalWalks = walks?.length ?? 0;
  const upcomingWalks =
    walks?.filter((walk) => walk.status === 'UPCOMING' || walk.status === 'IN_PROGRESS')
      .length ?? 0;
  const signedUpCount = walks?.filter((walk) => signedUpWalkIds.has(walk.walk_id)).length ?? 0;
  const adminTabOptions: Array<{ key: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'; label: string; count: number }> = [
    { key: 'UPCOMING', label: 'Upcoming', count: walks?.filter((walk) => walk.status === 'UPCOMING').length ?? 0 },
    { key: 'IN_PROGRESS', label: 'In progress', count: walks?.filter((walk) => walk.status === 'IN_PROGRESS').length ?? 0 },
    { key: 'COMPLETED', label: 'Completed', count: walks?.filter((walk) => walk.status === 'COMPLETED').length ?? 0 },
    { key: 'ABANDONED', label: 'Not completed', count: walks?.filter((walk) => walk.status === 'ABANDONED').length ?? 0 },
  ];
  const activeAdminTabLabel =
    adminTabOptions.find((tab) => tab.key === activeAdminTab)?.label ?? 'Walk';

  return (
    <>
      <Navigation user={user} />
      <main className="main-content page-shell">
        <div className="container">
          <OfflineBanner />
          <header className="page-header hero-panel page-hero">
            <div className="hero-copy">
              <h1>{isAdmin ? 'Manage walks' : 'Browse walks'}</h1>
              <p className="page-subtitle hero-subtitle">
                {isAdmin
                    ? 'Open each walk to view and update its details.'
                  : 'Explore upcoming survey walks, preview each route, and quickly see whether you are already signed up.'}
              </p>
            </div>

            <div className="hero-meta-card walk-hero-meta">
              <div className="hero-meta-grid">
                <div className="hero-stat">
                  <span className="hero-stat__label">Total listed</span>
                  <strong className="hero-stat__value">{totalWalks}</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat__label">Active now</span>
                  <strong className="hero-stat__value">{upcomingWalks}</strong>
                </div>
                {!isAdmin && (
                  <div className="hero-stat">
                    <span className="hero-stat__label">Your sign-ups</span>
                    <strong className="hero-stat__value">{signedUpCount}</strong>
                  </div>
                )}
              </div>

              <div className="hero-actions">
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleExport}
                      disabled={exportLoading}
                    >
                      <Download size={16} aria-hidden style={{ marginRight: '0.5rem' }} />
                      {exportLoading ? 'Exporting...' : 'Export survey data'}
                    </button>
                    <Link to="/walks/create" className="btn-primary">
                      Create survey walk
                    </Link>
                  </>
                ) : (
                  <Link to="/my-walks" className="btn-secondary">
                    View my walks
                  </Link>
                )}
              </div>
            </div>
          </header>

          {loading && <p className="loading">Loading walks...</p>}

          {!loading && error && (
            <section className="card section-panel">
              <p className="text-muted">Unable to load walks right now.</p>
            </section>
          )}

          {!loading && !error && walks !== null && walks.length === 0 && (
            <section className="card section-panel">
              <div className="empty-state empty-state--feature">
                <p>No walks yet.</p>
                <p>
                  {isAdmin
                    ? 'Create a survey walk to get started.'
                    : 'Check back later for upcoming survey walks.'}
                </p>
                {isAdmin && (
                  <Link to="/walks/create" className="btn-primary">
                    Create survey walk
                  </Link>
                )}
              </div>
            </section>
          )}

          {!loading && !error && walks !== null && walks.length > 0 && (
            <section className="walks-section" aria-label="Walks list">
              <div className="section-heading section-heading--compact">
                <div>
                  <h2>{isAdmin ? 'Published walks' : 'Choose a walk that fits your schedule'}</h2>
                  {isAdmin && (
                    <p className="section-description">
                      Published walks, segregated by status.
                    </p>
                  )}
                </div>
              </div>

              {isAdmin ? (
                <div className="walk-status-tabs" role="tablist" aria-label="Walk status tabs">
                  {adminTabOptions.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`walk-status-tab ${activeAdminTab === tab.key ? 'active' : ''}`}
                      onClick={() => setActiveAdminTab(tab.key)}
                      role="tab"
                      aria-selected={activeAdminTab === tab.key}
                    >
                      <span className="walk-status-tab__label">{tab.label}</span>
                      <span className="walk-status-tab__count">{tab.count}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Filter by
                  </p>
                  <FilterBar
                    groups={filterGroups}
                    activeFilters={activeFilters}
                    onToggle={toggleFilter}
                    onClear={clearFilters}
                  />
                </>
              )}

              {filteredWalks.length === 0 ? (
                <div className="w-full rounded-xl border border-border bg-card px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {isAdmin
                      ? `No ${activeAdminTabLabel.toLowerCase()} walks right now.`
                      : 'No walks match the selected filters.'}
                  </p>
                </div>
              ) : (
              <ul className="walks-list walk-list-shell">
                {filteredWalks.map((walk) => {
                  const showSignedUpTag =
                    !isAdmin && signedUpWalkIds.has(walk.walk_id);
                  const showDesignatedSubmitterTag =
                    !isAdmin && walk.group_leader_id === user.uid;
                  const currentCount = walk.current_participant_count ?? 0;
                  const isFull = currentCount >= walk.max_slots;
                  const cardBody = (
                    <>
                      <div className="walk-header walk-header--stacked">
                        <div className="walk-card__header-stack">
                          <div className="walk-card__tags">
                            {/* Walk type tag hidden until multiple walk types are supported */}
                            {/* Browse Walks tag order: Signed up (if joined) → Designated submitter (if leader) → walk status */}
                            {showSignedUpTag && (
                              <Tag variant="signed-up">Signed up</Tag>
                            )}
                            {showDesignatedSubmitterTag && (
                              <Tag variant="submitter" title="You can submit sightings for this walk">
                                Designated submitter
                              </Tag>
                            )}
                            <Tag variant={getWalkStatusTagVariant(walk.status)}>
                              {formatWalkStatus(walk.status)}
                            </Tag>
                            {isFull && <Tag variant="walk-full">Walk full</Tag>}
                          </div>

                          <div className="walk-card__title-group">
                            <span className="walk-location">
                              {isAdmin ? (
                                <Compass
                                  size={20}
                                  aria-hidden
                                  style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                                />
                              ) : (
                                <MapPin
                                  size={20}
                                  aria-hidden
                                  style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                                />
                              )}
                              {walk.name?.trim() || 'Route'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="map-section walk-card__map">
                        <RouteMap route={walk.route_info} height="188px" fitBounds />
                      </div>

                      <div className="walk-details walk-card__meta">
                        <div className="walk-date">
                          <Calendar
                            size={16}
                            aria-hidden
                            style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                          />
                          {formatDateTime(walk.date_time)}
                        </div>
                        <div className="walk-capacity" style={{ gap: '0.375rem' }}>
                          <Users
                            size={16}
                            aria-hidden
                            style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                          />
                          <span className="text-sm">
                            {currentCount} / {walk.max_slots} filled
                          </span>
                        </div>
                      </div>

                      {!isAdmin && isFull ? (
                        <span className="text-sm font-bold text-muted-foreground cursor-not-allowed" style={{ opacity: 0.5 }}>
                          Walk full — sign up unavailable
                        </span>
                      ) : (
                        <span className="walk-card__footer walk-card__cta">
                          {isAdmin ? 'Open management view' : 'View details and sign up'}
                        </span>
                      )}
                    </>
                  );
                  return (
                  <li key={walk.walk_id}>
                    {!isAdmin && isFull ? (
                      <div className="walk-card walk-card--link">
                        {cardBody}
                      </div>
                    ) : (
                      <Link to={`/walks/${walk.walk_id}`} className="walk-card walk-card--link">
                        {cardBody}
                      </Link>
                    )}
                  </li>
                  );
                })}
              </ul>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
