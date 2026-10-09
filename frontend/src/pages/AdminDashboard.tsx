import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auctionsApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatDate } from '../utils';
import toast from 'react-hot-toast';

type IncrementTier = { maxPrice: number | null; increment: number };
type FormValues = {
  title: string;
  description: string;
  startingPrice: string;
  reservePrice: string;
  startTime: string;
  endTime: string;
  minimumBidIncrement: string;
  antiSnipingMinutes: string;
  extensionMinutes: string;
  maxExtensions: string;
  useIncrementTiers: boolean;
};
type FieldErrors = Partial<Record<keyof FormValues | 'incrementTiers', string>>;

const defaultTiers: IncrementTier[] = [
  { maxPrice: 10000, increment: 100 },
  { maxPrice: 50000, increment: 500 },
  { maxPrice: 100000, increment: 1000 },
  { maxPrice: null, increment: 2500 },
];

const createDefaultForm = (): FormValues => ({
  title: '',
  description: '',
  startingPrice: '',
  reservePrice: '',
  startTime: '',
  endTime: '',
  minimumBidIncrement: '500',
  antiSnipingMinutes: '2',
  extensionMinutes: '2',
  maxExtensions: '3',
  useIncrementTiers: true,
});

function toLocalDateTime(value: string | Date): string {
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getServerFieldErrors(error: any): FieldErrors {
  const fieldMap: Record<string, keyof FieldErrors> = {
    title: 'title',
    description: 'description',
    startingPrice: 'startingPrice',
    reservePrice: 'reservePrice',
    startTime: 'startTime',
    endTime: 'endTime',
    minimumBidIncrement: 'minimumBidIncrement',
    antiSnipingDuration: 'antiSnipingMinutes',
    extensionDuration: 'extensionMinutes',
    maxExtensions: 'maxExtensions',
    incrementTiers: 'incrementTiers',
  };
  const errors: FieldErrors = {};
  const serverErrors = error.response?.data?.errors;

  if (serverErrors && typeof serverErrors === 'object') {
    for (const [field, message] of Object.entries(serverErrors)) {
      const formField = fieldMap[field];
      if (formField && typeof message === 'string') {
        errors[formField] = message;
      }
    }
  }

  const messages = error.response?.data?.message;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (typeof message !== 'string') continue;
      const field = Object.keys(fieldMap).find((name) => message.startsWith(`${name} `));
      if (field) errors[fieldMap[field]] = message;
    }
  } else if (typeof messages === 'string') {
    const field = Object.keys(fieldMap).find((name) => messages.startsWith(`${name} `));
    if (field) errors[fieldMap[field]] = messages;
  }

  return errors;
}

export default function AdminDashboard() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(createDefaultForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuthStore();

  useEffect(() => {
    if (searchParams.get('create') === '1') setShowCreate(true);
  }, [searchParams]);

  const loadAuctions = async () => {
    try {
      const response = await auctionsApi.list();
      setAuctions(response.data);
    } catch {
      toast.error('Failed to load auctions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin()) void loadAuctions();
  }, [isAdmin]);

  const resetForm = () => {
    setForm(createDefaultForm());
    setFieldErrors({});
    setEditingId(null);
  };

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};
    const startingPrice = Number(form.startingPrice);
    const reservePrice = form.reservePrice === '' ? undefined : Number(form.reservePrice);
    const startTime = new Date(form.startTime).getTime();
    const endTime = new Date(form.endTime).getTime();

    if (!form.title.trim()) errors.title = 'Title is required';
    if (!form.description.trim()) errors.description = 'Description is required';
    if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
      errors.startingPrice = 'Starting price must be a positive number';
    }
    if (reservePrice !== undefined && (!Number.isFinite(reservePrice) || reservePrice <= 0)) {
      errors.reservePrice = 'Reserve price must be a positive number';
    } else if (reservePrice !== undefined && reservePrice < startingPrice) {
      errors.reservePrice = 'Reserve price must be at least the starting price';
    }
    if (!form.startTime) errors.startTime = 'Start date and time are required';
    if (!form.endTime || !Number.isFinite(endTime)) errors.endTime = 'End date and time are required';
    else if (Number.isFinite(startTime) && endTime <= startTime) {
      errors.endTime = 'End time must be after start time';
    }
    if (!Number.isInteger(Number(form.minimumBidIncrement)) || Number(form.minimumBidIncrement) <= 0) {
      errors.minimumBidIncrement = 'Minimum increment must be a positive number';
    }
    if (!Number.isInteger(Number(form.antiSnipingMinutes)) || Number(form.antiSnipingMinutes) <= 0) {
      errors.antiSnipingMinutes = 'Anti-sniping window must be a positive number';
    }
    if (!Number.isInteger(Number(form.extensionMinutes)) || Number(form.extensionMinutes) <= 0) {
      errors.extensionMinutes = 'Extension duration must be a positive number';
    }
    if (!Number.isInteger(Number(form.maxExtensions)) || Number(form.maxExtensions) < 0) {
      errors.maxExtensions = 'Max extensions must be a non-negative whole number';
    }

    return errors;
  };

  const handleCreateOrUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        startingPrice: Number(form.startingPrice),
        reservePrice: form.reservePrice === '' ? undefined : Number(form.reservePrice),
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        minimumBidIncrement: Number(form.minimumBidIncrement),
        antiSnipingDuration: Number(form.antiSnipingMinutes) * 60,
        extensionDuration: Number(form.extensionMinutes) * 60,
        maxExtensions: Number(form.maxExtensions),
        incrementTiers: form.useIncrementTiers ? defaultTiers : undefined,
      };

      if (editingId) {
        await auctionsApi.update(editingId, payload);
        toast.success('Auction updated successfully');
      } else {
        await auctionsApi.create({ ...payload, status: 'DRAFT' });
        toast.success('Auction created successfully');
      }

      setShowCreate(false);
      resetForm();
      await loadAuctions();
    } catch (error: any) {
      const serverErrors = getServerFieldErrors(error);
      setFieldErrors(serverErrors);
      if (Object.keys(serverErrors).length === 0) {
        const message = error.response?.data?.message;
        toast.error(Array.isArray(message) ? message.join(', ') : message || 'Failed to save auction');
      } else {
        toast.error('Please correct the highlighted fields');
      }
    }
  };

  const handleAction = async (id: string, action: 'schedule' | 'cancel') => {
    if (action === 'cancel' && !window.confirm('Are you sure you want to cancel this auction?')) return;
    try {
      if (action === 'schedule') await auctionsApi.schedule(id);
      else await auctionsApi.cancel(id);
      toast.success(`Auction ${action}d successfully`);
      await loadAuctions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || `Failed to ${action} auction`);
    }
  };

  const handleEdit = (auction: any) => {
    setForm({
      title: auction.title,
      description: auction.description,
      startingPrice: String(auction.startingPrice),
      reservePrice: auction.reservePrice == null ? '' : String(auction.reservePrice),
      startTime: toLocalDateTime(auction.startTime),
      endTime: toLocalDateTime(auction.endTime),
      minimumBidIncrement: String(auction.minimumBidIncrement ?? 500),
      antiSnipingMinutes: String((auction.antiSnipingDuration ?? 120) / 60),
      extensionMinutes: String((auction.extensionDuration ?? 120) / 60),
      maxExtensions: String(auction.maxExtensions ?? 3),
      useIncrementTiers: Array.isArray(auction.incrementTiers) && auction.incrementTiers.length > 0,
    });
    setFieldErrors({});
    setEditingId(auction.id);
    setShowCreate(true);
  };

  if (!isAdmin()) return <div className="alert alert-error">Access denied. Admin only.</div>;

  const fieldError = (field: keyof FormValues | 'incrementTiers') =>
    fieldErrors[field] ? <p className="form-error" role="alert">{fieldErrors[field]}</p> : null;

  return (
    <div>
      <div className="page-header admin-page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Manage all platform auctions</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (showCreate) {
              setShowCreate(false);
              resetForm();
            } else {
              setShowCreate(true);
            }
          }}
        >
          {showCreate ? 'Close Form' : '+ Create Auction'}
        </button>
      </div>

      {showCreate && (
        <div className="card admin-auction-form-card">
          <h2>{editingId ? 'Edit Auction' : 'Create New Auction'}</h2>
          <form onSubmit={handleCreateOrUpdate} className="admin-auction-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="auction-title">Title *</label>
              <input
                id="auction-title"
                name="title"
                type="text"
                className="form-control"
                required
                value={form.title}
                aria-invalid={Boolean(fieldErrors.title)}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              {fieldError('title')}
            </div>

            <div className="form-group admin-form-full-width">
              <label className="form-label" htmlFor="auction-description">Description *</label>
              <textarea
                id="auction-description"
                name="description"
                className="form-control"
                required
                value={form.description}
                aria-invalid={Boolean(fieldErrors.description)}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              {fieldError('description')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="starting-price">Starting Price *</label>
              <input
                id="starting-price"
                name="startingPrice"
                type="number"
                className="form-control"
                min="0.01"
                step="1"
                required
                value={form.startingPrice}
                aria-invalid={Boolean(fieldErrors.startingPrice)}
                onChange={(event) => setForm({ ...form, startingPrice: event.target.value })}
              />
              {fieldError('startingPrice')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reserve-price">Reserve Price (optional)</label>
              <input
                id="reserve-price"
                name="reservePrice"
                type="number"
                className="form-control"
                min="0.01"
                step="1"
                value={form.reservePrice}
                aria-invalid={Boolean(fieldErrors.reservePrice)}
                onChange={(event) => setForm({ ...form, reservePrice: event.target.value })}
              />
              {fieldError('reservePrice')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="start-time">Start Date and Time *</label>
              <input
                id="start-time"
                name="startTime"
                type="datetime-local"
                className="form-control"
                required
                value={form.startTime}
                aria-invalid={Boolean(fieldErrors.startTime)}
                onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              />
              {fieldError('startTime')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="end-time">End Date and Time *</label>
              <input
                id="end-time"
                name="endTime"
                type="datetime-local"
                className="form-control"
                required
                value={form.endTime}
                aria-invalid={Boolean(fieldErrors.endTime)}
                onChange={(event) => setForm({ ...form, endTime: event.target.value })}
              />
              {fieldError('endTime')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="minimum-increment">Minimum Increment *</label>
              <input
                id="minimum-increment"
                name="minimumBidIncrement"
                type="number"
                className="form-control"
                min="0.01"
                step="1"
                required
                value={form.minimumBidIncrement}
                aria-invalid={Boolean(fieldErrors.minimumBidIncrement)}
                onChange={(event) => setForm({ ...form, minimumBidIncrement: event.target.value })}
              />
              {fieldError('minimumBidIncrement')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="anti-sniping">Anti-sniping Window (minutes) *</label>
              <input
                id="anti-sniping"
                name="antiSnipingMinutes"
                type="number"
                className="form-control"
                min="0.01"
                step="1"
                required
                value={form.antiSnipingMinutes}
                aria-invalid={Boolean(fieldErrors.antiSnipingMinutes)}
                onChange={(event) => setForm({ ...form, antiSnipingMinutes: event.target.value })}
              />
              {fieldError('antiSnipingMinutes')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="extension-duration">Extension Duration (minutes) *</label>
              <input
                id="extension-duration"
                name="extensionMinutes"
                type="number"
                className="form-control"
                min="0.01"
                step="1"
                required
                value={form.extensionMinutes}
                aria-invalid={Boolean(fieldErrors.extensionMinutes)}
                onChange={(event) => setForm({ ...form, extensionMinutes: event.target.value })}
              />
              {fieldError('extensionMinutes')}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="max-extensions">Max Extensions *</label>
              <input
                id="max-extensions"
                name="maxExtensions"
                type="number"
                className="form-control"
                min="0"
                step="1"
                required
                value={form.maxExtensions}
                aria-invalid={Boolean(fieldErrors.maxExtensions)}
                onChange={(event) => setForm({ ...form, maxExtensions: event.target.value })}
              />
              {fieldError('maxExtensions')}
            </div>

            <fieldset className="form-group admin-form-full-width admin-tier-options">
              <legend className="form-label">Increment Tiers (optional)</legend>
              <label className="admin-tier-toggle">
                <input
                  type="checkbox"
                  checked={form.useIncrementTiers}
                  onChange={(event) => setForm({ ...form, useIncrementTiers: event.target.checked })}
                />
                Use default increment tiers
              </label>
              {form.useIncrementTiers && (
                <ul>
                  <li>0–10,000: 100</li>
                  <li>10,001–50,000: 500</li>
                  <li>50,001–100,000: 1,000</li>
                  <li>Above 100,000: 2,500</li>
                </ul>
              )}
              {fieldError('incrementTiers')}
            </fieldset>

            <div className="admin-form-full-width">
              <button type="submit" className="btn btn-success">
                {editingId ? 'Save Changes' : 'Create Auction'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 className="admin-auction-list-title">All Auctions</h3>
        {loading ? (
          <div className="spinner" />
        ) : (
          <div className="admin-auction-table-wrap">
            <table className="admin-auction-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Dates</th>
                  <th>Price/Winner</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map((auction) => (
                  <tr key={auction.id}>
                    <td>{auction.title}</td>
                    <td><span className={`status-badge status-${auction.status}`}>{auction.status}</span></td>
                    <td>
                      <div>S: {formatDate(auction.startTime)}</div>
                      <div>E: {formatDate(auction.endTime)}</div>
                    </td>
                    <td>
                      <div className="admin-auction-price">{formatCurrency(auction.currentPrice)}</div>
                      {auction.reservePrice != null && <div>Res: {formatCurrency(auction.reservePrice)}</div>}
                      {auction.winnerName && <div>W: {auction.winnerName}</div>}
                    </td>
                    <td>
                      {(auction.status === 'DRAFT' || auction.status === 'SCHEDULED') && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(auction)}>Edit</button>
                      )}
                      {auction.status === 'DRAFT' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAction(auction.id, 'schedule')}>Schedule</button>
                      )}
                      {(auction.status === 'DRAFT' || auction.status === 'SCHEDULED' || auction.status === 'LIVE') && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleAction(auction.id, 'cancel')}>Cancel</button>
                      )}
                      <a href={`/auction/${auction.id}`} className="btn btn-secondary btn-sm">View Result / Audit</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
