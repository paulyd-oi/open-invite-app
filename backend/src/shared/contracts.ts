// contracts.ts
// Shared API contracts (schemas and types) used by both the server and the app.
// Import in the app as: `import { type GetSampleResponse } from "@shared/contracts"`
// Import in the server as: `import { postSampleRequestSchema } from "@shared/contracts"`

import { z } from "zod";

// ============================================
// Sample Routes (existing)
// ============================================

// GET /api/sample
export const getSampleResponseSchema = z.object({
  message: z.string(),
});
export type GetSampleResponse = z.infer<typeof getSampleResponseSchema>;

// POST /api/sample
export const postSampleRequestSchema = z.object({
  value: z.string(),
});
export type PostSampleRequest = z.infer<typeof postSampleRequestSchema>;
export const postSampleResponseSchema = z.object({
  message: z.string(),
});
export type PostSampleResponse = z.infer<typeof postSampleResponseSchema>;

// POST /api/upload/image
export const uploadImageRequestSchema = z.object({
  image: z.instanceof(File),
});
export type UploadImageRequest = z.infer<typeof uploadImageRequestSchema>;
export const uploadImageResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string(),
  filename: z.string(),
});
export type UploadImageResponse = z.infer<typeof uploadImageResponseSchema>;

// ============================================
// Open Invite - Events
// ============================================

// Event object returned from API
export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  emoji: z.string(),
  startTime: z.string(), // ISO date string
  endTime: z.string().nullable(),
  isRecurring: z.boolean(),
  recurrence: z.string().nullable(),
  visibility: z.string(),
  category: z.string().nullable().optional(), // Event category
  rsvpDeadline: z.string().nullable().optional(), // ISO date string for RSVP deadline
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }).optional(),
  groupVisibility: z.array(z.object({
    groupId: z.string(),
    group: z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
    }),
  })).optional(),
  joinRequests: z.array(z.object({
    id: z.string(),
    userId: z.string(),
    status: z.string(),
    message: z.string().nullable(),
    user: z.object({
      id: z.string(),
      name: z.string().nullable(),
      image: z.string().nullable(),
    }),
  })).optional(),
});
export type Event = z.infer<typeof eventSchema>;

// GET /api/events - Get user's events
export const getEventsResponseSchema = z.object({
  events: z.array(eventSchema),
});
export type GetEventsResponse = z.infer<typeof getEventsResponseSchema>;

// GET /api/events/feed - Get activity feed (friends' open events)
export const getEventsFeedResponseSchema = z.object({
  events: z.array(eventSchema),
});
export type GetEventsFeedResponse = z.infer<typeof getEventsFeedResponseSchema>;

// GET /api/events/calendar-events - Get events for calendar view (created + going)
// Query params: start (ISO date), end (ISO date)
export const getCalendarEventsResponseSchema = z.object({
  createdEvents: z.array(eventSchema),
  goingEvents: z.array(eventSchema),
});
export type GetCalendarEventsResponse = z.infer<typeof getCalendarEventsResponseSchema>;

// POST /api/events - Create new event
export const createEventRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  emoji: z.string().optional(),
  color: z.string().optional(), // Custom event color (hex)
  startTime: z.string(), // ISO date string
  endTime: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurrence: z.string().optional(),
  visibility: z.enum(["all_friends", "specific_groups", "circle_only", "private"]),
  groupIds: z.array(z.string()).optional(), // Required if visibility is specific_groups
  circleId: z.string().optional(), // Required if visibility is circle_only
  isPrivateCircleEvent: z.boolean().optional(), // If true, shows as "busy" to non-circle members
  sendNotification: z.boolean().optional(), // Whether to notify friends about this event
  reflectionEnabled: z.boolean().optional(), // Whether to prompt for reflection after event (default true)
});
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;
export const createEventResponseSchema = z.object({
  event: eventSchema,
});
export type CreateEventResponse = z.infer<typeof createEventResponseSchema>;

// PUT /api/events/:id - Update event
export const updateEventRequestSchema = createEventRequestSchema.partial();
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;
export const updateEventResponseSchema = z.object({
  event: eventSchema,
});
export type UpdateEventResponse = z.infer<typeof updateEventResponseSchema>;

// DELETE /api/events/:id
export const deleteEventResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteEventResponse = z.infer<typeof deleteEventResponseSchema>;

// POST /api/events/:id/join - Request to join event
export const joinEventRequestSchema = z.object({
  message: z.string().optional(),
});
export type JoinEventRequest = z.infer<typeof joinEventRequestSchema>;
export const joinEventResponseSchema = z.object({
  success: z.boolean(),
  joinRequest: z.object({
    id: z.string(),
    status: z.string(),
  }),
});
export type JoinEventResponse = z.infer<typeof joinEventResponseSchema>;

// PUT /api/events/:eventId/join/:requestId - Accept/reject join request
export const updateJoinRequestSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});
export type UpdateJoinRequest = z.infer<typeof updateJoinRequestSchema>;
export const updateJoinResponseSchema = z.object({
  success: z.boolean(),
});
export type UpdateJoinResponse = z.infer<typeof updateJoinResponseSchema>;

// ============================================
// Open Invite - Event Comments
// ============================================

// Comment object
export const eventCommentSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  userId: z.string(),
  content: z.string(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export type EventComment = z.infer<typeof eventCommentSchema>;

// GET /api/events/:id/comments - Get event comments
export const getEventCommentsResponseSchema = z.object({
  comments: z.array(eventCommentSchema),
});
export type GetEventCommentsResponse = z.infer<typeof getEventCommentsResponseSchema>;

// POST /api/events/:id/comments - Create comment
export const createCommentRequestSchema = z.object({
  content: z.string().min(1),
  imageUrl: z.string().optional(),
});
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;
export const createCommentResponseSchema = z.object({
  comment: eventCommentSchema,
});
export type CreateCommentResponse = z.infer<typeof createCommentResponseSchema>;

// DELETE /api/events/:eventId/comments/:commentId - Delete comment
export const deleteCommentResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteCommentResponse = z.infer<typeof deleteCommentResponseSchema>;

// ============================================
// Open Invite - Friends
// ============================================

// Friend/User object
export const friendUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  image: z.string().nullable(),
  Profile: z.object({
    handle: z.string(),
    bio: z.string().nullable(),
    calendarBio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }).nullable().optional(),
});
export type FriendUser = z.infer<typeof friendUserSchema>;

// Friendship object
export const friendshipSchema = z.object({
  id: z.string(),
  friendId: z.string(),
  isBlocked: z.boolean(),
  createdAt: z.string(),
  friend: friendUserSchema,
  groupMemberships: z.array(z.object({
    groupId: z.string(),
    group: z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
    }),
  })).optional(),
});
export type Friendship = z.infer<typeof friendshipSchema>;

// GET /api/friends - Get all friends
export const getFriendsResponseSchema = z.object({
  friends: z.array(friendshipSchema),
});
export type GetFriendsResponse = z.infer<typeof getFriendsResponseSchema>;

// GET /api/friends/:id/events - Get friend's visible events
export const getFriendEventsResponseSchema = z.object({
  events: z.array(eventSchema),
  friend: friendUserSchema,
});
export type GetFriendEventsResponse = z.infer<typeof getFriendEventsResponseSchema>;

// Friend request object
export const friendRequestSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  receiverId: z.string(),
  status: z.string(),
  createdAt: z.string(),
  sender: friendUserSchema.optional(),
  receiver: friendUserSchema.optional(),
});
export type FriendRequest = z.infer<typeof friendRequestSchema>;

// GET /api/friends/requests - Get pending friend requests
export const getFriendRequestsResponseSchema = z.object({
  received: z.array(friendRequestSchema),
  sent: z.array(friendRequestSchema),
});
export type GetFriendRequestsResponse = z.infer<typeof getFriendRequestsResponseSchema>;

// POST /api/friends/request - Send friend request (by email, phone, or userId)
export const sendFriendRequestSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  userId: z.string().optional(),
}).refine(data => data.email || data.phone || data.userId, {
  message: "Either email, phone, or userId is required",
});
export type SendFriendRequest = z.infer<typeof sendFriendRequestSchema>;
export const sendFriendRequestResponseSchema = z.object({
  success: z.boolean(),
  request: friendRequestSchema.optional(),
  message: z.string().optional(),
});
export type SendFriendRequestResponse = z.infer<typeof sendFriendRequestResponseSchema>;

// PUT /api/friends/request/:id - Accept/reject friend request
export const updateFriendRequestSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});
export type UpdateFriendRequestInput = z.infer<typeof updateFriendRequestSchema>;
export const updateFriendRequestResponseSchema = z.object({
  success: z.boolean(),
});
export type UpdateFriendRequestResponse = z.infer<typeof updateFriendRequestResponseSchema>;

// DELETE /api/friends/:id - Remove friend
export const removeFriendResponseSchema = z.object({
  success: z.boolean(),
});
export type RemoveFriendResponse = z.infer<typeof removeFriendResponseSchema>;

// PUT /api/friends/:id/block - Block/unblock friend
export const blockFriendRequestSchema = z.object({
  blocked: z.boolean(),
});
export type BlockFriendRequest = z.infer<typeof blockFriendRequestSchema>;
export const blockFriendResponseSchema = z.object({
  success: z.boolean(),
});
export type BlockFriendResponse = z.infer<typeof blockFriendResponseSchema>;

// ============================================
// Open Invite - Friend Groups
// ============================================

// Friend group object
export const friendGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  userId: z.string(),
  createdAt: z.string(),
  memberships: z.array(z.object({
    friendshipId: z.string(),
    friendship: z.object({
      friend: friendUserSchema,
    }).optional(),
  })).optional(),
});
export type FriendGroup = z.infer<typeof friendGroupSchema>;

// GET /api/groups - Get all friend groups
export const getGroupsResponseSchema = z.object({
  groups: z.array(friendGroupSchema),
});
export type GetGroupsResponse = z.infer<typeof getGroupsResponseSchema>;

// POST /api/groups - Create friend group
export const createGroupRequestSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
  icon: z.string().optional(),
});
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;
export const createGroupResponseSchema = z.object({
  group: friendGroupSchema,
});
export type CreateGroupResponse = z.infer<typeof createGroupResponseSchema>;

// PUT /api/groups/:id - Update friend group
export const updateGroupRequestSchema = createGroupRequestSchema.partial();
export type UpdateGroupRequest = z.infer<typeof updateGroupRequestSchema>;
export const updateGroupResponseSchema = z.object({
  group: friendGroupSchema,
});
export type UpdateGroupResponse = z.infer<typeof updateGroupResponseSchema>;

// DELETE /api/groups/:id
export const deleteGroupResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteGroupResponse = z.infer<typeof deleteGroupResponseSchema>;

// POST /api/groups/:id/members - Add friend to group
export const addGroupMemberRequestSchema = z.object({
  friendshipId: z.string(),
});
export type AddGroupMemberRequest = z.infer<typeof addGroupMemberRequestSchema>;
export const addGroupMemberResponseSchema = z.object({
  success: z.boolean(),
});
export type AddGroupMemberResponse = z.infer<typeof addGroupMemberResponseSchema>;

// DELETE /api/groups/:id/members/:friendshipId - Remove friend from group
export const removeGroupMemberResponseSchema = z.object({
  success: z.boolean(),
});
export type RemoveGroupMemberResponse = z.infer<typeof removeGroupMemberResponseSchema>;

// ============================================
// Open Invite - Notifications
// ============================================

export const notificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.string().nullable(),
  read: z.boolean(),
  seen: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

// GET /api/notifications
export const getNotificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number(),
});
export type GetNotificationsResponse = z.infer<typeof getNotificationsResponseSchema>;

// PUT /api/notifications/:id/read
export const markNotificationReadResponseSchema = z.object({
  success: z.boolean(),
});
export type MarkNotificationReadResponse = z.infer<typeof markNotificationReadResponseSchema>;

// PUT /api/notifications/read-all
export const markAllNotificationsReadResponseSchema = z.object({
  success: z.boolean(),
});
export type MarkAllNotificationsReadResponse = z.infer<typeof markAllNotificationsReadResponseSchema>;

// ============================================
// Open Invite - Profile
// ============================================

// GET /api/profile
export const getProfileResponseSchema = z.object({
  profile: z.object({
    id: z.number(),
    handle: z.string(),
    bio: z.string().nullable(),
    calendarBio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    userId: z.string(),
    birthday: z.string().nullable(),
    showBirthdayToFriends: z.boolean(),
    hideBirthdays: z.boolean(),
    omitBirthdayYear: z.boolean(),
    usernameLastChangedAt: z.string().nullable().optional(), // ISO timestamp
  }).nullable(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable().optional(),
    image: z.string().nullable(),
    Profile: z.object({
      handle: z.string(),
      bio: z.string().nullable(),
      calendarBio: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    }).nullable().optional(),
  }).nullable(),
});
export type GetProfileResponse = z.infer<typeof getProfileResponseSchema>;

// PUT /api/profile
export const updateProfileRequestSchema = z.object({
  handle: z.string().min(3).max(30).optional(),
  bio: z.string().max(200).optional(),
  calendarBio: z.string().max(300).optional(),
  avatarUrl: z.string().url().optional(),
  name: z.string().min(1).optional(),
  phone: z.string().max(20).optional().nullable(), // Phone number for friend search
  birthday: z.string().optional(), // ISO date string
  showBirthdayToFriends: z.boolean().optional(),
  hideBirthdays: z.boolean().optional(),
  omitBirthdayYear: z.boolean().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export const updateProfileResponseSchema = z.object({
  success: z.boolean(),
  profile: z.object({
    id: z.number(),
    handle: z.string(),
    bio: z.string().nullable(),
    calendarBio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    birthday: z.string().nullable(),
    showBirthdayToFriends: z.boolean(),
    hideBirthdays: z.boolean(),
    omitBirthdayYear: z.boolean(),
  }).nullable(),
});
export type UpdateProfileResponse = z.infer<typeof updateProfileResponseSchema>;

// POST /api/profile/search (legacy) - Search users by email or handle
export const searchUsersRequestSchema = z.object({
  query: z.string().min(1),
});
export type SearchUsersRequest = z.infer<typeof searchUsersRequestSchema>;
export const searchUsersResponseSchema = z.object({
  users: z.array(friendUserSchema),
});
export type SearchUsersResponse = z.infer<typeof searchUsersResponseSchema>;

// GET /api/profile/search - Search users (Instagram-style, ranked results)
// Query params: q (search query), limit (optional)
// Note: email is NOT returned publicly - only handle is shown as public identifier
// Response shape locked for contract stability
export const searchUserResultSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  handle: z.string().nullable(),
  mutualCount: z.number().optional(),
  isFriend: z.boolean().optional(),
});
export type SearchUserResult = z.infer<typeof searchUserResultSchema>;
export const searchUsersRankedResponseSchema = z.object({
  users: z.array(searchUserResultSchema),
});
export type SearchUsersRankedResponse = z.infer<typeof searchUsersRankedResponseSchema>;

// ============================================
// Open Invite - Blocked Contacts
// ============================================

// Blocked contact object
export const blockedContactSchema = z.object({
  id: z.string(),
  userId: z.string(),
  blockedUserId: z.string().nullable(),
  blockedEmail: z.string().nullable(),
  blockedPhone: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  blockedUser: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }).nullable().optional(),
});
export type BlockedContact = z.infer<typeof blockedContactSchema>;

// GET /api/blocked - Get all blocked contacts
export const getBlockedContactsResponseSchema = z.object({
  blockedContacts: z.array(blockedContactSchema),
});
export type GetBlockedContactsResponse = z.infer<typeof getBlockedContactsResponseSchema>;

// POST /api/blocked - Block a user or identifier
export const blockContactRequestSchema = z.object({
  userId: z.string().optional(), // Block an existing user by their user ID
  email: z.string().email().optional(), // Block by email
  phone: z.string().optional(), // Block by phone
  reason: z.string().optional(),
}).refine(data => data.userId || data.email || data.phone, {
  message: "Either userId, email, or phone is required",
});
export type BlockContactRequest = z.infer<typeof blockContactRequestSchema>;
export const blockContactResponseSchema = z.object({
  success: z.boolean(),
  blockedContact: blockedContactSchema.optional(),
  message: z.string().optional(),
});
export type BlockContactResponse = z.infer<typeof blockContactResponseSchema>;

// DELETE /api/blocked/:id - Unblock a contact
export const unblockContactResponseSchema = z.object({
  success: z.boolean(),
});
export type UnblockContactResponse = z.infer<typeof unblockContactResponseSchema>;

// POST /api/blocked/search - Search for users to block
export const searchToBlockRequestSchema = z.object({
  query: z.string().min(1),
});
export type SearchToBlockRequest = z.infer<typeof searchToBlockRequestSchema>;
export const searchToBlockResponseSchema = z.object({
  users: z.array(friendUserSchema),
});
export type SearchToBlockResponse = z.infer<typeof searchToBlockResponseSchema>;

// ============================================
// Open Invite - Birthdays
// ============================================

// Friend birthday object (for calendar display)
export const friendBirthdaySchema = z.object({
  id: z.string(), // friendId
  name: z.string().nullable(),
  image: z.string().nullable(),
  birthday: z.string(), // ISO date string (only month and day if year is omitted)
  showYear: z.boolean(), // Whether the year/age should be shown
});
export type FriendBirthday = z.infer<typeof friendBirthdaySchema>;

// GET /api/birthdays - Get friends' birthdays for calendar
export const getFriendBirthdaysResponseSchema = z.object({
  birthdays: z.array(friendBirthdaySchema),
});
export type GetFriendBirthdaysResponse = z.infer<typeof getFriendBirthdaysResponseSchema>;

// ============================================
// Open Invite - Event Photos (Memories)
// ============================================

export const eventPhotoSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  userId: z.string(),
  imageUrl: z.string(),
  caption: z.string().nullable(),
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export type EventPhoto = z.infer<typeof eventPhotoSchema>;

// GET /api/events/:id/photos
export const getEventPhotosResponseSchema = z.object({
  photos: z.array(eventPhotoSchema),
});
export type GetEventPhotosResponse = z.infer<typeof getEventPhotosResponseSchema>;

// POST /api/events/:id/photos
export const createEventPhotoRequestSchema = z.object({
  imageUrl: z.string().url(),
  caption: z.string().optional(),
});
export type CreateEventPhotoRequest = z.infer<typeof createEventPhotoRequestSchema>;
export const createEventPhotoResponseSchema = z.object({
  photo: eventPhotoSchema,
});
export type CreateEventPhotoResponse = z.infer<typeof createEventPhotoResponseSchema>;

// DELETE /api/events/:eventId/photos/:photoId
export const deleteEventPhotoResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteEventPhotoResponse = z.infer<typeof deleteEventPhotoResponseSchema>;

// ============================================
// Open Invite - Event Categories
// ============================================

export const eventCategorySchema = z.enum([
  "social",
  "sports",
  "food",
  "entertainment",
  "outdoor",
  "work",
  "travel",
  "wellness",
  "other",
]);
export type EventCategory = z.infer<typeof eventCategorySchema>;

export const EVENT_CATEGORIES = [
  { value: "social", label: "Social", emoji: "🎉", color: "#FF6B4A" },
  { value: "sports", label: "Sports", emoji: "⚽", color: "#4CAF50" },
  { value: "food", label: "Food & Drinks", emoji: "🍽️", color: "#FF9800" },
  { value: "entertainment", label: "Entertainment", emoji: "🎬", color: "#9C27B0" },
  { value: "outdoor", label: "Outdoor", emoji: "🏕️", color: "#00BCD4" },
  { value: "work", label: "Work", emoji: "💼", color: "#607D8B" },
  { value: "travel", label: "Travel", emoji: "✈️", color: "#3F51B5" },
  { value: "wellness", label: "Wellness", emoji: "🧘", color: "#4ECDC4" },
  { value: "other", label: "Other", emoji: "📅", color: "#78909C" },
] as const;

// ============================================
// Open Invite - Suggested Times
// ============================================

// POST /api/events/suggested-times
export const getSuggestedTimesRequestSchema = z.object({
  friendIds: z.array(z.string()).min(1),
  dateRange: z.object({
    start: z.string(), // ISO date string
    end: z.string(),   // ISO date string
  }),
  duration: z.number().min(30).optional(), // Minutes, default 60
});
export type GetSuggestedTimesRequest = z.infer<typeof getSuggestedTimesRequestSchema>;

export const timeSlotSchema = z.object({
  start: z.string(), // ISO date string
  end: z.string(),   // ISO date string
  availableFriends: z.array(z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  })),
  totalAvailable: z.number(),
});
export type TimeSlot = z.infer<typeof timeSlotSchema>;

export const getSuggestedTimesResponseSchema = z.object({
  slots: z.array(timeSlotSchema),
});
export type GetSuggestedTimesResponse = z.infer<typeof getSuggestedTimesResponseSchema>;

// ============================================
// Open Invite - Event Reminders
// ============================================

export const eventReminderSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  userId: z.string(),
  reminderTime: z.string(), // ISO date string
  minutesBefore: z.number(),
  sent: z.boolean(),
  createdAt: z.string(),
});
export type EventReminder = z.infer<typeof eventReminderSchema>;

// POST /api/events/:id/reminders
export const createEventReminderRequestSchema = z.object({
  minutesBefore: z.number().min(5).max(10080), // 5 minutes to 1 week
});
export type CreateEventReminderRequest = z.infer<typeof createEventReminderRequestSchema>;
export const createEventReminderResponseSchema = z.object({
  reminder: eventReminderSchema,
});
export type CreateEventReminderResponse = z.infer<typeof createEventReminderResponseSchema>;

// GET /api/events/:id/reminders
export const getEventRemindersResponseSchema = z.object({
  reminders: z.array(eventReminderSchema),
});
export type GetEventRemindersResponse = z.infer<typeof getEventRemindersResponseSchema>;

// DELETE /api/events/:id/reminders/:reminderId
export const deleteEventReminderResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteEventReminderResponse = z.infer<typeof deleteEventReminderResponseSchema>;

// ============================================
// Open Invite - Mutual Friends
// ============================================

// GET /api/friends/:id/mutual
export const getMutualFriendsResponseSchema = z.object({
  mutualFriends: z.array(friendUserSchema),
  count: z.number(),
});
export type GetMutualFriendsResponse = z.infer<typeof getMutualFriendsResponseSchema>;

// ============================================
// Open Invite - Friend Suggestions
// ============================================

// Public user schema - for public-facing responses without sensitive data (email/phone)
// Used for: suggestions, search results, public member lists
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

// Suggested friend object
export const friendSuggestionSchema = z.object({
  user: publicUserSchema,
  mutualFriends: z.array(z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  })),
  mutualFriendCount: z.number(),
});
export type FriendSuggestion = z.infer<typeof friendSuggestionSchema>;

// GET /api/friends/suggestions
export const getFriendSuggestionsResponseSchema = z.object({
  suggestions: z.array(friendSuggestionSchema),
});
export type GetFriendSuggestionsResponse = z.infer<typeof getFriendSuggestionsResponseSchema>;

// ============================================
// Open Invite - Suggestions Feed
// ============================================

// Suggestion action types for personalized recommendations
export const suggestionActionSchema = z.enum([
  "JOIN_EVENT",
  "NUDGE_CREATE",
  "NUDGE_INVITE",
  "RECONNECT_FRIEND",
  "HOT_AREA",
]);
export type SuggestionAction = z.infer<typeof suggestionActionSchema>;

// Suggestion feed item
export const suggestionFeedItemSchema = z.object({
  id: z.string(),
  type: suggestionActionSchema,
  title: z.string(),
  subtitle: z.string(),
  ctaLabel: z.string(),
  eventId: z.string().optional(),
  userId: z.string().optional(),
  category: z.string().optional(),
});
export type SuggestionFeedItem = z.infer<typeof suggestionFeedItemSchema>;

// GET /api/suggestions/feed
export const getSuggestionsFeedResponseSchema = z.object({
  suggestions: z.array(suggestionFeedItemSchema),
});
export type GetSuggestionsFeedResponse = z.infer<typeof getSuggestionsFeedResponseSchema>;

// ============================================
// Open Invite - Activity Feed
// ============================================

// Activity item object
export const activityItemSchema = z.object({
  id: z.string(),
  type: z.enum(["event_created", "event_joined", "event_commented", "photo_added"]),
  timestamp: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  }),
  event: z.object({
    id: z.string(),
    title: z.string(),
    emoji: z.string(),
    startTime: z.string(),
    host: z.object({
      id: z.string(),
      name: z.string().nullable(),
      image: z.string().nullable(),
    }),
  }),
  content: z.string().optional(), // For comments
  imageUrl: z.string().optional(), // For photos
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

// GET /api/events/activity-feed
export const getActivityFeedResponseSchema = z.object({
  activities: z.array(activityItemSchema),
  hasMore: z.boolean(),
});
export type GetActivityFeedResponse = z.infer<typeof getActivityFeedResponseSchema>;

// ============================================
// Open Invite - Profile Stats & Achievements
// ============================================

// Achievement object
export const achievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  emoji: z.string(),
  unlocked: z.boolean(),
  progress: z.number(),
  target: z.number(),
});
export type Achievement = z.infer<typeof achievementSchema>;

// Top friend object
export const topFriendSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  eventsCount: z.number(),
});
export type TopFriend = z.infer<typeof topFriendSchema>;

// GET /api/profile/stats
export const getProfileStatsResponseSchema = z.object({
  stats: z.object({
    hostedCount: z.number(),
    attendedCount: z.number(),
    categoryBreakdown: z.record(z.string(), z.number()),
    currentStreak: z.number(),
    maxAttendeesEvent: z.number(),
  }),
  topFriends: z.array(topFriendSchema),
  achievements: z.array(achievementSchema),
});
export type GetProfileStatsResponse = z.infer<typeof getProfileStatsResponseSchema>;

// ============================================
// Event Requests - Proposed events requiring RSVP
// ============================================

// Event request member schema
export const eventRequestMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.enum(["pending", "accepted", "declined"]),
  respondedAt: z.string().nullable(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export type EventRequestMember = z.infer<typeof eventRequestMemberSchema>;

// Event request schema
export const eventRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  emoji: z.string(),
  startTime: z.string(), // ISO date string
  endTime: z.string().nullable(),
  status: z.enum(["pending", "confirmed", "cancelled"]),
  creatorId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  creator: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
  members: z.array(eventRequestMemberSchema),
});
export type EventRequest = z.infer<typeof eventRequestSchema>;

// GET /api/event-requests - Get all event requests for user
export const getEventRequestsResponseSchema = z.object({
  eventRequests: z.array(eventRequestSchema),
  pendingCount: z.number(), // Count of requests awaiting user's RSVP
});
export type GetEventRequestsResponse = z.infer<typeof getEventRequestsResponseSchema>;

// GET /api/event-requests/:id - Get single event request
export const getEventRequestResponseSchema = z.object({
  eventRequest: eventRequestSchema,
});
export type GetEventRequestResponse = z.infer<typeof getEventRequestResponseSchema>;

// POST /api/event-requests - Create event request
export const createEventRequestInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  emoji: z.string().optional(),
  startTime: z.string(), // ISO date string
  endTime: z.string().optional(),
  memberIds: z.array(z.string()).min(1), // Friend user IDs to invite
});
export type CreateEventRequestInput = z.infer<typeof createEventRequestInputSchema>;
export const createEventRequestResponseSchema = z.object({
  eventRequest: eventRequestSchema,
});
export type CreateEventRequestResponse = z.infer<typeof createEventRequestResponseSchema>;

// PUT /api/event-requests/:id/respond - Respond to event request
export const respondEventRequestSchema = z.object({
  status: z.enum(["accepted", "declined"]),
});
export type RespondEventRequestInput = z.infer<typeof respondEventRequestSchema>;
export const respondEventRequestResponseSchema = z.object({
  success: z.boolean(),
  eventCreated: z.boolean().optional(), // True if all accepted and event was created
  eventId: z.string().optional(), // ID of created event if eventCreated is true
});
export type RespondEventRequestResponse = z.infer<typeof respondEventRequestResponseSchema>;

// DELETE /api/event-requests/:id - Cancel event request (creator only)
export const deleteEventRequestResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteEventRequestResponse = z.infer<typeof deleteEventRequestResponseSchema>;

// POST /api/event-requests/:id/nudge - Send nudge reminder to pending members
export const nudgeEventRequestResponseSchema = z.object({
  success: z.boolean(),
  nudgedCount: z.number(),
});
export type NudgeEventRequestResponse = z.infer<typeof nudgeEventRequestResponseSchema>;

// POST /api/event-requests/:id/suggest-time - Suggest alternative time when declining
export const suggestTimeSchema = z.object({
  suggestedTime: z.string(), // ISO date string
  message: z.string().optional(),
});
export type SuggestTimeInput = z.infer<typeof suggestTimeSchema>;
export const suggestTimeResponseSchema = z.object({
  success: z.boolean(),
});
export type SuggestTimeResponse = z.infer<typeof suggestTimeResponseSchema>;

// ============================================
// Business/Organization Accounts
// ============================================

// Business categories
export const BUSINESS_CATEGORIES = [
  { value: "fitness", label: "Fitness & Sports", emoji: "🏃" },
  { value: "food", label: "Food & Drinks", emoji: "🍽️" },
  { value: "entertainment", label: "Entertainment", emoji: "🎬" },
  { value: "community", label: "Community", emoji: "🤝" },
  { value: "religious", label: "Religious", emoji: "⛪" },
  { value: "sports", label: "Sports Teams", emoji: "⚽" },
  { value: "arts", label: "Arts & Culture", emoji: "🎨" },
  { value: "education", label: "Education", emoji: "📚" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "outdoor", label: "Outdoor & Adventure", emoji: "🏕️" },
  { value: "other", label: "Other", emoji: "📌" },
] as const;

// ============================================
// Multi-Profile / Account Switcher
// ============================================

// Profile types
export const personalProfileSchema = z.object({
  type: z.literal("personal"),
  id: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  image: z.string().nullable(),
  isActive: z.boolean().optional(),
});
export type PersonalProfile = z.infer<typeof personalProfileSchema>;

export const profileSchema = personalProfileSchema;
export type Profile = z.infer<typeof profileSchema>;

// GET /api/profiles - Get all profiles
export const getProfilesResponseSchema = z.object({
  profiles: z.array(profileSchema),
  activeProfile: profileSchema,
  activeProfileId: z.string().nullable(),
});
export type GetProfilesResponse = z.infer<typeof getProfilesResponseSchema>;

// POST /api/profiles/switch - Switch active profile
export const switchProfileInputSchema = z.object({
  profileId: z.string().nullable(), // null for personal profile
});
export type SwitchProfileInput = z.infer<typeof switchProfileInputSchema>;

export const switchProfileResponseSchema = z.object({
  success: z.boolean(),
  activeProfileId: z.string().nullable(),
});
export type SwitchProfileResponse = z.infer<typeof switchProfileResponseSchema>;

// GET /api/profiles/active - Get active profile
export const getActiveProfileResponseSchema = profileSchema;
export type GetActiveProfileResponse = z.infer<typeof getActiveProfileResponseSchema>;

// ============================================
// Achievements & Badges
// ============================================

// POST /api/achievements/badge - Set selected badge
export const setSelectedBadgeRequestSchema = z.object({
  achievementId: z.string().nullable(),
});
export type SetSelectedBadgeRequest = z.infer<typeof setSelectedBadgeRequestSchema>;

// ============================================
// Notification Preferences
// ============================================

// PUT /api/notifications/preferences - Update notification preferences
export const updateNotificationPreferencesInputSchema = z.object({
  pushEnabled: z.boolean().optional(),
  newFriendEvents: z.boolean().optional(),
  eventReminders: z.boolean().optional(),
  eventUpdates: z.boolean().optional(),
  eventCancellations: z.boolean().optional(),
  eventStartingSoon: z.boolean().optional(),
  newAttendee: z.boolean().optional(),
  attendeeDeclined: z.boolean().optional(),
  someoneInterested: z.boolean().optional(),
  rsvpReminders: z.boolean().optional(),
  eventRequestInvites: z.boolean().optional(),
  eventRequestResponses: z.boolean().optional(),
  eventRequestConfirmed: z.boolean().optional(),
  eventRequestNudges: z.boolean().optional(),
  eventComments: z.boolean().optional(),
  eventPhotos: z.boolean().optional(),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesInputSchema>;

// ============================================
// Calendar Import
// ============================================

// Imported calendar event schema (from device)
export const importedCalendarEventSchema = z.object({
  deviceEventId: z.string(), // ID from device calendar
  title: z.string(),
  startTime: z.string(), // ISO date string
  endTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  calendarId: z.string(), // Device calendar ID
  calendarName: z.string().optional(), // Device calendar name (e.g., "iCloud", "Work")
});
export type ImportedCalendarEvent = z.infer<typeof importedCalendarEventSchema>;

// POST /api/events/import - Import events from device calendar
export const importCalendarEventsRequestSchema = z.object({
  events: z.array(importedCalendarEventSchema),
  defaultVisibility: z.enum(["all_friends", "specific_groups", "private"]).optional(), // Default to "all_friends"
});
export type ImportCalendarEventsRequest = z.infer<typeof importCalendarEventsRequestSchema>;

export const importCalendarEventsResponseSchema = z.object({
  success: z.boolean(),
  imported: z.number(), // Number of events imported
  updated: z.number(), // Number of events updated (already existed)
  skipped: z.number(), // Number of events skipped (e.g., duplicates)
  events: z.array(eventSchema), // Created/updated events
});
export type ImportCalendarEventsResponse = z.infer<typeof importCalendarEventsResponseSchema>;

// GET /api/events/imported - Get user's imported events
export const getImportedEventsResponseSchema = z.object({
  events: z.array(eventSchema.extend({
    isImported: z.boolean(),
    deviceCalendarId: z.string().nullable(),
    deviceCalendarName: z.string().nullable(),
    importedAt: z.string().nullable(),
  })),
});
export type GetImportedEventsResponse = z.infer<typeof getImportedEventsResponseSchema>;

// DELETE /api/events/imported/:id - Remove an imported event
export const deleteImportedEventResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteImportedEventResponse = z.infer<typeof deleteImportedEventResponseSchema>;

// PUT /api/events/:id/visibility - Update event visibility (including imported events)
export const updateEventVisibilityRequestSchema = z.object({
  visibility: z.enum(["all_friends", "specific_groups", "private"]),
  groupIds: z.array(z.string()).optional(), // Required if visibility is "specific_groups"
});
export type UpdateEventVisibilityRequest = z.infer<typeof updateEventVisibilityRequestSchema>;

export const updateEventVisibilityResponseSchema = z.object({
  success: z.boolean(),
  event: eventSchema,
});
export type UpdateEventVisibilityResponse = z.infer<typeof updateEventVisibilityResponseSchema>;