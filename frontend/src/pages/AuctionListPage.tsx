import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auctionsApi } from '../api';
import { formatCurrency, formatDate, getTimeRemaining } from '../utils';
import toast from 'react-hot-toast';

type Status = 'ALL' | 'LIVE' | 'SCHEDULED' | 'COMPLETED' | 'DRAFT';

export default function AuctionListPage() {
  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status>('ALL');
  const navigate = useNavigate();

  const loadAuctions = async () => {
    try {
      const res = await auctionsApi.list(filter === 'ALL' ? undefined : filter);
      setAuctions(res.data);
    } catch {
      toast.error('Failed to load auctions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadAuctions();
  }, [filter]);

  const statuses: Status[] = ['ALL', 'LIVE', 'SCHEDULED', 'COMPLETED', 'DRAFT'];

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading auctions...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Live Auctions</h1>
          <p className="page-subtitle">Bid in real-time on exclusive items</p>
        </div>
      </div>

      <div className="filter-bar">
        {statuses.map(s => (
          <button
            key={s}
            className={`filter-btn ${filter === s ? 'active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {auctions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No auctions found</div>
          <p>Check back soon or try a different filter</p>
        </div>
      ) : (
        <div className="auction-grid">
          {auctions.map(auction => (
            <AuctionCard key={auction.id} auction={auction} onClick={() => navigate(`/auctions/${auction.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionCard({ auction, onClick }: { auction: any; onClick: () => void }) {
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(auction.endTime));

  useEffect(() => {
    if (auction.status !== 'LIVE') return;
    const interval = setInterval(() => {
      setTimeLeft(getTimeRemaining(auction.endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction.endTime, auction.status]);

  return (
    <div className="auction-card" onClick={onClick} id={`auction-card-${auction.id}`}>
      <div className="auction-card-body">
        <span className={`status-badge status-${auction.status}`}>{auction.status}</span>
        <div className="auction-card-title">{auction.title}</div>
        <div className="auction-card-desc">{auction.description}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="price-label">Current Price</div>
            <div className="price-display">{formatCurrency(auction.currentPrice)}</div>
          </div>

          {auction.status === 'LIVE' && (
            <div style={{ textAlign: 'right' }}>
              <div className="price-label">Ends in</div>
              <div style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: timeLeft.isUrgent ? 'var(--accent-red)' : 'var(--text-primary)',
              }}>
                {timeLeft.display}
              </div>
            </div>
          )}

          {auction.status === 'SCHEDULED' && (
            <div style={{ textAlign: 'right' }}>
              <div className="price-label">Starts</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {formatDate(auction.startTime)}
              </div>
            </div>
          )}

          {(auction.status === 'COMPLETED' || auction.status === 'RESERVE_NOT_MET') && auction.winnerName && (
            <div style={{ textAlign: 'right' }}>
              <div className="price-label">Winner</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-gold)' }}>
                🏆 {auction.winnerName}
              </div>
            </div>
          )}
        </div>

        {auction.hasReservePrice && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            🔒 Reserve price applies
          </div>
        )}
      </div>
    </div>
  );
}
