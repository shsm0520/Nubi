import { create } from "zustand";

export type NginxResponse = {
  timestamp: string;
  endpoint: string;
  payload: unknown;
  error?: string;
};

export interface NginxState {
  loading: boolean;
  history: NginxResponse[];
  setLoading: (loading: boolean) => void;
  addResponse: (entry: NginxResponse) => void;
}

export const useNginxStore = create<NginxState>((set) => ({
  loading: false,
  history: [],
  setLoading: (loading) => set({ loading }),
  addResponse: (entry) =>
    set((state) => ({ history: [entry, ...state.history].slice(0, 20) })),
}));
