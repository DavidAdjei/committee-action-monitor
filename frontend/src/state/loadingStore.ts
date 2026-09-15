import { create } from "zustand";

interface LoadingStoreState {
  activeRequests: number;
  isLoading: boolean;
  startRequest: () => void;
  stopRequest: () => void;
}

export const useLoadingStore = create<LoadingStoreState>((set) => ({
  activeRequests: 0,
  isLoading: false,
  startRequest: () =>
    set((state) => {
      const next = state.activeRequests + 1;
      return { activeRequests: next, isLoading: next > 0 };
    }),
  stopRequest: () =>
    set((state) => {
      const next = Math.max(0, state.activeRequests - 1);
      return { activeRequests: next, isLoading: next > 0 };
    }),
}));
