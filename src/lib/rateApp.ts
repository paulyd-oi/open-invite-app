import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform, Alert } from "react-native";
import { devError } from "./devLog";

const STORAGE_KEY = "app_review_data";

// Replace with your actual App Store ID when published
const APP_STORE_ID = "6757429210";

interface ReviewData {
  eventsCreated: number;
  friendsAdded: number;
  eventsJoined: number;
  lastPromptDate: string | null;
  hasReviewed: boolean;
  appLaunches: number;
}

const DEFAULT_DATA: ReviewData = {
  eventsCreated: 0,
  friendsAdded: 0,
  eventsJoined: 0,
  lastPromptDate: null,
  hasReviewed: false,
  appLaunches: 0,
};

// Thresholds to trigger the review prompt
const EVENTS_THRESHOLD = 3;
const FRIENDS_THRESHOLD = 5;
const JOINS_THRESHOLD = 2;
const LAUNCHES_THRESHOLD = 5;
const DAYS_BETWEEN_PROMPTS = 60;

async function getReviewData(): Promise<ReviewData> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) {
      // Merge with defaults to handle new fields
      return { ...DEFAULT_DATA, ...JSON.parse(data) };
    }
    return DEFAULT_DATA;
  } catch {
    return DEFAULT_DATA;
  }
}

async function saveReviewData(data: ReviewData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    if (__DEV__) {
      devError("Failed to save review data");
    }
  }
}

function shouldPromptForReview(data: ReviewData): boolean {
  // Never prompt if already reviewed
  if (data.hasReviewed) {
    return false;
  }

  // Check if enough engagement (multiple positive signals)
  const engagementScore =
    (data.eventsCreated >= EVENTS_THRESHOLD ? 1 : 0) +
    (data.friendsAdded >= FRIENDS_THRESHOLD ? 1 : 0) +
    (data.eventsJoined >= JOINS_THRESHOLD ? 1 : 0) +
    (data.appLaunches >= LAUNCHES_THRESHOLD ? 1 : 0);

  // Require at least 2 engagement signals
  if (engagementScore < 2) {
    return false;
  }

  // Check if we've prompted recently
  if (data.lastPromptDate) {
    const lastPrompt = new Date(data.lastPromptDate);
    const daysSinceLastPrompt = Math.floor(
      (Date.now() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastPrompt < DAYS_BETWEEN_PROMPTS) {
      return false;
    }
  }

  return true;
}

function openAppStoreReview(): void {
  const url = Platform.select({
    ios: `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
    default: `market://details?id=com.vibecode.openinvite`,
  });

  if (url) {
    Linking.openURL(url).catch((err) => {
      if (__DEV__) {
        devError("Failed to open store:", err);
      }
    });
  }
}

/**
 * Show a friendly review prompt dialog
 */
async function promptForReview(): Promise<void> {
  Alert.alert(
    "Enjoying Open Invite?",
    "We'd love to hear your feedback! Would you take a moment to rate us on the App Store?",
    [
      {
        text: "Not Now",
        style: "cancel",
      },
      {
        text: "Maybe Later",
        style: "default",
      },
      {
        text: "Rate Now",
        onPress: async () => {
          const data = await getReviewData();
          data.hasReviewed = true;
          await saveReviewData(data);
          openAppStoreReview();
        },
      },
    ]
  );
}

/**
 * Track when user creates an event and potentially prompt for review
 */
export async function trackEventCreated(): Promise<void> {
  const data = await getReviewData();
  data.eventsCreated += 1;
  await saveReviewData(data);

  if (shouldPromptForReview(data)) {
    data.lastPromptDate = new Date().toISOString();
    await saveReviewData(data);
    // Small delay to not interrupt the flow
    setTimeout(() => {
      promptForReview();
    }, 1500);
  }
}

/**
 * Track when user adds a friend and potentially prompt for review
 */
export async function trackFriendAdded(): Promise<void> {
  const data = await getReviewData();
  data.friendsAdded += 1;
  await saveReviewData(data);

  if (shouldPromptForReview(data)) {
    data.lastPromptDate = new Date().toISOString();
    await saveReviewData(data);
    setTimeout(() => {
      promptForReview();
    }, 1500);
  }
}

/**
 * Track when user joins an event
 */
export async function trackEventJoined(): Promise<void> {
  const data = await getReviewData();
  data.eventsJoined += 1;
  await saveReviewData(data);

  if (shouldPromptForReview(data)) {
    data.lastPromptDate = new Date().toISOString();
    await saveReviewData(data);
    setTimeout(() => {
      promptForReview();
    }, 1500);
  }
}

/**
 * Track app launches
 */
export async function trackAppLaunch(): Promise<void> {
  const data = await getReviewData();
  data.appLaunches += 1;
  await saveReviewData(data);

  // Don't prompt on launch, just track
}

/**
 * Mark that the user has reviewed the app
 */
export async function markAsReviewed(): Promise<void> {
  const data = await getReviewData();
  data.hasReviewed = true;
  await saveReviewData(data);
}

/**
 * Reset review tracking (for testing)
 */
export async function resetReviewTracking(): Promise<void> {
  await saveReviewData(DEFAULT_DATA);
}

/**
 * Manually request a review (e.g., from settings)
 */
export async function manuallyRequestReview(): Promise<void> {
  openAppStoreReview();
}
