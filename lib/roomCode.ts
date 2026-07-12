// ============================================================
// KanTara — Room code generator
// PRD §9a: 5-character codes from uppercase alphanumeric,
// ambiguous characters removed (no 0/O, no 1/I/L).
// On collision with an active room, regenerate and retry.
// ============================================================

// Characters that are unambiguous when read aloud or displayed on screen
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates a single random 5-character room code.
 * e.g. "KJ48X"
 */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

/**
 * Generates a unique room code that doesn't collide with any active room
 * in the database. Retries up to maxAttempts times before throwing.
 *
 * PRD §9a: "On insert, if the code already exists in an active room,
 * regenerate and retry. With ~30 usable characters and 5 slots,
 * collisions are rare enough that a single retry is enough."
 */
export async function generateUniqueRoomCode(
  checkExists: (code: string) => Promise<boolean>,
  maxAttempts = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateRoomCode();
    const exists = await checkExists(code);
    if (!exists) return code;
  }
  throw new Error('[KanTara] Failed to generate a unique room code after max attempts');
}
