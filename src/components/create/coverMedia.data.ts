import type { CoverMediaItem, CoverCategory } from "./coverMedia.types";

// ─── Category chips ───

export const COVER_CATEGORIES: CoverCategory[] = [
  { id: "all", label: "All" },
  { id: "trending", label: "Trending" },
  { id: "birthday", label: "Birthday" },
  { id: "elegant", label: "Elegant" },
  { id: "minimal", label: "Minimal" },
  { id: "dinner", label: "Dinner" },
  { id: "party", label: "Party" },
  { id: "outdoors", label: "Outdoors" },
  { id: "sports", label: "Sports" },
  { id: "beach", label: "Beach" },
  { id: "music", label: "Music" },
  { id: "worship", label: "Worship" },
  { id: "brunch", label: "Brunch" },
  { id: "gamenight", label: "Game Night" },
  { id: "holiday", label: "Holiday" },
  { id: "kickback", label: "Kickback" },
  { id: "movienight", label: "Movie Night" },
  { id: "fitness", label: "Fitness" },
  { id: "study", label: "Study" },
  { id: "roadtrip", label: "Road Trip" },
  { id: "graduation", label: "Graduation" },
];

// ─── Helpers ───

const u = (id: string) => `https://images.unsplash.com/${id}`;
const full = (id: string) => `${u(id)}?w=1280&q=80`;
const thumb = (id: string) => `${u(id)}?w=400&q=60`;

function img(
  id: string,
  photoId: string,
  category: string,
  tags: string[],
): CoverMediaItem {
  return {
    id,
    type: "image",
    url: full(photoId),
    thumbnailUrl: thumb(photoId),
    source: "featured",
    category,
    tags,
  };
}

// ─── Featured covers (100 Unsplash images) ───

export const FEATURED_COVERS: CoverMediaItem[] = [
  // ── Trending (5) ──
  img("f-1", "photo-1533174072545-7a4b6ad7a6c3", "trending", ["party", "concert", "lights", "crowd"]),
  img("f-2", "photo-1514525253161-7a46d19cd819", "trending", ["concert", "crowd", "neon", "festival"]),
  img("f-3", "photo-1470229722913-7c0e2dbbafd3", "trending", ["festival", "stage", "crowd", "music"]),
  img("f-4", "photo-1459749411175-04bf5292ceea", "trending", ["concert", "lights", "music", "live"]),
  img("f-5", "photo-1429962714451-bb934ecdc4ec", "trending", ["dance", "crowd", "nightclub", "social"]),

  // ── Birthday (5) ──
  img("f-6", "photo-1530103862676-de8c9debad1d", "birthday", ["birthday", "balloons", "colorful", "celebration"]),
  img("f-7", "photo-1578985545062-69928b1d9587", "birthday", ["birthday", "cake", "candles", "dessert"]),
  img("f-8", "photo-1558636508-e0db3814bd1d", "birthday", ["birthday", "cupcakes", "sprinkles", "baking"]),
  img("f-9", "photo-1513151233558-d860c5398176", "birthday", ["birthday", "confetti", "streamers", "colorful"]),
  img("f-10", "photo-1527529482837-4698179dc6ce", "birthday", ["birthday", "sparkler", "celebration", "candle"]),

  // ── Elegant / Formal (5) ──
  img("f-11", "photo-1519167758481-83f550bb49b3", "elegant", ["elegant", "venue", "lights", "wedding"]),
  img("f-12", "photo-1478146059778-26028b07395a", "elegant", ["elegant", "table", "candles", "dinner"]),
  img("f-13", "photo-1510076857177-7470076d4098", "elegant", ["elegant", "chandelier", "ballroom", "luxury"]),
  img("f-14", "photo-1464366400600-7168b8af9bc3", "elegant", ["elegant", "flowers", "table", "reception"]),
  img("f-15", "photo-1507504031003-b417219a0fde", "elegant", ["elegant", "gala", "formal", "evening"]),

  // ── Minimal / Clean (5) ──
  img("f-16", "photo-1557682250-33bd709cbe85", "minimal", ["minimal", "gradient", "abstract", "purple"]),
  img("f-17", "photo-1558591710-4b4a1ae0f04d", "minimal", ["minimal", "abstract", "waves", "pink"]),
  img("f-18", "photo-1579546929518-9e396f3cc809", "minimal", ["minimal", "gradient", "mesh", "colorful"]),
  img("f-19", "photo-1553356084-58ef4a67b2a7", "minimal", ["minimal", "paint", "abstract", "blue"]),
  img("f-20", "photo-1618005182384-a83a8bd57fbe", "minimal", ["minimal", "gradient", "swirl", "warm"]),

  // ── Dinner / Food (5) ──
  img("f-21", "photo-1414235077428-338989a2e8c0", "dinner", ["dinner", "food", "restaurant", "plated"]),
  img("f-22", "photo-1517248135467-4c7edcad34c4", "dinner", ["dinner", "restaurant", "interior", "ambient"]),
  img("f-23", "photo-1555396273-367ea4eb4db5", "dinner", ["dinner", "bar", "restaurant", "cozy"]),
  img("f-24", "photo-1544025162-d76694265947", "dinner", ["dinner", "steak", "food", "grill"]),
  img("f-25", "photo-1559339352-11d035aa65de", "dinner", ["dinner", "pasta", "italian", "food"]),

  // ── Party / Nightlife (5) ──
  img("f-26", "photo-1496024840928-4c417adf211d", "party", ["party", "friends", "fun", "social"]),
  img("f-27", "photo-1492684223066-81342ee5ff30", "party", ["party", "confetti", "celebration", "night"]),
  img("f-28", "photo-1528495612343-9ca9f4a4de28", "party", ["party", "drinks", "cocktail", "bar"]),
  img("f-29", "photo-1516450360452-9312f5e86fc7", "party", ["party", "disco", "ball", "nightlife"]),
  img("f-30", "photo-1504196606672-aef5c9cefc92", "party", ["party", "dj", "turntable", "nightclub"]),

  // ── Outdoors / Adventure (5) ──
  img("f-31", "photo-1504280390367-361c6d9f38f4", "outdoors", ["outdoors", "camping", "tent", "nature"]),
  img("f-32", "photo-1523301343968-6a6ebf63c672", "outdoors", ["outdoors", "picnic", "park", "friends"]),
  img("f-33", "photo-1551632811-561732d1e306", "outdoors", ["outdoors", "hiking", "mountain", "adventure"]),
  img("f-34", "photo-1476611338391-6f395a0ebc7b", "outdoors", ["outdoors", "bonfire", "fire", "camping"]),
  img("f-35", "photo-1445307806294-bff7f67ff225", "outdoors", ["outdoors", "festival", "field", "summer"]),

  // ── Sports / Game Day (16) ──
  img("f-36", "photo-1540747913346-19e32dc3e97e", "sports", ["sports", "football", "stadium", "crowd", "gameday"]),
  img("f-37", "photo-1574629810360-7efbbe195018", "sports", ["sports", "basketball", "court", "game", "hoop"]),
  img("f-38", "photo-1508098682722-e99c43a406b2", "sports", ["sports", "soccer", "field", "ball", "pitch"]),
  img("f-39", "photo-1471295253337-3ceaaedca402", "sports", ["sports", "tailgate", "fans", "gameday", "party"]),
  img("f-40", "photo-1530549387789-4c1017266635", "sports", ["sports", "baseball", "stadium", "game", "diamond"]),
  img("f-101", "photo-1566577739112-5180d4bf9390", "sports", ["sports", "football", "field", "action", "tackle"]),
  img("f-102", "photo-1546519638-68e109498ffc", "sports", ["sports", "basketball", "dunk", "action", "arena"]),
  img("f-103", "photo-1529768167801-9173d94c2a42", "sports", ["sports", "baseball", "bat", "swing", "batter"]),
  img("f-104", "photo-1551958219-acbc608c6377", "sports", ["sports", "soccer", "match", "action", "goal"]),
  img("f-105", "photo-1554068865-24cecd4e34b8", "sports", ["sports", "tennis", "court", "racket", "serve"]),
  img("f-106", "photo-1622279457486-62dcc4a431d6", "sports", ["sports", "tennis", "match", "player", "swing"]),
  img("f-107", "photo-1535131749006-b7f58c99034b", "sports", ["sports", "golf", "course", "green", "swing"]),
  img("f-108", "photo-1612872087720-bb876e2e67d1", "sports", ["sports", "volleyball", "beach", "net", "sand"]),
  img("f-109", "photo-1519315901367-f34ff9154487", "sports", ["sports", "swimming", "pool", "lane", "race"]),
  img("f-110", "photo-1455729552865-3658a5d39692", "sports", ["sports", "surfing", "wave", "ocean", "board"]),
  img("f-111", "photo-1526888935184-a82d2a4b7e67", "sports", ["sports", "pickleball", "paddle", "court", "outdoor"]),

  // ── Beach / Pool (5) ──
  img("f-41", "photo-1507525428034-b723cf961d3e", "beach", ["beach", "ocean", "sand", "tropical"]),
  img("f-42", "photo-1519046904884-53103b34b206", "beach", ["beach", "waves", "sunset", "surf"]),
  img("f-43", "photo-1544551763-46a013bb70d5", "beach", ["beach", "pool", "summer", "resort"]),
  img("f-44", "photo-1473116763249-2faaef81ccda", "beach", ["beach", "palm", "tropical", "paradise"]),
  img("f-45", "photo-1530053969600-caed2596d242", "beach", ["beach", "pool", "party", "float"]),

  // ── Music / Concert (5) ──
  img("f-46", "photo-1501386761578-0a55f5a7a413", "music", ["music", "guitar", "acoustic", "live"]),
  img("f-47", "photo-1493225457124-a3eb161ffa5f", "music", ["music", "concert", "band", "stage"]),
  img("f-48", "photo-1524368535928-5b5e00ddc76d", "music", ["music", "festival", "crowd", "outdoor"]),
  img("f-49", "photo-1511671782779-c97d3d27a1d4", "music", ["music", "vinyl", "record", "retro"]),
  img("f-50", "photo-1415201364774-f6f0bb35f28f", "music", ["music", "headphones", "listening", "audio"]),

  // ── Worship / Faith (10) ──
  img("f-51", "photo-1438232992991-995b7058bbb3", "worship", ["worship", "church", "candles", "prayer"]),
  img("f-52", "photo-1477672680933-0287a151330e", "worship", ["worship", "cross", "sunset", "faith"]),
  img("f-53", "photo-1504052434569-70ad5836ab65", "worship", ["worship", "bible", "study", "devotion"]),
  img("f-54", "photo-1507692049790-de58290a4334", "worship", ["worship", "hands", "praise", "community"]),
  img("f-55", "photo-1445445290350-18a3b86e0b5a", "worship", ["worship", "stained", "glass", "church"]),
  img("f-112", "photo-1510925758641-869d353cecc7", "worship", ["worship", "hands", "raised", "christian", "praise"]),
  img("f-113", "photo-1473177104440-ffee2f376098", "worship", ["worship", "church", "service", "congregation", "christian"]),
  img("f-114", "photo-1476234251651-f353703a034d", "worship", ["worship", "prayer", "circle", "group", "faith"]),
  img("f-115", "photo-1559027615-cd4628902d4a", "worship", ["worship", "missionary", "outreach", "service", "community"]),
  img("f-116", "photo-1470019693664-1d202d2c0907", "worship", ["worship", "praise", "night", "christian", "church"]),

  // ── Brunch / Coffee (5) ──
  img("f-56", "photo-1504754524776-8f4f37790ca0", "brunch", ["brunch", "breakfast", "table", "food"]),
  img("f-57", "photo-1495474472287-4d71bcdd2085", "brunch", ["brunch", "coffee", "latte", "cafe"]),
  img("f-58", "photo-1484723091739-30a097e8f929", "brunch", ["brunch", "pancakes", "breakfast", "syrup"]),
  img("f-59", "photo-1525351484163-7529414344d8", "brunch", ["brunch", "toast", "avocado", "healthy"]),
  img("f-60", "photo-1445116572660-236099ec97a0", "brunch", ["brunch", "cafe", "friends", "coffee"]),

  // ── Game Night (5) ──
  img("f-61", "photo-1610890716171-6b1bb98ffd09", "gamenight", ["gamenight", "board", "game", "cards"]),
  img("f-62", "photo-1541744573515-478c959628a0", "gamenight", ["gamenight", "poker", "chips", "cards"]),
  img("f-63", "photo-1612287230202-1ff1d85d1bdf", "gamenight", ["gamenight", "console", "gaming", "controller"]),
  img("f-64", "photo-1585504198199-20277593b94f", "gamenight", ["gamenight", "dice", "tabletop", "board"]),
  img("f-65", "photo-1511882150382-421056c89033", "gamenight", ["gamenight", "chess", "strategy", "classic"]),

  // ── Holiday / Seasonal (5) ──
  img("f-66", "photo-1482517967863-00e15c9b44be", "holiday", ["holiday", "christmas", "lights", "festive"]),
  img("f-67", "photo-1467810563316-b5476525c0f9", "holiday", ["holiday", "fireworks", "newyear", "celebration"]),
  img("f-68", "photo-1457364559154-aa2644600ebb", "holiday", ["holiday", "thanksgiving", "autumn", "leaves"]),
  img("f-69", "photo-1518199266791-5375a83190b7", "holiday", ["holiday", "halloween", "pumpkin", "spooky"]),
  img("f-70", "photo-1545622783-b3e021430fee", "holiday", ["holiday", "easter", "eggs", "spring"]),

  // ── Kickback (5) ──
  img("f-71", "photo-1522071820081-009f0129c71c", "kickback", ["kickback", "hangout", "couch", "friends", "casual"]),
  img("f-72", "photo-1529156069898-49953e39b3ac", "kickback", ["kickback", "backyard", "friends", "laughing", "social"]),
  img("f-73", "photo-1517457373958-b7bdd4587205", "kickback", ["kickback", "living room", "chill", "relaxed", "cozy"]),
  img("f-74", "photo-1543269865-cbf427effbad", "kickback", ["kickback", "sofa", "group", "casual", "hangout"]),
  img("f-75", "photo-1523580494863-6f3031224c94", "kickback", ["kickback", "friends", "lounge", "relaxed", "vibes"]),

  // ── Movie Night (5) ──
  img("f-76", "photo-1585647347483-22b66260dfff", "movienight", ["movie", "popcorn", "snacks", "night", "cinema"]),
  img("f-77", "photo-1489599849927-2ee91cede3ba", "movienight", ["movie", "theater", "seats", "screen", "cinema"]),
  img("f-78", "photo-1536440136628-849c177e76a1", "movienight", ["movie", "projector", "screen", "dark", "screening"]),
  img("f-79", "photo-1505686994434-e3cc5abf1330", "movienight", ["movie", "film", "reel", "vintage", "classic"]),
  img("f-80", "photo-1542204165-65bf26472b9b", "movienight", ["movie", "couch", "home", "streaming", "cozy"]),

  // ── Fitness (5) ──
  img("f-81", "photo-1534438327276-14e5300c3a48", "fitness", ["fitness", "gym", "weights", "workout", "training"]),
  img("f-82", "photo-1571019613454-1cb2f99b2d8b", "fitness", ["fitness", "running", "cardio", "exercise", "outdoor"]),
  img("f-83", "photo-1518611012118-696072aa579a", "fitness", ["fitness", "yoga", "stretch", "wellness", "class"]),
  img("f-84", "photo-1544367567-0f2fcb009e0b", "fitness", ["fitness", "yoga", "mat", "pose", "meditation"]),
  img("f-85", "photo-1517836357463-d25dfeac3438", "fitness", ["fitness", "gym", "dumbbells", "strength", "group"]),

  // ── Study (9) ──
  img("f-86", "photo-1521587760476-6c12a4b040da", "study", ["study", "library", "books", "shelves", "reading"]),
  img("f-87", "photo-1497633762265-9d179a990aa6", "study", ["study", "desk", "laptop", "workspace", "focus"]),
  img("f-88", "photo-1522202176988-66273c2fd55f", "study", ["study", "group", "coworking", "laptops", "team"]),
  img("f-89", "photo-1434030216411-0b793f4b4173", "study", ["study", "notebook", "notes", "writing", "pen"]),
  img("f-90", "photo-1488190211105-8b0e65b80b4e", "study", ["study", "coffee", "laptop", "cafe", "work"]),
  img("f-117", "photo-1506784365847-bbad939e9335", "study", ["study", "bible study", "christian", "group", "faith"]),
  img("f-118", "photo-1455849318743-b2233052fcff", "study", ["study", "bible", "devotional", "open", "christian"]),
  img("f-119", "photo-1491438590914-bc09fcaaf77a", "study", ["study", "small group", "discussion", "christian", "community"]),
  img("f-120", "photo-1544396821-4dd40b938ad3", "study", ["study", "journal", "devotional", "christian", "prayer"]),

  // ── Road Trip (5) ──
  img("f-91", "photo-1469854523086-cc02fe5d8800", "roadtrip", ["roadtrip", "highway", "scenic", "drive", "adventure"]),
  img("f-92", "photo-1449965408869-eaa3f722e40d", "roadtrip", ["roadtrip", "car", "vintage", "travel", "retro"]),
  img("f-93", "photo-1533587851505-d119e13fa0d7", "roadtrip", ["roadtrip", "van", "mountains", "camping", "freedom"]),
  img("f-94", "photo-1506012787146-f92b2d7d6d96", "roadtrip", ["roadtrip", "desert", "road", "scenic", "open"]),
  img("f-95", "photo-1494783367193-149034c05e8f", "roadtrip", ["roadtrip", "coast", "drive", "ocean", "cliffs"]),

  // ── Graduation (5) ──
  img("f-96", "photo-1523580846011-d3a5bc25702b", "graduation", ["graduation", "caps", "toss", "celebration", "ceremony"]),
  img("f-97", "photo-1627556704302-624286467c65", "graduation", ["graduation", "gown", "diploma", "proud", "achievement"]),
  img("f-98", "photo-1559024094-4a1e4495c3c1", "graduation", ["graduation", "cap", "tassel", "degree", "commencement"]),
  img("f-99", "photo-1564585222527-c2777a5bc6cb", "graduation", ["graduation", "confetti", "celebrate", "friends", "party"]),
  img("f-100", "photo-1541339907198-e08756dedf3f", "graduation", ["graduation", "class", "group", "robes", "university"]),
];
