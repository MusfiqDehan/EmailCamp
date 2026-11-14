import { useState, useEffect, useCallback, useRef } from 'react';
import Cookies from 'js-cookie';
import type { RealtimeConnectionState } from '@/config/state-machines';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001';

export interface CampaignStatusUpdate {
  id: string;
  name: string;
  status: string;
  old_status: string;
  stats_sent: number;
  stats_delivered: number;
  stats_opened: number;
  stats_clicked: number;
  stats_total_recipients: number;
  updated_at: string;
}

export interface RealtimeMessage {
  type: 'campaign_status_update' | 'notification' | 'unread_count';
  data?: any;
  count?: number;
}

export type CampaignStatusUpdateCallback = (update: CampaignStatusUpdate) => void;

export const useRealtimeUpdates = () => {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const callbacksRef = useRef<Map<string, CampaignStatusUpdateCallback>>(new Map());
  
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3 seconds

  const isConnected = connectionState === 'connected';

  // Register a callback for campaign status updates
  const onCampaignStatusUpdate = useCallback((id: string, callback: CampaignStatusUpdateCallback) => {
    callbacksRef.current.set(id, callback);
    
    // Return unsubscribe function
    return () => {
      callbacksRef.current.delete(id);
    };
  }, []);

  // Broadcast campaign status update to all registered callbacks
  const broadcastCampaignUpdate = useCallback((update: CampaignStatusUpdate) => {
    // Call specific campaign callback
    const callback = callbacksRef.current.get(update.id);
    if (callback) {
      callback(update);
    }
    
    // Also call global callback if it exists
    const globalCallback = callbacksRef.current.get('*');
    if (globalCallback) {
      globalCallback(update);
    }
  }, []);

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      // Get auth token from cookies
      const accessToken = Cookies.get('access_token');
      if (!accessToken) {
        setConnectionState('disconnected');
        return;
      }

      setConnectionState(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

      // Create WebSocket connection with auth token
      const ws = new WebSocket(`${WS_URL}/ws/notifications/?token=${accessToken}`);
      
      ws.onopen = () => {
        setConnectionState('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);

          if (message.type === 'campaign_status_update') {
            broadcastCampaignUpdate(message.data as CampaignStatusUpdate);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = () => {
        setConnectionState('error');
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        // Attempt to reconnect if not a manual close
        if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          setConnectionState('reconnecting');
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, RECONNECT_DELAY);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setConnectionState('error');
          setError('Failed to connect to real-time service. Please refresh the page.');
        } else {
          setConnectionState('disconnected');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setConnectionState('error');
      setError('Failed to establish real-time connection');
    }
  }, [broadcastCampaignUpdate]);

  // Initial WebSocket setup
  useEffect(() => {
    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close(1000); // Normal closure
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isConnected,
    connectionState,
    error,
    reconnect: connectWebSocket,
    onCampaignStatusUpdate
  };
};
