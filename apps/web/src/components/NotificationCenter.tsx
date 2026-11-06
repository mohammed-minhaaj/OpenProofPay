import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { api, API_BASE_URL } from '../services/api.js';

interface NotificationItem {
  id?: string;
  _id?: string;
  type: string;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  read: boolean;
  createdAt: string;
}

export const NotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch initial notifications list
  const loadNotifications = async () => {
    try {
      const res = await api.get('/notifications?limit=20');
      if (res.data?.success) {
        setNotifications(res.data.data || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    loadNotifications();

    // Subscribe to SSE real-time notifications stream
    let eventSource: EventSource | null = null;
    try {
      const token = api.getToken();
      if (token) {
        // EventSource with auth parameter or fetch stream fallback
        eventSource = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`, {
          withCredentials: true
        });

        eventSource.onopen = () => {
          setConnected(true);
        };

        eventSource.addEventListener('notification', (e) => {
          try {
            const newNotif = JSON.parse(e.data);
            setNotifications((prev) => [newNotif, ...prev.filter((n) => (n.id || n._id) !== (newNotif.id || newNotif._id))]);
            setUnreadCount((c) => c + 1);
          } catch {
            // Ignore parse errors
          }
        });

        eventSource.onerror = () => {
          setConnected(false);
        };
      }
    } catch {
      // SSE not available, falls back to polling
    }

    // Periodic refresh fallback every 30s
    const pollInterval = setInterval(loadNotifications, 30000);

    return () => {
      clearInterval(pollInterval);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => ((n.id || n._id) === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore error
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Ignore error
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'WORK_APPROVED':
      case 'PAYMENT_COMPLETED':
      case 'VERIFICATION_COMPLETED':
        return <CheckCircle size={15} style={{ color: '#10b981' }} />;
      case 'DISPUTE_UPDATED':
      case 'REVISION_REQUESTED':
      case 'VERIFICATION_FAILED':
        return <AlertTriangle size={15} style={{ color: '#f59e0b' }} />;
      default:
        return <Info size={15} style={{ color: '#3b82f6' }} />;
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={connected ? 'Real-time Notifications Connected' : 'Notifications'}
        style={{
          position: 'relative',
          background: 'none',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '6px',
          width: '34px',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: unreadCount > 0 ? '#fff' : 'var(--text-secondary)',
          backgroundColor: isOpen ? 'rgba(59, 130, 246, 0.1)' : 'transparent'
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              borderRadius: '999px',
              minWidth: '16px',
              height: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            marginTop: '8px',
            width: '360px',
            maxHeight: '480px',
            backgroundColor: '#181b23',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Notifications</span>
              {unreadCount > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa'
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-blue)',
                  fontSize: '11px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map((item) => {
                const notifId = item.id || item._id || '';
                return (
                  <div
                    key={notifId}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      backgroundColor: item.read ? 'transparent' : 'rgba(59, 130, 246, 0.06)',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      transition: 'background-color 0.15s ease'
                    }}
                  >
                    <div style={{ marginTop: '2px' }}>{getIconForType(item.type)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: item.read ? 500 : 700,
                          color: item.read ? 'var(--text-secondary)' : '#fff',
                          marginBottom: '2px'
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          lineHeight: '1.4',
                          wordBreak: 'break-word'
                        }}
                      >
                        {item.message}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          marginTop: '4px'
                        }}
                      >
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {!item.read && (
                      <button
                        onClick={() => markAsRead(notifId)}
                        title="Mark read"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px'
                        }}
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
