import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import { Calendar, CircleDot, Clock, Users } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useViewMode } from '../contexts/useViewMode';
import { RafflesGoService, ApiError } from '../api';
import { RouteMap } from '../components/RouteMap';
import type { RouteCoordinates } from '../components/RouteMap';
import { PointPickerMap } from '../components/PointPickerMap';
import { Tag } from '../components/Tag';
import { StatusTag } from '../components/StatusTag';
import { storage } from '../lib/firebase';
import { formatWalkStatus } from '../lib/walkStatus';
import { useToast } from '../contexts/useToast';
import { OfflineBanner } from '../components/OfflineBanner';
import { savePendingSighting, savePendingEdit, savePendingDelete } from '../lib/offlineSightingDb';
import { useOfflineSync } from '../hooks/useOfflineSync';

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

function formatDateOnly(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

function formatTimeOnly(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function displayNameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const a = parts[0][0];
  const b = parts[parts.length - 1][0];
  return `${a ?? ''}${b ?? ''}`.toUpperCase() || '?';
}

function isoToDateAndTime(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    const date = d.toISOString().slice(0, 10);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return { date, time: `${hours}:${minutes}` };
  } catch {
    return { date: '', time: '' };
  }
}

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

function startPlus2Hours(iso: string): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + 2);
  return d.toISOString();
}

function endOfDayUTC(iso: string): Date {
  const d = new Date(iso);
  const ymd = d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  return new Date(`${ymd}T23:59:59.999Z`);
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function parseApiErrorMessage(e: unknown, fallback: string): string {
  const bodyError =
    e instanceof ApiError &&
    e.body &&
    typeof e.body === 'object' &&
    typeof (e.body as { error?: string }).error === 'string'
      ? (e.body as { error: string }).error
      : null;
  const bodyMessage =
    e instanceof ApiError &&
    e.body &&
    typeof e.body === 'object' &&
    typeof (e.body as { message?: string }).message === 'string'
      ? (e.body as { message: string }).message
      : null;
  const raw = bodyError ?? bodyMessage ?? (e instanceof Error ? e.message : fallback);
  // Network/connectivity errors (backend not running, CORS, etc.)
  if (
    typeof raw === 'string' &&
    (raw === 'Failed to fetch' || raw === 'Load failed' || raw.startsWith('NetworkError'))
  ) {
    return 'Upload failed. Make sure the backend is running and Firebase Storage is configured correctly, then try again.';
  }
  return raw;
}

function isNetworkLikeError(e: unknown): boolean {
  return (
    e instanceof TypeError ||
    (e instanceof Error && /fetch|network|failed to fetch/i.test(e.message))
  );
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/]/g, '_');
}

function buildSightingImageStoragePath(walkId: string, sightingId: string, file: File): string {
  const safeFilename = sanitizeFilename(file.name);
  const uniquePrefix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `sightings/${walkId}/${sightingId}/${uniquePrefix}-${safeFilename}`;
}

const MAX_SIGHTING_IMAGE_COUNT = 5;
const MAX_SIGHTING_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_SIGHTING_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;

function validateSelectedImageFiles(files: File[], existingCount = 0): string | null {
  const totalCount = existingCount + files.length;
  if (totalCount > MAX_SIGHTING_IMAGE_COUNT) {
    return `You can upload up to ${MAX_SIGHTING_IMAGE_COUNT} photos per sighting.`;
  }

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return 'Only image files can be uploaded.';
    }
    if (file.size > MAX_SIGHTING_IMAGE_SIZE_BYTES) {
      return `Each image must be ${Math.round(MAX_SIGHTING_IMAGE_SIZE_BYTES / (1024 * 1024))} MB or smaller.`;
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_SIGHTING_TOTAL_UPLOAD_BYTES) {
    return `Selected uploads must total ${Math.round(MAX_SIGHTING_TOTAL_UPLOAD_BYTES / (1024 * 1024))} MB or less.`;
  }

  return null;
}

class SightingImageUploadError extends Error {
  uploadedCount: number;

  constructor(message: string, uploadedCount: number) {
    super(message);
    this.name = 'SightingImageUploadError';
    this.uploadedCount = uploadedCount;
  }
}

export default function WalkDetailPage({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = location;
  const { isAdmin } = useViewMode();
  const { showToast } = useToast();
  const refreshSightingsRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const { isOffline, pendingCount, isSyncing, syncResult, refreshPendingCount } = useOfflineSync(id ?? '', () => {
    refreshSightingsRef.current?.();
  });
  const justCreated =
    state && typeof state === 'object' && 'created' in state && state.created === true;

  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [showDeleteWalkConfirm, setShowDeleteWalkConfirm] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [isSignedUp, setIsSignedUp] = useState(false);
  const [startingWalk, setStartingWalk] = useState(false);
  const [endingWalk, setEndingWalk] = useState(false);
  const [showStartWalkConfirm, setShowStartWalkConfirm] = useState(false);
  const [showEndWalkConfirm, setShowEndWalkConfirm] = useState(false);

  const [walk, setWalk] = useState<{
    walk_id: string;
    route_info: RouteCoordinates;
    date_time: string;
    scheduled_end_time?: string;
    max_slots: number;
    group_leader_id: string | null;
    status: string;
    has_sightings: boolean;
    name?: string;
    started_at?: string;
    ended_at?: string;
    current_participant_count?: number;
    participants?: Array<{
      user_id: string;
      display_name: string;
      is_designated_submitter: boolean;
      disabled?: boolean;
    }>;
  } | null>(null);
  const [volunteerWalkRefreshing, setVolunteerWalkRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  const [routeInfo, setRouteInfo] = useState<RouteCoordinates>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const currentLocalMinute = currentLocalMinuteIso();
  const todayIsoDate = currentLocalMinute.slice(0, 10);
  const currentLocalTime = currentLocalMinute.slice(11, 16);
  const startTimeMin = date === todayIsoDate ? currentLocalTime : undefined;
  const endTimeMin = time || startTimeMin;
  const [maxSlots, setMaxSlots] = useState(10);

  type ParticipantItem = {
    participation_id: string;
    walk_id: string;
    user_id: string;
    attendance_status: string;
    created_at: number;
    disabled?: boolean;
  };
  const [participants, setParticipants] = useState<ParticipantItem[] | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [userDisplayMap, setUserDisplayMap] = useState<Record<string, { email?: string; displayName?: string }>>({});
  const [showTransferSubmitterPanel, setShowTransferSubmitterPanel] = useState(false);
  const [transferSubmitterId, setTransferSubmitterId] = useState('');
  const [transferSubmitterLoading, setTransferSubmitterLoading] = useState(false);
  const [transferSubmitterError, setTransferSubmitterError] = useState<string | null>(null);

  const loading =
    Boolean(id) &&
    (walk === null || walk.walk_id !== id) &&
    pageError === null;

  const isCurrentSubmitter = Boolean(walk && walk.group_leader_id === user.uid);
  const canManageSubmitter = Boolean(walk && (isAdmin || isCurrentSubmitter));

  const participantDisplayLookup = Object.fromEntries(
    (walk?.participants ?? []).map((participant) => [participant.user_id, participant.display_name]),
  );

  const eligibleSubmitterOptions = (participants ?? [])
    .filter((participant) => participant.user_id !== walk?.group_leader_id)
    .filter(
      (participant) =>
        participant.attendance_status === 'REGISTERED' || participant.attendance_status === 'ATTENDED',
    )
    .filter((participant) => !participant.disabled)
    .map((participant) => ({
      user_id: participant.user_id,
      label:
        participantDisplayLookup[participant.user_id]
        || userDisplayMap[participant.user_id]?.displayName
        || userDisplayMap[participant.user_id]?.email
        || participant.user_id,
    }));

  const refreshWalkDetail = async () => {
    if (!id) return;
    setVolunteerWalkRefreshing(true);
    try {
      const w = await RafflesGoService.getWalkById(id);
      setWalk({
        ...w,
        route_info: w.route_info as RouteCoordinates,
      });
    } catch {
      /* keep existing walk */
    } finally {
      setVolunteerWalkRefreshing(false);
    }
  };

  const refreshParticipants = async () => {
    if (!id || !canManageSubmitter) return;

    setParticipantsLoading(true);
    setParticipantsError(null);
    try {
      const [participantList, usersResponse] = await Promise.all([
        RafflesGoService.getWalkParticipants(id),
        isAdmin ? RafflesGoService.listUsers().catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
      ]);
      setParticipants(participantList as ParticipantItem[]);
      const map: Record<string, { email?: string; displayName?: string }> = {};
      for (const u of usersResponse.users ?? []) {
        map[u.uid] = { email: u.email, displayName: u.displayName };
      }
      setUserDisplayMap(map);
    } catch (e) {
      const bodyMessage =
        e instanceof ApiError &&
        e.body &&
        typeof e.body === 'object' &&
        typeof (e.body as { error?: string }).error === 'string'
          ? (e.body as { error: string }).error
          : null;
      const raw = bodyMessage ?? (e instanceof Error ? e.message : 'Failed to load participants.');
      const friendly =
        raw === 'Default Response' || raw === 'Forbidden' || raw === 'Forbidden: not a participant'
          ? 'Unable to load participants.'
          : raw;
      setParticipantsError(friendly);
    } finally {
      setParticipantsLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    // Try to restore cached walk data immediately so the page renders offline
    const cachedWalkJson = sessionStorage.getItem(`walk-cache-${id}`);
    const cachedSignedUp = sessionStorage.getItem(`walk-signedup-${id}`);
    if (cachedWalkJson && walk === null) {
      try {
        const cachedWalk = JSON.parse(cachedWalkJson);
        cachedWalk.route_info = cachedWalk.route_info as RouteCoordinates;
        setWalk(cachedWalk);
        setIsSignedUp(cachedSignedUp === 'true');
        if (isAdmin) {
          setRouteInfo(cachedWalk.route_info);
          setName(cachedWalk.name ?? '');
          const { date: d, time: t } = isoToDateAndTime(cachedWalk.date_time);
          setDate(d);
          setTime(t);
          setMaxSlots(cachedWalk.max_slots);
          const endIso = cachedWalk.scheduled_end_time ?? startPlus2Hours(cachedWalk.date_time);
          const { time: endT } = isoToDateAndTime(endIso);
          setEndTime(endT);
        }
      } catch { /* ignore corrupt cache */ }
    }

    Promise.all([
      RafflesGoService.getWalkById(id),
      RafflesGoService.getMyWalks(),
    ])
      .then(([w, myWalks]) => {
        if (!cancelled) {
          const walkData = {
            ...w,
            route_info: w.route_info as RouteCoordinates,
          };
          setWalk(walkData);
          setPageError(null);
          const signedUp = myWalks.some((p) => p.walk_id === id);
          setIsSignedUp(signedUp);

          // Cache walk data for offline access
          sessionStorage.setItem(`walk-cache-${id}`, JSON.stringify(walkData));
          sessionStorage.setItem(`walk-signedup-${id}`, String(signedUp));

          if (isAdmin) {
            setRouteInfo(walkData.route_info);
            setName(walkData.name ?? '');
            const { date: d, time: t } = isoToDateAndTime(walkData.date_time);
            setDate(d);
            setTime(t);
            setMaxSlots(walkData.max_slots);
            const endIso = walkData.scheduled_end_time ?? startPlus2Hours(walkData.date_time);
            const { time: endT } = isoToDateAndTime(endIso);
            setEndTime(endT);
          }
        }
      })
      .catch((e) => {
        if (!cancelled && !cachedWalkJson) {
          const message = e instanceof Error ? e.message : 'Failed to load walk.';
          setPageError(message);
          showToast({ message, variant: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin, showToast]);

  useEffect(() => {
    if (import.meta.env.DEV && walk?.walk_id) {
      console.debug('[WalkDetail] walk_id', walk.walk_id);
    }
  }, [walk?.walk_id]);

  useEffect(() => {
    if (!justCreated) return;
    showToast({ message: 'Walk created successfully.', variant: 'success' });
    navigate(location.pathname, { replace: true, state: null });
  }, [justCreated, location.pathname, navigate, showToast]);

  useEffect(() => {
    if (!toastError) return;
    showToast({ message: toastError, variant: 'error' });
  }, [showToast, toastError]);

  useEffect(() => {
    if (!signUpError) return;
    showToast({ message: signUpError, variant: 'error' });
    setSignUpError(null);
  }, [showToast, signUpError]);

  useEffect(() => {
    if (!saveSuccess) return;
    showToast({ message: 'Walk saved.', variant: 'success' });
    setSaveSuccess(false);
  }, [saveSuccess, showToast]);

  useEffect(() => {
    if (!withdrawSuccess) return;
    showToast({ message: 'You have been withdrawn from this walk.', variant: 'success' });
    setWithdrawSuccess(false);
  }, [showToast, withdrawSuccess]);

  // Admins and current designated submitters can manage handover, so fetch participant eligibility data for them.
  useEffect(() => {
    if (!id || !canManageSubmitter || walk?.walk_id !== id) return;
    let cancelled = false;
    setParticipants(null);
    setParticipantsLoading(true);
    setParticipantsError(null);
    Promise.all([
      RafflesGoService.getWalkParticipants(id),
      isAdmin ? RafflesGoService.listUsers().catch(() => ({ users: [] })) : Promise.resolve({ users: [] }),
    ])
      .then(([participantList, usersResponse]) => {
        if (cancelled) return;
        setParticipants(participantList as ParticipantItem[]);
        const map: Record<string, { email?: string; displayName?: string }> = {};
        for (const u of usersResponse.users ?? []) {
          map[u.uid] = { email: u.email, displayName: u.displayName };
        }
        setUserDisplayMap(map);
        setParticipantsError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          const bodyMessage = e instanceof ApiError && e.body && typeof e.body === 'object' && typeof (e.body as { error?: string }).error === 'string'
            ? (e.body as { error: string }).error
            : null;
          const raw = bodyMessage ?? (e instanceof Error ? e.message : 'Failed to load participants.');
          const friendly =
            raw === 'Default Response' || raw === 'Forbidden' || raw === 'Forbidden: not a participant'
              ? 'Unable to load participants.'
              : raw;
          setParticipantsError(friendly);
        }
      })
      .finally(() => {
        if (!cancelled) setParticipantsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isAdmin, canManageSubmitter, walk?.walk_id]);

  const handleSignUp = async () => {
    if (!id) return;
    setToastError(null);
    setSignUpError(null);
    setSigningUp(true);
    try {
      await RafflesGoService.signUpForWalk(id);
      setIsSignedUp(true);
      await refreshWalkDetail();
    } catch (e) {
      const message = parseApiErrorMessage(e, 'Failed to sign up.');
      setSignUpError(
        message === 'You are already signed up for another walk on this day'
          ? 'You’re already signed up for another walk that day. Please withdraw from that walk first if you’d like to join this one.'
          : message,
      );
    } finally {
      setSigningUp(false);
    }
  };

  const handleWithdrawClick = () => {
    setShowWithdrawConfirm(true);
  };

  const handleWithdrawConfirm = async () => {
    if (!id) return;
    setShowWithdrawConfirm(false);
    setToastError(null);
    setWithdrawSuccess(false);
    setWithdrawing(true);
    try {
      await RafflesGoService.withdrawFromWalk(id);
      setIsSignedUp(false);
      setWithdrawSuccess(true);
      await refreshWalkDetail();
      await refreshParticipants();
    } catch (e) {
      setToastError(e instanceof Error ? e.message : 'Failed to withdraw.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleTransferSubmitter = async () => {
    if (!id || !transferSubmitterId) {
      setTransferSubmitterError('Please select a participant to transfer the role to.');
      return;
    }

    setTransferSubmitterLoading(true);
    setTransferSubmitterError(null);
    try {
      const updatedWalk = await RafflesGoService.updateDesignatedSubmitter(id, {
        newSubmitterId: transferSubmitterId,
      });
      setWalk({
        ...updatedWalk,
        route_info: updatedWalk.route_info as RouteCoordinates,
      });
      setShowTransferSubmitterPanel(false);
      setTransferSubmitterId('');
      showToast({ message: 'Designated submitter updated.', variant: 'success' });
      await refreshWalkDetail();
      await refreshParticipants();
    } catch (e) {
      setTransferSubmitterError(
        parseApiErrorMessage(e, 'Failed to transfer designated submitter role.'),
      );
    } finally {
      setTransferSubmitterLoading(false);
    }
  };

  const renderTransferSubmitterPanel = () => {
    if (!canManageSubmitter || !walk || walk.status === 'COMPLETED' || walk.status === 'ABANDONED') {
      return null;
    }

    return (
      <div className="card" style={{ marginTop: '1rem', padding: '1rem 1.1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem' }}>Designated Submitter</h4>
            <p className="text-muted" style={{ margin: '0.35rem 0 0' }}>
              Transfer the designated submitter role to another eligible participant in this walk.
            </p>
          </div>

          {!showTransferSubmitterPanel ? (
            <div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowTransferSubmitterPanel(true);
                  setTransferSubmitterError(null);
                }}
              >
                Transfer Designated Submitter Role
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span className="text-sm font-medium">New designated submitter</span>
                <select
                  value={transferSubmitterId}
                  onChange={(event) => setTransferSubmitterId(event.target.value)}
                  disabled={transferSubmitterLoading}
                >
                  <option value="">Select a participant</option>
                  {eligibleSubmitterOptions.map((participant) => (
                    <option key={participant.user_id} value={participant.user_id}>
                      {participant.label}
                    </option>
                  ))}
                </select>
              </label>

              {eligibleSubmitterOptions.length === 0 && (
                <p className="text-muted" style={{ margin: 0 }}>
                  No eligible participants are currently available for handover.
                </p>
              )}

              {transferSubmitterError && (
                <div className="message-error" role="alert">
                  {transferSubmitterError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleTransferSubmitter}
                  disabled={
                    transferSubmitterLoading ||
                    eligibleSubmitterOptions.length === 0 ||
                    !transferSubmitterId
                  }
                >
                  {transferSubmitterLoading ? 'Transferring…' : 'Confirm transfer'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowTransferSubmitterPanel(false);
                    setTransferSubmitterId('');
                    setTransferSubmitterError(null);
                  }}
                  disabled={transferSubmitterLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setToastError(null);
    setSaveSuccess(false);
    const dateTime = toIsoDateTime(date, time);
    if (!dateTime) {
      setToastError('Please set date and time.');
      return;
    }
    if (new Date(dateTime) < new Date(currentLocalMinuteIso())) {
      setToastError('Start date and time cannot be in the past.');
      return;
    }
    const endDateTime = date && endTime ? toIsoDateTime(date, endTime) : '';
    if (endDateTime && new Date(endDateTime) <= new Date(dateTime)) {
      setToastError('End time must be after start time.');
      return;
    }
    if (routeInfo.length < 2) {
      setToastError('Add at least two waypoints on the map.');
      return;
    }
    if (maxSlots < 1) {
      setToastError('Max volunteer slots must be at least 1.');
      return;
    }
    setSaving(true);
    try {
      const payload: {
        route_info: RouteCoordinates;
        date_time: string;
        max_slots: number;
        name?: string;
        scheduled_end_time?: string | null;
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
      const updated = await RafflesGoService.updateWalk(id, payload);
      setWalk({
        ...updated,
        route_info: updated.route_info as RouteCoordinates,
      });
      setSaveSuccess(true);
      setRouteInfo(updated.route_info as RouteCoordinates);
      setName(updated.name ?? '');
      const { date: d, time: t } = isoToDateAndTime(updated.date_time);
      setDate(d);
      setTime(t);
      setMaxSlots(updated.max_slots);
      const endIso = updated.scheduled_end_time ?? startPlus2Hours(updated.date_time);
      const { time: endT } = isoToDateAndTime(endIso);
      setEndTime(endT);
    } catch (e) {
      setToastError(e instanceof Error ? e.message : 'Failed to save walk.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteWalkConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id || !walk) return;
    setShowDeleteWalkConfirm(false);
    setDeleting(true);
    setToastError(null);
    try {
      await RafflesGoService.deleteWalk(id);
      navigate('/walks', { replace: true });
    } catch (e) {
      setToastError(e instanceof Error ? e.message : 'Failed to delete walk.');
    } finally {
      setDeleting(false);
    }
  };

  const removeLastWaypoint = () => {
    if (routeInfo.length <= 2) return;
    setRouteInfo((prev) => prev.slice(0, -1));
  };

  const canStartOrEndWalk =
    walk &&
    (isAdmin || walk.group_leader_id === user.uid) &&
    (walk.status === 'UPCOMING' || walk.status === 'IN_PROGRESS');
  const scheduledStartPassed =
    walk && new Date() >= new Date(walk.date_time);
  // Start walk: allowed anytime after scheduled start time, but only until end-of-day.
  const walkStartClosesAt = walk ? endOfDayUTC(walk.date_time) : null;
  const canStartNow =
    Boolean(scheduledStartPassed && walkStartClosesAt && new Date() <= walkStartClosesAt);
  const showStartButton = canStartOrEndWalk && walk?.status === 'UPCOMING';
  const showEndButton = canStartOrEndWalk && walk?.status === 'IN_PROGRESS';
  const startButtonDisabled = startingWalk || !canStartNow;

  type SightingItem = {
    sighting_id: string;
    walk_id: string;
    recorded_by_user_id: string;
    adult_count: number;
    juvenile_count: number;
    infant_count: number;
    behavior: string;
    notes: string;
    images_references: string[];
    observation_timestamp: string;
    last_edited_at?: string;
    latitude: number;
    longitude: number;
    submission_status: 'DRAFT' | 'SUBMITTED';
  };
  const [sightings, setSightings] = useState<SightingItem[] | null>(null);
  const [sightingsLoading, setSightingsLoading] = useState(false);
  const [sightingsError, setSightingsError] = useState<string | null>(null);
  const [sightingsSuccess, setSightingsSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!sightingsSuccess) return;
    showToast({ message: sightingsSuccess, variant: 'success' });
    setSightingsSuccess(null);
  }, [showToast, sightingsSuccess]);

  const isLeader = Boolean(walk && walk.group_leader_id === user.uid);
  const now = new Date();

  function getLeaderSightingWindow(
    walkData: typeof walk,
    at: Date,
  ): { isOpen: boolean; closesAt?: Date; reason?: string } {
    if (!walkData) return { isOpen: false, reason: 'Walk not loaded.' };

    if (walkData.status === 'IN_PROGRESS') {
      const effectiveEndIso =
        walkData.scheduled_end_time && walkData.scheduled_end_time.trim() !== ''
          ? walkData.scheduled_end_time
          : addHours(new Date(walkData.date_time), 2).toISOString();

      // Backend:
      // effectiveEndIso = scheduled_end_time ?? (date_time + 2h)
      // closesAt = effectiveEndIso + 2h
      const closesAt = addHours(new Date(effectiveEndIso), 2);

      return {
        isOpen: at <= closesAt,
        closesAt,
        reason: at <= closesAt ? undefined : 'The sighting recording/editing window has closed.',
      };
    }

    if (walkData.status === 'COMPLETED') {
      if (!walkData.ended_at) {
        return { isOpen: false, reason: 'This walk is completed, but no ended time is available.' };
      }
      // Backend: closesAt = ended_at + 2h
      const closesAt = addHours(new Date(walkData.ended_at), 2);
      return {
        isOpen: at <= closesAt,
        closesAt,
        reason: at <= closesAt ? undefined : 'The sighting recording/editing window has closed.',
      };
    }

    return { isOpen: false, reason: 'This walk is not accepting sighting submissions.' };
  }

  const leaderWindowClosedMessage = (closesAt?: Date) =>
    closesAt
      ? `Sightings can only be recorded/edited while the walk is in progress, or within 2 hours after it ends. Window closed at ${formatDateTime(
          closesAt.toISOString(),
        )}.`
      : 'Sightings can only be recorded/edited while the walk is in progress, or within 2 hours after it ends.';

  const leaderSightingWindow = getLeaderSightingWindow(walk, now);
  const recordConfirmMessage = leaderSightingWindow.closesAt
    ? `Record this sighting? You can edit it until ${formatDateTime(
        leaderSightingWindow.closesAt.toISOString(),
      )}.`
    : 'Record this sighting?';
  const saveConfirmMessage = leaderSightingWindow.closesAt
    ? `Save changes to this sighting? Edits are allowed until ${formatDateTime(
        leaderSightingWindow.closesAt.toISOString(),
      )}.`
    : 'Save changes to this sighting?';

  useEffect(() => {
    if (!id) return;
    if (walk?.walk_id !== id) return;
    // Participants can view, and admins can view regardless of signup/leadership.
    if (!isAdmin && !isSignedUp && !isLeader) return;

    let cancelled = false;
    setSightingsLoading(true);
    setSightingsError(null);

    // Restore cached sightings immediately so they show while offline
    const cachedSightingsJson = sessionStorage.getItem(`sightings-cache-${id}`);
    if (cachedSightingsJson && sightings === null) {
      try {
        setSightings(JSON.parse(cachedSightingsJson));
      } catch { /* ignore corrupt cache */ }
    }

    RafflesGoService.listSightingsForWalk(id)
      .then((list) => {
        if (cancelled) return;
        const sorted = [...(list as SightingItem[])].sort((a, b) => {
          const ta = new Date(a.observation_timestamp).getTime();
          const tb = new Date(b.observation_timestamp).getTime();
          return tb - ta;
        });
        setSightings(sorted);
        sessionStorage.setItem(`sightings-cache-${id}`, JSON.stringify(sorted));
      })
      .catch((e) => {
        if (cancelled) return;
        // If we have cached data, don't show an error
        if (cachedSightingsJson) {
          setSightingsLoading(false);
          return;
        }
        const raw = parseApiErrorMessage(e, 'Failed to load sightings.');
        const friendly =
          raw === 'Default Response' || raw === 'Forbidden'
            ? 'Unable to load sightings.'
            : raw;
        setSightingsError(friendly);
        setSightings(null);
      })
      .finally(() => {
        if (!cancelled) setSightingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin, walk?.walk_id, isSignedUp, isLeader]);

  const refreshSightings = async () => {
    if (!id) return;
    try {
      const list = await RafflesGoService.listSightingsForWalk(id);
      const sorted = [...(list as SightingItem[])].sort((a, b) => {
        const ta = new Date(a.observation_timestamp).getTime();
        const tb = new Date(b.observation_timestamp).getTime();
        return tb - ta;
      });
      setSightings(sorted);
      setSightingsError(null);
      sessionStorage.setItem(`sightings-cache-${id}`, JSON.stringify(sorted));
    } catch (e) {
      // If offline, don't overwrite existing sightings with an error
      if (e instanceof TypeError || (e instanceof Error && /fetch|network/i.test(e.message))) {
        return;
      }
      setSightingsError(parseApiErrorMessage(e, 'Failed to refresh sightings.'));
    }
  };
  refreshSightingsRef.current = refreshSightings;

  type SightingFormState = {
    adult_count: number;
    juvenile_count: number;
    infant_count: number;
    behavior: string;
    notes: string;
    latitude: number | null;
    longitude: number | null;
    locationSource: 'device' | 'map' | null;
    observation_timestamp: string;
    existingImages: string[];
    removedExistingImages: string[];
    newFiles: File[];
  };

  const blankSightingForm = (): SightingFormState => ({
    adult_count: 0,
    juvenile_count: 0,
    infant_count: 0,
    behavior: '',
    notes: '',
    latitude: null,
    longitude: null,
    locationSource: null,
    observation_timestamp: new Date().toISOString(),
    existingImages: [],
    removedExistingImages: [],
    newFiles: [],
  });

  const [recordOpen, setRecordOpen] = useState(false);
  const [editingSightingId, setEditingSightingId] = useState<string | null>(null);
  const [form, setForm] = useState<SightingFormState>(() => blankSightingForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [showRecordConfirm, setShowRecordConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDeleteSightingConfirm, setShowDeleteSightingConfirm] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const isEditing = editingSightingId !== null;

  useEffect(() => {
    if (!formError) return;
    showToast({ message: formError, variant: 'error' });
    setFormError(null);
  }, [formError, showToast]);

  const openCreateForm = () => {
    if (isAdmin) return;
    const windowNow = getLeaderSightingWindow(walk, new Date());
    if (!windowNow.isOpen) {
      setFormError(leaderWindowClosedMessage(windowNow.closesAt));
      return;
    }
    setSightingsSuccess(null);
    setFormError(null);
    setEditingSightingId(null);
    setForm(blankSightingForm());
    setRecordOpen(true);
  };

  const openEditForm = (s: SightingItem) => {
    if (isAdmin) return;
    const windowNow = getLeaderSightingWindow(walk, new Date());
    if (!windowNow.isOpen) {
      setFormError(leaderWindowClosedMessage(windowNow.closesAt));
      return;
    }
    setSightingsSuccess(null);
    setFormError(null);
    setEditingSightingId(s.sighting_id);
    setForm({
      adult_count: s.adult_count,
      juvenile_count: s.juvenile_count,
      infant_count: s.infant_count,
      behavior: s.behavior,
      notes: s.notes ?? '',
      latitude: s.latitude,
      longitude: s.longitude,
      locationSource: null,
      observation_timestamp: s.observation_timestamp,
      existingImages: s.images_references ?? [],
      removedExistingImages: [],
      newFiles: [],
    });
    setRecordOpen(true);
  };

  const removeSelectedNewFile = (index: number) => {
    setForm((prev) => ({
      ...prev,
      newFiles: prev.newFiles.filter((_, fileIndex) => fileIndex !== index),
    }));
  };

  const removeExistingImage = (url: string) => {
    setForm((prev) => {
      const nextExistingImages = prev.existingImages.filter((existingUrl) => existingUrl !== url);
      const nextTotalPhotos = nextExistingImages.length + prev.newFiles.length;

      setFormError(
        nextTotalPhotos < 1 && editingSightingId
          ? 'At least one photo is required before you can save changes. Upload a replacement photo or delete the sighting instead.'
          : null,
      );

      return {
        ...prev,
        existingImages: nextExistingImages,
        removedExistingImages: prev.removedExistingImages.includes(url)
          ? prev.removedExistingImages
          : [...prev.removedExistingImages, url],
      };
    });
  };

  const deleteStorageObjects = async (urls: string[]) => {
    await Promise.all(
      urls.map(async (url) => {
        try {
          await deleteObject(ref(storage, url));
        } catch {
          // Best effort cleanup only; the sighting document is the source of truth.
        }
      }),
    );
  };

  const canEditSighting = (s: SightingItem) =>
    !isAdmin && isLeader && leaderSightingWindow.isOpen && s.submission_status === 'DRAFT';

  const validateForm = () => {
    const totalPhotos = form.existingImages.length + form.newFiles.length;
    if (totalPhotos < 1) {
      return isEditing
        ? 'At least one photo is required before you can save changes. Upload a replacement photo or delete the sighting instead.'
        : 'At least one photo is required.';
    }
    if (totalPhotos > MAX_SIGHTING_IMAGE_COUNT) {
      return `You can upload up to ${MAX_SIGHTING_IMAGE_COUNT} photos per sighting.`;
    }
    const fileValidation = validateSelectedImageFiles(form.newFiles, form.existingImages.length);
    if (fileValidation) {
      return fileValidation;
    }

    const totalCount = form.adult_count + form.juvenile_count + form.infant_count;
    if (totalCount < 1) {
      return 'At least one of adult, juvenile, or infant count must be 1 or more.';
    }
    if (!form.behavior.trim()) {
      return 'Behavior is required.';
    }
    const hasCoords = typeof form.latitude === 'number' && typeof form.longitude === 'number';
    if (!hasCoords) {
      return 'Location is required. Allow location access or choose a point on the map.';
    }
    return null;
  };

  const acquireDeviceLocation = () => {
    if (!navigator.geolocation) return;

    const onSuccess = (pos: GeolocationPosition) => {
      setForm((prev) => ({
        ...prev,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        locationSource: 'device',
      }));
    };

    // Try high accuracy first. If it fails (common offline when A-GPS is unavailable),
    // fall back to lower accuracy which uses cached or satellite-only positioning.
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          onSuccess,
          () => {
            // Both attempts failed; user can still pick on map
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 },
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  };

  const uploadAndAttachImages = async (walkId: string, sightingId: string, files: File[]) => {
    let uploadedCount = 0;

    for (const file of files) {
      try {
        const storagePath = buildSightingImageStoragePath(walkId, sightingId, file);
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, {
          contentType: file.type || 'application/octet-stream',
        });
        const downloadUrl = await getDownloadURL(storageRef);

        await RafflesGoService.addSightingImageReference(walkId, sightingId, {
          imageUrl: downloadUrl,
        });
        uploadedCount += 1;
      } catch (e) {
        throw new SightingImageUploadError(
          parseApiErrorMessage(e, `Failed to upload ${file.name}.`),
          uploadedCount,
        );
      }
    }
  };

  const handleConfirmCreate = async () => {
    if (!id) return;
    setShowRecordConfirm(false);
    setFormError(null);
    setSightingsSuccess(null);

    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }

    const saveCreateOffline = async (walkId: string) => {
      await savePendingSighting(walkId, {
        adult_count: form.adult_count,
        juvenile_count: form.juvenile_count,
        infant_count: form.infant_count,
        behavior: form.behavior.trim(),
        notes: form.notes ?? '',
        observation_timestamp: new Date().toISOString(),
        latitude: form.latitude as number,
        longitude: form.longitude as number,
      }, form.newFiles);

      await refreshPendingCount();
      setSightingsSuccess('Sighting saved offline. It will sync when you reconnect.');
      setRecordOpen(false);
      setEditingSightingId(null);
      setForm(blankSightingForm());
    };

    if (!navigator.onLine) {
      setRecording(true);
      try {
        await saveCreateOffline(id);
      } catch (err) {
        console.error('Local save failed:', err);
        setFormError(err instanceof Error ? err.message : 'Failed to save sighting offline.');
      } finally {
        setRecording(false);
      }
      return;
    }

    const windowNow = getLeaderSightingWindow(walk, new Date());
    if (!windowNow.isOpen) {
      setFormError(leaderWindowClosedMessage(windowNow.closesAt));
      return;
    }

    setRecording(true);
    let createdSightingId: string | null = null;
    try {
      const created = await RafflesGoService.createSighting(id, {
        adult_count: form.adult_count,
        juvenile_count: form.juvenile_count,
        infant_count: form.infant_count,
        behavior: form.behavior.trim(),
        notes: form.notes ?? '',
        images_references: [],
        observation_timestamp: new Date().toISOString(),
        latitude: form.latitude as number,
        longitude: form.longitude as number,
      });

      createdSightingId = created.sighting_id;

      if (form.newFiles.length > 0) {
        await uploadAndAttachImages(id, createdSightingId, form.newFiles);
      }

      setSightingsSuccess('Sighting recorded.');
      setRecordOpen(false);
      setEditingSightingId(null);
      setForm(blankSightingForm());
      await refreshSightings();
    } catch (e) {
      if (isNetworkLikeError(e) && !createdSightingId) {
        try {
          await saveCreateOffline(id);
        } catch (err) {
          console.error('Local save failed:', err);
          setFormError(err instanceof Error ? err.message : 'Failed to save sighting offline.');
        }
        return;
      }

      if (createdSightingId) {
        setRecordOpen(false);
        setEditingSightingId(null);
        setForm(blankSightingForm());
        await refreshSightings();
        showToast({
          message: 'Sighting recorded, but one or more photos failed to upload. Edit the sighting to retry.',
          variant: 'error',
        });
        return;
      }

      setFormError(parseApiErrorMessage(e, 'Failed to record sighting.'));
    } finally {
      setRecording(false);
    }
  };

  const saveEditOffline = async (walkId: string, sightingId: string) => {
    await savePendingEdit(walkId, sightingId, {
      adult_count: form.adult_count,
      juvenile_count: form.juvenile_count,
      infant_count: form.infant_count,
      behavior: form.behavior.trim(),
      notes: form.notes ?? '',
      latitude: form.latitude as number,
      longitude: form.longitude as number,
      observation_timestamp: form.observation_timestamp || new Date().toISOString(),
      images_references: form.existingImages,
    }, form.newFiles, form.removedExistingImages);

    await refreshPendingCount();
    setSightingsSuccess('Edit saved offline. It will sync when you reconnect.');
    setRecordOpen(false);
    setEditingSightingId(null);
    setForm(blankSightingForm());
  };

  const handleConfirmSave = async () => {
    if (!id || !editingSightingId) return;
    setShowSaveConfirm(false);
    setFormError(null);
    setSightingsSuccess(null);

    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }

    // Offline path: save edit locally
    if (isOffline) {
      setRecording(true);
      try {
        await saveEditOffline(id, editingSightingId);
      } catch {
        setFormError('Failed to save edit offline.');
      } finally {
        setRecording(false);
      }
      return;
    }

    const windowNow = getLeaderSightingWindow(walk, new Date());
    if (!windowNow.isOpen) {
      setFormError(leaderWindowClosedMessage(windowNow.closesAt));
      return;
    }

    setRecording(true);
    try {
      await RafflesGoService.updateSighting(id, editingSightingId, {
        adult_count: form.adult_count,
        juvenile_count: form.juvenile_count,
        infant_count: form.infant_count,
        behavior: form.behavior.trim(),
        notes: form.notes ?? '',
        images_references: form.existingImages,
        observation_timestamp: form.observation_timestamp || new Date().toISOString(),
        latitude: form.latitude as number,
        longitude: form.longitude as number,
      });

      if (form.removedExistingImages.length > 0) {
        await deleteStorageObjects(form.removedExistingImages);
      }

      if (form.newFiles.length > 0) {
        await uploadAndAttachImages(id, editingSightingId, form.newFiles);
      }

      setSightingsSuccess('Sighting updated.');
      setRecordOpen(false);
      setEditingSightingId(null);
      setForm(blankSightingForm());
      await refreshSightings();
    } catch (e) {
      if (isNetworkLikeError(e)) {
        try {
          await saveEditOffline(id, editingSightingId);
        } catch {
          setFormError('Failed to save edit offline.');
        }
      } else {
        setFormError(parseApiErrorMessage(e, 'Failed to update sighting.'));
      }
    } finally {
      setRecording(false);
    }
  };

  const deleteOffline = async (walkId: string, sightingId: string) => {
    await savePendingDelete(walkId, sightingId);
    await refreshPendingCount();
    setSightings((prev) => prev ? prev.filter((s) => s.sighting_id !== sightingId) : prev);
    setSightingsSuccess('Delete saved offline. It will sync when you reconnect.');
    setRecordOpen(false);
    setEditingSightingId(null);
    setForm(blankSightingForm());
    setFormError(null);
  };

  const handleDeleteSightingConfirm = async () => {
    if (!id || !editingSightingId) return;
    setShowDeleteSightingConfirm(false);
    setFormError(null);
    setSightingsSuccess(null);
    setRecording(true);

    // Offline path: queue delete locally
    if (isOffline) {
      try {
        await deleteOffline(id, editingSightingId);
      } catch {
        setFormError('Failed to save delete offline.');
      } finally {
        setRecording(false);
      }
      return;
    }

    try {
      await RafflesGoService.deleteSighting(id, editingSightingId);
      setSightingsSuccess('Sighting deleted.');
      setRecordOpen(false);
      setEditingSightingId(null);
      setForm(blankSightingForm());
      setFormError(null);
      await refreshSightings();
    } catch (e) {
      if (isNetworkLikeError(e)) {
        try {
          await deleteOffline(id, editingSightingId);
        } catch {
          setFormError('Failed to save delete offline.');
        }
      } else {
        setFormError(parseApiErrorMessage(e, 'Failed to delete sighting.'));
      }
    } finally {
      setRecording(false);
    }
  };

  const handleStartWalk = async () => {
    if (!id) return;
    setShowStartWalkConfirm(false);
    setToastError(null);
    setStartingWalk(true);
    try {
      const updated = await RafflesGoService.startWalk(id);
      setWalk({
        ...updated,
        route_info: updated.route_info as RouteCoordinates,
      });
    } catch (e) {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === 'object' && typeof (e.body as { message?: string }).message === 'string'
          ? (e.body as { message: string }).message
          : e instanceof Error
            ? e.message
            : 'Failed to start walk';
      setToastError(msg);
    } finally {
      setStartingWalk(false);
    }
  };

  const handleEndWalk = async () => {
    if (!id) return;
    setShowEndWalkConfirm(false);
    setToastError(null);
    setEndingWalk(true);
    try {
      const updated = await RafflesGoService.endWalk(id);
      setWalk({
        ...updated,
        route_info: updated.route_info as RouteCoordinates,
      });
    } catch (e) {
      const msg =
        e instanceof ApiError && e.body && typeof e.body === 'object' && typeof (e.body as { message?: string }).message === 'string'
          ? (e.body as { message: string }).message
          : e instanceof Error
            ? e.message
            : 'Failed to end walk';
      setToastError(msg);
    } finally {
      setEndingWalk(false);
    }
  };

  function renderSightingForm() {
    return (
      <div className="walk-detail-sighting-form">
        <h4 id="sighting-form-title" style={{ marginTop: 0 }}>{isEditing ? 'Edit sighting' : 'Record sighting'}</h4>

        <div
          className="walk-datetime-grid"
          style={{ marginTop: '0.75rem', gridTemplateColumns: '1fr 1fr 1fr', maxWidth: 'none' }}
        >
          <div className="filter-group">
            <label htmlFor="adult-count">Adult count</label>
            <input
              id="adult-count"
              type="number"
              min={0}
              required
              value={form.adult_count}
              disabled={recording}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  adult_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
            />
          </div>
          <div className="filter-group">
            <label htmlFor="juvenile-count">Juvenile count</label>
            <input
              id="juvenile-count"
              type="number"
              min={0}
              required
              value={form.juvenile_count}
              disabled={recording}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  juvenile_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
            />
          </div>
          <div className="filter-group">
            <label htmlFor="infant-count">Infant count</label>
            <input
              id="infant-count"
              type="number"
              min={0}
              required
              value={form.infant_count}
              disabled={recording}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  infant_count: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
            />
          </div>
        </div>

        <div className="form-row mt-lg" style={{ marginTop: '0.75rem' }}>
          <div className="filter-group" style={{ flex: 1 }}>
            <label htmlFor="behavior">Behavior</label>
            <input
              id="behavior"
              type="text"
              required
              value={form.behavior}
              disabled={recording}
              onChange={(e) => setForm((prev) => ({ ...prev, behavior: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <div className="filter-group" style={{ flex: 1 }}>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              value={form.notes}
              disabled={recording}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>
        </div>

        <div className="walk-detail-section" style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <strong>Location</strong>
              <div className="text-muted" style={{ marginTop: '0.25rem' }}>
                {typeof form.latitude === 'number' && typeof form.longitude === 'number'
                  ? `${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}`
                  : 'Not set'}
                {form.locationSource === 'device' && ' (from device)'}
                {form.locationSource === 'map' && ' (set on map)'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={recording}
                onClick={acquireDeviceLocation}
              >
                Use device location
              </button>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <p className="form-hint" style={{ marginTop: 0 }}>
              Click the map to mark where you spotted the langur, or use device location if you are at the observation point.
            </p>
            <PointPickerMap
              value={
                form.latitude != null && form.longitude != null
                  ? [form.latitude, form.longitude]
                  : null
              }
              onChange={(lat, lng) =>
                setForm((prev) => ({
                  ...prev,
                  latitude: lat,
                  longitude: lng,
                  locationSource: 'map',
                }))
              }
              height="280px"
            />
          </div>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <strong>Photos (required)</strong>
          <p className="form-hint" style={{ marginTop: '0.25rem' }}>
            Add at least one photo. Up to {MAX_SIGHTING_IMAGE_COUNT} photos, {Math.round(MAX_SIGHTING_IMAGE_SIZE_BYTES / (1024 * 1024))} MB per image, {Math.round(MAX_SIGHTING_TOTAL_UPLOAD_BYTES / (1024 * 1024))} MB total per upload.
          </p>

          {form.existingImages.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {form.existingImages.map((url, idx) => (
                <div key={`existing-${idx}`} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    className="walk-detail-image-thumb"
                    onClick={() => setImagePreviewUrl(url)}
                    aria-label={`Preview existing photo ${idx + 1}`}
                  >
                    <img
                      src={url}
                      alt={`Existing photo ${idx + 1}`}
                      style={{
                        width: '96px',
                        height: '72px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                      }}
                    />
                  </button>
                  <button
                    type="button"
                    className="walk-detail-image-remove"
                    disabled={recording}
                    onClick={() => removeExistingImage(url)}
                    aria-label={`Remove existing photo ${idx + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            multiple
            required={form.existingImages.length + form.newFiles.length < 1}
            disabled={recording}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              const validation = validateSelectedImageFiles(files, form.existingImages.length);
              if (validation) {
                setFormError(validation);
                e.currentTarget.value = '';
                return;
              }
              setFormError(null);
              setForm((prev) => ({ ...prev, newFiles: files }));
            }}
          />
          {form.newFiles.length > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
              <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                Selected: {form.newFiles.length} file{form.newFiles.length !== 1 ? 's' : ''}
              </div>
              {form.newFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.lastModified}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    background: 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</div>
                    <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={recording}
                    onClick={() => removeSelectedNewFile(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn-primary"
            disabled={recording}
            onClick={() => {
              setFormError(null);
              const validation = validateForm();
              if (validation) {
                setFormError(validation);
                return;
              }
              if (isEditing) setShowSaveConfirm(true);
              else setShowRecordConfirm(true);
            }}
          >
            {recording ? (isEditing ? 'Saving…' : 'Recording…') : isEditing ? 'Save changes' : 'Record sighting'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={recording}
            onClick={() => {
              setRecordOpen(false);
              setEditingSightingId(null);
              setFormError(null);
              setForm(blankSightingForm());
            }}
          >
            Cancel
          </button>
          {isEditing && (
            <button
              type="button"
              className="btn-danger"
              disabled={recording}
              onClick={() => setShowDeleteSightingConfirm(true)}
            >
              {recording ? 'Deleting…' : 'Delete sighting'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {imagePreviewUrl && (
        <div
          className="modal active walk-detail-image-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setImagePreviewUrl(null)}
        >
          <div
            className="modal-content walk-detail-image-preview-modal__content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="walk-detail-image-preview-modal__close"
              onClick={() => setImagePreviewUrl(null)}
              aria-label="Close image preview"
            >
              ×
            </button>
            <img
              src={imagePreviewUrl}
              alt="Selected sighting"
              className="walk-detail-image-preview-modal__image"
            />
          </div>
        </div>
      )}
      {!isAdmin && recordOpen && (
        <div
          className="modal active walk-detail-sighting-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sighting-form-title"
          onClick={() => {
            if (recording) return;
            setRecordOpen(false);
            setEditingSightingId(null);
            setForm(blankSightingForm());
            setFormError(null);
          }}
        >
          <div
            className="modal-content walk-detail-sighting-modal__content"
            onClick={(e) => e.stopPropagation()}
          >
            {renderSightingForm()}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={showWithdrawConfirm}
        message={
          walk?.group_leader_id === user.uid
            ? 'Are you sure you want to withdraw from this walk? You are the current designated submitter. If you continue, the role will be reassigned automatically if another eligible participant exists.'
            : 'Are you sure you want to withdraw from this walk?'
        }
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={handleWithdrawConfirm}
        onCancel={() => setShowWithdrawConfirm(false)}
      />
      <ConfirmDialog
        open={showDeleteWalkConfirm}
        message="Are you sure you want to delete this walk? This cannot be undone."
        confirmLabel="Delete walk"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteWalkConfirm(false)}
      />
      <ConfirmDialog
        open={showStartWalkConfirm}
        message="Starting the walk cannot be reversed. Are you sure you want to start this walk?"
        confirmLabel="Start walk"
        cancelLabel="Cancel"
        onConfirm={handleStartWalk}
        onCancel={() => setShowStartWalkConfirm(false)}
      />
      <ConfirmDialog
        open={showEndWalkConfirm}
        message="Ending the walk cannot be reversed. Are you sure you want to end this walk?"
        confirmLabel="End walk"
        cancelLabel="Cancel"
        onConfirm={handleEndWalk}
        onCancel={() => setShowEndWalkConfirm(false)}
      />
      <Navigation user={user} />
      <main className="main-content page-shell">
        <div className="container">
          <OfflineBanner pendingCount={pendingCount} isSyncing={isSyncing} syncResult={syncResult} hidden={recordOpen} />
          <header className="page-header hero-panel page-hero walk-detail-hero">
            <Link to="/walks" className="back-link walk-detail-hero__back">
              ← {isAdmin ? 'Manage walks' : 'Browse walks'}
            </Link>
            <div className="walk-detail-hero__content">
              <div className="hero-copy walk-detail-hero__main">
                <span className="hero-kicker">
                  {isAdmin ? 'Walk management' : 'Walk overview'}
                </span>
                <h1 className="walk-detail-hero__title">
                  {walk?.name?.trim() || 'Survey walk details'}
                </h1>
                <p className="page-subtitle hero-subtitle walk-detail-hero__subtitle">
                  {isAdmin
                    ? 'Edit route, timing, capacity, and participant list.'
                    : 'Review route, date, and slot availability below.'}
                </p>
              </div>
              {walk && (
                <div className="hero-meta-card walk-detail-hero__meta">
                  <div className="hero-meta-grid">
                    <div className="hero-stat walk-detail-hero-stat-row">
                      <div className="walk-detail-status-labelled">
                        <span className="walk-detail-status-field-label">Status</span>
                        <StatusTag status={walk.status} />
                      </div>
                    </div>
                    <div className="hero-stat">
                      <span className="hero-stat__label">Volunteer slots</span>
                      <strong className="hero-stat__value">{walk.max_slots}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </header>

          <section className="card section-panel walk-detail-page-panel" aria-label="Walk details">
            {loading && (
              <p className="loading">Loading walk…</p>
            )}

            {!loading && walk && isAdmin && (
              <form
                onSubmit={handleSave}
                className="form-section form-section--elevated walk-detail-admin-form"
              >
                <div className="form-row mt-lg" style={{ marginBottom: '1rem' }}>
                  <div className="filter-group" style={{ flex: 1, maxWidth: '400px' }}>
                    <label htmlFor="walk-name-edit">Walk name</label>
                    <input
                      id="walk-name-edit"
                      type="text"
                      placeholder="e.g. Central Catchment Survey"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <span className="form-hint" style={{ display: 'block', marginTop: '0.25rem' }}>
                      Shown on Browse walks, My Walks and Manage walks.
                    </span>
                  </div>
                </div>
                <div className="walk-detail-map-heading-block">
                  <h2 className="walk-detail-map-heading-title">Map and waypoints</h2>
                  <p className="walk-detail-map-heading-desc">
                    Click the map to add waypoints. The route needs at least two points before
                    publishing.
                  </p>
                </div>
                <RouteMap
                  route={routeInfo}
                  editable
                  onRouteChange={setRouteInfo}
                  height="400px"
                  className="map-section"
                />
                <div className="form-row form-group" style={{ marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={removeLastWaypoint}
                    disabled={routeInfo.length <= 2}
                    aria-label="Remove last waypoint"
                  >
                    Remove last point
                  </button>
                  {routeInfo.length > 0 && (
                    <span className="text-muted" style={{ alignSelf: 'center' }}>
                      {routeInfo.length} point{routeInfo.length !== 1 ? 's' : ''}
                    </span>
                  )}
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
                    <label htmlFor="walk-end-time">End time</label>
                    <input
                      id="walk-end-time"
                      type="time"
                      min={endTimeMin}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
                <p className="form-hint" style={{ marginTop: '-0.5rem', marginBottom: '1.5rem', maxWidth: '560px' }}>
                  Leave end time blank for 2 hours after start. Same day as start.
                </p>

                <div className="walk-detail-section walk-detail-admin-status-field">
                  <div className="walk-detail-status-labelled">
                    <span className="walk-detail-status-field-label">Status</span>
                    <StatusTag status={walk.status} />
                  </div>
                  <div className="flex items-center gap-2" style={{ marginTop: '0.5rem' }}>
                    <Users
                      size={16}
                      aria-hidden
                      style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {(walk.current_participant_count ?? 0)} / {walk.max_slots} slots filled
                    </span>
                    {(walk.current_participant_count ?? 0) >= walk.max_slots && (
                      <Tag variant="walk-full">Walk full</Tag>
                    )}
                  </div>
                </div>

                {canStartOrEndWalk && (
                  <div className="walk-detail-section" style={{ marginTop: '1.25rem' }}>
                    {showStartButton && (
                      <div style={{ marginBottom: showEndButton ? '0.75rem' : 0 }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setShowStartWalkConfirm(true)}
                          disabled={startButtonDisabled}
                          style={{
                            padding: '0.5rem 1.25rem',
                            fontSize: '1rem',
                            fontWeight: 600,
                          }}
                        >
                          {startingWalk ? 'Starting…' : 'Start walk'}
                        </button>
                        {startButtonDisabled && !startingWalk && (
                          <p className="form-hint" style={{ marginTop: '0.5rem', marginBottom: 0, fontWeight: 500 }}>
                            {!scheduledStartPassed
                              ? `Not time yet — you can start from ${formatDateTime(walk.date_time)}.`
                              : 'Start window has closed (end of scheduled day).'}
                          </p>
                        )}
                      </div>
                    )}
                    {showEndButton && (
                      <div>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setShowEndWalkConfirm(true)}
                          disabled={endingWalk}
                          style={{
                            padding: '0.5rem 1.25rem',
                            fontSize: '1rem',
                            fontWeight: 600,
                          }}
                        >
                          {endingWalk ? 'Ending…' : 'End walk'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="walk-detail-section mt-lg">
                  <h3>Participants</h3>
                  <div className="participants-card participants-card--panel">
                    {participantsLoading && (
                      <p className="text-muted" style={{ margin: 0 }}>Loading participants…</p>
                    )}
                    {!participantsLoading && participantsError && (
                      <p className="text-muted" style={{ margin: 0 }}>{participantsError}</p>
                    )}
                    {!participantsLoading && !participantsError && participants !== null && participants.length === 0 && (
                      <p className="text-muted" style={{ margin: 0 }}>No volunteers have signed up for this walk yet.</p>
                    )}
                    {!participantsLoading && !participantsError && participants !== null && participants.length > 0 && (
                      <ul className="participant-list participant-list--clean" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {participants.map((p) => {
                          const display = userDisplayMap[p.user_id]?.displayName
                            || userDisplayMap[p.user_id]?.email
                            || p.user_id;
                          const isSubmitter = p.user_id === walk.group_leader_id;
                          const isDeactivated = Boolean(p.disabled);
                          return (
                            <li
                              key={p.participation_id}
                              className="participant-item participant-item--row walk-detail-participant-row"
                            >
                              <span
                                className={isDeactivated ? 'text-muted-foreground' : undefined}
                                style={isDeactivated ? { opacity: 0.75 } : undefined}
                              >
                                {display}
                              </span>
                              {isDeactivated && (
                                <Tag variant="deactivated">Deactivated</Tag>
                              )}
                              {isSubmitter && (
                                <Tag variant="designated-submitter">
                                  Designated submitter
                                </Tag>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  {renderTransferSubmitterPanel()}
                </div>

                <div className="form-actions mt-lg walk-detail-admin-form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={handleDelete}
                    disabled={deleting}
                    aria-label="Delete this walk"
                  >
                    {deleting ? 'Deleting…' : 'Delete walk'}
                  </button>
                </div>
              </form>
            )}

            {!loading && !pageError && walk && isAdmin && (
              <div className="walk-detail-section mt-lg">
                <h3>Sightings for this walk</h3>
                {leaderSightingWindow.closesAt && (
                  <p className="form-hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
                    Sightings can be recorded and edited until {formatDateTime(leaderSightingWindow.closesAt.toISOString())}. After that, editing is locked.
                  </p>
                )}

                {sightingsLoading && (
                  <p className="text-muted" style={{ marginTop: '0.5rem' }}>Loading sightings…</p>
                )}
                {!sightingsLoading && sightingsError && (
                  <p className="text-muted" style={{ marginTop: '0.5rem' }}>{sightingsError}</p>
                )}

                {!sightingsLoading && !sightingsError && sightings !== null && sightings.length === 0 && (
                  <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                    No sightings recorded for this walk yet.
                  </p>
                )}

                {!sightingsLoading && !sightingsError && sightings !== null && sightings.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                    {sightings.map((s) =>
                      !isAdmin && editingSightingId === s.sighting_id ? (
                        <div
                          key={s.sighting_id}
                          className="card"
                          style={{
                            padding: '1rem',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-card)',
                          }}
                        >
                          {renderSightingForm()}
                        </div>
                      ) : (
                        <div
                          key={s.sighting_id}
                          className="card"
                          style={{
                            padding: '1rem',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-card)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '1.35rem', lineHeight: 1.2 }}>
                                Adults: {s.adult_count} · Juveniles: {s.juvenile_count} · Infants: {s.infant_count}
                              </div>

                              <div style={{ marginTop: '0.5rem' }}>
                                <strong>Behavior:</strong> {s.behavior}
                              </div>

                              <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                <strong>Recorded:</strong> {formatDateTime(s.observation_timestamp)}
                              </div>
                              <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                <strong>Last edited:</strong> {formatDateTime(s.last_edited_at ?? s.observation_timestamp)}
                              </div>

                              {s.notes?.trim() && (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <strong>Notes:</strong> {s.notes}
                                </div>
                              )}

                              <div className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                Location: {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                              </div>
                            </div>

                            {canEditSighting(s) && (
                              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => openEditForm(s)}
                                >
                                  Edit
                                </button>
                              </div>
                            )}
                          </div>

                          {s.images_references && s.images_references.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                              {s.images_references.map((url, idx) => (
                                <button
                                  type="button"
                                  key={`${s.sighting_id}-${idx}`}
                                  className="walk-detail-image-thumb"
                                  onClick={() => setImagePreviewUrl(url)}
                                  aria-label={`Preview sighting photo ${idx + 1}`}
                                >
                                  <img
                                    src={url}
                                    alt={`Sighting photo ${idx + 1}`}
                                    style={{
                                      width: '96px',
                                      height: '72px',
                                      objectFit: 'cover',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color)',
                                    }}
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}

            {!loading && !pageError && walk && !isAdmin && (
              <>
                <div className="walk-detail-section">
                  <h3>Route</h3>
                  <RouteMap
                    route={walk.route_info}
                    height="320px"
                    fitBounds
                  />
                </div>
                {isSignedUp && walk.group_leader_id === user.uid && (
                  <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.1rem' }}>
                    <p className="text-muted" style={{ margin: 0 }}>
                      You are the <strong>designated submitter</strong> for this walk. You can record sightings for the group.
                    </p>
                  </div>
                )}
                {!isAdmin && walk.group_leader_id === user.uid && (walk.status === 'UPCOMING' || walk.status === 'IN_PROGRESS') && (
                  <div className="walk-detail-section" style={{ marginBottom: '1.25rem' }}>
                    {walk.status === 'UPCOMING' && (
                      <div>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => setShowStartWalkConfirm(true)}
                          disabled={startButtonDisabled}
                          style={{ padding: '0.5rem 1.25rem', fontSize: '1rem', fontWeight: 600 }}
                        >
                          {startingWalk ? 'Starting…' : 'Start walk'}
                        </button>
                        {startButtonDisabled && !startingWalk && (
                          <p className="form-hint" style={{ marginTop: '0.5rem', marginBottom: 0, fontWeight: 500 }}>
                            {!scheduledStartPassed
                              ? `Not time yet — you can start from ${formatDateTime(walk.date_time)}.`
                              : 'Start window has closed (end of scheduled day).'}
                          </p>
                        )}
                      </div>
                    )}
                    {walk.status === 'IN_PROGRESS' && (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setShowEndWalkConfirm(true)}
                        disabled={endingWalk}
                        style={{ padding: '0.5rem 1.25rem', fontSize: '1rem', fontWeight: 600 }}
                      >
                        {endingWalk ? 'Ending…' : 'End walk'}
                      </button>
                    )}
                  </div>
                )}
                <div className="walk-details-grid walk-detail-section">
                  <div className="detail-item">
                    <span className="detail-icon">
                      <Calendar
                        size={16}
                        aria-hidden
                        style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                      />
                    </span>
                    <div className="detail-text">
                      <span className="detail-label">Start date</span>
                      <span className="detail-value">{formatDateOnly(walk.date_time)}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-icon">
                      <Clock
                        size={16}
                        aria-hidden
                        style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                      />
                    </span>
                    <div className="detail-text">
                      <span className="detail-label">Start time</span>
                      <span className="detail-value">{formatTimeOnly(walk.date_time)}</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-icon">
                      <Clock
                        size={16}
                        aria-hidden
                        style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                      />
                    </span>
                    <div className="detail-text">
                      <span className="detail-label">End time</span>
                      <span className="detail-value">
                        {formatTimeOnly(walk.scheduled_end_time ?? startPlus2Hours(walk.date_time))}
                      </span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-icon">
                      <Users
                        size={16}
                        aria-hidden
                        style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                      />
                    </span>
                    <div className="detail-text">
                      <span className="detail-label">Max slots</span>
                      <span className="detail-value">{walk.max_slots}</span>
                    </div>
                  </div>
                  <div className="detail-item walk-detail-volunteer-status-item">
                    <span className="detail-icon" aria-hidden>
                      <CircleDot
                        size={16}
                        style={{ opacity: 0.7, flexShrink: 0, color: 'currentColor' }}
                      />
                    </span>
                    <div className="detail-text">
                      <div className="walk-detail-status-labelled">
                        <span className="walk-detail-status-field-label">Status</span>
                        <StatusTag status={walk.status} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="walk-detail-section" style={{ marginTop: '1rem' }}>
                  {volunteerWalkRefreshing ? (
                    <p className="text-sm text-muted-foreground">Loading participants…</p>
                  ) : (
                    <>
                      {(() => {
                        const maxSlots = walk.max_slots;
                        const currentCount = walk.current_participant_count ?? 0;
                        const isFull = currentCount >= maxSlots;
                        const participantsList = walk.participants ?? [];
                        return (
                          <>
                            {isFull ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Tag variant="absent">Walk full</Tag>
                                <span className="text-sm text-muted-foreground">
                                  {currentCount} / {maxSlots} filled
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground flex items-center gap-2">
                                <Users
                                  size={16}
                                  aria-hidden
                                  style={{ flexShrink: 0, opacity: 0.7, color: 'currentColor' }}
                                />
                                {currentCount} / {maxSlots} slots filled
                              </span>
                            )}
                            <div style={{ marginTop: '1rem' }}>
                              <h3
                                className="text-sm text-muted-foreground"
                                style={{
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.06em',
                                  marginBottom: '0.5rem',
                                }}
                              >
                                Participants
                              </h3>
                              {participantsList.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No participants yet.</p>
                              ) : (
                                <ul
                                  className="flex gap-2"
                                  style={{
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: 0,
                                    flexDirection: 'column',
                                  }}
                                >
                                  {participantsList.map((p) => {
                                    const deactivated = Boolean(p.disabled);
                                    return (
                                    <li key={p.user_id} className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className="flex items-center rounded-full font-medium flex-shrink-0"
                                        style={{
                                          width: 32,
                                          height: 32,
                                          justifyContent: 'center',
                                          fontSize: '0.75rem',
                                          lineHeight: 1,
                                          background: 'var(--bg-secondary)',
                                          color: deactivated ? 'var(--text-muted)' : 'var(--text-primary)',
                                          opacity: deactivated ? 0.75 : 1,
                                        }}
                                        aria-hidden
                                      >
                                        {displayNameInitials(p.display_name)}
                                      </span>
                                      <span
                                        className={`text-sm font-medium${deactivated ? ' text-muted-foreground' : ''}`}
                                        style={deactivated ? { opacity: 0.85 } : undefined}
                                      >
                                        {p.display_name}
                                      </span>
                                      {deactivated && (
                                        <Tag variant="deactivated">Deactivated</Tag>
                                      )}
                                      {p.is_designated_submitter && (
                                        <Tag variant="designated-submitter">Designated submitter</Tag>
                                      )}
                                    </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  )}
                  {renderTransferSubmitterPanel()}
                </div>
                <div className="walk-detail-section" style={{ marginTop: '1.5rem' }}>
                  {walk.status === 'UPCOMING' ? (
                    <>
                      <div className="walk-detail-volunteer-actions-row">
                        {isSignedUp ? (
                          <button
                            type="button"
                            className="btn-danger walk-detail-volunteer-action-btn"
                            onClick={handleWithdrawClick}
                            disabled={withdrawing}
                          >
                            {withdrawing ? 'Withdrawing…' : 'Withdraw from walk'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary walk-detail-volunteer-action-btn"
                            onClick={handleSignUp}
                            disabled={signingUp}
                          >
                            {signingUp ? 'Signing up…' : 'Sign up for this walk'}
                          </button>
                        )}
                        <Link
                          to="/my-walks"
                          className="btn-secondary walk-detail-volunteer-action-btn"
                        >
                          My walks
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-muted" style={{ marginBottom: '0.5rem' }}>
                        {walk.status === 'COMPLETED'
                          ? 'This walk is no longer accepting sign-ups. The walk has been completed.'
                          : walk.status === 'IN_PROGRESS'
                            ? 'This walk is no longer accepting sign-ups. The walk is currently in progress.'
                            : walk.status === 'ABANDONED'
                              ? 'This walk is no longer accepting sign-ups. The walk has been abandoned.'
                              : `This walk is no longer accepting sign-ups. (${formatWalkStatus(walk.status)})`}
                      </p>
                      <div className="walk-detail-volunteer-actions-row">
                        <Link
                          to="/my-walks"
                          className="btn-secondary walk-detail-volunteer-action-btn"
                        >
                          My walks
                        </Link>
                      </div>
                    </>
                  )}
                </div>

                {/* Sightings section (participants can view; leader can record/edit within window) */}
                {(isSignedUp || isLeader || isAdmin) && (
                  <div className="walk-detail-section mt-lg">
                    <h3>Sightings for this walk</h3>
                    {leaderSightingWindow.closesAt && (
                      <p className="form-hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
                        Sightings can be recorded and edited until {formatDateTime(leaderSightingWindow.closesAt.toISOString())}. After that, editing is locked.
                      </p>
                    )}

                    {sightingsLoading && (
                      <p className="text-muted" style={{ marginTop: '0.5rem' }}>Loading sightings…</p>
                    )}
                    {!sightingsLoading && sightingsError && (
                      <p className="text-muted" style={{ marginTop: '0.5rem' }}>{sightingsError}</p>
                    )}

                    {!sightingsLoading && !sightingsError && sightings !== null && sightings.length === 0 && pendingCount === 0 && (
                      <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                        No sightings recorded for this walk yet.
                      </p>
                    )}

                    {!isAdmin && isLeader && (
                      <div style={{ marginTop: '1rem' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={openCreateForm}
                          disabled={!leaderSightingWindow.isOpen}
                        >
                          Record sighting
                        </button>
                        {!leaderSightingWindow.isOpen && (
                          <p className="form-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                            {leaderSightingWindow.reason ?? 'Recording/editing is not available right now.'}
                            {leaderSightingWindow.closesAt
                              ? ` Window closed at ${formatDateTime(leaderSightingWindow.closesAt.toISOString())}.`
                              : null}
                          </p>
                        )}
                      </div>
                    )}

                    {!sightingsLoading && !sightingsError && sightings !== null && sightings.length > 0 && (
                      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                        {sightings.map((s) =>
                          <div
                            key={s.sighting_id}
                            className="card"
                            style={{
                              padding: '1rem',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-card)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1.35rem', lineHeight: 1.2 }}>
                                  Adults: {s.adult_count} · Juveniles: {s.juvenile_count} · Infants: {s.infant_count}
                                </div>

                                <div style={{ marginTop: '0.5rem' }}>
                                  <strong>Behavior:</strong> {s.behavior}
                                </div>

                                <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                                  <strong>Recorded:</strong> {formatDateTime(s.observation_timestamp)}
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                  <strong>Last edited:</strong> {formatDateTime(s.last_edited_at ?? s.observation_timestamp)}
                                </div>

                                {s.notes?.trim() && (
                                  <div style={{ marginTop: '0.5rem' }}>
                                    <strong>Notes:</strong> {s.notes}
                                  </div>
                                )}

                                <div className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                  Location: {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                                </div>
                              </div>
                              {canEditSighting(s) && (
                                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => openEditForm(s)}
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </div>

                            {s.images_references && s.images_references.length > 0 && (
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                                {s.images_references.map((url, idx) => (
                                  <button
                                    type="button"
                                    key={`${s.sighting_id}-${idx}`}
                                    className="walk-detail-image-thumb"
                                    onClick={() => setImagePreviewUrl(url)}
                                    aria-label={`Preview sighting photo ${idx + 1}`}
                                  >
                                    <img
                                      src={url}
                                      alt={`Sighting photo ${idx + 1}`}
                                      style={{
                                        width: '96px',
                                        height: '72px',
                                        objectFit: 'cover',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                      }}
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <ConfirmDialog
                      open={showRecordConfirm}
                      message={recordConfirmMessage}
                      confirmLabel={recording ? 'Recording…' : 'Record'}
                      cancelLabel="Cancel"
                      onConfirm={handleConfirmCreate}
                      onCancel={() => setShowRecordConfirm(false)}
                    />
                    <ConfirmDialog
                      open={showSaveConfirm}
                      message={saveConfirmMessage}
                      confirmLabel={recording ? 'Saving…' : 'Save'}
                      cancelLabel="Cancel"
                      onConfirm={handleConfirmSave}
                      onCancel={() => setShowSaveConfirm(false)}
                    />
                    <ConfirmDialog
                      open={showDeleteSightingConfirm}
                      message="Are you sure you want to delete this recording? This cannot be undone."
                      confirmLabel={recording ? 'Deleting…' : 'Delete'}
                      cancelLabel="Cancel"
                      onConfirm={handleDeleteSightingConfirm}
                      onCancel={() => setShowDeleteSightingConfirm(false)}
                    />
                  </div>
                )}
              </>
            )}

            {!loading && pageError && (
              <p className="text-muted">Unable to load walk details right now.</p>
            )}

            {!loading && !pageError && !walk && id && (
              <p className="text-muted">Walk not found.</p>
            )}

            {!id && (
              <p className="text-muted">No walk selected.</p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
