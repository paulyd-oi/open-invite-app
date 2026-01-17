# Open Invite

A social calendar app that makes it easy to stay connected with friends, see their events, and invite them to yours. No more complicated invites - just open invites!

**Core value proposition:** "See what friends are doing and join in"

## Features

### Core Functionality
- **Activity Feed**: See open events from your friends in one place
- **Event Creation**: Create events with title, description, location, date/time, emoji, and frequency (one-time, weekly, monthly)
- **Calendar View**: View and manage your own events on a calendar
- **Friend System**: Add friends, manage friend requests, and organize them into groups
- **Privacy Controls**: Choose who sees your events - all friends or specific groups
- **Circles**: Create planning groups with friends to coordinate events together
- **Calendar Import**: Sync events from your device calendar (Apple Calendar, Google Calendar) to share with friends

### Calendar Import & Sync
Import events from your device's native calendars to share with friends:
- **Multi-Calendar Support**: Select which calendars to import from (iCloud, Google, work calendars, etc.)
- **Selective Import**: Choose which events to sync - you don't have to import everything
- **Visibility Control**: Set default visibility when importing (Open to Friends, Specific Groups, or Private)
- **Already Synced Detection**: Events that are already imported show a "Synced" badge
- **Smart Updates**: Re-importing the same events updates them instead of creating duplicates
- **Edit Visibility Later**: Change any imported event's visibility from the event edit screen

**How to use:**
1. Go to Calendar > Import Calendar (calendar icon with arrow)
2. Grant calendar permissions if prompted
3. Select which calendars to import from
4. Choose default visibility for imported events
5. Load events and select which ones to sync
6. Tap "Sync Events" to import to Open Invite

Imported events appear on your Open Invite calendar and are visible to friends based on your visibility settings.

### Circles (Planning Groups)
A new way to plan events with friends:
- **Create Circles**: Group friends together for planning events (e.g., "Weekend Squad", "Work Friends")
- **Add Members**: Add friends to existing circles at any time - their public events will automatically appear in the circle calendar
- **Stacked Calendar**: See everyone's availability in one view with color-coded member events
- **Free Time Finder**: Automatically identifies time slots when all members are free
- **Group Chat**: Built-in messaging to coordinate event details, timing, and location
- **Circle Events**: Create events from within a circle - choose between:
  - **Private**: Only circle members see the event; others see a "Busy" block on your calendar
  - **Public**: All friends can see and join the event
- **Clubhouse-Style Cards**: Beautiful card design with stacked profile bubbles
- **Swipe Actions**: Swipe right to pin favorite circles, swipe left to leave
- **Pin Friends**: Pin your closest friends to the top of your friends list
- **Friend Suggestions**: When adding new members, the app reminds you to ensure everyone in the circle is friends with each other for full visibility

### Calendar View
Apple Calendar-inspired design with continuous scrolling and multiple view modes:
- **Compact**: Minimal view with colored dots indicating events
- **Stacked**: Shows colored bars stacked under each date
- **Details**: Displays event titles directly in calendar cells (supports multi-line titles when expanded)
- **List**: Full monthly list grouped by date
- **Persistent View Preference**: Your selected calendar view mode is saved and remembered when you leave and return to the calendar

**Calendar Events Display:**
- **Your Created Events**: All events you created always appear in the calendar
- **RSVP "Going" Events**: Events you RSVP'd "Going" to appear automatically in the calendar main list
- **Real-Time Updates**: Calendar updates immediately when you RSVP to events (no app restart needed)
- **Unified List**: Created and "Going" events are merged and sorted by time for each day

Events are color-coded by their group color, making it easy to see which friend group each event belongs to. The calendar includes:
- **Continuous scrolling**: Scroll seamlessly through months (12 months back, 24 months forward)
- Quick "Today" button to jump to current date
- Header automatically updates to show the currently visible month
- Selected date event list with full details
- **Pinch-to-expand**: Seamlessly expand calendar rows vertically, transitioning between view modes

### Event Details
- **Who's Coming**: See all friends who have been accepted to the event
- **Map & Navigation**: Tap on location to expand and get directions via Apple/Google Maps
- **Join Requests**: Request to join events and see your request status
- **Edit Events**: Tap the pencil icon to edit your own events (title, description, location, time, visibility)
- **Delete Events**: Remove events you no longer want to host
- **Sync to Device Calendar**: One-tap sync to add/update the event in your device calendar (Apple Calendar)
  - **Synced Badge**: Shows green "Synced to Calendar" badge after successful sync
  - **Idempotent Updates**: Syncing again updates the existing device event (no duplicates)
  - **Permission Gating**: Guides you through calendar permissions if needed
  - **More Options**: Access Google Calendar and other options via "More calendar options"

### Event Reflection (Host Only)
After an event ends, hosts can add a private reflection to remember how it went:
- **Star Rating**: Rate the event from 1-5 stars
- **Reflection Notes**: Write private notes about what went well, what could improve, and any highlights
- **Quick Prompts**: Use suggested phrases like "Great conversations!" or "Perfect turnout" to quickly add notes
- **Push Notifications**: 1 hour after an event ends, hosts receive a reminder to add their reflection
- **Private**: Reflections are only visible to the host - no one else can see them

This feature helps hosts:
- Reflect on their events before forgetting
- Track what works and what doesn't
- Take notes for future similar events
- Improve their hosting over time

### Recurring Events
When creating events, you can set the frequency:
- **One Time**: Single event on the selected date
- **Weekly**: Auto-creates 4 events (one per week for the month)
- **Monthly**: Auto-creates 3 events (one per month for the quarter)

### Friend Groups
Organize your friends into categories like:
- Dance Friends
- Gaming Friends
- Running Buddies
- Work Colleagues
- etc.

When creating events, you can make them visible to all friends or only specific groups.

**Group Management:**
- Create groups with custom names and colors from your Profile
- Add or remove friends from groups using the person+ icon next to each group
- View shared groups with a friend on their profile page under "Groups Together"
- Add friends to groups directly from their profile using the "Add" button in the Groups Together section
- Event visibility shows which specific groups can see the event

### Social Features

**Activity Feed** (`/activity`)
See what your friends are up to in real-time:
- Event creations - when friends create new events
- Event joins - when friends RSVP to events
- Comments - when friends comment on events
- Photos - when friends add memory photos to past events
- Beautiful timeline UI with relative timestamps
- Tap any activity to view the event details

**Friend Suggestions** (`/suggestions`)
Discover people you may know:
- See friends-of-friends based on mutual connections
- Shows mutual friend count and avatars
- Send friend requests directly from the suggestions
- Smart filtering excludes blocked users and existing friends
- Sorted by number of mutual friends

Access both features from quick-access buttons on the Friends page.

### Friends Page
View and manage your friends with flexible display options:

**View Modes:**
- **List View**: Compact display showing friend names and group tags. Each friend has a dropdown arrow - tap it to expand and reveal their calendar without leaving the list. Tap the friend's name/avatar to go to their full profile.
- **Detailed View**: Shows each friend's card with their mini calendar always visible, displaying their upcoming events for the month.

**Group Filtering:**
- Filter your friends list by group to quickly find specific friends
- Tap the filter button to select a group (e.g., "Dance Friends", "Work Colleagues")
- Clear the filter to see all friends again
- Shows count of filtered friends vs. total friends

### Notifications
Get notified when:
- Friends create new events
- Someone requests to join your event
- Your join request is accepted/declined
- You receive a friend request

### Notification Preferences
Comprehensive notification settings to give you full control over what alerts you receive:

**Access via:** Settings > Notification Preferences

**Master Toggle:**
- Enable/disable all push notifications with a single switch

**Event Notifications:**
- New Friend Events - When friends create new events
- Event Reminders - Reminders before events you're attending
- Event Updates - When events you're attending are modified
- Event Cancellations - When events are cancelled
- Starting Soon - 30 minutes before an event starts

**RSVPs & Attendance:**
- New Attendee - When someone joins your event
- Attendee Declined - When someone declines your event
- Someone Interested - When someone marks interest in your event
- RSVP Reminders - Reminders to respond to event invites

**Event Requests:**
- New Invitations - When invited to event requests
- Member Responses - When members respond to your requests
- Event Confirmed - When an event request is confirmed
- Nudge Reminders - When someone nudges you to respond

**Comments & Photos:**
- Event Comments - Comments on your events
- Event Photos - Photos added to events you're part of
- Comment Replies - Replies to your comments

**Friends & Social:**
- Friend Requests - New friend requests
- Request Accepted - When your friend request is accepted
- Friend Birthdays - Birthday reminders for friends

**Circles:**
- Circle Messages - Messages in your circles
- Circle Events - New events in your circles
- Circle Invites - Invitations to join circles

**Smart Notifications (FOMO):**
- Friend Joined Event - When friends join events you're interested in
- Popular Events - When events become trending
- Weekly Summary - Weekly activity summary from friends
- Reconnect Suggestions - Suggestions to reconnect with friends

**Daily Digest:**
- Daily Summary - A daily summary of what's happening (off by default)
- Customizable delivery time

**Quiet Hours:**
- Enable quiet hours to pause notifications during specific times
- Set custom start and end times (default: 10 PM - 8 AM)

**Event Reflections:**
- Reflection Prompts - Reminders to reflect after your events end

### Privacy & Safety - Block Contacts
Comprehensive blocking feature for privacy and personal safety:
- **Block Users**: Block existing accounts to hide all traces of your profile from them
- **Block by Email**: Pre-block an email address before they even create an account
- **Block by Phone**: Pre-block a phone number before they create an account
- **Silent Blocking**: Blocked users have no way to know they've been blocked
- **Automatic Cleanup**: Blocking removes existing friendships, friend requests, and event join requests

When you block someone:
- They can't see your profile, events, or any trace of your account
- They can't send you friend requests
- They won't appear in your search results
- Any existing friendship is automatically removed

Access this feature from **Settings > Privacy & Security > Blocked Contacts**.

### Notes to Remember
Keep private notes about friends to help you remember important details:
- **Private Notes**: Only you can see these notes - they are never shared with anyone
- **Bullet Point Format**: Notes are displayed as easy-to-read bullet points
- **Collapsible Section**: Tap the header to minimize/expand the notes section
- **Quick Add**: Type and tap the + button or press return to add a new note
- **Easy Delete**: Tap the trash icon to remove any note

Access this feature on any friend's profile page, in the "Notes to Remember" section above "Groups Together".

### Privacy - Non-Friend Profiles
When viewing someone's profile who is not yet your friend:
- **Profile Info Visible**: Name, avatar, and calendar bio are visible
- **Events Hidden**: Their events and open invites are completely hidden with a "Add friend to see events" prompt
- **Calendar Private**: The calendar shows dates only, with no event indicators
- **Email Masked**: Their email is partially hidden for privacy protection

This protects users from stalkers and unwanted attention by ensuring events are only visible to actual friends.

### Birthdays
Track and share birthdays with friends:
- **Set Your Birthday**: Use the date picker in Settings > Birthdays to set your birthday
- **Share with Friends**: Toggle "Show to Friends" to display your birthday on friends' calendars
- **Privacy Options**:
  - **Hide Age/Year**: Only show the month and day (not your age)
  - **Hide Birthdays**: Don't show other friends' birthdays on your calendar
- **Calendar Integration**: Friend birthdays appear as pink-colored events on your calendar with a 🎂 emoji

### Discover Tab
Find new ways to connect with friends through the Discover tab:

**Reconnect Suggestions**
- Smart suggestions for friends you haven't hung out with in a while
- See how many days since your last hangout
- Quick access to their profile to plan something

**Nearby Events**
- See friend events grouped by location
- Find who's hanging out in areas near you today
- Easily join events in your area

**Hangout Streaks**
- Track your weekly hangout streaks with friends
- See total hangouts and current streak for each friend
- Compare current streak to your longest streak
- Motivation to keep meeting up regularly

**Quick Event Templates**
- Tap "Quick Event" to create events from templates
- Pre-configured templates: Coffee, Lunch, Workout, Movie Night, Game Night, Walk, Drinks, Dinner
- Each template has default emoji, duration, and description
- Create custom templates for your frequent hangouts

### Who's Free? (Enhanced)
From the Calendar, tap any date to see which friends are available:
- **Free Friends**: Friends with no events on that day - perfect candidates to hang out with
- **Busy Friends**: Friends who already have events scheduled or are working
- **Friend Selection**: Tap friends to select them for group planning
- **Combined Availability Calendar**: When friends are selected, see a week-view calendar showing when EVERYONE is free
  - Green = all selected friends are free
  - Yellow = some friends are free
  - Red = no one is free
  - Shows "X/Y" count for each day
- **Navigate Weeks**: Browse forward/backward through weeks to find the perfect day
- **Quick Event Creation**: One-tap to create an event with all selected friends
- Work schedules are factored in - friends who are working show a briefcase icon

### Reconnect Reminders
Never lose touch with friends:
- **Smart Reminders**: On your feed, see friends you haven't hung out with in 14+ days
- **Days Since Hangout**: Shows exactly how long it's been since you last met
- **One-Tap Planning**: "Plan hangout" button to instantly create an event with that friend
- **Non-Intrusive**: Only shows when there are friends to reconnect with
- **Horizontal Scroll**: Browse through multiple friends you should reconnect with

### Work Schedule
Set your regular work hours so friends know when you're busy:
- Access via **Settings > Work Schedule**
- Toggle each day of the week on/off
- Set custom start and end times for each day
- Customize the label (default: "Work") - e.g., "Classes", "Gym", etc.
- Work schedule appears as "Busy" blocks on your calendar
- Friends see you as busy on the "Who's Free?" screen during work hours
- **Show on Calendar toggle**: Turn off to hide work events from calendar bubbles/dots while still showing them in the event list below the calendar

### Interest Reactions
Show interest in events without fully committing:
- Tap "Maybe" on any friend's event to show you're interested
- See how many people are interested in your events
- Interested users are displayed in an expandable list
- Great for gauging attendance before committing

### Event Reminders
Set custom reminders for any event:
- Choose from multiple reminder times: 5 min, 15 min, 30 min, 1 hour, 2 hours, or 1 day before
- Set multiple reminders per event
- Local push notifications deliver reminders even when app is closed
- Reminders auto-disable for past times
- Access from the bell icon on any event detail page

### Event Categories
Categorize your events for better organization:
- Choose from 9 categories: Social, Sports, Food & Drinks, Entertainment, Outdoor, Work, Travel, Wellness, or Other
- Each category has a custom emoji and color
- Filter events by category
- Category badges display on event cards

### Event Photo Memories
Share and view photos from past events:
- Upload photos to events that have already happened
- Take new photos or choose from your library
- **Automatic Compression**: Images are automatically compressed before upload to save storage and reduce data usage
- Full-screen photo gallery viewer
- See who shared each photo
- Event owners can delete any photo, users can delete their own

### Event Comments with Images
Add comments to events with optional photo attachments:
- Text comments on any event
- Attach photos to comments (automatically compressed)
- View comments in a timeline format
- Event owners can moderate comments

### Mutual Friends
See mutual connections on friend profiles:
- View mutual friends shared between you and another user
- Horizontal scrollable list of mutual friends
- Tap any mutual friend to view their profile
- Shows total count of mutual friends

### Suggested Times
AI-powered time suggestions when creating events:
- Select friends you want to invite
- Choose a date range to search
- See time slots ranked by availability
- View how many selected friends are free for each slot
- One-tap to select a suggested time

### Event Requests
Create collaborative events that work for everyone:
- **Create Event Requests**: Invite specific friends to an event
- **Flexible RSVP**: Friends can accept or decline - the event still happens with whoever can make it
- **Smart Time Suggestions**: When creating a request, see when all selected friends are free
- **Status Tracking**: See how many friends have accepted (e.g., "2/3 accepted")
- **Automatic Event Creation**: When all friends have responded, the event is automatically created with whoever accepted
- **No More Cancellations**: One person declining doesn't cancel it for everyone - the event goes on!
- **Calendar Badge**: Red notification badge on Calendar tab shows pending event requests awaiting your response
- **Event Requests Section**: View all your pending and confirmed event requests on the Calendar page
- **Nudge Reminders**: Event creators can send push notification reminders to members who haven't responded
- **Suggest Different Time**: Invitees can suggest alternative times instead of just accepting or declining
- **Confetti Celebration**: When everyone responds, a confetti animation celebrates the confirmed event!

**How it works:**
1. Tap "Send Event Request" on the Calendar page
2. Select friends to invite and set event details
3. Friends receive notifications to accept or decline
4. When everyone has responded, the event is created with all who accepted
5. Even if some decline, the event happens with whoever can make it!

This is perfect for coordinating group activities where flexibility is key.

### Calendar Sync
Sync events with your device calendars:
- **Import Calendars**: View events from your Apple Calendar, Google Calendar, or any calendar synced to your device
- **Export to Calendar**: Add any event to your device calendar with one tap
- **Google Calendar**: Opens Google Calendar in browser to add events
- **Apple Calendar**: Adds events directly to your default calendar
- **Conflict Detection**: See if event times conflict with your existing calendar events

### Duplicate Events
Quickly create similar events:
- Tap the copy icon on any event detail page to duplicate it
- Pre-fills all event details (title, description, location, emoji, visibility, category)
- Just pick a new date and time
- Perfect for recurring meetups or similar activities

### Beautiful Empty States
Friendly illustrations and helpful guidance when:
- No events in your feed
- No friends added yet
- No notifications
- No photos for an event
- No search results

### Share Events
Share events with friends outside the app:
- Tap the share icon in the event header
- Native share sheet opens (iMessage, WhatsApp, etc.)
- Formatted message includes event emoji, title, date, time, and location
- **Universal Links**: Shared URLs now work intelligently - they open the app directly if installed, or redirect to the App Store if not
- Easy way to invite friends who don't have the app yet

### Deep Links
Smart linking system for seamless sharing:
- **Universal Links**: Event share links like `https://open-invite-api.onrender.com/share/event/{id}` work from any platform
- **App Deep Links**: `vibecode://event/{id}` opens events directly in the app
- **Automatic Handling**: Links intelligently detect if the app is installed and redirect appropriately
- **Preview Cards**: Social media preview cards show event title and emoji when sharing links

### Stories/Moments
Share quick updates that expire after 24 hours:
- **Text Stories**: Share what you're up to with a text post
- **Image Stories**: Share photos with your friends
- **Event Stories**: Promote your events as stories
- **Custom Colors**: Choose background colors for text stories
- **Privacy Control**: Share with all friends or specific groups
- **View Tracking**: See who viewed your stories
- **Auto-Expiration**: Stories automatically disappear after 24 hours

### iOS Widget (Coming Soon)
View today's events directly from your home screen:
- **Today's Events**: See your upcoming events at a glance
- **Friend Activity**: Quick view of friend activity count
- **Backend Ready**: API endpoints for widget data are implemented
- Note: Widget UI requires native Swift code to be implemented during the App Store build process

### Contact Sync During Onboarding
Seamlessly find friends when you first join:
- **Onboarding Step**: New "Find Your Friends" step during initial app setup
- **Permission Request**: Friendly explanation of why contact access helps
- **Multi-Select**: Select multiple contacts to invite at once
- **Batch Invites**: Send friend requests to all selected contacts with one tap
- **Skip Option**: Can be skipped if you prefer to add friends manually later

### Smart Notifications (FOMO Triggers)
Intelligent notifications to keep you engaged with your friends' activities:
- **Friend Joined Event**: Get notified when a friend joins an event you're interested in
- **Popular Events**: Alerts when events reach popularity milestones (5, 10, 20 attendees)
- **New Event Push**: Push notifications when friends create new events
- **Event Starting Soon**: Reminders when events you're attending are about to start
- **Weekly Activity Summary**: FOMO summaries showing how active your friends have been

These smart notifications help ensure you don't miss out on fun activities with your friends!

### Event Discussion (formerly Comments)
Enhanced conversation area on event detail pages:
- **Discussion Section**: Renamed from "Comments" to encourage conversation
- **Conversation Prompt**: Shows "Start the conversation!" banner when 2+ people are attending but no one has commented
- **Conversation Starters**: Tappable suggestions like "What should I bring?", "Anyone want to carpool?", "Running late, start without me?"
- **Easy Coordination**: Perfect for coordinating logistics with other attendees

### Quick Event Button
Instant event creation from the feed:
- Floating "Quick Plan" button on the feed screen
- Pre-built templates: Coffee, Lunch, Workout, Movie Night, Game Night, Walk, Drinks, Dinner
- Smart time picker: In 30 min, Tonight, Tomorrow, This Weekend
- One-tap event creation with default emoji and duration
- Perfect for spontaneous hangouts

### Social Proof on Events
See who's going to events:
- Avatar stack showing friends attending
- Smart copy like "Sarah + 3 others going"
- FOMO banners for popular events
- Mutual friends indicator

### Offline Mode (MVP)
Use the app even when you don't have an internet connection:

**Offline Resilience:**
- **Stay Logged In**: Network failures never log you out - only true auth errors (401/403) clear your session
- **Cached Session**: Your session is stored locally so you remain authenticated even when offline
- **Offline Banner**: Amber "Offline" banner shows when you're not connected, with a retry button

**Offline Actions:**
- **Create Events**: Create new events while offline - they appear immediately in your calendar with a local placeholder
- **RSVP Changes**: Change your RSVP status (Going/Interested/Maybe/Can't make it) while offline

**Sync on Reconnect:**
- **Automatic Queue Replay**: When you come back online, queued actions are automatically synced
- **Syncing Banner**: Blue "Syncing..." banner shows progress while replaying queued actions
- **Conflict Resolution**: Local placeholder events are reconciled with server-created events on sync
- **Toast Notifications**: Get notified when sync completes or if any actions failed

**Technical Details:**
- Actions are queued in AsyncStorage and replayed in FIFO order
- Queue key: `offlineQueue:v1`
- Session cache key: `session_cache_v1`
- Network status is monitored via `@react-native-community/netinfo`

### Streak Counter
Track your hangout consistency:
- Shows current streak, longest streak, total hangouts
- Color intensity increases with longer streaks
- Motivational progress display

### Achievements & Badges
Earn achievements based on your social activity:

**Achievement Categories:**
- **Hosting**: Based on events you've hosted
- **Attending**: Based on events you've attended
- **Streaks**: Based on consecutive weeks being social

**Profile Badges:**
- Select any unlocked achievement to display as a badge on your profile
- Friends can see your earned badge
- Great way to show off your social activity!

### Monthly Recap (Spotify Wrapped style)
Shareable monthly recap cards (available during last 2 days of month and first 2 days of next month):
- Total hangouts, friends met, favorite activities
- Top friend you hung out with most
- Social rank: Social Butterfly, Super Connector, Rising Star
- Beautiful animated slides with gradients
- Share your recap to social media

### Animated Splash Screen
Beautiful branded launch experience:
- Animated logo with spring physics
- Gradient background
- Tagline: "Share plans. Discover friends. Connect."
- Smooth fade transition into the app

### Smart Review Prompts
Non-intrusive app review requests:
- Tracks user engagement (events created, friends added, events joined)
- Only prompts after meaningful engagement (2+ positive signals)
- Respects 60-day cooldown between prompts
- Opens native App Store review page

### UX Polish & Quick Wins
Enhanced user experience with attention to detail:

**Skeleton Loading Screens**
- Shimmer animations during data loading
- Content-aware placeholders for events, friends, and activity
- Smooth transitions from loading to content

**Animated Empty States**
- Floating decorative icons with subtle animations
- Pulsing center icons for visual interest
- Type-specific illustrations (events, friends, notifications, etc.)
- Action buttons to guide users

**Haptic Feedback**
- Light impact feedback on button presses
- Medium feedback on important actions
- Success/error notification feedback

**Animated Components**
- AnimatedButton with press scaling and spring physics
- AnimatedCard with touch feedback
- AnimatedIconButton for icon-only interactions

**Error Handling & Offline Support**
- Error boundary catches crashes and shows friendly recovery UI
- Offline banner appears when internet connection is lost
- Automatic retry when connection is restored
- Graceful fallbacks for slow or unavailable backend

### Referral System & Rewards
Invite friends and earn premium rewards:
- **Referral Code Format**: Your unique code is generated as (first initial)(last name 3 letters)_(4 unique chars), e.g., `bdia_t8js` for Brenda Diaz
- **Referral Counter**: Track your referral progress in Settings > Invite Friends section
- **Progress Bar**: Visual progress toward the next referral milestone
- **Reward Tiers**:
  - 3 friends = 1 month premium
  - 10 friends = 1 year FREE
  - 20 friends = Lifetime premium (launch period only)
- **Already Premium?**: If you reach a milestone while already premium, your subscription is extended

### Get Started Guide
New user onboarding experience:
- **First Login Popup**: A welcome modal appears on first login, inviting users to take a quick tour
- **Interactive Guide**: 7-step walkthrough covering:
  - Settings highlights (Birthday, Work Hours, Import Calendar)
  - Creating events
  - Private events and friend groups
  - Finding who's free
  - Inviting friends and earning rewards
- **Access Anytime**: Return to the guide via Settings > Support > Get Started Guide

### Help & FAQ (Complete Feature Guide)
Comprehensive in-app documentation at `/help-faq`:
- **Collapsible Sections**: 11 major feature categories, each expandable
- **Detailed Breakdowns**: Every feature has step-by-step "How it works" instructions
- **Pro Tips**: Helpful tips for getting the most out of each feature
- **Categories Covered**:
  - Events & Calendar (8 features)
  - Friends & Social (7 features)
  - Event Requests (3 features)
  - Availability & Scheduling (4 features)
  - Circles (4 features)
  - Smart Suggestions (4 features)
  - Achievements & Gamification (5 features)
  - Notifications (3 features)
  - Profile & Settings (5 features)
  - Referrals & Rewards (3 features)
  - Privacy & Security (3 features)
- **Access**: Settings > Support > Help & FAQ

### Welcome Onboarding Flow
Beautiful new user onboarding experience at `/welcome`:
1. **Welcome/Get Started**: Animated hero with floating avatars and calendar preview showcasing the app
2. **Email Sign Up**: Create account with email and password
3. **Email Verification**: Enter 5-digit code sent to your email
4. **Name Entry**: Set your display name for friends to see
5. **Profile Photo**: Take or choose a profile picture (skippable)
6. **Permissions**: Request contacts, notifications, location, and calendar access
7. **Quote Screen**: Motivational quote about relationships
8. **Subscription**: Choose yearly plan ($10/year launch special) or investor lifetime ($60)
9. **Referral**: Invite friends to earn free premium (3/10/20 friend tiers)

Features:
- Dark, elegant UI with coral accent color
- Smooth spring animations and haptic feedback
- Progress indicator with animated bars
- Skip option available throughout
- "Already have an account?" link on welcome screen

### Smart Date Picker
Improved event creation date picker:
- **Year Minimized**: Year is displayed as a small label instead of a scrollable wheel
- **Accident-Proof**: Year adjustment via +1/-1 buttons prevents accidental year changes
- **Focus on Day/Month**: Main picker focuses on the most commonly used date/month selection

### Smart Permissions
- Pre-permission dialogs explain why each permission is needed
- Clear benefit explanations before requesting access
- Easy access to settings if permission was previously denied
- Permissions: Camera, Photos, Calendar, Notifications

### Freemium Model & Paywalls

The app uses a freemium model where participation is always free, but power features require Pro.

**Free Tier:**
- Join unlimited events (participation is always free)
- Create up to 3 active events
- 2 circles max with 15 members each
- 7-day Who's Free horizon
- 30-day event history
- Basic achievements

**Pro Tier:**
- Unlimited active events and recurring events
- Unlimited circles and members
- 90-day Who's Free horizon
- Full event history
- Full achievements
- Circle insights and analytics
- Priority sync

**Paywall Triggers (10 contexts):**
1. `ACTIVE_EVENTS_LIMIT` - When at 3 active events
2. `RECURRING_EVENTS` - When selecting weekly/monthly frequency
3. `WHOS_FREE_HORIZON` - When viewing dates >7 days ahead
4. `UPCOMING_BIRTHDAYS_HORIZON` - When viewing birthdays >7 days ahead
5. `CIRCLES_LIMIT` - When creating 3rd circle
6. `CIRCLE_MEMBERS_LIMIT` - When adding 16th member
7. `INSIGHTS_LOCKED` - When accessing analytics
8. `HISTORY_LIMIT` - When viewing events >30 days old
9. `ACHIEVEMENTS_LOCKED` - When accessing full achievements
10. `PRIORITY_SYNC_LOCKED` - When accessing priority sync

**Key Files:**
- `src/lib/entitlements.ts` - Frontend entitlements logic
- `backend/src/lib/entitlements.ts` - Backend entitlements logic
- `src/components/paywall/PaywallModal.tsx` - Paywall modal component
- `src/components/notifications/NotificationNudgeModal.tsx` - Notification permission modal
- `src/app/dev-smoke-tests.tsx` - QA screen for testing all paywalls

## Tech Stack

### Frontend
- Expo SDK 53 with React Native 0.76.7
- Expo Router for file-based navigation
- NativeWind (TailwindCSS) for styling
- React Query for server state management
- Lucide React Native for icons
- React Native Reanimated for animations

### Backend
- Bun runtime
- Hono web framework
- Prisma ORM with SQLite
- Better Auth for authentication

## App Structure

```
src/app/
├── index.tsx                    # Activity Feed (main screen)
├── calendar.tsx                 # Calendar view with Event Requests section
├── create.tsx                   # Create event (supports templates)
├── create-event-request.tsx     # Create event request with friend selection
├── discover.tsx                 # Discover tab (suggestions, nearby, streaks)
├── whos-free.tsx                # See which friends are free on a date
├── friends.tsx                  # Friends list with social feature buttons
├── activity.tsx                 # Friend activity feed (events, joins, comments, photos)
├── suggestions.tsx              # Friend suggestions (people you may know)
├── profile.tsx                  # User profile & groups
├── login.tsx                    # Authentication
├── friend/[id].tsx              # Friend detail & their events
├── user/[id].tsx                # Public user profile (non-friend)
├── event/[id].tsx               # Event detail with Interest reactions
└── event-request/[id].tsx       # Event request detail & RSVP
```

## Design

### Theme & Appearance
The app supports three theme modes:
- **Light Mode**: Warm off-white background with coral accents
- **Dark Mode**: Pure black background with adaptive colors (matches iOS dark mode aesthetic)
- **Auto (System)**: Automatically follows your iPhone's dark/light mode setting (default)

The onboarding experience automatically adapts to your system theme - if you're in light mode on your phone, the onboarding will display in light mode. This applies throughout the entire onboarding flow including all mock UI elements.

You can also customize the accent color from 8 color options in Settings > Appearance.

### Color Palette
- **Primary**: Coral (#FF6B4A) - warm, inviting, energetic (customizable)
- **Secondary**: Teal (#4ECDC4) - fresh, complementary accent
- **Light Background**: Warm off-white (#FFF9F5)
- **Dark Background**: Pure black (#000000)
- **Text**: Adapts to theme (dark charcoal in light mode, white in dark mode)

### Navigation
5-button custom bottom navigation:
1. Discover (left) - Smart friend suggestions, nearby events, streaks, and quick templates
2. Calendar (left) - View your calendar with "Who's Free?" feature
3. Feed (center, prominent) - Activity feed
4. Friends (right) - Friends list
5. Profile (right) - Your profile & settings

**Notification Badge**: The Profile tab shows a red notification badge when you have pending friend requests, and the Calendar tab shows a badge when you have pending event requests awaiting your response.

### Premium Subscription
The app offers a freemium model with RevenueCat integration:

**Free Tier:**
- Up to 10 friends
- Up to 5 events per month
- Basic event creation
- No smart notifications

**Launch Pricing (First 3 Months):**
- 2-week FREE trial for all new users
- **Early Bird Annual**: $10/year (Year 1 only)
- **Investor Subscription**: $60 lifetime (limited time offer)

**Regular Pricing (After Launch):**
- **Annual**: $40/year
- **Lifetime Member**: $99.99 one-time

**Premium Features:**
- Unlimited friends
- Unlimited events
- Smart notifications
- Priority support
- Friend Groups
- Who's Free feature
- Work Schedule sync
- Notes for friends

Access subscription options from **Settings > Subscription** or the paywall screen.

### Referral Program
Grow with Open Invite and earn free premium access!

**How It Works:**
1. Share your unique invite code with friends
2. When they sign up using your code, you both get rewards
3. They get a welcome bonus as a new user

**Reward Tiers:**
- **3 friends joined**: 1 Month Premium FREE
- **10 friends joined**: 1 Year Premium FREE
- **20 friends joined**: Lifetime Premium VIP (Launch period only - first 3 months)

**Features:**
- Unique referral code generated from your name (e.g., `bdia_t8js` for Brenda Diaz)
- Shareable invite link
- Track successful referrals and pending invites
- View progress toward next reward tier
- Access from Settings > Invite Friends or during onboarding

### Discount Codes
Special promo codes for friends and family:

**Available Codes:**
- **MONTH1FREE**: 1 month of Premium (100 uses available)
- **YEAR1FREE**: 1 year of Premium (50 uses available)
- **LIFETIME4U**: Lifetime Premium access (20 uses available)

**How to Redeem:**
1. Go to the subscription/paywall screen
2. Tap "Have a discount code?"
3. Enter your code and tap "Redeem Code"
4. Your premium subscription will be activated immediately

**Notes:**
- Each user can only redeem each code once
- Codes can stack with existing subscriptions (extends your premium)
- Redeemed codes sync to your account in the backend

### Friends Page
- **Friend Requests Section**: Displays pending friend requests as profile cards with Accept/Decline buttons
- **Quick Add to Groups**: When accepting a friend request, a popup appears letting you instantly add them to multiple groups - perfect for adding close friends to all relevant groups at once
- **View Modes**: Toggle between List (compact) and Detailed (with mini calendars) views
- **Group Filter**: Filter friends by group to quickly find friends in specific categories
- **Test Friend Tools**: Beta testing mode to create test friends and events for development

### Profile Page
- **Stats Row**: Shows your Events count and Friends count as tappable cards (navigates to Calendar/Friends respectively)
- **Friend Requests Section**: Displays pending friend requests as profile cards with Accept/Decline buttons - similar to Instagram/Facebook friend request flow. When you tap a request card after accepting, you can view their friend profile
- **Friend Groups**: Create and manage friend groups to organize your friends

## Getting Started

The app runs automatically in Vibecode. Simply:
1. Sign up or sign in with your **email**
2. Add friends by their email, phone number, or handle
3. Create your first event
4. Watch the invites roll in!

### Friend Search (Instagram-style)
Find and add friends with live, ranked search results:
- **Live Results**: As you type (2+ characters), matching users appear instantly below the search box
- **Smart Ranking**: Results are ranked by relevance:
  1. Exact handle matches (@username) appear first
  2. Exact email matches
  3. Name prefix matches
  4. Name/handle substring matches
  5. Mutual friends boost ranking
- **Multi-Format Search**: Search by:
  - Name (partial match)
  - Email (prefix or exact)
  - Phone number (normalized digits)
  - Handle/username (@username)
- **Mutual Friends**: See how many mutual friends you have with each result
- **Friend Badge**: Already-friends are marked with a "Friend" badge
- **Offline Support**: Shows "Offline — search unavailable" when disconnected (no logout)
- **Debounced**: 300ms debounce prevents spamming the server

### Authentication
- **Sign in with Apple** (iOS): One-tap sign in using your Apple ID - fastest way to get started
- **Email Sign Up**: Create an account with email and password
- **Email Verification**: After signing up with email, you'll receive a verification code to confirm your address
- **Forgot Password**: Reset your password via email link

**Note**: Apple Sign In users skip email verification (Apple pre-verifies emails). Phone numbers are still used for finding friends (search by phone number in bio).

### Business/Organization Accounts (Coming Soon)
> **Note**: Business accounts are currently hidden in the app. This feature will be rolled out in a future update as we focus on perfecting the core friends + events experience first.

Business accounts will support:
- Public-facing event creators (Run clubs, Churches, Sports teams, etc.)
- Public events visible to all users
- Followers instead of friends
- Open profiles viewable by everyone

<!--
**2. Business/Organization Accounts**
- Public-facing event creators (Run clubs, Churches, Sports teams, etc.)
- Create events visible to all users
- Build followers instead of friends
- Open profiles viewable by everyone

**Creating a Business Account:**
1. Go to Discover > Public Events > Explore
2. Tap "Create Your Business Profile"
3. Fill in business details:
   - Business name and unique handle (@runclub_austin)
   - Category (Fitness, Religious, Community, etc.)
   - Location, website, contact info
   - Social media links (Instagram, Twitter, Facebook)
4. Start creating public events!

**Business Features:**
- **Public Events**: All business events are visible in the Discover > Public Events tab
- **Followers**: Users can follow businesses to get notified of new events
- **Category Discovery**: Browse businesses by category (Fitness, Food, Entertainment, etc.)
- **Search**: Find businesses by name, handle, or description
- **Verified Badge**: Verified businesses display a purple checkmark
- **Full Calendar**: Each business has their own event calendar

**Following Businesses:**
- Tap "Follow" on any business profile
- Followed businesses appear in your Friends tab under "Businesses You Follow"
- Business cards now match friend card layout with mini calendars showing upcoming events
- In List view: tap the dropdown arrow to expand and see the business calendar
- In Detailed view: calendar is always visible on each business card
- Get push notifications when they create new events
- Their events appear in your Discover > Public Events feed

**Examples of Business Accounts:**
- **Run Clubs**: Weekly group runs, 5K events
- **Churches**: Service times, community events
- **Sports Teams**: Practice schedules, game days
- **Gyms**: Group fitness classes, special events
- **Restaurants**: Happy hours, live music nights
- **Art Studios**: Classes, exhibitions, workshops

**Technical Details:**
- Businesses have separate event tables (BusinessEvent vs Event)
- Events support recurring schedules (daily, weekly, monthly)
- RSVP system with capacity limits
- Event notifications to all followers

**Profile Switching (Multi-Profile Support):**
If you own or manage a business, you can switch between your personal and business profiles:
- **Long-press** the Profile tab to open the profile switcher
- Select your personal account or any business you manage
- When in business mode:
  - Your profile tab shows a small building icon indicator
  - The Profile page transforms into a Business Dashboard
  - You see business stats (followers, events, total RSVPs)
  - Quick actions: Create Event, Team management, View public page
  - Your events section shows upcoming/past business events
- Switch back to personal mode to use the regular social calendar
- Each profile operates independently with its own events and audience

**Business Dashboard Features:**
- Business header with logo, cover image, and verification badge
- Real-time follower count and engagement metrics
- Quick event creation for your business
- Team management (invite admins/managers)
- View your public business page as followers see it
- **Event Calendar**: Interactive calendar showing all your business events
  - Navigate between months
  - Tap any date to see events scheduled for that day
  - Quick create event option for days with no events
- Manage upcoming and past events with attendee counts
- Tips section for new businesses to help grow their audience

**Business Event Banners:**
- Upload custom banner images when creating business events
- 16:9 aspect ratio recommended for best display
- Or use emoji icons for quick event creation
- Banners display prominently on event cards in the Discover feed

**Edit Business Profile:**
Access from Business Settings > Edit Profile to update:
- Business name and description
- Logo and cover images
- Category (Fitness, Food, Entertainment, etc.)
- Location
- Contact info (email, phone)
- **Website & Social Links**: Add your website URL and social media handles
  - Website (displays as clickable link on your business page)
  - Instagram handle
  - Twitter/X handle
  - Facebook page
-->

**Event Reflection Toggle:**
Hosts can disable the post-event reflection prompt for individual events:
- In event details, toggle "Prompt for reflection" off before the event
- Great for small, casual events that don't need formal reflection
- When disabled, no reminder notification will be sent after the event ends
- Can re-enable anytime if you change your mind

## Production Scaling (v2.3)

The backend is optimized for 10,000+ concurrent users:

### Database Indexes
Critical indexes have been added to improve query performance:
- `event`: userId, startTime, createdAt (for feed queries)
- `friendship`: userId, friendId (for friend lookups)
- `notification`: userId, read, createdAt (for notification feeds)
- `session`: userId, expiresAt (for session validation)
- `friend_request`: senderId, receiverId, status (for friend request queries)

### Rate Limiting
Protection against abuse and server overload:
- **Global**: 200 requests/minute per client
- **Auth endpoints**: 10 attempts per 15 minutes (prevents brute force)
- **Email verification**: 5 attempts per hour
- Rate limit headers included in responses (X-RateLimit-*)

### Toast Notifications
Non-blocking toast notifications replace modal alerts for better UX:
- Success, error, info, and warning variants
- Swipe to dismiss
- Auto-dismiss after 3 seconds
- Haptic feedback on appearance

## Paywall & Navigation System (v3.1)

### Navigation Helper (`src/lib/nav.ts`)
Single source of truth for all app routes with type-safe navigation functions:
- `goToHome(router)` - Navigate to home/feed
- `goToCreate(router)` - Create event screen
- `goToCalendar(router)` - Calendar view
- `goToFriends(router)` - Friends list
- `goToProfile(router)` - User profile
- `goToSettings(router)` - App settings
- `goToWhosFree(router)` - Who's Free screen
- `goToSubscription(router)` - Upgrade/subscription screen
- `goToCircle(router, id)` - Specific circle
- `goToEvent(router, id)` - Event details
- `goToFriend(router, id)` - Friend profile

### Paywall Contexts (10 total)
Each paywall context has specific copy and triggers:

| Context | Trigger | CTA |
|---------|---------|-----|
| `ACTIVE_EVENTS_LIMIT` | Create event when at 3 max | Upgrade to Pro |
| `RECURRING_EVENTS` | Select weekly/monthly frequency | Upgrade to Pro |
| `WHOS_FREE_HORIZON` | Select date beyond 7 days | Unlock Pro |
| `UPCOMING_BIRTHDAYS_HORIZON` | View birthdays beyond 7 days | Unlock Pro |
| `CIRCLES_LIMIT` | Create circle when at 2 max | Upgrade to Pro |
| `CIRCLE_MEMBERS_LIMIT` | Add member when at 15 max | Upgrade to Pro |
| `INSIGHTS_LOCKED` | Access insights/analytics | Unlock Pro |
| `HISTORY_LIMIT` | View history beyond 30 days | Unlock Pro |
| `ACHIEVEMENTS_LOCKED` | Access full achievements | Unlock Pro |
| `PRIORITY_SYNC_LOCKED` | Enable priority sync | Unlock Pro |

### Session Paywall Guard
Prevents over-monetization with session-based tracking:
- `wasPaywallShownThisSession()` - Check if paywall was shown
- `canShowAutomaticPaywall()` - Check if automatic paywall is allowed
- `markPaywallShown()` - Mark paywall as shown (called automatically)
- `resetSessionPaywallTracking()` - Reset for new session

### Notification Nudge System
Evolving copy based on dismissal history:
- **First nudge**: Benefit-framed ("Stay in the loop")
- **Second nudge**: Loss-framed ("Don't miss out")
- **Third+ dismissal**: Never auto-show again

Helper functions:
- `canShowAutoNudge()` - Check if auto-nudge should show
- `getNudgeState()` - Get current nudge state

### Analytics Events
Stub functions ready for provider integration:
- `paywall_shown` - When paywall modal appears
- `paywall_dismissed` - When user taps secondary CTA
- `paywall_purchase_started` - When user taps primary CTA
- `notification_permission_granted` - When user enables notifications
- `notification_permission_denied` - When user denies notifications
- `notification_nudge_shown` - When nudge modal appears
- `notification_nudge_dismissed` - When user dismisses nudge

### Dev Smoke Tests
QA screen at `/dev-smoke-tests` for testing:
- All 10 paywall contexts with manual triggers
- Navigation to all major screens
- Session state visibility (paywall shown, can show automatic)
- Notification nudge state
- Last CTA tracking
- Session reset button

## TestFlight QA Checklist (v3.2 Polish Pass)

### UI/UX Improvements Made
- [x] Replaced all `Alert.alert()` with Toast notifications for non-blocking feedback
- [x] Added ConfirmModal for all destructive actions (delete event, remove team member, delete business)
- [x] Fixed email-null safety for Apple Sign In users (6 components fixed)
- [x] Apple Sign In users correctly bypass email verification

### Files Modified
**Toast + ConfirmModal Conversions:**
- `src/app/account-center.tsx`
- `src/app/event-request/[id].tsx`
- `src/app/event/edit/[id].tsx`
- `src/app/onboarding.tsx`
- `src/app/paywall.tsx`
- `src/components/EventPhotoGallery.tsx`
- `src/components/LoginWithEmailPassword.tsx`
- `src/app/create-business.tsx`
- `src/app/business/[id]/edit.tsx`
- `src/app/business/[id]/settings.tsx`
- `src/app/business/[id]/team.tsx`
- `src/app/business/[id]/create-event.tsx`
- `src/app/dev-smoke-tests.tsx`

**Email-null Safety Fixes:**
- `src/app/profile.tsx` - Avatar initials fallback
- `src/app/event/[id].tsx` - Host name fallback
- `src/app/business/[id]/team.tsx` - Member name fallback
- `src/app/suggestions.tsx` - User name fallback
- `src/app/calendar.tsx` - Host name fallback

### Manual QA Checklist
Before cutting a new TestFlight build, verify:

**Core Flows:**
- [ ] Create account with email → verify toast shows for errors
- [ ] Apple Sign In → user skips email verification
- [ ] Create event → toast shows on success/error
- [ ] Edit event → toast confirms save
- [ ] Delete event → ConfirmModal appears with destructive styling

**Friend Actions:**
- [ ] Send friend request → toast shows result
- [ ] Accept/decline request → toast feedback
- [ ] Search friends by name, email, phone → results display

**Business Features (if enabled):**
- [ ] Create business → validation toasts
- [ ] Edit business profile → save toast
- [ ] Delete business → ConfirmModal with warning
- [ ] Invite team member → success toast
- [ ] Remove team member → ConfirmModal

**Subscription/Paywall:**
- [ ] All 10 paywall contexts trigger correctly (use dev-smoke-tests)
- [ ] Primary CTA navigates to /subscription
- [ ] Secondary CTA dismisses modal only
- [ ] Purchase success → toast + modal

**Apple Sign In Users:**
- [ ] No email → user displays correctly (name only)
- [ ] Avatar shows first initial of name or "?"
- [ ] Friend suggestions work without email
- [ ] Profile displays correctly

### Known Safe Alert.alert Usage
These files intentionally use native `Alert.alert()` for iOS system patterns:
- `src/lib/permissions.ts` - Pre-permission prompts for camera/photos
- `src/lib/rateApp.ts` - App Store review prompt

