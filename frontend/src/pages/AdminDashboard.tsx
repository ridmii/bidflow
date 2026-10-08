import { useState, useEffect } from 'react';
import { auctionsApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { formatCurrency, formatDate } from '../utils';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const { isAdmin } = useAuthStore();

  const [form, setForm] = useState({
    title: '',
    description: '',
    startingPrice: '',
    reservePrice: '',
    startTime: '',
    endTime: '',
    minimumBidIncrement: 500,
    antiSnipingDuration: 120,
    extensionDuration: 120,
    maxExtensions: 3,
    status: 'DRAFT',
  });

  const loadAuctions = async () => {
    try {
      const res = await auctionsApi.list();
      setAuctions(res.data);
    } catch {
      toast.error('Failed to load auctions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin()) {
      loadAuctions();
    }
  }, [isAdmin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        startingPrice: Number(form.startingPrice),
        reservePrice: form.reservePrice ? Number(form.reservePrice) : undefined,
        minimumBidIncrement: Number(form.minimumBidIncrement),
        antiSnipingDuration: Number(form.antiSnipingDuration),
        extensionDuration: Number(form.extensionDuration),
        maxExtensions: Number(form.maxExtensions),
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      };
      await auctionsApi.create(payload);
      toast.success('Auction created successfully');
      setShowCreate(false);
      loadAuctions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create auction');
    }
  };

  const handleAction = async (id: string, action: 'schedule' | 'cancel') => {
    if (action === 'cancel' && !window.confirm("Are you sure you want to cancel this auction?")) {
      return;
    }
    try {
      if (action === 'schedule') {
        await auctionsApi.schedule(id);
      } else {
        await auctionsApi.cancel(id);
      }
      toast.success("Auction " + action + "d successfully");
      loadAuctions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to " + action + " auction");
    }
  };

  if (!isAdmin()) {
    return <div className="alert alert-error">Access denied. Admin only.</div>;
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">Manage all platform auctions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Close Form' : '+ Create Auction'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Create New Auction</h2>
          <form onSubmit={handleCreate} className="grid-2">
            <div className="form-group">
              <label className="form-label">Title</label>
              <input type="text" className="form-control" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
            </div>
            
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Description</label>
              <textarea className="form-control" required value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">Starting Price (Rs)</label>
              <input type="number" className="form-control" required min="1" value={form.startingPrice} onChange={e => setForm({...form, startingPrice: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">Reserve Price (Rs) - Optional</label>
              <input type="number" className="form-control" min="1" value={form.reservePrice} onChange={e => setForm({...form, reservePrice: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">Start Time</label>
              <input type="datetime-local" className="form-control" required value={form.startTime} onChange={e => setForm({...form, startTime: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">End Time</label>
              <input type="datetime-local" className="form-control" required value={form.endTime} onChange={e => setForm({...form, endTime: e.target.value})} />
            </div>

            <div className="form-group">
              <label className="form-label">Minimum Bid Increment (Rs)</label>
              <input type="number" className="form-control" required min="1" value={form.minimumBidIncrement} onChange={e => setForm({...form, minimumBidIncrement: Number(e.target.value)})} />
            </div>

            <div className="form-group">
              <label className="form-label">Anti-Sniping Duration (sec)</label>
              <input type="number" className="form-control" required min="0" value={form.antiSnipingDuration} onChange={e => setForm({...form, antiSnipingDuration: Number(e.target.value)})} />
            </div>

            <div className="form-group">
              <label className="form-label">Extension Duration (sec)</label>
              <input type="number" className="form-control" required min="0" value={form.extensionDuration} onChange={e => setForm({...form, extensionDuration: Number(e.target.value)})} />
            </div>

            <div className="form-group">
              <label className="form-label">Max Extensions</label>
              <input type="number" className="form-control" required min="0" value={form.maxExtensions} onChange={e => setForm({...form, maxExtensions: Number(e.target.value)})} />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="DRAFT">DRAFT</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="LIVE">LIVE</option>
              </select>
            </div>

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="btn btn-success">Save Auction</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>All Auctions</h3>
        {loading ? (
          <div className="spinner" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '1rem' }}>Title</th>
                  <th style={{ padding: '1rem' }}>Status</th>
                  <th style={{ padding: '1rem' }}>Dates</th>
                  <th style={{ padding: '1rem' }}>Price/Winner</th>
                  <th style={{ padding: '1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem', fontWeight: 600 }}>{a.title}</td>
                    <td style={{ padding: '1rem' }}><span className={"status-badge status-" + a.status}>{a.status}</span></td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      <div>S: {formatDate(a.startTime)}</div>
                      <div>E: {formatDate(a.endTime)}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ color: 'var(--accent-gold)' }}>{formatCurrency(a.currentPrice)}</div>
                      {a.winnerName && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>W: {a.winnerName}</div>}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {a.status === 'DRAFT' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleAction(a.id, 'schedule')}>Schedule</button>
                      )}
                      {(a.status === 'DRAFT' || a.status === 'SCHEDULED' || a.status === 'LIVE') && (
                        <button className="btn btn-danger btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => handleAction(a.id, 'cancel')}>Cancel</button>
                      )}
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
