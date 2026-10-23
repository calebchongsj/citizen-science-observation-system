import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { Navigation } from '../components/Navigation';
import { RafflesGoService } from '../api';
import { RouteMap, type RouteCoordinates } from '../components/RouteMap';
import { useToast } from '../contexts/useToast';

const WEEKDAY_OPTIONS = [
  { value: 'SUNDAY', label: 'Sunday' },
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
] as const;

function toIsoDateTime(date: string, time: string): string {
  if (!date || !time) return '';
  return `${date}T${time}:00`;
}

function currentLocalMinuteIso(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function weekdayFromDate(date: string): (typeof WEEKDAY_OPTIONS)[number]['value'] | '' {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return WEEKDAY_OPTIONS[parsed.getDay()]?.value ?? '';
}

export default function CreateWalkPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [routeInfo, setRouteInfo] = useState<RouteCoordinates>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [repeatWeekday, setRepeatWeekday] = useState<(typeof WEEKDAY_OPTIONS)[number]['value'] | ''>('');
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [maxSlots, setMaxSlots] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentLocalMinute = currentLocalMinuteIso();
  const todayIsoDate = currentLocalMinute.slice(0, 10);
  const currentLocalTime = currentLocalMinute.slice(11, 16);
  const startTimeMin = date === todayIsoDate ? currentLocalTime : undefined;
  const endTimeMin = time || startTimeMin;

  useEffect(() => {
    if (!error) return;
    showToast({ message: error, variant: 'error' });
    setError(null);
  }, [error, showToast]);

  const removeLastWaypoint = () => {
    if (routeInfo.length === 0) return;
    setRouteInfo((prev) => prev.slice(0, -1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const dateTime = toIsoDateTime(date, time);
    if (!dateTime) {
      setError('Please set date and time.');
      return;
    }
    if (new Date(dateTime) < new Date(currentLocalMinuteIso())) {
      setError('Start date and time cannot be in the past.');
      return;
    }
    const endDateTime = date && endTime ? toIsoDateTime(date, endTime) : '';
    if (endDateTime && new Date(endDateTime) <= new Date(dateTime)) {
      setError('End time must be after start time.');
      return;
    }
    if (routeInfo.length < 2) {
      setError('Add at least two waypoints on the map (click the map to add points).');
      return;
    }
    if (maxSlots < 1) {
      setError('Max volunteer slots must be at least 1.');
      return;
    }
    if (isRecurring) {
      if (!repeatWeekday) {
        setError('Select a repeat day for recurring walk creation.');
        return;
      }
      if (!repeatEndDate) {
        setError('Select the date when recurring walk creation should stop.');
        return;
      }
      if (repeatEndDate < date) {
        setError('Recurring end date must be on or after the start date.');
        return;
      }
      if (weekdayFromDate(date) !== repeatWeekday) {
        setError('Start date must fall on the selected repeat day.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: {
        route_info: RouteCoordinates;
        date_time: string;
        max_slots: number;
        name?: string;
        scheduled_end_time?: string | null;
        recurrence?: {
          repeat_weekday: (typeof WEEKDAY_OPTIONS)[number]['value'];
          end_date: string;
        };
      } = {
        route_info: routeInfo,
        date_time: dateTime,
        max_slots: maxSlots,
        name: name.trim() || undefined,
      };
      if (endDateTime) {
        payload.scheduled_end_time = endDateTime;
      } else {
        payload.scheduled_end_time = null;
      }
      if (isRecurring && repeatWeekday && repeatEndDate) {
        payload.recurrence = {
          repeat_weekday: repeatWeekday,
          end_date: repeatEndDate,
        };
      }
      const result = await RafflesGoService.createWalk(payload);
      if (result.walks.length === 1) {
        navigate(`/walks/${result.walks[0].walk_id}`, { state: { created: true } });
      } else {
        navigate('/walks', {
          state: {
            successMessage: `${result.created_count} recurring walks created successfully.`,
          },
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create walk. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navigation user={user} />
      <main className="main-content page-shell">
        <div className="container">
          <header className="page-header hero-panel page-hero">
            <div className="hero-copy">
              <h1>Create survey walk</h1>
              <p className="page-subtitle hero-subtitle">
                Set up a walk route, schedule, and volunteer capacity for a new walk.
              </p>
            </div>
          </header>

          <section className="card form-shell" aria-label="Create walk form">
            <form onSubmit={handleSubmit} className="form-section form-section--elevated">
              <div className="form-layout">
                <section className="form-panel">
                  <div className="section-heading section-heading--compact">
                    <div>
                      <h2>Walk details</h2>
                    </div>
                  </div>

                  <div className="filter-group">
                    <label htmlFor="walk-name">Walk name</label>
                    <input
                      id="walk-name"
                      type="text"
                      placeholder="e.g. Central Catchment Survey"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-describedby="walk-name-hint"
                    />
                  </div>

                  <div className="walk-datetime-grid">
                    <div className="filter-group">
                      <label htmlFor="walk-date">Start date</label>
                      <input
                        id="walk-date"
                        type="date"
                        required
                        min={todayIsoDate}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                    <div className="filter-group">
                      <label htmlFor="walk-slots">Max volunteer slots</label>
                      <input
                        id="walk-slots"
                        type="number"
                        min={1}
                        required
                        value={maxSlots}
                        onChange={(e) =>
                          setMaxSlots(Math.max(1, parseInt(e.target.value, 10) || 1))
                        }
                      />
                    </div>
                    <div className="filter-group">
                      <label htmlFor="walk-time">Start time</label>
                      <input
                        id="walk-time"
                        type="time"
                        required
                        min={startTimeMin}
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </div>
                    <div className="filter-group">
                      <label htmlFor="walk-end-time">End time (optional)</label>
                      <input
                        id="walk-end-time"
                        type="time"
                        min={endTimeMin}
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="form-hint form-hint--inline">
                    Leaving end time blank will set it to 2 hours after start by default
                  </p>

                  <div className="recurring-toggle">
                    <label htmlFor="walk-recurring" className="recurring-toggle__label">
                      <input
                        id="walk-recurring"
                        type="checkbox"
                        checked={isRecurring}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsRecurring(checked);
                          if (checked) {
                            setRepeatWeekday(weekdayFromDate(date));
                          } else {
                            setRepeatWeekday('');
                            setRepeatEndDate('');
                          }
                        }}
                      />
                      <span className="recurring-toggle__copy">
                        <span className="recurring-toggle__title">Batch create recurring walks</span>
                        <span className="form-hint recurring-toggle__hint">
                          Create this walk weekly on the same route and time until the selected stop date.
                        </span>
                      </span>
                    </label>
                  </div>

                  {isRecurring && (
                    <div className="walk-datetime-grid" style={{ marginTop: '1rem' }}>
                      <div className="filter-group">
                        <label htmlFor="walk-repeat-day">Repeat day</label>
                        <select
                          id="walk-repeat-day"
                          required={isRecurring}
                          value={repeatWeekday}
                          onChange={(e) =>
                            setRepeatWeekday(
                              e.target.value as (typeof WEEKDAY_OPTIONS)[number]['value'],
                            )
                          }
                        >
                          <option value="">Select a day</option>
                          {WEEKDAY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="filter-group">
                        <label htmlFor="walk-repeat-end-date">Repeat until</label>
                        <input
                          id="walk-repeat-end-date"
                          type="date"
                          required={isRecurring}
                          min={date || todayIsoDate}
                          value={repeatEndDate}
                          onChange={(e) => setRepeatEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </section>

                <section className="form-panel form-panel--map">
                  <div className="section-heading section-heading--compact">
                    <div className="form-panel-map-heading-stack">
                      <h2>Plan the Route</h2>
                      <p className="section-description">
                        Click the map to add waypoints. The route needs at least two points before publishing.
                      </p>
                    </div>
                  </div>

                  <RouteMap
                    route={routeInfo}
                    editable
                    onRouteChange={setRouteInfo}
                    height="400px"
                    className="map-section"
                  />

                  <div className="route-toolbar">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={removeLastWaypoint}
                      disabled={routeInfo.length === 0}
                      aria-label="Remove last waypoint"
                    >
                      Remove last point
                    </button>
                    <span className="route-toolbar__count">
                      {routeInfo.length} point{routeInfo.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {routeInfo.length > 0 && (
                    <details className="route-details">
                      <summary className="form-hint">View stored coordinates</summary>
                      <pre className="coordinates-display coordinates-display--stacked">
                        {JSON.stringify(routeInfo, null, 2)}
                      </pre>
                    </details>
                  )}
                </section>
              </div>

              <div className="form-actions mt-lg">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Publishing...' : 'Publish walk'}
                </button>
                <Link to="/walks" className="btn-secondary">
                  Cancel
                </Link>
              </div>
            </form>
          </section>
        </div>
      </main>
    </>
  );
}
