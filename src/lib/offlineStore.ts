/**
 * Offline Store Module
 *
 * Manages local state for offline functionality:
 * - Local placeholder events (created offline, awaiting sync)
 * - Syncing state (is currently replaying queue)
 * - Local RSVP state (RSVP changes made offline)
 */

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Event } from "@/shared/contracts";

// Storage key for local events
const LOCAL_EVENTS_KEY = "localEvents:v1";
const LOCAL_RSVPS_KEY = "localRsvps:v1";

// Local event extends Event with additional fields
export interface LocalEvent extends Partial<Event> {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string;
  location?: string;
  description?: string;
  visibility?: string;
  inviteOnly?: boolean;
  color?: string;
  isLocalOnly: true;
  localId: string; // e.g., "local_abc123"
  queueActionId?: string; // Reference to the queued action
}

// Local RSVP state
export interface LocalRsvp {
  eventId: string;
  status: "going" | "interested" | "not_going";
  localId: string;
  queueActionId?: string;
}

// Store state
interface OfflineStoreState {
  // Syncing state
  isSyncing: boolean;
  syncProgress: { current: number; total: number } | null;

  // Local events (created offline)
  localEvents: LocalEvent[];

  // Local RSVPs (changed offline)
  localRsvps: Map<string, LocalRsvp>; // eventId -> LocalRsvp

  // Actions
  setSyncing: (syncing: boolean) => void;
  setSyncProgress: (progress: { current: number; total: number } | null) => void;

  // Local event actions
  addLocalEvent: (event: LocalEvent) => void;
  removeLocalEvent: (localId: string) => void;
  reconcileLocalEvent: (localId: string, serverId: string) => void;
  clearLocalEvents: () => void;

  // Local RSVP actions
  setLocalRsvp: (eventId: string, rsvp: LocalRsvp) => void;
  removeLocalRsvp: (eventId: string) => void;
  clearLocalRsvps: () => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

// Create the store
export const useOfflineStore = create<OfflineStoreState>((set, get) => ({
  // Initial state
  isSyncing: false,
  syncProgress: null,
  localEvents: [],
  localRsvps: new Map(),

  // Syncing actions
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setSyncProgress: (progress) => set({ syncProgress: progress }),

  // Local event actions
  addLocalEvent: (event) => {
    set((state) => ({
      localEvents: [...state.localEvents, event],
    }));
    get().saveToStorage();
  },

  removeLocalEvent: (localId) => {
    set((state) => ({
      localEvents: state.localEvents.filter((e) => e.localId !== localId),
    }));
    get().saveToStorage();
  },

  reconcileLocalEvent: (localId, serverId) => {
    // Remove the local event after it's been synced
    // The server event will be fetched via query refetch
    set((state) => ({
      localEvents: state.localEvents.filter((e) => e.localId !== localId),
    }));
    get().saveToStorage();

    if (__DEV__) {
      console.log(`[OfflineStore] Reconciled local event ${localId} -> ${serverId}`);
    }
  },

  clearLocalEvents: () => {
    set({ localEvents: [] });
    get().saveToStorage();
  },

  // Local RSVP actions
  setLocalRsvp: (eventId, rsvp) => {
    set((state) => {
      const newRsvps = new Map(state.localRsvps);
      newRsvps.set(eventId, rsvp);
      return { localRsvps: newRsvps };
    });
    get().saveToStorage();
  },

  removeLocalRsvp: (eventId) => {
    set((state) => {
      const newRsvps = new Map(state.localRsvps);
      newRsvps.delete(eventId);
      return { localRsvps: newRsvps };
    });
    get().saveToStorage();
  },

  clearLocalRsvps: () => {
    set({ localRsvps: new Map() });
    get().saveToStorage();
  },

  // Persistence
  loadFromStorage: async () => {
    try {
      const [eventsData, rsvpsData] = await Promise.all([
        AsyncStorage.getItem(LOCAL_EVENTS_KEY),
        AsyncStorage.getItem(LOCAL_RSVPS_KEY),
      ]);

      const localEvents = eventsData ? JSON.parse(eventsData) : [];
      const rsvpsArray = rsvpsData ? JSON.parse(rsvpsData) : [];
      const localRsvps = new Map<string, LocalRsvp>(
        rsvpsArray.map((r: LocalRsvp) => [r.eventId, r])
      );

      set({ localEvents, localRsvps });

      if (__DEV__) {
        console.log(`[OfflineStore] Loaded ${localEvents.length} local events, ${localRsvps.size} local RSVPs`);
      }
    } catch (error) {
      if (__DEV__) {
        console.log("[OfflineStore] Error loading from storage:", error);
      }
    }
  },

  saveToStorage: async () => {
    try {
      const { localEvents, localRsvps } = get();
      const rsvpsArray = Array.from(localRsvps.values());

      await Promise.all([
        AsyncStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(localEvents)),
        AsyncStorage.setItem(LOCAL_RSVPS_KEY, JSON.stringify(rsvpsArray)),
      ]);
    } catch (error) {
      if (__DEV__) {
        console.log("[OfflineStore] Error saving to storage:", error);
      }
    }
  },
}));

// Selector hooks for efficient subscriptions
export const useIsSyncing = () => useOfflineStore((s) => s.isSyncing);
export const useSyncProgress = () => useOfflineStore((s) => s.syncProgress);
export const useLocalEvents = () => useOfflineStore((s) => s.localEvents);

// Get local RSVP for a specific event
export function useLocalRsvp(eventId: string): LocalRsvp | undefined {
  return useOfflineStore((s) => s.localRsvps.get(eventId));
}

// Check if an event is local-only
export function isLocalEvent(eventId: string): boolean {
  return eventId.startsWith("local_");
}

// Generate a local event ID
export function generateLocalEventId(): string {
  const random = Math.random().toString(36).substring(2, 10);
  return `local_${random}_${Date.now()}`;
}
