import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { auctionsApi, bidsApi } from '../api';
import { getSocket, joinAuction, leaveAuction } from '../socket';
import { formatCurrency, formatDate, getTimeRemaining } from '../utils';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function AuctionDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [auction, setAuction] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [minBidInfo, setMinBidInfo] = useState<any>(null);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [autoBidAmount, setAutoBidAmount] = useState<string>('');
  const [myAutoBid, setMyAutoBid] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeState, setTimeState] = useState<any>(null);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [bidError, setBidError] = useState('');
  const [autoBidError, setAutoBidError] = useState('');
  const { user } = useAuthStore();
  const socketRef = useRef<any>(null);
  const bidAttemptRef = useRef<{ amount: number; idempotencyKey: string } | null>(null);

  const getBidErrorMessage = (error: any, action: 'bid' | 'auto-bid') => {
    const status = error.response?.status;
    const responseMessage = error.response?.data?.message;
    if (status === 401) return 'You are not logged in. Please sign in to place a bid.';
    if (typeof responseMessage === 'string') return responseMessage;
    if (Array.isArray(responseMessage)) return responseMessage.join(', ');
    if (error.response?.data?.code === 'ALREADY_LEADING') {
      return 'You are already the leading bidder.';
    }
    return action === 'bid' ? 'Failed to place bid. Please try again.' : 'Failed to set auto-bid. Please try again.';
  };

  const loadData = async () => {
    try {
      const [auctionRes, bidsRes, minBidRes, autoBidRes] = await Promise.all([
        auctionsApi.get(id!),
        bidsApi.history(id!),
        auctionsApi.minimumBid(id!),
        bidsApi.getMyAutoBid(id!).catch(() => ({ data: null }))
      ]);
      setAuction(auctionRes.data);
      setBids(bidsRes.data);
      setMinBidInfo(minBidRes.data);
      setBidAmount(minBidRes.data.minimumNextBid.toString());
      setMyAutoBid(autoBidRes.data);
      setTimeState(getTimeRemaining(auctionRes.data.endTime));
    } catch (err) {
      toast.error('Failed to load auction data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const socket = getSocket();
    socketRef.current = socket;
    joinAuction(id!);

    socket.on('bid-placed', (data: any) => {
      setAuction((prev: any) => ({
        ...prev,
        currentPrice: data.currentPrice,
        leadingBidderId: data.bidderId,
        leadingBidderName: data.bidderName,
      }));
      setBids((prev) => [data, ...prev]);
      // re-fetch min bid info
      auctionsApi.minimumBid(id!).then(res => {
        setMinBidInfo(res.data);
        setBidAmount(res.data.minimumNextBid.toString());
      });
      if (data.bidderId !== user?.id) {
        toast('New bid placed!', { icon: '💰' });
      }
    });

    socket.on('auction-extended', (data: any) => {
      setAuction((prev: any) => ({ ...prev, endTime: data.newEndTime, extensionCount: data.extensionCount }));
      setExtensions(prev => [...prev, data]);
      toast('Auction time extended! (Anti-sniping)', { icon: '⏱️' });
    });

    socket.on('auction-ended', (data: any) => {
      setAuction((prev: any) => ({
        ...prev,
        status: data.status,
        winnerId: data.winnerId,
        winnerName: data.winnerName,
        winningBidAmount: data.winningBidAmount,
      }));
      toast.success(data.status === 'COMPLETED' ? `Auction ended! Winner: ${data.winnerName}` : `Auction ended: ${data.status}`);
    });

    return () => {
      leaveAuction(id!);
      socket.off('bid-placed');
      socket.off('auction-extended');
      socket.off('auction-ended');
    };
  }, [id, user?.id]);

  useEffect(() => {
    if (!auction) return;
    const interval = setInterval(() => {
      setTimeState(getTimeRemaining(auction.endTime));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction]);

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setBidError('');
    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBidError('Enter a valid positive bid amount.');
      return;
    }
    if (!user) {
      setBidError('You are not logged in. Please sign in to place a bid.');
      return;
    }
    if (!bidAttemptRef.current || bidAttemptRef.current.amount !== amount) {
      bidAttemptRef.current = { amount, idempotencyKey: crypto.randomUUID() };
    }

    try {
      await bidsApi.place(id!, { amount }, bidAttemptRef.current.idempotencyKey);
      bidAttemptRef.current = null;
      toast.success('Bid placed successfully!');
    } catch (error: any) {
      const message = getBidErrorMessage(error, 'bid');
      setBidError(message);
      toast.error(message);
    }
  };

  const handleSetAutoBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setAutoBidError('');
    const maxAmount = Number(autoBidAmount);
    if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
      setAutoBidError('Enter a valid positive maximum amount.');
      return;
    }
    if (!user) {
      setAutoBidError('You are not logged in. Please sign in to configure auto-bidding.');
      return;
    }

    try {
      await bidsApi.setAutoBid(id!, { maxAmount });
      toast.success('Auto-bid configured successfully!');
      const res = await bidsApi.getMyAutoBid(id!);
      setMyAutoBid(res.data);
      setAutoBidAmount('');
    } catch (error: any) {
      const message = getBidErrorMessage(error, 'auto-bid');
      setAutoBidError(message);
      toast.error(message);
    }
  };

  if (loading || !auction) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span>Loading live auction...</span>
      </div>
    );
  }

  const isLive = auction.status === 'LIVE';
  const isWinning = auction.leadingBidderId === user?.id;

  return (
    <div>
      {extensions.map((ext, idx) => (
         <div key={idx} className="extension-toast">
           <span>⏱️ <strong>Time Extended!</strong> Auction was extended due to a last-minute bid. New end time: {formatDate(ext.newEndTime)}</span>
         </div>
      ))}

      {(auction.status === 'COMPLETED' || auction.status === 'RESERVE_NOT_MET') && (
        <div className="winner-banner">
          <div className="winner-trophy">{auction.status === 'COMPLETED' ? '🏆' : '🔒'}</div>
          <div className="winner-title">
            {auction.status === 'COMPLETED' ? `Winner: ${auction.winnerName}` : 'Reserve Not Met'}
          </div>
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            Final Price: {formatCurrency(auction.currentPrice)}
          </p>
        </div>
      )}

      <div className="live-auction-layout">
        <div className="auction-main-col">
          <div className="card">
            <span className={`status-badge status-${auction.status}`}>{auction.status}</span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '1rem 0' }}>{auction.title}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginBottom: '2rem' }}>
              {auction.description}
            </p>

            <div className="grid-3" style={{ marginBottom: '2rem' }}>
              <div className="stat-block">
                <div className="stat-label">Current Price</div>
                <div className="stat-value" style={{ color: 'var(--accent-gold)' }}>
                  {formatCurrency(auction.currentPrice)}
                </div>
              </div>
              <div className="stat-block">
                <div className="stat-label">Time Remaining</div>
                <div className={`stat-value ${timeState?.isUrgent ? 'text-danger' : ''}`} style={timeState?.isUrgent ? { color: 'var(--accent-red)', animation: 'flash 1s infinite' } : {}}>
                  {timeState?.display || '--'}
                </div>
              </div>
              <div className="stat-block">
                <div className="stat-label">Current Leader</div>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                  {auction.leadingBidderName || 'None'} {isWinning && <span style={{ fontSize: '0.875rem', color: 'var(--accent-primary)' }}>(You)</span>}
                </div>
              </div>
            </div>

            {isLive ? (
              <div className="bidding-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Manual Bidding */}
                <div>
                  <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Place Manual Bid</h3>
                  <form onSubmit={handlePlaceBid}>
                    <div className="bid-input-group">
                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          className="form-control"
                          value={bidAmount}
                          onChange={e => {
                            setBidAmount(e.target.value);
                            setBidError('');
                          }}
                          min={minBidInfo?.minimumNextBid}
                          step={minBidInfo?.minimumIncrement}
                          required
                        />
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                          Min bid: {formatCurrency(minBidInfo?.minimumNextBid || 0)} (Increment: {formatCurrency(minBidInfo?.minimumIncrement || 0)})
                        </div>
                      </div>
                      <button type="submit" className="btn btn-primary btn-lg">Bid Now</button>
                    </div>
                    {bidError && <p className="form-error" role="alert">{bidError}</p>}
                  </form>
                </div>

                {/* Auto Bidding */}
                <div>
                  <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Configure Auto-Bid</h3>
                  {myAutoBid && myAutoBid.isActive && (
                     <div className="alert alert-info">
                       <strong>Auto-Bid Active</strong>
                     </div>
                  )}
                  <form onSubmit={handleSetAutoBid}>
                    <div className="bid-input-group">
                      <input
                        type="number"
                        className="form-control"
                        value={autoBidAmount}
                        onChange={e => {
                          setAutoBidAmount(e.target.value);
                          setAutoBidError('');
                        }}
                        placeholder="Your max limit..."
                        required
                        min={Number(auction.currentPrice) + 1}
                      />
                      <button type="submit" className="btn btn-gold btn-lg">Set Max</button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      We'll bid just enough to keep you in the lead, up to this amount.
                    </div>
                    {autoBidError && <p className="form-error" role="alert">{autoBidError}</p>}
                  </form>
                </div>
              </div>
            ) : (
              <div className="alert alert-warning">
                Bidding is currently closed for this auction. (Status: {auction.status})
              </div>
            )}
          </div>
        </div>

        {/* Live Bid History */}
        <div className="auction-sidebar">
          <div className="card">
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Live Bid History</h3>
            <div className="bid-list">
              {bids.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No bids yet</div>
              ) : (
                bids.map((bid, index) => (
                  <div key={bid.id} className={`bid-item ${index === 0 ? 'latest' : ''} ${bid.type === 'AUTO' ? 'bid-item-auto' : ''}`}>
                    <div>
                      <div className="bid-amount">{formatCurrency(bid.amount)}</div>
                      <div className="bid-meta">by {bid.bidderName} {bid.bidderId === user?.id && '(You)'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(bid.placedAt)}</div>
                      {bid.type === 'AUTO' && <span className="status-badge" style={{ marginTop: '0.25rem', fontSize: '0.65rem' }}>Auto</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
