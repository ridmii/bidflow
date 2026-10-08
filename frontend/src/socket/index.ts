import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket || socket.disconnected) {
    socket = io('http://localhost:3000/auction', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
  }
  return socket;
};

export const joinAuction = (auctionId: string) => {
  getSocket().emit('join-auction', { auctionId });
};

export const leaveAuction = (auctionId: string) => {
  getSocket().emit('leave-auction', { auctionId });
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
