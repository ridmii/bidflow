import { format, differenceInSeconds } from 'date-fns';

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatDate(dateStr: string | Date): string {
  return format(new Date(dateStr), 'MMM dd, yyyy h:mm a');
}

export function getTimeRemaining(endTimeStr: string | Date): {
  display: string;
  isUrgent: boolean;
  ended: boolean;
} {
  const end = new Date(endTimeStr);
  const now = new Date();
  const diffSecs = differenceInSeconds(end, now);

  if (diffSecs <= 0) {
    return { display: 'Ended', isUrgent: false, ended: true };
  }

  const days = Math.floor(diffSecs / 86400);
  const hours = Math.floor((diffSecs % 86400) / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  const seconds = diffSecs % 60;

  let display = '';
  if (days > 0) display += `${days}d `;
  if (hours > 0 || days > 0) display += `${hours}h `;
  display += `${minutes}m ${seconds}s`;

  return {
    display,
    isUrgent: diffSecs < 120, // less than 2 minutes
    ended: false,
  };
}
