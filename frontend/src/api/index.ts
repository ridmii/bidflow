import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Auctions
export const auctionsApi = {
  list: (status?: string) => api.get('/auctions', { params: status ? { status } : {} }),
  get: (id: string) => api.get(`/auctions/${id}`),
  create: (data: any) => api.post('/auctions', data),
  update: (id: string, data: any) => api.patch(`/auctions/${id}`, data),
  schedule: (id: string) => api.post(`/auctions/${id}/schedule`),
  cancel: (id: string) => api.post(`/auctions/${id}/cancel`),
  minimumBid: (id: string) => api.get(`/auctions/${id}/minimum-bid`),
  auditLog: (id: string) => api.get(`/auctions/${id}/audit`),
};

// Bids
export const bidsApi = {
  place: (auctionId: string, data: any) => api.post(`/auctions/${auctionId}/bids`, data),
  history: (auctionId: string) => api.get(`/auctions/${auctionId}/bids`),
  setAutoBid: (auctionId: string, data: any) => api.post(`/auctions/${auctionId}/bids/auto`, data),
  getMyAutoBid: (auctionId: string) => api.get(`/auctions/${auctionId}/bids/auto/me`),
};

