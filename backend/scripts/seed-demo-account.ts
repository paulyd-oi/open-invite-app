/**
 * Seed Demo/Beta Account Script
 *
 * Creates a demo account for App Store review with:
 * - 1 demo user (beta tester account)
 * - 12 friends with profiles and bios
 * - Various events on calendars
 * - Comments and interactions on events
 * - Pending friend requests
 * - Friend groups
 *
 * Demo Account Credentials:
 * Email: demo@openinvite.app
 * Password: DemoReview2024!
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { hashPassword } from "better-auth/crypto";

const db = new PrismaClient();

// Demo account credentials
const DEMO_EMAIL = "demo@openinvite.app";
const DEMO_PASSWORD = "DemoReview2024!";
const DEMO_NAME = "Alex Demo";
const DEMO_HANDLE = "alexdemo";

// Friend data - diverse set of 12 friends
const FRIENDS_DATA = [
  {
    name: "Sarah Chen",
    handle: "sarahc",
    bio: "Coffee enthusiast & weekend hiker. Always down for brunch!",
    calendarBio: "My calendar is packed with yoga and coffee dates",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Marcus Williams",
    handle: "marcusw",
    bio: "Basketball fanatic. Game nights are my thing.",
    calendarBio: "Basketball practice Tuesdays & Thursdays",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Emma Rodriguez",
    handle: "emmar",
    bio: "Foodie exploring the city one restaurant at a time 🍜",
    calendarBio: "Usually free evenings - let's grab dinner!",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "James Park",
    handle: "jamesp",
    bio: "Software engineer by day, gamer by night",
    calendarBio: "WFH most days, flexible for lunch meetups",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Olivia Thompson",
    handle: "oliviat",
    bio: "Yoga instructor & plant mom. Spreading good vibes!",
    calendarBio: "Teaching yoga MWF mornings, free afternoons",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "David Kim",
    handle: "davidk",
    bio: "Photographer capturing moments. Love sunset shoots!",
    calendarBio: "Weekends are for photo adventures",
    avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Sophia Martinez",
    handle: "sophiam",
    bio: "Dance teacher & salsa lover. Let's hit the dance floor!",
    calendarBio: "Dance classes evenings, free for weekend hangouts",
    avatarUrl: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Ryan Johnson",
    handle: "ryanj",
    bio: "Craft beer enthusiast & trivia night champion",
    calendarBio: "Trivia Wednesdays at O'Malley's - join us!",
    avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Mia Lee",
    handle: "mialee",
    bio: "Bookworm & cozy cafe lover. Book club every month!",
    calendarBio: "Book club last Sunday of the month",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Chris Anderson",
    handle: "chrisa",
    bio: "Running marathons and chasing PRs. Early bird!",
    calendarBio: "Morning runs 6am, busy with training",
    avatarUrl: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Isabella Wright",
    handle: "isabellaw",
    bio: "Art curator with a passion for galleries & wine nights",
    calendarBio: "Gallery openings Thursdays, wine Fridays",
    avatarUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Tyler Brown",
    handle: "tylerb",
    bio: "Music producer & concert junkie. Live shows are life!",
    calendarBio: "Studio time varies, always free for concerts",
    avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop&crop=faces",
  },
];

// People who will send friend requests to demo user
const FRIEND_REQUEST_SENDERS = [
  {
    name: "Nicole Foster",
    handle: "nicolef",
    bio: "New to the city! Looking for hiking buddies",
    avatarUrl: "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Brandon Mitchell",
    handle: "brandonm",
    bio: "Tennis player seeking doubles partners",
    avatarUrl: "https://images.unsplash.com/photo-1463453091185-61582044d556?w=400&h=400&fit=crop&crop=faces",
  },
  {
    name: "Jessica Wang",
    handle: "jessicaw",
    bio: "Startup founder, always networking",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=400&fit=crop&crop=faces",
  },
];

// Event templates for creating realistic events
const EVENT_TEMPLATES = [
  { title: "Coffee catch-up", emoji: "☕", category: "food", duration: 60 },
  { title: "Brunch at the new spot", emoji: "🥞", category: "food", duration: 90 },
  { title: "Happy hour drinks", emoji: "🍻", category: "social", duration: 120 },
  { title: "Movie night", emoji: "🎬", category: "entertainment", duration: 180 },
  { title: "Basketball game", emoji: "🏀", category: "sports", duration: 120 },
  { title: "Yoga session", emoji: "🧘", category: "fitness", duration: 60 },
  { title: "Hiking adventure", emoji: "🥾", category: "outdoors", duration: 240 },
  { title: "Game night", emoji: "🎮", category: "entertainment", duration: 180 },
  { title: "Dinner reservation", emoji: "🍽️", category: "food", duration: 120 },
  { title: "Concert", emoji: "🎵", category: "entertainment", duration: 180 },
  { title: "Art gallery visit", emoji: "🎨", category: "entertainment", duration: 120 },
  { title: "Book club meeting", emoji: "📚", category: "social", duration: 120 },
  { title: "Trivia night", emoji: "🧠", category: "social", duration: 150 },
  { title: "Dance class", emoji: "💃", category: "fitness", duration: 90 },
  { title: "Beach day", emoji: "🏖️", category: "outdoors", duration: 300 },
  { title: "Wine tasting", emoji: "🍷", category: "food", duration: 120 },
  { title: "Cooking class", emoji: "👨‍🍳", category: "food", duration: 150 },
  { title: "Karaoke night", emoji: "🎤", category: "entertainment", duration: 180 },
  { title: "Farmers market trip", emoji: "🥬", category: "outdoors", duration: 90 },
  { title: "Picnic in the park", emoji: "🧺", category: "outdoors", duration: 120 },
];

// Comments for events
const COMMENTS = [
  "Can't wait! This is going to be so fun!",
  "I'll bring snacks!",
  "Count me in!",
  "What should I wear?",
  "Is parking available nearby?",
  "I might be 10 mins late, save me a spot!",
  "Should we carpool?",
  "Sounds amazing, see you there!",
  "Do we need to bring anything?",
  "I'll text you when I'm on my way",
  "This place has the best reviews!",
  "Finally! Been wanting to do this for ages",
  "Can I invite my friend too?",
  "What's the address again?",
  "Perfect timing, I'm free!",
];

// Locations
const LOCATIONS = [
  "Blue Bottle Coffee, Downtown",
  "The Breakfast Club, Main St",
  "O'Malley's Pub",
  "AMC Metreon 16",
  "24 Hour Fitness, Market St",
  "Golden Gate Park",
  "Dolores Park",
  "The Fillmore",
  "SFMOMA",
  "City Lights Bookstore",
  "Kokkari Estiatorio",
  "Bi-Rite Market",
  "Ocean Beach",
  "Napa Valley",
  "Sur La Table, Union Square",
];

async function hashPasswordLocal(password: string): Promise<string> {
  // Use Better Auth's hashPassword function
  return hashPassword(password);
}

function getRandomItem<T>(array: T[]): T {
  const item = array[Math.floor(Math.random() * array.length)];
  if (item === undefined) throw new Error("Array is empty");
  return item;
}

function getRandomDate(daysFromNow: number, hoursRange: [number, number]): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const hour = Math.floor(Math.random() * (hoursRange[1] - hoursRange[0])) + hoursRange[0];
  date.setHours(hour, 0, 0, 0);
  return date;
}

function getPastDate(daysAgo: number, hoursRange: [number, number]): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const hour = Math.floor(Math.random() * (hoursRange[1] - hoursRange[0])) + hoursRange[0];
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  console.log("🌱 Starting demo account seed...\n");

  // Clean up existing demo data (if re-running)
  console.log("🧹 Cleaning up existing demo data...");
  const existingDemoUser = await db.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  if (existingDemoUser) {
    // Delete profile first (foreign key constraint)
    await db.profile.deleteMany({ where: { userId: existingDemoUser.id } });
    // Delete the demo user and all related data
    await db.user.delete({ where: { id: existingDemoUser.id } });
    console.log("   Deleted existing demo user");
  }

  // Also clean up friend users by handle
  const allHandles = [...FRIENDS_DATA.map(f => f.handle), ...FRIEND_REQUEST_SENDERS.map(f => f.handle)];
  for (const handle of allHandles) {
    const profile = await db.profile.findUnique({ where: { handle } });
    if (profile) {
      // Delete profile first
      await db.profile.delete({ where: { handle } });
      // Then delete user
      await db.user.delete({ where: { id: profile.userId } }).catch(() => {
        // User might already be deleted
      });
    }
  }
  console.log("   Cleaned up existing friend users\n");

  // Create demo user
  console.log("👤 Creating demo user...");
  const demoUserId = randomUUID();
  const hashedPassword = await hashPassword(DEMO_PASSWORD);

  const demoUser = await db.user.create({
    data: {
      id: demoUserId,
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      emailVerified: true,
      onboardingCompleted: true,
      referralCode: "DEMO2024",
      Profile: {
        create: {
          handle: DEMO_HANDLE,
          bio: "App Store reviewer - exploring all features!",
          calendarBio: "Busy exploring the app, always open to hangouts!",
          avatarUrl: "https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=200",
          birthday: new Date("1990-06-15"),
          showBirthdayToFriends: true,
        },
      },
      account: {
        create: {
          id: randomUUID(),
          accountId: demoUserId,
          providerId: "credential",
          password: hashedPassword,
        },
      },
      subscription: {
        create: {
          tier: "premium",
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          purchasedAt: new Date(),
        },
      },
    },
  });
  console.log(`   Created: ${DEMO_NAME} (${DEMO_EMAIL})`);
  console.log(`   Password: ${DEMO_PASSWORD}\n`);

  // Create friend groups for demo user
  console.log("📁 Creating friend groups...");
  const groups = await Promise.all([
    db.friend_group.create({
      data: {
        name: "Close Friends",
        color: "#FF6B4A",
        icon: "heart",
        userId: demoUserId,
      },
    }),
    db.friend_group.create({
      data: {
        name: "Fitness Buddies",
        color: "#10B981",
        icon: "dumbbell",
        userId: demoUserId,
      },
    }),
    db.friend_group.create({
      data: {
        name: "Foodies",
        color: "#F59E0B",
        icon: "utensils",
        userId: demoUserId,
      },
    }),
    db.friend_group.create({
      data: {
        name: "Work Friends",
        color: "#3B82F6",
        icon: "briefcase",
        userId: demoUserId,
      },
    }),
  ]);
  console.log(`   Created ${groups.length} friend groups\n`);

  // Create friends
  console.log("👥 Creating friends...");
  const friendUsers: { id: string; name: string }[] = [];

  for (const friendData of FRIENDS_DATA) {
    const friendId = randomUUID();
    const friendUser = await db.user.create({
      data: {
        id: friendId,
        email: `${friendData.handle}@openinvite.demo`,
        name: friendData.name,
        image: friendData.avatarUrl, // Set image on User model for API responses
        emailVerified: true,
        onboardingCompleted: true,
        Profile: {
          create: {
            handle: friendData.handle,
            bio: friendData.bio,
            calendarBio: friendData.calendarBio,
            avatarUrl: friendData.avatarUrl,
            birthday: new Date(1988 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
            showBirthdayToFriends: Math.random() > 0.3,
          },
        },
      },
    });
    friendUsers.push({ id: friendId, name: friendData.name });
    console.log(`   Created friend: ${friendData.name}`);
  }

  // Create bidirectional friendships
  console.log("\n🤝 Creating friendships...");
  const friendships: string[] = [];

  for (const friend of friendUsers) {
    // Demo user -> Friend
    const friendship1 = await db.friendship.create({
      data: {
        userId: demoUserId,
        friendId: friend.id,
      },
    });
    friendships.push(friendship1.id);

    // Friend -> Demo user
    await db.friendship.create({
      data: {
        userId: friend.id,
        friendId: demoUserId,
      },
    });
  }
  console.log(`   Created ${friendUsers.length} friendships\n`);

  // Assign some friends to groups
  console.log("📋 Assigning friends to groups...");
  // Close Friends: Sarah, Emma, James, Mia
  const closeFriendIds = [0, 2, 3, 8].map(i => friendships[i]).filter((id): id is string => id !== undefined);
  for (const fId of closeFriendIds) {
    await db.friend_group_membership.create({
      data: { friendshipId: fId, groupId: groups[0].id },
    });
  }

  // Fitness Buddies: Marcus, Olivia, Chris
  const fitnessFriendIds = [1, 4, 9].map(i => friendships[i]).filter((id): id is string => id !== undefined);
  for (const fId of fitnessFriendIds) {
    await db.friend_group_membership.create({
      data: { friendshipId: fId, groupId: groups[1].id },
    });
  }

  // Foodies: Sarah, Emma, Ryan, Isabella
  const foodieFriendIds = [0, 2, 7, 10].map(i => friendships[i]).filter((id): id is string => id !== undefined);
  for (const fId of foodieFriendIds) {
    await db.friend_group_membership.create({
      data: { friendshipId: fId, groupId: groups[2].id },
    });
  }

  // Work Friends: James, David, Tyler
  const workFriendIds = [3, 5, 11].map(i => friendships[i]).filter((id): id is string => id !== undefined);
  for (const fId of workFriendIds) {
    await db.friend_group_membership.create({
      data: { friendshipId: fId, groupId: groups[3].id },
    });
  }
  console.log("   Assigned friends to groups\n");

  // Create events for demo user
  console.log("📅 Creating events for demo user...");
  const demoEvents: string[] = [];

  // Create 5-7 upcoming events for demo user
  const demoEventCount = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < demoEventCount; i++) {
    const template = getRandomItem(EVENT_TEMPLATES);
    const startTime = getRandomDate(i + 1, [10, 20]);
    const endTime = new Date(startTime.getTime() + template.duration * 60 * 1000);

    const event = await db.event.create({
      data: {
        title: template.title,
        emoji: template.emoji,
        category: template.category,
        description: `Join me for ${template.title.toLowerCase()}! It's going to be great.`,
        location: getRandomItem(LOCATIONS),
        startTime,
        endTime,
        visibility: "all_friends",
        userId: demoUserId,
      },
    });
    demoEvents.push(event.id);
    console.log(`   Created event: ${template.emoji} ${template.title}`);
  }

  // Create events for friends (so demo user can see them)
  console.log("\n📅 Creating events for friends...");
  const friendEvents: { id: string; userId: string; title: string }[] = [];

  for (const friend of friendUsers) {
    // Each friend has 2-4 upcoming events
    const eventCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < eventCount; i++) {
      const template = getRandomItem(EVENT_TEMPLATES);
      const startTime = getRandomDate(Math.floor(Math.random() * 14) + 1, [9, 21]);
      const endTime = new Date(startTime.getTime() + template.duration * 60 * 1000);

      const event = await db.event.create({
        data: {
          title: template.title,
          emoji: template.emoji,
          category: template.category,
          description: `${friend.name.split(" ")[0]}'s ${template.title.toLowerCase()} - everyone welcome!`,
          location: getRandomItem(LOCATIONS),
          startTime,
          endTime,
          visibility: "all_friends",
          userId: friend.id,
        },
      });
      friendEvents.push({ id: event.id, userId: friend.id, title: template.title });
    }
    console.log(`   Created events for ${friend.name}`);
  }

  // Add comments to some events
  console.log("\n💬 Adding comments to events...");

  // Add comments to demo user's events
  for (const eventId of demoEvents) {
    const commentCount = 2 + Math.floor(Math.random() * 4);
    const commenters = [...friendUsers].sort(() => Math.random() - 0.5).slice(0, commentCount);

    for (const commenter of commenters) {
      await db.event_comment.create({
        data: {
          eventId,
          userId: commenter.id,
          content: getRandomItem(COMMENTS),
        },
      });
    }
  }
  console.log(`   Added comments to demo user's events`);

  // Add comments to friend events (including from demo user)
  for (const event of friendEvents.slice(0, 15)) {
    // Demo user comments on some friend events
    if (Math.random() > 0.5) {
      await db.event_comment.create({
        data: {
          eventId: event.id,
          userId: demoUserId,
          content: getRandomItem(COMMENTS),
        },
      });
    }

    // Other friends comment
    const otherFriends = friendUsers.filter(f => f.id !== event.userId);
    const commenters = otherFriends.sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3));

    for (const commenter of commenters) {
      await db.event_comment.create({
        data: {
          eventId: event.id,
          userId: commenter.id,
          content: getRandomItem(COMMENTS),
        },
      });
    }
  }
  console.log(`   Added comments to friend events`);

  // Add event interests (people interested but not committed)
  console.log("\n⭐ Adding event interests...");
  for (const event of friendEvents.slice(0, 20)) {
    // Demo user shows interest in some events
    if (Math.random() > 0.6) {
      await db.event_interest.create({
        data: {
          eventId: event.id,
          userId: demoUserId,
        },
      });
    }
  }
  console.log(`   Added interests to events`);

  // Create join requests for demo user's events
  console.log("\n📨 Creating join requests...");
  for (const eventId of demoEvents.slice(0, 3)) {
    const requesters = friendUsers.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 3));

    for (const requester of requesters) {
      await db.event_join_request.create({
        data: {
          eventId,
          userId: requester.id,
          status: Math.random() > 0.3 ? "pending" : "accepted",
          message: Math.random() > 0.5 ? "Would love to join!" : null,
        },
      });
    }
  }
  console.log(`   Created join requests for demo events`);

  // Create pending friend requests to demo user
  console.log("\n📬 Creating pending friend requests...");
  for (const senderData of FRIEND_REQUEST_SENDERS) {
    const senderId = randomUUID();
    await db.user.create({
      data: {
        id: senderId,
        email: `${senderData.handle}@openinvite.demo`,
        name: senderData.name,
        image: senderData.avatarUrl, // Set image on User model for API responses
        emailVerified: true,
        onboardingCompleted: true,
        Profile: {
          create: {
            handle: senderData.handle,
            bio: senderData.bio,
            avatarUrl: senderData.avatarUrl,
          },
        },
      },
    });

    await db.friend_request.create({
      data: {
        senderId,
        receiverId: demoUserId,
        status: "pending",
      },
    });
    console.log(`   Friend request from: ${senderData.name}`);
  }

  // Create notifications for demo user
  console.log("\n🔔 Creating notifications...");
  const notifications = [
    { type: "friend_request", title: "New friend request", body: "Nicole Foster wants to be your friend" },
    { type: "friend_request", title: "New friend request", body: "Brandon Mitchell wants to be your friend" },
    { type: "friend_request", title: "New friend request", body: "Jessica Wang wants to be your friend" },
    { type: "new_event", title: "New event nearby", body: "Sarah Chen is hosting Coffee catch-up" },
    { type: "join_request", title: "Join request", body: "Marcus Williams wants to join your Happy hour drinks" },
    { type: "event_comment", title: "New comment", body: "Emma Rodriguez commented on your event" },
  ];

  for (const notif of notifications) {
    await db.notification.create({
      data: {
        userId: demoUserId,
        type: notif.type,
        title: notif.title,
        body: notif.body,
        read: Math.random() > 0.7,
      },
    });
  }
  console.log(`   Created ${notifications.length} notifications`);

  // Create some hangout history for streaks
  console.log("\n📊 Creating hangout history...");
  for (let i = 0; i < 8; i++) {
    const friend = getRandomItem(friendUsers);
    const template = getRandomItem(EVENT_TEMPLATES);
    await db.hangout_history.create({
      data: {
        userId: demoUserId,
        friendId: friend.id,
        eventTitle: template.title,
        hangoutDate: getPastDate(Math.floor(Math.random() * 30), [10, 20]),
      },
    });
  }
  console.log(`   Created hangout history`);

  // Create work schedule for demo user
  console.log("\n💼 Creating work schedule...");
  const workDays = [1, 2, 3, 4, 5]; // Monday to Friday
  for (const day of workDays) {
    await db.work_schedule.create({
      data: {
        userId: demoUserId,
        dayOfWeek: day,
        isEnabled: true,
        startTime: "09:00",
        endTime: "17:00",
        label: "Work",
      },
    });
  }
  console.log(`   Created work schedule (Mon-Fri 9-5)`);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ DEMO ACCOUNT CREATED SUCCESSFULLY!");
  console.log("=".repeat(50));
  console.log("\n📱 Demo Account Credentials:");
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log("\n📊 Data Summary:");
  console.log(`   • 12 friends with profiles`);
  console.log(`   • ${demoEventCount} events on demo user's calendar`);
  console.log(`   • ${friendEvents.length} events from friends`);
  console.log(`   • Comments and interactions on events`);
  console.log(`   • 3 pending friend requests`);
  console.log(`   • 4 friend groups with members`);
  console.log(`   • 6 notifications`);
  console.log(`   • Work schedule (Mon-Fri 9-5)`);
  console.log(`   • Premium subscription active`);
  console.log("\n🍎 For App Store Review:");
  console.log("   Add these credentials to TestFlight Beta App Review Information:");
  console.log(`   Username: ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log("=".repeat(50) + "\n");

  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error seeding demo account:", e);
  db.$disconnect();
  process.exit(1);
});
