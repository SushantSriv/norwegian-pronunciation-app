/**
 * Who you are on the leaderboard, which is as little as possible.
 *
 * A nickname you picked, a random id, and a random secret that proves the id
 * is yours. No email, no account, no sign-in, nothing derived from the device.
 * The app suggests a name so that the shortest path through the prompt is also
 * the anonymous one — a learner who cannot think of anything gets NorskNinja,
 * not their own name.
 *
 * The secret is the whole of the authentication story. It is generated here,
 * lives in this browser's localStorage, and is sent as a bearer token so the
 * server can tell one anonymous learner from another. Clearing site data
 * discards it, and with it any way to post to that identity again — which is
 * the honest trade for having no account to recover.
 */
import { sanitizeNickname, type Check } from './leaderboardRules';

const STORAGE_KEY = 'npa-identity-v1';

export interface Identity {
    /** Public, and the only thing other learners see alongside the nickname. */
    id: string;
    /** Private. Proves this browser owns the id. Never displayed. */
    secret: string;
    nickname: string;
    createdAt: number;
}

// ---------------------------------------------------------------------------
// Suggested names
// ---------------------------------------------------------------------------

const FIRST = [
    'Norsk', 'Fjord', 'Fjell', 'Nordic', 'Språk', 'Nord', 'Vinter', 'Sol',
    'Elve', 'Skog', 'Bre', 'Vind',
];

const SECOND = [
    'Ninja', 'Fox', 'Stjerne', 'Voice', 'Tale', 'Lærer', 'Pro', 'Rev',
    'Ravn', 'Stemme', 'Venn', 'Spurv',
];

const pick = <T,>(items: readonly T[], random: () => number): T =>
    items[Math.floor(random() * items.length) % items.length];

/**
 * A name to offer the learner.
 *
 * @param random Injectable, so tests get the same name twice.
 */
export function suggestNickname(random: () => number = Math.random): string {
    return `${pick(FIRST, random)}${pick(SECOND, random)}`;
}

/**
 * The same, with a number on the end.
 *
 * Used when the server says the suggestion is taken — two learners reaching
 * for FjordFox on the same evening is likely enough to plan for.
 */
export function suggestVariant(nickname: string, random: () => number = Math.random): string {
    const base = nickname.replace(/\d+$/, '').slice(0, 16);
    return `${base}${Math.floor(random() * 90) + 10}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Why a name was refused, in words a learner can act on. */
const REASONS: Record<string, string> = {
    'not-a-string': 'Velg et navn først.',
    'too-short': 'Litt lengre — minst 3 tegn.',
    'too-long': 'Litt kortere — høyst 20 tegn.',
    'bad-characters': 'Bare bokstaver, tall, mellomrom, - og _.',
    reserved: 'Det navnet er reservert. Velg et annet.',
};

export interface NicknameCheck {
    ok: boolean;
    /** The cleaned-up name, when it passed. */
    value: string;
    /** What to tell the learner, when it did not. */
    message: string;
}

/**
 * Check a nickname exactly the way the server will.
 *
 * Same function, imported from the shared rules, so the app can never accept a
 * name that is then rejected on sync.
 */
export function checkNickname(raw: string): NicknameCheck {
    const result: Check<string> = sanitizeNickname(raw);
    return result.ok
        ? { ok: true, value: result.value, message: '' }
        : { ok: false, value: '', message: REASONS[result.reason] ?? 'Det navnet går ikke.' };
}

// ---------------------------------------------------------------------------
// Creating and keeping one
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
    const buffer = new Uint8Array(bytes);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buffer);
    else for (let i = 0; i < buffer.length; i++) buffer[i] = Math.floor(Math.random() * 256);
    return [...buffer].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createIdentity(nickname: string, now = Date.now()): Identity {
    return {
        id: randomHex(16),
        secret: randomHex(32),
        nickname,
        createdAt: now,
    };
}

export function loadIdentity(): Identity | null {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Identity>;
        if (!parsed?.id || !parsed.secret || !parsed.nickname) return null;
        return {
            id: parsed.id,
            secret: parsed.secret,
            nickname: parsed.nickname,
            createdAt: parsed.createdAt ?? Date.now(),
        };
    } catch {
        return null;
    }
}

export function saveIdentity(identity: Identity): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
        // Storage unavailable. Points still accrue for this session; they just
        // cannot be claimed under a name that survives a reload.
    }
}

export function forgetIdentity(): void {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do; there was nowhere to forget it from.
    }
}
