import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { Calendar, Footprints } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RafflesGoService } from '../api';
import { FilterBar } from '../components/FilterBar';
import type { FilterGroup } from '../components/FilterBar';
import { Tag } from '../components/Tag';
import { formatWalkStatus, getWalkStatusTagVariant } from '../lib/walkStatus';
import { useToast } from '../contexts/useToast';

type MyParticipation = {
  participation_id: string;
  walk_id: string;
  user_id: string;
  attendance_status: 'REGISTERED' | 'ATTENDED' | 'ABSENT';
  created_at: number;
  group_leader_id: string | null;
  walk_name?: string;
  status?: string;
  walk_date_time?: string;
};

function getAttendanceTagVariant(
  status: MyParticipation['attendance_status'],
): 'registered' | 'attended' | 'absent' {
  switch (status) {
    case 'ATTENDED':
      return 'attended';
    case 'ABSENT':
      return 'absent';
    case 'REGISTERED':
    default:
      return 'registered';
  }
}

function formatAttendanceStatus(status: MyParticipation['attendance_status']): string {
  switch (status) {
    case 'REGISTERED':
      return 'Registered';
    case 'ATTENDED':
      return 'Attended';
    case 'ABSENT':
      return 'Absent';
    default:
      return status;
  }
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return value;
  }
}

const MY_WALKS_FILTER_WALK_STATUS: FilterGroup = {
  key: 'walk-status',
  label: 'Walk status',
  options: [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'in-progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'not-completed', label: 'Not completed' },
  ],
};

const MY_WALKS_FILTER_ROLE: FilterGroup = {
  key: 'role',
  label: 'Role',
  options: [{ key: 'designated-submitter', label: 'Designated submitter' }],
};

const MY_WALKS_FILTER_GROUPS: FilterGroup[] = [MY_WALKS_FILTER_WALK_STATUS, MY_WALKS_FILTER_ROLE];

function myWalkMatchesFilter(
  p: MyParticipation,
  key: string,
  userId: string,
): boolean {
  switch (key) {
    case 'upcoming':
      return p.status === 'UPCOMING';
    case 'in-progress':
      return p.status === 'IN_PROGRESS';
    case 'completed':
      return p.status === 'COMPLETED';
    case 'not-completed':
      return p.status === 'ABANDONED';
    case 'registered':
      return p.attendance_status === 'REGISTERED';
    case 'attended':
      return p.attendance_status === 'ATTENDED';
    case 'absent':
      return p.attendance_status === 'ABSENT';
    case 'designated-submitter':
      return p.group_leader_id === userId;
    default:
      return false;
  }
}

export default function MyWalksPage({ user }: { user: User }) {
  const { showToast } = useToast();
  const [participations, setParticipations] = useState<MyParticipation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawConfirmWalkId, setWithdrawConfirmWalkId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const loading = participations === null && error === null;

  useEffect(() => {
    let cancelled = false;
    RafflesGoService.getMyWalks()
      .then((list) => {
        if (!cancelled) {
          const sorted = [...(list as MyParticipation[])].sort((a, b) => {
            const aTime = a.walk_date_time
              ? new Date(a.walk_date_time).getTime()
              : Number.MAX_SAFE_INTEGER;
            const bTime = b.walk_date_time
              ? new Date(b.walk_date_time).getTime()
              : Number.MAX_SAFE_INTEGER;
            return aTime - bTime;
          });
          setParticipations(sorted);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Failed to load your walks.';
          setError(message);
          showToast({ message, variant: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const handleWithdrawClick = (walkId: string) => {
    setWithdrawConfirmWalkId(walkId);
  };

  const handleWithdrawConfirm = async () => {
    const walkId = withdrawConfirmWalkId;
    if (!walkId) return;
    setWithdrawConfirmWalkId(null);
    setWithdrawingId(walkId);
    try {
      await RafflesGoService.withdrawFromWalk(walkId);
      setParticipations((prev) => prev?.filter((p) => p.walk_id !== walkId) ?? null);
      showToast({ message: 'You have been withdrawn from the walk.', variant: 'success' });
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : 'Failed to withdraw.',
        variant: 'error',
      });
    } finally {
      setWithdrawingId(null);
    }
  };

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

  const filteredParticipations = useMemo(() => {
    if (!participations) return [];
    if (activeFilters.size === 0) return participations;
    return participations.filter((p) =>
      [...activeFilters].some((key) => myWalkMatchesFilter(p, key, user.uid)),
    );
  }, [participations, activeFilters, user.uid]);

  const totalWalks = participations?.length ?? 0;
  const submitterCount =
    participations?.filter((participation) => participation.group_leader_id === user.uid).length ??
    0;

  return (
    <>
      <ConfirmDialog
        open={withdrawConfirmWalkId !== null}
        message="Are you sure you want to withdraw from this walk?"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={handleWithdrawConfirm}
        onCancel={() => setWithdrawConfirmWalkId(null)}
      />
      <Navigation user={user} />
      <main className="main-content page-shell">
        <div className="container">
          <header className="page-header hero-panel page-hero">
            <div className="hero-copy">
              <h1>My walks</h1>
              <p className="page-subtitle hero-subtitle">
                Keep track of the walks you have joined, see your role at a glance, and jump back into details when you need them.
              </p>
              <div className="hero-actions">
                <Link to="/walks" className="btn-primary">
                  Browse walks
                </Link>
              </div>
            </div>

            <div className="hero-meta-card">
              <div className="hero-meta-grid">
                <div className="hero-stat">
                  <span className="hero-stat__label">Registered walks</span>
                  <strong className="hero-stat__value">{totalWalks}</strong>
                </div>
                <div className="hero-stat">
                  <span className="hero-stat__label">Submitter roles</span>
                  <strong className="hero-stat__value">{submitterCount}</strong>
                </div>
              </div>
            </div>
          </header>

          {loading && <p className="loading">Loading your walks...</p>}

          {!loading && error && (
            <section className="card section-panel">
              <p className="text-muted">Unable to load your walks right now.</p>
            </section>
          )}

          {!loading && !error && participations !== null && participations.length === 0 && (
            <section className="card section-panel">
              <div className="empty-state empty-state--feature">
                <p>You have not signed up for any walks yet.</p>
                <Link to="/walks" className="btn-primary">
                  Browse available walks
                </Link>
              </div>
            </section>
          )}

          {!loading && participations !== null && participations.length > 0 && (
            <section className="section-panel" aria-label="My registered walks">
              <div className="section-heading section-heading--compact">
                <div>
                  <h2>Your current and past commitments</h2>
                </div>
              </div>

              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Filter by
              </p>
              <FilterBar
                groups={MY_WALKS_FILTER_GROUPS}
                activeFilters={activeFilters}
                onToggle={toggleFilter}
                onClear={clearFilters}
              />

              {filteredParticipations.length === 0 ? (
                <div className="w-full rounded-xl border border-border bg-card px-6 py-12 text-center">
                  <p className="text-sm text-muted-foreground">No walks match the selected filters.</p>
                </div>
              ) : (
              <ul className="walks-list walk-list-shell">
                {filteredParticipations.map((p) => (
                  <li key={p.participation_id} className="walk-card walk-card--static">
                    <div className="walk-header walk-header--my-walks walk-header--stacked">
                      <div className="walk-card__header-stack">
                        <div className="walk-card__tags">
                          {/* Walk type tag hidden until multiple walk types are supported */}
                          {/* "Signed up" tag removed from My Walks — all walks here are signed up for by definition.
    "Signed up" tag is preserved on Browse Walks (WalksPage.tsx) where it distinguishes
    joined walks from unjoined ones. */}
                          {p.group_leader_id === user.uid && (
                            <Tag variant="submitter" title="You can submit sightings for this walk">
                              Designated submitter
                            </Tag>
                          )}
                          {p.status && (
                            <Tag variant={getWalkStatusTagVariant(p.status)}>
                              {formatWalkStatus(p.status)}
                            </Tag>
                          )}
                          {/* "Registered" status hidden — implied for all upcoming walks. "Attended"/"Absent" still shown when relevant. */}
                          {p.attendance_status !== 'REGISTERED' && (
                            <Tag variant={getAttendanceTagVariant(p.attendance_status)}>
                              {formatAttendanceStatus(p.attendance_status)}
                            </Tag>
                          )}
                        </div>

                        <div className="walk-card__title-group">
                          <span className="walk-location">
                            <Footprints
                              size={20}
                              aria-hidden
                              style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                            />
                            {p.walk_name?.trim() ? (
                              <span>{p.walk_name.trim()}</span>
                            ) : (
                              <span>Unnamed walk</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="walk-details walk-card__meta">
                      <div className="walk-date">
                        <Calendar
                          size={16}
                          aria-hidden
                          style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                        />
                        Walk time: {p.walk_date_time ? formatDateTime(p.walk_date_time) : 'Not available'}
                      </div>
                    </div>

                    <div className="walk-actions my-walks-card-actions">
                      <Link to={`/walks/${p.walk_id}`} className="my-walks-card-actions__details">
                        View walk details
                      </Link>
                      <button
                        type="button"
                        className="my-walks-card-actions__withdraw"
                        disabled={withdrawingId === p.walk_id}
                        onClick={() => handleWithdrawClick(p.walk_id)}
                      >
                        {withdrawingId === p.walk_id ? 'Withdrawing...' : 'Withdraw'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
