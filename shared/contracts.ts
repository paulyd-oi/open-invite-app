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
  color: z.string().nullable().optional(), // Custom event color (hex)
  startTime: z.string(), // ISO date string
  endTime: z.string().nullable(),
  isRecurring: z.boolean(),
  recurrence: z.string().nullable(),
  visibility: z.string(),
  category: z.string().nullable().optional(), // Event category
  rsvpDeadline: z.string().nullable().optional(), // ISO date string for RSVP deadline
  isBusy: z.boolean().optional(), // Mark as busy/work time - hidden from social feed, shown greyed
  hostIds: z.array(z.string()).optional(), // Co-host user IDs who can edit the event
  // Host-only summary fields (only returned to event host)
  summary: z.string().nullable().optional(), // Host's reflection notes
  summaryRating: z.number().nullable().optional(), // 1-5 star rating
  summaryNotifiedAt: z.string().nullable().optional(), // When host was notified
  reflectionEnabled: z.boolean().optional(), // Whether to prompt for reflection after event (default true)
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
    featuredBadge: z.object({
      badgeKey: z.string(),
      name: z.string(),
      description: z.string(),
      tierColor: z.string(),
    }).nullable().optional(),
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
  // Capacity fields (server-computed)
  capacity: z.number().nullable().optional(), // Max guests (null = unlimited)
  goingCount: z.number().optional(), // Number of confirmed attendees
  isFull: z.boolean().optional(), // True if goingCount >= capacity
  viewerRsvpStatus: z.enum(["going", "not_going", "interested", "maybe"]).nullable().optional(), // Current viewer's RSVP
});
export type Event = z.infer<typeof eventSchema>;

// GET /api/events - Get user's events
export const getEventsResponseSchema = z.object({
  events: z.array(eventSchema),
});
export type GetEventsResponse = z.infer<typeof getEventsResponseSchema>;

// GET /api/events/feed - Get activity feed (friends' open events)
// Supports pagination: ?limit=N&cursor=ID
// Response always includes nextCursor (null when no more pages)
export const getEventsFeedResponseSchema = z.object({
  events: z.array(eventSchema),
  nextCursor: z.string().nullable().optional(), // null = no more pages
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
  capacity: z.number().min(1).nullable().optional(), // Max guests (null = unlimited)
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
// Open Invite - Event Summary (Host Reflection)
// ============================================

// PUT /api/events/:id/summary - Update event summary (host only)
export const updateEventSummaryRequestSchema = z.object({
  summary: z.string().max(2000).optional(),
  rating: z.number().min(1).max(5).optional(),
});
export type UpdateEventSummaryRequest = z.infer<typeof updateEventSummaryRequestSchema>;

export const updateEventSummaryResponseSchema = z.object({
  success: z.boolean(),
  event: z.object({
    id: z.string(),
    summary: z.string().nullable(),
    summaryRating: z.number().nullable(),
  }),
});
export type UpdateEventSummaryResponse = z.infer<typeof updateEventSummaryResponseSchema>;

// GET /api/events/pending-summaries - Get past events that need summaries
export const getPendingSummariesResponseSchema = z.object({
  events: z.array(z.object({
    id: z.string(),
    title: z.string(),
    emoji: z.string(),
    startTime: z.string(),
    endTime: z.string().nullable(),
    location: z.string().nullable(),
    attendeeCount: z.number(),
  })),
});
export type GetPendingSummariesResponse = z.infer<typeof getPendingSummariesResponseSchema>;

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
  featuredBadge: z.object({
    badgeKey: z.string(),
    name: z.string(),
    description: z.string(),
    tierColor: z.string(),
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
  // Mutual friends data (for received requests)
  mutualCount: z.number().optional(),
  mutualPreviewUsers: z.array(z.object({
    id: z.string(),
    name: z.string().nullable(),
    image: z.string().nullable(),
  })).optional(),
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
  badges: z.array(z.object({
    achievementId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    emoji: z.string(),
    tier: z.string(),
    tierColor: z.string(),
    grantedAt: z.string(),
  })),
  featuredBadge: z.object({
    badgeKey: z.string(),
    name: z.string(),
    description: z.string(),
    tierColor: z.string(),
  }).nullable().optional(),
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

// Public user object (no email/phone for privacy)
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  handle: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  // P0 FIX: Include bio fields for suggestion cards
  bio: z.string().nullable().optional(),
  calendarBio: z.string().nullable().optional(),
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
  type: z.enum([
    "event_created",
    "event_joined",
    "event_commented",
    "photo_added",
    "business_event_attending",
    "business_event_interested",
  ]),
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
  isBusinessEvent: z.boolean().optional(), // For business events
  business: z.object({
    id: z.string(),
    name: z.string(),
    handle: z.string(),
    logoUrl: z.string().nullable(),
  }).optional(), // For business events
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
// Tiered Achievements & Badges System
// ============================================

// Tier colors for badges
export const TIER_COLORS = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  diamond: "#B9F2FF",
} as const;

// Achievement progress schema (enhanced)
export const achievementProgressSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  emoji: z.string(),
  category: z.enum(["hosting", "attending", "crowd", "streak", "social"]),
  tier: z.enum(["bronze", "silver", "gold", "platinum", "diamond"]),
  tierColor: z.string(),
  unlocked: z.boolean(),
  unlockedAt: z.string().nullable(),
  progress: z.number(),
  target: z.number(),
});
export type AchievementProgress = z.infer<typeof achievementProgressSchema>;

// GET /api/achievements
export const getAchievementsResponseSchema = z.object({
  achievements: z.array(achievementProgressSchema),
  stats: z.object({
    totalUnlocked: z.number(),
    totalAchievements: z.number(),
    completedEventsHosted: z.number(),
    completedEventsAttended: z.number(),
    maxAttendeesAtCompletedEvent: z.number(),
    currentStreak: z.number(),
    friendsMade: z.number(),
  }),
  selectedBadgeId: z.string().nullable(),
});
export type GetAchievementsResponse = z.infer<typeof getAchievementsResponseSchema>;

// PUT /api/profile/badge - Set selected badge
export const setSelectedBadgeRequestSchema = z.object({
  achievementId: z.string().nullable(),
});
export type SetSelectedBadgeRequest = z.infer<typeof setSelectedBadgeRequestSchema>;
export const setSelectedBadgeResponseSchema = z.object({
  success: z.boolean(),
});
export type SetSelectedBadgeResponse = z.infer<typeof setSelectedBadgeResponseSchema>;

// Badge display for profile cards
export const profileBadgeSchema = z.object({
  achievementId: z.string(),
  name: z.string(),
  emoji: z.string(),
  tier: z.string(),
  tierColor: z.string(),
});
export type ProfileBadge = z.infer<typeof profileBadgeSchema>;

// ============================================
// Stories/Moments - 24-hour expiring posts
// ============================================

// Story schema
export const storySchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "event"]),
  content: z.string().nullable(),
  imageUrl: z.string().nullable(),
  eventId: z.string().nullable(),
  backgroundColor: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  viewed: z.boolean(),
  viewCount: z.number(),
});
export type Story = z.infer<typeof storySchema>;

// Story group in feed (grouped by user)
export const storyGroupSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  userImage: z.string().nullable(),
  hasUnviewed: z.boolean(),
  storyCount: z.number(),
  latestStoryTime: z.string(),
  stories: z.array(storySchema),
});
export type StoryGroup = z.infer<typeof storyGroupSchema>;

// GET /api/stories/feed
export const getStoriesFeedResponseSchema = z.object({
  feed: z.array(storyGroupSchema),
});
export type GetStoriesFeedResponse = z.infer<typeof getStoriesFeedResponseSchema>;

// POST /api/stories - Create story
export const createStoryInputSchema = z.object({
  type: z.enum(["text", "image", "event"]).optional(),
  content: z.string().optional(),
  imageUrl: z.string().optional(),
  eventId: z.string().optional(),
  backgroundColor: z.string().optional(),
  visibility: z.enum(["all_friends", "specific_groups"]).optional(),
  groupIds: z.array(z.string()).optional(),
});
export type CreateStoryInput = z.infer<typeof createStoryInputSchema>;

export const createStoryResponseSchema = z.object({
  story: z.object({
    id: z.string(),
    type: z.string(),
    content: z.string().nullable(),
    imageUrl: z.string().nullable(),
    eventId: z.string().nullable(),
    backgroundColor: z.string(),
    visibility: z.string(),
    createdAt: z.string(),
    expiresAt: z.string(),
    user: z.object({
      id: z.string(),
      name: z.string().nullable(),
      image: z.string().nullable(),
    }),
  }),
});
export type CreateStoryResponse = z.infer<typeof createStoryResponseSchema>;

// GET /api/stories/:id/views - Get story viewers
export const getStoryViewsResponseSchema = z.object({
  views: z.array(z.object({
    viewedAt: z.string(),
    user: z.object({
      id: z.string(),
      name: z.string().nullable(),
      image: z.string().nullable(),
    }),
  })),
});
export type GetStoryViewsResponse = z.infer<typeof getStoryViewsResponseSchema>;

// POST /api/stories/:id/view - Mark story as viewed
export const viewStoryResponseSchema = z.object({
  success: z.boolean(),
});
export type ViewStoryResponse = z.infer<typeof viewStoryResponseSchema>;

// DELETE /api/stories/:id - Delete story
export const deleteStoryResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteStoryResponse = z.infer<typeof deleteStoryResponseSchema>;

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

export const businessCategorySchema = z.enum([
  "fitness", "food", "entertainment", "community", "religious",
  "sports", "arts", "education", "nightlife", "outdoor", "other",
]);
export type BusinessCategory = z.infer<typeof businessCategorySchema>;

// Business object
export const businessSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  handle: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  website: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  instagram: z.string().nullable(),
  twitter: z.string().nullable(),
  facebook: z.string().nullable(),
  isVerified: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  followerCount: z.number().optional(),
  eventCount: z.number().optional(),
  isFollowing: z.boolean().optional(),
});
export type Business = z.infer<typeof businessSchema>;

// Business Event object
export const businessEventSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  emoji: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  isRecurring: z.boolean(),
  recurrence: z.string().nullable(),
  category: z.string().nullable(),
  maxAttendees: z.number().nullable(),
  rsvpDeadline: z.string().nullable(),
  coverUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  business: businessSchema.optional(),
  attendeeCount: z.number().optional(),
  interestedCount: z.number().optional(),
  userStatus: z.enum(["attending", "interested", "none"]).optional(),
});
export type BusinessEvent = z.infer<typeof businessEventSchema>;

// GET /api/businesses - Get all/search businesses
export const getBusinessesResponseSchema = z.object({
  businesses: z.array(businessSchema),
  total: z.number(),
});
export type GetBusinessesResponse = z.infer<typeof getBusinessesResponseSchema>;

// GET /api/businesses/:id - Get single business
export const getBusinessResponseSchema = z.object({
  business: businessSchema,
  upcomingEvents: z.array(businessEventSchema),
});
export type GetBusinessResponse = z.infer<typeof getBusinessResponseSchema>;

// POST /api/businesses - Create business
export const createBusinessInputSchema = z.object({
  name: z.string().min(1).max(100),
  handle: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, "Handle can only contain letters, numbers, and underscores"),
  description: z.string().max(500).optional(),
  category: businessCategorySchema,
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  location: z.string().max(100).optional(),
  instagram: z.string().max(50).optional(),
  twitter: z.string().max(50).optional(),
  facebook: z.string().max(100).optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessInputSchema>;

export const createBusinessResponseSchema = z.object({
  business: businessSchema,
});
export type CreateBusinessResponse = z.infer<typeof createBusinessResponseSchema>;

// PUT /api/businesses/:id - Update business
export const updateBusinessInputSchema = createBusinessInputSchema.partial();
export type UpdateBusinessInput = z.infer<typeof updateBusinessInputSchema>;

export const updateBusinessResponseSchema = z.object({
  business: businessSchema,
});
export type UpdateBusinessResponse = z.infer<typeof updateBusinessResponseSchema>;

// DELETE /api/businesses/:id
export const deleteBusinessResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteBusinessResponse = z.infer<typeof deleteBusinessResponseSchema>;

// POST /api/businesses/:id/follow - Follow/unfollow business
export const followBusinessInputSchema = z.object({
  notifyEvents: z.boolean().optional(),
});
export type FollowBusinessInput = z.infer<typeof followBusinessInputSchema>;

export const followBusinessResponseSchema = z.object({
  success: z.boolean(),
  isFollowing: z.boolean(),
});
export type FollowBusinessResponse = z.infer<typeof followBusinessResponseSchema>;

// GET /api/businesses/following - Get followed businesses
export const getFollowedBusinessesResponseSchema = z.object({
  businesses: z.array(businessSchema),
});
export type GetFollowedBusinessesResponse = z.infer<typeof getFollowedBusinessesResponseSchema>;

// GET /api/businesses/owned - Get user's owned businesses
export const getOwnedBusinessesResponseSchema = z.object({
  businesses: z.array(businessSchema),
});
export type GetOwnedBusinessesResponse = z.infer<typeof getOwnedBusinessesResponseSchema>;

// ============================================
// Business Events
// ============================================

// GET /api/businesses/:id/events - Get business events
export const getBusinessEventsResponseSchema = z.object({
  events: z.array(businessEventSchema),
});
export type GetBusinessEventsResponse = z.infer<typeof getBusinessEventsResponseSchema>;

// POST /api/businesses/:id/events - Create business event
export const createBusinessEventInputSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  location: z.string().max(200).optional(),
  emoji: z.string().optional(),
  startTime: z.string(),
  endTime: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurrence: z.string().optional(),
  category: z.string().optional(),
  maxAttendees: z.number().min(1).optional(),
  rsvpDeadline: z.string().optional(),
  coverUrl: z.string().url().optional(),
});
export type CreateBusinessEventInput = z.infer<typeof createBusinessEventInputSchema>;

export const createBusinessEventResponseSchema = z.object({
  event: businessEventSchema,
});
export type CreateBusinessEventResponse = z.infer<typeof createBusinessEventResponseSchema>;

// PUT /api/business-events/:id - Update business event
export const updateBusinessEventInputSchema = createBusinessEventInputSchema.partial();
export type UpdateBusinessEventInput = z.infer<typeof updateBusinessEventInputSchema>;

export const updateBusinessEventResponseSchema = z.object({
  event: businessEventSchema,
});
export type UpdateBusinessEventResponse = z.infer<typeof updateBusinessEventResponseSchema>;

// DELETE /api/business-events/:id
export const deleteBusinessEventResponseSchema = z.object({
  success: z.boolean(),
});
export type DeleteBusinessEventResponse = z.infer<typeof deleteBusinessEventResponseSchema>;

// POST /api/business-events/:id/attend - RSVP to event
export const attendBusinessEventInputSchema = z.object({
  status: z.enum(["attending", "interested", "none"]),
});
export type AttendBusinessEventInput = z.infer<typeof attendBusinessEventInputSchema>;

export const attendBusinessEventResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(["attending", "interested", "none"]),
});
export type AttendBusinessEventResponse = z.infer<typeof attendBusinessEventResponseSchema>;

// GET /api/business-events/discover - Discover public business events
export const discoverBusinessEventsResponseSchema = z.object({
  events: z.array(businessEventSchema),
  hasMore: z.boolean(),
});
export type DiscoverBusinessEventsResponse = z.infer<typeof discoverBusinessEventsResponseSchema>;

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

export const businessProfileSchema = z.object({
  type: z.literal("business"),
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  image: z.string().nullable(),
  isOwner: z.boolean(),
  role: z.enum(["owner", "admin", "manager"]),
  isVerified: z.boolean(),
});
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

export const profileSchema = z.union([personalProfileSchema, businessProfileSchema]);
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
// Business Team Management
// ============================================

export const teamMemberRoleSchema = z.enum(["owner", "admin", "manager"]);
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;

export const teamMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.string(),
  status: z.string(),
  invitedAt: z.string(),
  acceptedAt: z.string().nullable(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

// GET /api/profiles/businesses/:id/team
export const getBusinessTeamResponseSchema = z.object({
  owner: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
    role: z.literal("owner"),
  }).nullable(),
  teamMembers: z.array(teamMemberSchema),
});
export type GetBusinessTeamResponse = z.infer<typeof getBusinessTeamResponseSchema>;

// POST /api/profiles/businesses/:id/team - Invite team member
export const inviteTeamMemberInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager"]).optional(),
});
export type InviteTeamMemberInput = z.infer<typeof inviteTeamMemberInputSchema>;

export const inviteTeamMemberResponseSchema = z.object({
  success: z.boolean(),
  member: teamMemberSchema,
});
export type InviteTeamMemberResponse = z.infer<typeof inviteTeamMemberResponseSchema>;

// PUT /api/profiles/businesses/:id/team/:memberId - Update role
export const updateTeamMemberInputSchema = z.object({
  role: z.enum(["admin", "manager"]),
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberInputSchema>;

// GET /api/profiles/invitations - Get pending invitations
export const teamInvitationSchema = z.object({
  id: z.string(),
  role: z.string(),
  invitedAt: z.string(),
  business: z.object({
    id: z.string(),
    name: z.string(),
    handle: z.string(),
    logoUrl: z.string().nullable(),
  }),
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const getInvitationsResponseSchema = z.object({
  invitations: z.array(teamInvitationSchema),
});
export type GetInvitationsResponse = z.infer<typeof getInvitationsResponseSchema>;

// ============================================
// Open Invite - Circles (Planning Groups)
// ============================================

// Circle member object
export const circleMemberSchema = z.object({
  id: z.string(),
  circleId: z.string(),
  userId: z.string(),
  isPinned: z.boolean(),
  joinedAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export type CircleMember = z.infer<typeof circleMemberSchema>;

// Circle message object
export const circleMessageSchema = z.object({
  id: z.string(),
  circleId: z.string(),
  userId: z.string(),
  content: z.string(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  }),
});
export type CircleMessage = z.infer<typeof circleMessageSchema>;

// Circle object
export const circleSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  description: z.string().nullable().optional(),
  createdById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPinned: z.boolean(),
  members: z.array(circleMemberSchema),
  messageCount: z.number().optional(),
  unreadCount: z.number().optional(),
});
export type Circle = z.infer<typeof circleSchema>;

// GET /api/circles
export const getCirclesResponseSchema = z.object({
  circles: z.array(circleSchema),
});
export type GetCirclesResponse = z.infer<typeof getCirclesResponseSchema>;

// GET /api/circles/:id
export const circleEventSchema = z.object({
  id: z.string(),
  circleId: z.string(),
  eventId: z.string(),
  isPrivate: z.boolean(),
  createdAt: z.string(),
  event: eventSchema.nullable(),
});

export const memberEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  emoji: z.string(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  location: z.string().nullable(),
  isPrivate: z.boolean(),
});

export const memberEventsSchema = z.object({
  userId: z.string(),
  events: z.array(memberEventSchema),
});

export const getCircleDetailResponseSchema = z.object({
  circle: circleSchema.extend({
    messages: z.array(circleMessageSchema),
    circleEvents: z.array(circleEventSchema),
    memberEvents: z.array(memberEventsSchema),
  }),
});
export type GetCircleDetailResponse = z.infer<typeof getCircleDetailResponseSchema>;

// POST /api/circles
export const createCircleRequestSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().optional(),
  memberIds: z.array(z.string()).min(1),
});
export type CreateCircleRequest = z.infer<typeof createCircleRequestSchema>;

// GET /api/circles/:id/messages
export const getCircleMessagesResponseSchema = z.object({
  messages: z.array(circleMessageSchema),
  hasMore: z.boolean(),
});
export type GetCircleMessagesResponse = z.infer<typeof getCircleMessagesResponseSchema>;

// POST /api/circles/:id/messages
export const sendCircleMessageRequestSchema = z.object({
  content: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional(),
});
export type SendCircleMessageRequest = z.infer<typeof sendCircleMessageRequestSchema>;

// POST /api/circles/:id/events
export const createCircleEventRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  emoji: z.string().optional(),
  startTime: z.string(),
  endTime: z.string().optional(),
  isPrivate: z.boolean().optional(),
});
export type CreateCircleEventRequest = z.infer<typeof createCircleEventRequestSchema>;

// GET /api/circles/:id/availability
export const memberBusyTimeSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const memberAvailabilitySchema = z.object({
  userId: z.string(),
  busyTimes: z.array(memberBusyTimeSchema),
});

export const getCircleAvailabilityResponseSchema = z.object({
  availability: z.array(memberAvailabilitySchema),
  startDate: z.string(),
  endDate: z.string(),
});
export type GetCircleAvailabilityResponse = z.infer<typeof getCircleAvailabilityResponseSchema>;

// ============================================
// Notification Preferences
// ============================================

// Notification preferences schema
export const notificationPreferencesSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),

  // Master toggle
  pushEnabled: z.boolean(),

  // Event Notifications
  newFriendEvents: z.boolean(),
  eventReminders: z.boolean(),
  eventUpdates: z.boolean(),
  eventCancellations: z.boolean(),
  eventStartingSoon: z.boolean(),

  // RSVP & Attendance
  newAttendee: z.boolean(),
  attendeeDeclined: z.boolean(),
  someoneInterested: z.boolean(),
  rsvpReminders: z.boolean(),

  // Event Requests
  eventRequestInvites: z.boolean(),
  eventRequestResponses: z.boolean(),
  eventRequestConfirmed: z.boolean(),
  eventRequestNudges: z.boolean(),

  // Comments & Photos
  eventComments: z.boolean(),
  eventPhotos: z.boolean(),
  commentReplies: z.boolean(),

  // Friends & Social
  friendRequests: z.boolean(),
  friendRequestAccepted: z.boolean(),
  friendBirthdays: z.boolean(),

  // Circles
  circleMessages: z.boolean(),
  circleEvents: z.boolean(),
  circleInvites: z.boolean(),

  // Smart / FOMO Notifications
  fomoFriendJoined: z.boolean(),
  fomoPopularEvents: z.boolean(),
  weeklySummary: z.boolean(),
  reconnectSuggestions: z.boolean(),

  // Business Events
  businessEvents: z.boolean(),

  // Daily Digest
  dailyDigest: z.boolean(),
  dailyDigestTime: z.string(),

  // Quiet Hours
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string(),
  quietHoursEnd: z.string(),

  // Reflection Prompts
  eventReflectionPrompts: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

// GET /api/notifications/preferences
export const getNotificationPreferencesResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
});
export type GetNotificationPreferencesResponse = z.infer<typeof getNotificationPreferencesResponseSchema>;

// PUT /api/notifications/preferences
export const updateNotificationPreferencesInputSchema = z.object({
  // Master toggle
  pushEnabled: z.boolean().optional(),

  // Event Notifications
  newFriendEvents: z.boolean().optional(),
  eventReminders: z.boolean().optional(),
  eventUpdates: z.boolean().optional(),
  eventCancellations: z.boolean().optional(),
  eventStartingSoon: z.boolean().optional(),

  // RSVP & Attendance
  newAttendee: z.boolean().optional(),
  attendeeDeclined: z.boolean().optional(),
  someoneInterested: z.boolean().optional(),
  rsvpReminders: z.boolean().optional(),

  // Event Requests
  eventRequestInvites: z.boolean().optional(),
  eventRequestResponses: z.boolean().optional(),
  eventRequestConfirmed: z.boolean().optional(),
  eventRequestNudges: z.boolean().optional(),

  // Comments & Photos
  eventComments: z.boolean().optional(),
  eventPhotos: z.boolean().optional(),
  commentReplies: z.boolean().optional(),

  // Friends & Social
  friendRequests: z.boolean().optional(),
  friendRequestAccepted: z.boolean().optional(),
  friendBirthdays: z.boolean().optional(),

  // Circles
  circleMessages: z.boolean().optional(),
  circleEvents: z.boolean().optional(),
  circleInvites: z.boolean().optional(),

  // Smart / FOMO Notifications
  fomoFriendJoined: z.boolean().optional(),
  fomoPopularEvents: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  reconnectSuggestions: z.boolean().optional(),

  // Business Events
  businessEvents: z.boolean().optional(),

  // Daily Digest
  dailyDigest: z.boolean().optional(),
  dailyDigestTime: z.string().optional(),

  // Quiet Hours
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),

  // Reflection Prompts
  eventReflectionPrompts: z.boolean().optional(),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesInputSchema>;

export const updateNotificationPreferencesResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
});
export type UpdateNotificationPreferencesResponse = z.infer<typeof updateNotificationPreferencesResponseSchema>;

// ============================================
// User Reports (Trust & Safety)
// ============================================

// Reason enum values for reporting users
export const reportReasonEnum = z.enum([
  "spam",
  "harassment",
  "impersonation",
  "inappropriate_content",
  "other",
]);
export type ReportReason = z.infer<typeof reportReasonEnum>;

// POST /api/reports/user - Report a user
export const reportUserRequestSchema = z.object({
  reportedUserId: z.string(),
  reason: reportReasonEnum,
  details: z.string().max(500).optional(),
});
export type ReportUserRequest = z.infer<typeof reportUserRequestSchema>;

export const reportUserResponseSchema = z.object({
  success: z.literal(true),
});
export type ReportUserResponse = z.infer<typeof reportUserResponseSchema>;

// ============================================
// Event Co-Hosts
// ============================================

// PUT /api/events/:id/hosts - Update event hosts
export const updateEventHostsRequestSchema = z.object({
  hostIds: z.array(z.string()),
});
export type UpdateEventHostsRequest = z.infer<typeof updateEventHostsRequestSchema>;

export const updateEventHostsResponseSchema = z.object({
  success: z.boolean(),
  event: eventSchema,
});
export type UpdateEventHostsResponse = z.infer<typeof updateEventHostsResponseSchema>;

// ============================================
// Event Reports (Trust & Safety)
// ============================================

// Reason enum values for reporting events
export const eventReportReasonEnum = z.enum([
  "spam",
  "inappropriate",
  "safety",
  "other",
]);
export type EventReportReason = z.infer<typeof eventReportReasonEnum>;

// POST /api/reports/event - Report an event
export const reportEventRequestSchema = z.object({
  eventId: z.string(),
  reason: eventReportReasonEnum,
  details: z.string().max(500).optional(),
});
export type ReportEventRequest = z.infer<typeof reportEventRequestSchema>;

export const reportEventResponseSchema = z.object({
  success: z.literal(true),
});
export type ReportEventResponse = z.infer<typeof reportEventResponseSchema>;
