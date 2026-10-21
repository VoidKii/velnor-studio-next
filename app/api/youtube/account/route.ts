import { NextRequest, NextResponse } from "next/server";
import { getYoutubeOAuthConfig, oauthCookieOptions, readYoutubeSession, refreshYoutubeAccessToken, seal, YOUTUBE_SESSION_COOKIE } from "../oauth-lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

function utcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const config = getYoutubeOAuthConfig();
  if (!config) return json({ configured: false, connected: false });
  const session = readYoutubeSession(request);
  if (!session) return json({ configured: true, connected: false });

  try {
    const token = await refreshYoutubeAccessToken(session.refreshToken, config);
    if (!token.accessToken) {
      if (token.invalidGrant) {
        const response = json({ configured: true, connected: false, error: "reconnect_required" }, 401);
        response.cookies.delete(YOUTUBE_SESSION_COOKIE);
        return response;
      }
      return json({ configured: true, connected: true, channel: { id: session.channelId, title: session.channelTitle, thumbnail: session.channelThumbnail, subscriberCount: null }, error: "analytics_unavailable" }, 502);
    }

    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 27);
    const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelUrl.search = new URLSearchParams({ part: "statistics", mine: "true" }).toString();
    const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
    analyticsUrl.search = new URLSearchParams({
      ids: "channel==MINE",
      startDate: utcDate(start),
      endDate: utcDate(end),
      metrics: "views,subscribersGained",
    }).toString();
    const headers = { Authorization: `Bearer ${token.accessToken}` };
    const [channelResponse, analyticsResponse] = await Promise.all([
      fetch(channelUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }),
      fetch(analyticsUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!channelResponse.ok) {
      return json({ configured: true, connected: true, channel: { id: session.channelId, title: session.channelTitle, thumbnail: session.channelThumbnail, subscriberCount: null }, error: "analytics_unavailable" }, 502);
    }
    const channelData = await channelResponse.json() as { items?: Array<{ statistics?: { subscriberCount?: unknown; hiddenSubscriberCount?: unknown } }> };
    const statistics = channelData.items?.[0]?.statistics;
    const subscribers = typeof statistics?.subscriberCount === "string" && statistics.hiddenSubscriberCount !== true ? statistics.subscriberCount : null;
    const channel = { id: session.channelId, title: session.channelTitle, thumbnail: session.channelThumbnail, subscriberCount: subscribers };
    if (!analyticsResponse.ok) {
      const error = !analyticsResponse.ok && (analyticsResponse.status === 403 || analyticsResponse.status === 404) ? "analytics_api_unavailable" : "analytics_unavailable";
      return json({ configured: true, connected: true, channel, error });
    }
    const analyticsData = await analyticsResponse.json() as { rows?: unknown[][] };
    const row = analyticsData.rows?.[0];
    const views = typeof row?.[0] === "number" && Number.isFinite(row[0]) ? row[0] : null;
    const subscribersGained = typeof row?.[1] === "number" && Number.isFinite(row[1]) ? row[1] : null;

    const response = json({
      configured: true,
      connected: true,
      channel,
      analytics: row ? { views28Days: views, subscribersGained28Days: subscribersGained, startDate: utcDate(start), endDate: utcDate(end) } : null,
    });
    // Refresh the sealed browser session lifetime only after the provider accepts it.
    response.cookies.set(YOUTUBE_SESSION_COOKIE, seal(session, config.encryptionKey), oauthCookieOptions(60 * 60 * 24 * 180));
    return response;
  } catch {
    return json({ configured: true, connected: true, channel: { id: session.channelId, title: session.channelTitle, thumbnail: session.channelThumbnail, subscriberCount: null }, error: "analytics_unavailable" }, 502);
  }
}

export async function DELETE(request: NextRequest) {
  const config = getYoutubeOAuthConfig();
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return json({ error: "invalid_origin" }, 403);
  const session = readYoutubeSession(request);
  if (config && session) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: session.refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      // The local sealed session is still cleared if Google's revocation endpoint is unavailable.
    }
  }
  const response = json({ disconnected: true });
  response.cookies.delete(YOUTUBE_SESSION_COOKIE);
  return response;
}

