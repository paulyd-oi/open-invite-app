/**
 * Add 20 events throughout January 2026 for the demo account
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEMO_EMAIL = "demo@openinvite.app";

// Diverse events for January
const JANUARY_EVENTS = [
  { title: "New Year's Brunch", emoji: "🥂", category: "food", day: 1, hour: 11, duration: 120 },
  { title: "Gym session", emoji: "💪", category: "fitness", day: 3, hour: 7, duration: 90 },
  { title: "Coffee & catch-up", emoji: "☕", category: "social", day: 5, hour: 10, duration: 60 },
  { title: "Movie night", emoji: "🎬", category: "entertainment", day: 7, hour: 19, duration: 150 },
  { title: "Wine tasting", emoji: "🍷", category: "food", day: 9, hour: 18, duration: 120 },
  { title: "Book club meeting", emoji: "📚", category: "social", day: 11, hour: 14, duration: 120 },
  { title: "Basketball game", emoji: "🏀", category: "sports", day: 12, hour: 16, duration: 120 },
  { title: "Dinner party", emoji: "🍽️", category: "food", day: 14, hour: 19, duration: 180 },
  { title: "Yoga class", emoji: "🧘", category: "fitness", day: 15, hour: 8, duration: 60 },
  { title: "Art gallery opening", emoji: "🎨", category: "entertainment", day: 17, hour: 18, duration: 120 },
  { title: "Hiking trip", emoji: "🥾", category: "outdoors", day: 18, hour: 9, duration: 240 },
  { title: "Trivia night", emoji: "🧠", category: "social", day: 20, hour: 20, duration: 150 },
  { title: "Cooking class", emoji: "👨‍🍳", category: "food", day: 21, hour: 18, duration: 150 },
  { title: "Concert", emoji: "🎵", category: "entertainment", day: 23, hour: 20, duration: 180 },
  { title: "Brunch date", emoji: "🥞", category: "food", day: 25, hour: 11, duration: 90 },
  { title: "Game night", emoji: "🎮", category: "entertainment", day: 26, hour: 19, duration: 180 },
  { title: "Beach walk", emoji: "🏖️", category: "outdoors", day: 27, hour: 15, duration: 120 },
  { title: "Happy hour", emoji: "🍻", category: "social", day: 28, hour: 17, duration: 120 },
  { title: "Dance class", emoji: "💃", category: "fitness", day: 29, hour: 19, duration: 90 },
  { title: "Karaoke night", emoji: "🎤", category: "entertainment", day: 31, hour: 21, duration: 180 },
];

const LOCATIONS = [
  "The Breakfast Club, Main St",
  "24 Hour Fitness, Market St",
  "Blue Bottle Coffee, Downtown",
  "AMC Metreon 16",
  "Napa Valley",
  "City Lights Bookstore",
  "Golden Gate Park",
  "Kokkari Estiatorio",
  "Yoga Studio, SOMA",
  "SFMOMA",
  "Muir Woods",
  "O'Malley's Pub",
  "Sur La Table, Union Square",
  "The Fillmore",
  "The Mill, Divisadero",
  "Sarah's Place",
  "Ocean Beach",
  "The Irish Bank",
  "Dance Studio SF",
  "Pandora Karaoke",
];

async function main() {
  console.log("🗓️ Adding January 2026 events for demo account...\n");

  // Get demo user
  const demoUser = await db.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  if (!demoUser) {
    console.error("❌ Demo user not found!");
    process.exit(1);
  }

  // Get demo user's friends
  const friendships = await db.friendship.findMany({
    where: { userId: demoUser.id },
    include: { user_friendship_friendIdTouser: true },
  });

  const friendIds = friendships.map(f => f.friendId);
  console.log(`Found ${friendIds.length} friends\n`);

  // Create events
  for (let i = 0; i < JANUARY_EVENTS.length; i++) {
    const event = JANUARY_EVENTS[i];
    if (!event) continue;

    const startTime = new Date(2026, 0, event.day, event.hour, 0, 0); // January 2026
    const endTime = new Date(startTime.getTime() + event.duration * 60 * 1000);

    // Alternate between demo user hosting and friends hosting
    const isHostedByDemo = i % 3 !== 2; // 2/3 hosted by demo, 1/3 by friends
    const friendId = friendIds[i % friendIds.length];
    const hostId = isHostedByDemo ? demoUser.id : (friendId ?? demoUser.id);

    const createdEvent = await db.event.create({
      data: {
        title: event.title,
        emoji: event.emoji,
        category: event.category,
        description: `Join us for ${event.title.toLowerCase()}! It's going to be great.`,
        location: LOCATIONS[i] ?? "TBD",
        startTime,
        endTime,
        visibility: "all_friends",
        userId: hostId,
      },
    });

    // Add join requests/attendance for events hosted by demo
    if (isHostedByDemo) {
      // Add 2-4 friends as attendees
      const attendeeCount = 2 + Math.floor(Math.random() * 3);
      const attendees = [...friendIds].sort(() => Math.random() - 0.5).slice(0, attendeeCount);
      
      for (const attendeeId of attendees) {
        await db.event_join_request.create({
          data: {
            eventId: createdEvent.id,
            userId: attendeeId,
            status: "accepted",
          },
        });
      }
      console.log(`✅ Created: ${event.emoji} ${event.title} (Jan ${event.day}) - ${attendeeCount} attendees`);
    } else {
      // Demo user attending friend's event
      await db.event_join_request.create({
        data: {
          eventId: createdEvent.id,
          userId: demoUser.id,
          status: "accepted",
        },
      });
      console.log(`✅ Created: ${event.emoji} ${event.title} (Jan ${event.day}) - You're attending`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Successfully added 20 January 2026 events!");
  console.log("=".repeat(50));

  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  db.$disconnect();
  process.exit(1);
});
