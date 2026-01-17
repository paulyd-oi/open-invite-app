/**
 * Add group visibility to January 2026 events for color on calendar
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEMO_EMAIL = "demo@openinvite.app";

async function main() {
  console.log("🎨 Adding group visibility to events...\n");

  // Get demo user
  const demoUser = await db.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  if (!demoUser) {
    console.error("❌ Demo user not found!");
    process.exit(1);
  }

  // Get demo user's friend groups
  const groups = await db.friend_group.findMany({
    where: { userId: demoUser.id },
  });

  console.log("Found groups:");
  groups.forEach(g => console.log(`  - ${g.name} (${g.color})`));
  console.log("");

  // Get January 2026 events hosted by demo user
  const startOfJan = new Date(2026, 0, 1);
  const endOfJan = new Date(2026, 1, 1);
  
  const events = await db.event.findMany({
    where: {
      userId: demoUser.id,
      startTime: {
        gte: startOfJan,
        lt: endOfJan,
      },
    },
    orderBy: { startTime: "asc" },
  });

  console.log(`Found ${events.length} January events\n`);

  // Map event categories to groups
  const categoryToGroup: Record<string, string> = {
    "fitness": "Fitness Buddies",
    "sports": "Fitness Buddies", 
    "food": "Foodies",
    "social": "Close Friends",
    "entertainment": "Close Friends",
    "outdoors": "Fitness Buddies",
  };

  // Update events with group visibility
  for (const event of events) {
    const groupName = categoryToGroup[event.category || "social"];
    const group = groups.find(g => g.name === groupName);
    
    if (group && Math.random() > 0.3) { // 70% chance to assign to group
      // Update event visibility
      await db.event.update({
        where: { id: event.id },
        data: { visibility: "specific_groups" },
      });

      // Create group visibility entry
      await db.event_group_visibility.create({
        data: {
          eventId: event.id,
          groupId: group.id,
        },
      });

      console.log(`✅ ${event.emoji} ${event.title} → ${group.name} (${group.color})`);
    } else {
      console.log(`⚪ ${event.emoji} ${event.title} → All friends`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Group visibility added! Calendar should now have colors.");
  console.log("=".repeat(50));

  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  db.$disconnect();
  process.exit(1);
});
