/**
 * Seed Demo Businesses Script
 *
 * Creates businesses and business events for the demo account to populate the Discover page.
 *
 * Run with: bun run scripts/seed-demo-businesses.ts
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const db = new PrismaClient();

const DEMO_EMAIL = "demo@openinvite.app";

// Business data - diverse set of local businesses/organizations
const BUSINESSES_DATA = [
  {
    name: "Austin Run Club",
    handle: "austinrunclub",
    description: "Join us for weekly group runs around Austin! All paces welcome. We meet every Tuesday and Saturday morning for scenic routes through the city's best trails and neighborhoods.",
    category: "fitness",
    logoUrl: "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=400",
    coverUrl: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800",
    location: "Austin, TX",
    website: "https://austinrunclub.com",
    instagram: "@austinrunclub",
    events: [
      {
        title: "Saturday Morning Long Run",
        description: "Join us for our weekly long run! We'll tackle 8-10 miles through Lady Bird Lake trail. All paces welcome - we have pace groups for everyone from 8:00/mi to 12:00/mi. Coffee and stretching after!",
        location: "Zilker Park, Austin TX",
        emoji: "🏃",
        daysFromNow: 2,
        hour: 7,
        duration: 120,
        category: "fitness",
      },
      {
        title: "Tuesday Track Workout",
        description: "Speed work Tuesday! We'll be doing 800m repeats at the track. Great for building speed and meeting other runners. Warm up at 6:15pm, workout starts at 6:30pm sharp.",
        location: "Austin High Track, 1715 W Cesar Chavez St",
        emoji: "⚡",
        daysFromNow: 4,
        hour: 18,
        duration: 75,
        category: "fitness",
      },
      {
        title: "Trail Running 101 Workshop",
        description: "New to trail running? Learn the basics! We'll cover proper form, gear selection, navigation, and safety tips. Then we'll hit the trails for a beginner-friendly 3-mile run.",
        location: "Barton Creek Greenbelt",
        emoji: "🥾",
        daysFromNow: 9,
        hour: 8,
        duration: 150,
        category: "fitness",
      },
    ],
  },
  {
    name: "Eastside Social Club",
    handle: "eastsidesocial",
    description: "Your neighborhood community hub! We host trivia nights, game nights, live music, and community gatherings. Located in the heart of East Austin.",
    category: "community",
    logoUrl: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=400",
    coverUrl: "https://images.unsplash.com/photo-1528495612343-9ca9f4a4de28?w=800",
    location: "East Austin, TX",
    website: "https://eastsidesocial.club",
    instagram: "@eastsidesocial",
    events: [
      {
        title: "Wednesday Trivia Night",
        description: "Test your knowledge at our weekly trivia! Teams of 2-6 people. Winners get a $50 bar tab. Categories include pop culture, history, science, and a wild card round. Free to play!",
        location: "Eastside Social Club, 1234 E 6th St",
        emoji: "🧠",
        daysFromNow: 3,
        hour: 19,
        duration: 120,
        category: "entertainment",
      },
      {
        title: "Board Game Bonanza",
        description: "Bring your favorite board games or play ours! We have over 100 games in our library. Great for meeting new people. Snacks and drinks available.",
        location: "Eastside Social Club, 1234 E 6th St",
        emoji: "🎲",
        daysFromNow: 5,
        hour: 18,
        duration: 180,
        category: "entertainment",
      },
      {
        title: "Live Jazz Night",
        description: "Featuring the Austin Jazz Collective! Enjoy smooth jazz with craft cocktails. No cover charge. Seating is first-come, first-served.",
        location: "Eastside Social Club, 1234 E 6th St",
        emoji: "🎷",
        daysFromNow: 7,
        hour: 20,
        duration: 180,
        category: "entertainment",
      },
      {
        title: "Community Potluck Dinner",
        description: "Monthly potluck! Bring a dish to share and meet your neighbors. Theme this month: comfort food from your childhood. All dietary preferences welcome.",
        location: "Eastside Social Club, 1234 E 6th St",
        emoji: "🍲",
        daysFromNow: 14,
        hour: 18,
        duration: 180,
        category: "food",
      },
    ],
  },
  {
    name: "Austin Yoga Collective",
    handle: "austinyogaco",
    description: "Find your flow with Austin's friendliest yoga community. We offer classes for all levels in beautiful outdoor settings and partner studios across the city.",
    category: "fitness",
    logoUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
    coverUrl: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
    location: "Austin, TX",
    instagram: "@austinyogaco",
    events: [
      {
        title: "Sunrise Yoga at Zilker",
        description: "Start your day right with yoga at sunrise! This all-levels vinyasa flow takes place on the great lawn. Bring your own mat. Ends with a guided meditation.",
        location: "Zilker Park Great Lawn",
        emoji: "🧘",
        daysFromNow: 1,
        hour: 6,
        duration: 75,
        category: "fitness",
      },
      {
        title: "Full Moon Yoga",
        description: "A magical evening practice under the full moon. We'll flow through gentle poses and end with sound healing. Lanterns provided. Bring a blanket!",
        location: "Mount Bonnell",
        emoji: "🌕",
        daysFromNow: 12,
        hour: 19,
        duration: 90,
        category: "fitness",
      },
      {
        title: "Yoga & Brunch",
        description: "60-minute yoga flow followed by a healthy brunch at our partner cafe. Class is all-levels. Brunch includes avocado toast, smoothie bowls, and more!",
        location: "Juiceland South Lamar",
        emoji: "🥑",
        daysFromNow: 8,
        hour: 10,
        duration: 150,
        category: "food",
      },
    ],
  },
  {
    name: "Tech Talks Austin",
    handle: "techtalksatx",
    description: "Monthly meetups for Austin's tech community. We feature talks from local engineers, startup founders, and tech leaders. Network, learn, and grow!",
    category: "education",
    logoUrl: "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=400",
    coverUrl: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800",
    location: "Downtown Austin, TX",
    website: "https://techtalksaustin.com",
    events: [
      {
        title: "AI in Production: Real World Lessons",
        description: "Learn from engineers who've deployed AI at scale. Three speakers from local startups share their experiences, challenges, and solutions. Q&A and networking after.",
        location: "Capital Factory, 701 Brazos St",
        emoji: "🤖",
        daysFromNow: 6,
        hour: 18,
        duration: 150,
        category: "education",
      },
      {
        title: "Startup Pitch Night",
        description: "5 early-stage startups pitch to a panel of investors and the community. Great networking opportunity! Pizza and drinks provided.",
        location: "WeWork Congress",
        emoji: "🚀",
        daysFromNow: 13,
        hour: 18,
        duration: 180,
        category: "education",
      },
      {
        title: "Coffee & Code Morning",
        description: "Casual morning coding session. Bring your laptop and work on personal projects, get help with problems, or just chat tech. Coffee on us!",
        location: "Houndstooth Coffee, Frost Tower",
        emoji: "☕",
        daysFromNow: 4,
        hour: 8,
        duration: 120,
        category: "education",
      },
    ],
  },
  {
    name: "Austin Art Walks",
    handle: "austinartwalks",
    description: "Discover Austin's vibrant art scene! We organize guided tours of galleries, street art, and studios. Meet local artists and learn about the stories behind their work.",
    category: "arts",
    logoUrl: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=400",
    coverUrl: "https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=800",
    location: "Austin, TX",
    instagram: "@austinartwalks",
    events: [
      {
        title: "East Austin Studio Tour Preview",
        description: "Get an exclusive preview of this year's EAST artists! We'll visit 5 studios and meet the artists before the crowds. Small group, intimate experience.",
        location: "Meet at Canopy, 916 Springdale Rd",
        emoji: "🎨",
        daysFromNow: 10,
        hour: 14,
        duration: 180,
        category: "arts",
      },
      {
        title: "Street Art & Murals of South Congress",
        description: "Walking tour of SoCo's best murals and street art. Learn about the artists and the stories behind each piece. Great photo opportunities!",
        location: "Meet at Jo's Coffee, South Congress",
        emoji: "🖼️",
        daysFromNow: 3,
        hour: 10,
        duration: 120,
        category: "arts",
      },
      {
        title: "Gallery Night: First Thursday",
        description: "Join us for First Thursday gallery hop! We'll hit 4 galleries on the East Side. Wine and light bites at each stop. Meet gallery owners and collectors.",
        location: "Meet at grayDUCK Gallery",
        emoji: "🍷",
        daysFromNow: 5,
        hour: 18,
        duration: 180,
        category: "arts",
      },
    ],
  },
];

// Businesses that demo user OWNS (can switch to these profiles)
const DEMO_OWNED_BUSINESSES = ["austinrunclub", "techtalksatx"];

// Additional businesses that demo user will follow (but doesn't own)
const FOLLOW_BUSINESSES = ["eastsidesocial", "austinyogaco", "austinartwalks"];

// Fake business owners for businesses not owned by demo user
const FAKE_OWNERS = [
  { name: "Jamie Martinez", email: "jamie@eastsidesocial.club" },
  { name: "Priya Sharma", email: "priya@austinyoga.co" },
  { name: "David Chen", email: "david@austinartwalks.com" },
];

async function seedDemoBusinesses() {
  console.log("🏢 Starting demo businesses seed...\n");

  // Find demo user
  const demoUser = await db.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  if (!demoUser) {
    console.error("❌ Demo user not found! Run seed-demo-account.ts first.");
    process.exit(1);
  }

  console.log(`✅ Found demo user: ${demoUser.name} (${demoUser.email})\n`);

  // Clean up existing demo businesses
  console.log("🧹 Cleaning up existing demo businesses...");
  for (const bizData of BUSINESSES_DATA) {
    const existing = await db.business.findUnique({
      where: { handle: bizData.handle },
    });
    if (existing) {
      await db.business.delete({ where: { id: existing.id } });
      console.log(`   Deleted existing business: ${bizData.name}`);
    }
  }

  // Clean up fake owners
  for (const owner of FAKE_OWNERS) {
    const existing = await db.user.findUnique({
      where: { email: owner.email },
    });
    if (existing) {
      await db.user.delete({ where: { id: existing.id } });
      console.log(`   Deleted existing fake owner: ${owner.name}`);
    }
  }

  // Create fake owners for non-demo businesses
  console.log("\n👥 Creating fake business owners...");
  const fakeOwnerIds: Record<string, string> = {};

  for (const owner of FAKE_OWNERS) {
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        email: owner.email,
        name: owner.name,
        emailVerified: true,
      },
    });
    fakeOwnerIds[owner.email] = userId;
    console.log(`   Created: ${owner.name}`);
  }

  // Map business handles to their owners
  const businessOwnerMap: Record<string, string> = {
    "austinrunclub": demoUser.id,      // Demo user owns
    "techtalksatx": demoUser.id,       // Demo user owns
    "eastsidesocial": fakeOwnerIds["jamie@eastsidesocial.club"] ?? demoUser.id,
    "austinyogaco": fakeOwnerIds["priya@austinyoga.co"] ?? demoUser.id,
    "austinartwalks": fakeOwnerIds["david@austinartwalks.com"] ?? demoUser.id,
  };

  // Create businesses and events
  console.log("\n📍 Creating businesses and events...\n");

  for (const bizData of BUSINESSES_DATA) {
    const businessId = randomUUID();
    const ownerId = businessOwnerMap[bizData.handle] ?? demoUser.id;
    const isOwnedByDemo = DEMO_OWNED_BUSINESSES.includes(bizData.handle);

    // Create business
    const business = await db.business.create({
      data: {
        id: businessId,
        ownerId: ownerId,
        name: bizData.name,
        handle: bizData.handle,
        description: bizData.description,
        category: bizData.category,
        logoUrl: bizData.logoUrl,
        coverUrl: bizData.coverUrl,
        location: bizData.location,
        website: bizData.website || null,
        instagram: bizData.instagram || null,
        isVerified: isOwnedByDemo ? true : Math.random() > 0.5, // Demo-owned businesses are verified
      },
    });

    const ownerLabel = isOwnedByDemo ? "(DEMO OWNS)" : "";
    console.log(`✅ Created business: ${business.name} (@${business.handle}) ${ownerLabel}`);

    // Create events for this business
    for (const eventData of bizData.events) {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + eventData.daysFromNow);
      startTime.setHours(eventData.hour, 0, 0, 0);

      const endTime = new Date(startTime.getTime() + eventData.duration * 60 * 1000);

      await db.business_event.create({
        data: {
          id: randomUUID(),
          businessId: business.id,
          title: eventData.title,
          description: eventData.description,
          location: eventData.location,
          emoji: eventData.emoji,
          startTime,
          endTime,
          category: eventData.category,
        },
      });

      console.log(`   📅 Created event: ${eventData.emoji} ${eventData.title}`);
    }

    console.log("");
  }

  // Follow some businesses from demo account
  console.log("👥 Following businesses from demo account...");

  for (const handle of FOLLOW_BUSINESSES) {
    const business = await db.business.findUnique({
      where: { handle },
    });

    if (business) {
      await db.business_follow.upsert({
        where: {
          businessId_userId: {
            businessId: business.id,
            userId: demoUser.id,
          },
        },
        update: {},
        create: {
          businessId: business.id,
          userId: demoUser.id,
          notifyEvents: true,
        },
      });
      console.log(`   ✅ Following: ${business.name}`);
    }
  }

  // Add some random attendees and interested users to events
  console.log("\n👥 Adding attendees and interest to events...");

  const allBusinessEvents = await db.business_event.findMany({
    include: { business: true },
  });

  // Create some fake attendees (we'll use the demo user's friends)
  const demoFriends = await db.friendship.findMany({
    where: { userId: demoUser.id },
    select: { friendId: true },
  });

  const friendIds = demoFriends.map(f => f.friendId);

  for (const event of allBusinessEvents) {
    // Add 2-8 random attendees
    const attendeeCount = 2 + Math.floor(Math.random() * 7);
    const shuffledFriends = [...friendIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(attendeeCount, shuffledFriends.length); i++) {
      const userId = shuffledFriends[i];
      if (!userId) continue;
      try {
        await db.business_event_attendee.create({
          data: {
            eventId: event.id,
            userId: userId,
            status: Math.random() > 0.2 ? "attending" : "maybe",
          },
        });
      } catch (e) {
        // Ignore duplicate errors
      }
    }

    // Add 3-10 interested users
    const interestedCount = 3 + Math.floor(Math.random() * 8);
    const shuffledForInterest = [...friendIds].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(interestedCount, shuffledForInterest.length); i++) {
      const userId = shuffledForInterest[i];
      if (!userId) continue;
      try {
        await db.business_event_interest.create({
          data: {
            eventId: event.id,
            userId: userId,
          },
        });
      } catch (e) {
        // Ignore duplicate errors
      }
    }
  }

  console.log(`   Added attendees and interest to ${allBusinessEvents.length} events`);

  // Summary
  console.log("\n✅ DEMO BUSINESSES CREATED SUCCESSFULLY!");
  console.log("\n📊 Summary:");
  console.log(`   • ${BUSINESSES_DATA.length} businesses created`);
  console.log(`   • ${DEMO_OWNED_BUSINESSES.length} businesses OWNED by demo user (can switch profiles)`);
  console.log(`   • ${BUSINESSES_DATA.reduce((acc, b) => acc + b.events.length, 0)} events created`);
  console.log(`   • ${FOLLOW_BUSINESSES.length} businesses followed by demo user`);
  console.log("\n🔄 Demo user can switch between:");
  console.log("   • Personal profile (Alex Demo)");
  for (const handle of DEMO_OWNED_BUSINESSES) {
    const biz = BUSINESSES_DATA.find(b => b.handle === handle);
    if (biz) console.log(`   • ${biz.name} (@${handle})`);
  }
  console.log("\n📱 Open the Discover page to see the businesses!");
}

seedDemoBusinesses()
  .catch((e) => {
    console.error("❌ Error seeding demo businesses:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
