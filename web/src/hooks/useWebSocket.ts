import { create } from "zustand";

export interface NginxStatusPayload {
  running: boolean;
  configValid: boolean;
  version?: string;
}

export interface MaintenancePayload {
  enabled: boolean;
  message?: string;
}

export interface MetricsPayload {
  activeConnections: number;
  uptime: number;
  uptimeString: string;
  reading: number;
  writing: number;
  waiting: number;
  rxBytes: number;
  txBytes: number;
}

interface WebSocketState {
  connected: boolean;
  nginxStatus: NginxStatusPayload | null;
  maintenanceMode: MaintenancePayload | null;
  metrics: MetricsPayload | null;
  connect: () => void;
  disconnect: () => void;
  sendAction: (action: string, data?: unknown) => void;
}

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

export const useWebSocket = create<WebSocketState>((set, get) => ({
  connected: false,
  nginxStatus: null,
  maintenanceMode: null,
  metrics: null,

  connect: () => {
    if (ws?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
      set({ connected: true });
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      set({ connected: false });
      ws = null;

      // Auto reconnect after 3 seconds
      reconnectTimeout = setTimeout(() => {
        get().connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "nginx_status":
            set({ nginxStatus: msg.payload as NginxStatusPayload });
            break;
          case "maintenance_mode":
            set({ maintenanceMode: msg.payload as MaintenancePayload });
            break;
          case "metrics":
            set({ metrics: msg.payload as MetricsPayload });
            break;
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };
  },

  disconnect: () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    set({ connected: false });
  },

  sendAction: (action: string, data?: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action, data }));
    }
  },
}));
