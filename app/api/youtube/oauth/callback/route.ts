import { NextRequest, NextResponse } from "next/server";
import {
  equalState,
  getYoutubeOAuthConfig,
  oauthCookieOptions,
  readYoutubeSession,
  seal,
  unseal,
  YOUTUBE_SESSION_COOKIE,
  YOUTUBE_STATE_COOKIE,
  type YoutubeSession,
} from "../../oauth-lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function returnToSettings(request: NextRequest, result: string, redirectUri?: string) {
  const destination = redirectUri ? new URL("/", redirectUri) : new URL("/", request.url);
  destination.searchParams.set("youtube", result);
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function clearState(response: NextResponse) {
  response.cookies.delete(YOUTUBE_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const config = getYoutubeOAuthConfig();
  const stateCookie = request.cookies.get(YOUTUBE_STATE_COOKIE)?.value;
  const state = config ? unseal<{ state?: unknown; verifier?: unknown }>(stateCookie, config.encryptionKey) : null;
  const receivedState = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code");

  if (!config || !state || typeof state.state !== "string" || typeof state.verifier !== "string" || !equalState(receivedState, state.state)) {
    return clearState(returnToSettings(request, "invalid_state", config?.redirectUri));
  }
  if (request.nextUrl.searchParams.has("error")) {
    return clearState(returnToSettings(request, "cancelled", config.redirectUri));
  }
  if (!code) {
    return clearState(returnToSettings(request, "failed", config.redirectUri));
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: state.verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const tokens = await tokenResponse.json() as { access_token?: unknown; refresh_token?: unknown };
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") return clearState(returnToSettings(request, "failed", config.redirectUri));

    const priorSession = readYoutubeSession(request);
    const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token : priorSession?.refreshToken;
    if (!refreshToken) return clearState(returnToSettings(request, "failed", config.redirectUri));

    const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelsUrl.search = new URLSearchParams({ part: "snippet,statistics", mine: "true" }).toString();
    const channelResponse = await fetch(channelsUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const channelData = await channelResponse.json() as {
      items?: Array<{ id?: unknown; snippet?: { title?: unknown; thumbnails?: { default?: { url?: unknown } } } }>;
    };
    const channel = channelData.items?.[0];
    if (!channelResponse.ok || typeof channel?.id !== "string" || typeof channel.snippet?.title !== "string") return clearState(returnToSettings(request, "channel_unavailable", config.redirectUri));

    const session: YoutubeSession = {
      refreshToken,
      channelId: channel.id,
      channelTitle: channel.snippet.title.slice(0, 200),
      channelThumbnail: typeof channel.snippet.thumbnails?.default?.url === "string" ? channel.snippet.thumbnails.default.url.slice(0, 1000) : null,
      connectedAt: Date.now(),
    };
    const response = returnToSettings(request, "connected", config.redirectUri);
    response.cookies.set(YOUTUBE_SESSION_COOKIE, seal(session, config.encryptionKey), oauthCookieOptions(60 * 60 * 24 * 180));
    return clearState(response);
  } catch {
    return clearState(returnToSettings(request, "failed", config.redirectUri));
  }
}

