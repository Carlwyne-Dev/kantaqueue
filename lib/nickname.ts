// ============================================================
// KanTara — Guest nickname pool
// PRD §5.2 / §9a: Auto-assigned random fun nickname (e.g. "Sunny Mango").
// Check for uniqueness within the room before assigning — no two guests
// in the same room should share a name.
// ============================================================

const ADJECTIVES = [
  'Sunny', 'Loud', 'Happy', 'Chill', 'Wild', 'Spicy', 'Sweet', 'Brave',
  'Funky', 'Cool', 'Fierce', 'Shy', 'Jolly', 'Sassy', 'Lazy', 'Hyper',
  'Gloomy', 'Cheery', 'Sleepy', 'Bouncy', 'Wacky', 'Snappy', 'Zippy',
  'Peppy', 'Grumpy', 'Fancy', 'Quirky', 'Dapper', 'Bubbly', 'Feisty',
];

const NOUNS = [
  'Mango', 'Tito', 'Bebang', 'Papaya', 'Adobo', 'Lechon', 'Balut',
  'Sinigang', 'Sisig', 'Bangus', 'Kamote', 'Tsong', 'Pare', 'Bossing',
  'Lodi', 'Idol', 'Legend', 'Rockstar', 'Star', 'Superstar', 'Diva',
  'Maestro', 'Bituin', 'Hari', 'Reyna', 'Bida', 'Kontrabida', 'Villian',
  'Hero', 'Genius', 'Wizard', 'Ninja', 'Samurai', 'Viking', 'Pirate',
];

/**
 * Picks a random element from an array.
 */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a single random nickname.
 * e.g. "Sunny Mango", "Loud Tito", "Karaoke Bebang"
 */
export function generateNickname(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

/**
 * Generates a unique nickname that isn't already taken in this room.
 * If the first pick collides, appends " 2" and retries once, then " 3", etc.
 *
 * PRD §9a: "Before inserting, check if that name is already taken in this
 * room_id; if so, re-roll or append ' 2' and retry."
 */
export function generateUniqueNickname(takenNames: Set<string>): string {
  // Try up to 10 fresh random combos first
  for (let i = 0; i < 10; i++) {
    const name = generateNickname();
    if (!takenNames.has(name)) return name;
  }

  // Fallback: append incrementing suffix until unique
  let base = generateNickname();
  let suffix = 2;
  while (takenNames.has(suffix === 2 ? base : `${base} ${suffix}`)) {
    suffix++;
  }
  return suffix === 2 ? base : `${base} ${suffix}`;
}
