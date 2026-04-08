/**
 * createSettingsStore — Zustand store for create-page settings state.
 *
 * Shared between create.tsx and the create-settings modal page.
 * create.tsx hydrates on mount / edit-load; both pages read/write directly.
 * reset() clears everything when the create page unmounts.
 */

import { create } from "zustand";

export interface CreateSettingsState {
  // Category
  category: string;

  // Visibility
  visibility: "public" | "all_friends" | "specific_groups" | "circle_only";
  selectedGroupIds: string[];

  // Notification
  sendNotification: boolean;

  // Capacity
  hasCapacity: boolean;
  capacityInput: string;

  // RSVP Deadline
  hasRsvpDeadline: boolean;
  rsvpDeadlineDate: Date;

  // Cost Per Person
  costPerPerson: string;

  // Pitch In
  pitchInEnabled: boolean;
  pitchInAmount: string;
  pitchInMethod: "venmo" | "cashapp" | "paypal" | "other";
  pitchInHandle: string;
  pitchInNote: string;

  // What to Bring
  bringListEnabled: boolean;
  bringListItems: string[];
  bringListInput: string;

  // Privacy & Display
  showGuestList: boolean;
  showGuestCount: boolean;
  showLocationPreRsvp: boolean;
  hideWebLocation: boolean;
  hideDetailsUntilRsvp: boolean;

  // Actions
  set: (partial: Partial<Omit<CreateSettingsState, "set" | "toggleGroup" | "reset">>) => void;
  toggleGroup: (id: string) => void;
  reset: () => void;
}

const DEFAULTS: Omit<CreateSettingsState, "set" | "toggleGroup" | "reset"> = {
  category: "social",
  visibility: "all_friends",
  selectedGroupIds: [],
  sendNotification: true,
  hasCapacity: false,
  capacityInput: "",
  hasRsvpDeadline: false,
  rsvpDeadlineDate: new Date(),
  costPerPerson: "",
  pitchInEnabled: false,
  pitchInAmount: "",
  pitchInMethod: "venmo",
  pitchInHandle: "",
  pitchInNote: "",
  bringListEnabled: false,
  bringListItems: [],
  bringListInput: "",
  showGuestList: true,
  showGuestCount: true,
  showLocationPreRsvp: false,
  hideWebLocation: false,
  hideDetailsUntilRsvp: false,
};

export const useCreateSettingsStore = create<CreateSettingsState>((set) => ({
  ...DEFAULTS,

  set: (partial) => set(partial),

  toggleGroup: (id: string) =>
    set((s) => ({
      selectedGroupIds: s.selectedGroupIds.includes(id)
        ? s.selectedGroupIds.filter((gid) => gid !== id)
        : [...s.selectedGroupIds, id],
    })),

  reset: () => set(DEFAULTS),
}));
