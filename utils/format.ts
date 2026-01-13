
export const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
   if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString();
};

export const formatPresenceTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const now = new Date();
  const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSeconds < 60) {
    return 'Last seen just now';
  }
  if (diffSeconds < 3600) {
    return `Last seen ${Math.floor(diffSeconds / 60)}m ago`;
  }
  
  const timeFormat: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true };

  if (date.toDateString() === now.toDateString()) {
    return `Last seen today at ${date.toLocaleTimeString([], timeFormat)}`;
  }
  
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Last seen yesterday at ${date.toLocaleTimeString([], timeFormat)}`;
  }

  return `Last seen on ${date.toLocaleDateString()}`;
}
