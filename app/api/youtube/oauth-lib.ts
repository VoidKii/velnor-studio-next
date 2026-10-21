import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const YOUTUBE_SESSION_COOKIE = "velnor.youtube.session";
export const YOUTUBE_STATE_COOKIE = "velnor.youtube.oauth-state";
export const YOUTUBE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export type YoutubeSession = {
  refreshToken: string;
  channelId: string;
  channelTitle: string;
  channelThumbnail: string | null;
  connectedAt: number;
};

export function getYoutubeOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  const encryptionSecret = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !redirectUri || !encryptionSecret) return null;
  try {
    const parsedRedirect = new URL(redirectUri);
    if (parsedRedirect.protocol !== "https:" && parsedRedirect.hostname !== "localhost") return null;
  } catch {
    return null;
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(encryptionSecret)) return null;
  const encryptionKey = Buffer.from(encryptionSecret, "base64url");
  if (encryptionKey.length !== 32) return null;
  return { clientId, clientSecret, redirectUri, encryptionKey };
}

export function oauthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function seal(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function unseal<T>(value: string | undefined, key: Buffer): T | null {
  if (!value || value.length > 3500) return null;
  try {
    const [ivPart, tagPart, bodyPart] = value.split(".");
    if (!ivPart || !tagPart || !bodyPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const body = Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()]);
    return JSON.parse(body.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function equalState(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function readYoutubeSession(request: NextRequest): YoutubeSession | null {
  const config = getYoutubeOAuthConfig();
  if (!config) return null;
  const session = unseal<YoutubeSession>(request.cookies.get(YOUTUBE_SESSION_COOKIE)?.value, config.encryptionKey);
  if (!session || typeof session.refreshToken !== "string" || typeof session.channelId !== "string" || typeof session.channelTitle !== "string") return null;
  return session;
}

export async function refreshYoutubeAccessToken(refreshToken: string, config: NonNullable<ReturnType<typeof getYoutubeOAuthConfig>>) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json() as { access_token?: unknown; error?: unknown };
  if (!response.ok || typeof data.access_token !== "string") {
    const invalidGrant = data.error === "invalid_grant";
    return { accessToken: null, invalidGrant };
  }
  return { accessToken: data.access_token, invalidGrant: false };
}

