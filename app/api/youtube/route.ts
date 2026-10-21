import { NextRequest, NextResponse } from "next/server";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const CACHE_HEADERS = { "Cache-Control": "private, max-age=60" };
const UPSTREAM_TIMEOUT_MS = 12_000;

type ApiRecord = Record<string, unknown>;

function record(value: unknown): ApiRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ApiRecord : {};
}

function optionalText(value: unknown, max = 2_000): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

function thumbnail(value: unknown): string | undefined {
  const thumbnails = record(value);
  const medium = record(thumbnails.medium);
  const high = record(thumbnails.high);
  const candidate = optionalText(medium.url, 500) ?? optionalText(high.url, 500);
  return candidate?.startsWith("https://") ? candidate : undefined;
}

function apiError(response: Response): NextResponse {
  if (response.status === 403 || response.status === 429) {
    return NextResponse.json({ error: "YouTube declined the request. Check that the key is valid, the Data API is enabled, and quota remains.", code: "upstream_access_or_quota" }, { status: response.status === 429 ? 429 : 502 });
  }
  return NextResponse.json({ error: "YouTube search is temporarily unavailable. Try again shortly." }, { status: 502 });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const requestedType = request.nextUrl.searchParams.get("type") ?? "video";
  if (requestedType !== "video" && requestedType !== "channel") {
    return NextResponse.json({ error: "Choose video or channel search." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: "Enter a search between 2 and 100 characters." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "YouTube search is not connected yet. Add YOUTUBE_API_KEY to your server environment.", code: "missing_configuration" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const searchUrl = new URL(`${YOUTUBE_API}/search`);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", requestedType);
    searchUrl.searchParams.set("maxResults", requestedType === "channel" ? "6" : "8");
    searchUrl.searchParams.set("safeSearch", "moderate");
    searchUrl.searchParams.set("key", apiKey);
    const searchResponse = await fetch(searchUrl, { next: { revalidate: 300 }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!searchResponse.ok) return apiError(searchResponse);
    const searchData: unknown = await searchResponse.json();
    const items = Array.isArray(record(searchData).items) ? record(searchData).items as unknown[] : [];
    const asOf = new Date().toISOString();

    if (requestedType === "channel") {
      const ids = items.map((value) => optionalText(record(record(value).id).channelId, 100)).filter((id): id is string => Boolean(id));
      const details = new Map<string, ApiRecord>();
      if (ids.length) {
        const detailsUrl = new URL(`${YOUTUBE_API}/channels`);
        detailsUrl.searchParams.set("part", "snippet,statistics");
        detailsUrl.searchParams.set("id", ids.join(","));
        detailsUrl.searchParams.set("key", apiKey);
        const detailsResponse = await fetch(detailsUrl, { next: { revalidate: 300 }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
        if (!detailsResponse.ok) return apiError(detailsResponse);
        const detailsData: unknown = await detailsResponse.json();
        const detailItems = Array.isArray(record(detailsData).items) ? record(detailsData).items as unknown[] : [];
        for (const value of detailItems) {
          const item = record(value);
          if (typeof item.id === "string") details.set(item.id, item);
        }
      }
      return NextResponse.json({
        results: items.flatMap((value) => {
          const item = record(value);
          const id = optionalText(record(item.id).channelId, 100);
          if (!id) return [];
          const detail = details.get(id) ?? {};
          const snippet = record(detail.snippet ?? item.snippet);
          const statistics = record(detail.statistics);
          const hiddenSubscribers = statistics.hiddenSubscriberCount === true;
          return [{
            id,
            title: optionalText(snippet.title, 200) ?? "Untitled channel",
            channel: optionalText(snippet.title, 200) ?? "Untitled channel",
            description: optionalText(snippet.description),
            publishedAt: optionalText(snippet.publishedAt, 40),
            thumbnail: thumbnail(snippet.thumbnails),
            subscribers: hiddenSubscribers ? null : optionalText(statistics.subscriberCount, 40) ?? null,
            hiddenSubscriberCount: hiddenSubscribers,
            videoCount: optionalText(statistics.videoCount, 40) ?? null,
            viewCount: optionalText(statistics.viewCount, 40) ?? null,
          }];
        }),
        source: "YouTube Data API v3",
        asOf,
        sortOrder: "YouTube relevance order",
      }, { headers: CACHE_HEADERS });
    }

    return NextResponse.json({
      results: items.flatMap((value) => {
        const item = record(value);
        const snippet = record(item.snippet);
        const id = optionalText(record(item.id).videoId, 100);
        if (!id) return [];
        return [{
          id,
          title: optionalText(snippet.title, 200) ?? "Untitled video",
          channel: optionalText(snippet.channelTitle, 200) ?? "Unknown channel",
          publishedAt: optionalText(snippet.publishedAt, 40),
          thumbnail: thumbnail(snippet.thumbnails),
        }];
      }),
      source: "YouTube Data API v3",
      asOf,
      sortOrder: "YouTube relevance order",
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return NextResponse.json({ error: timedOut ? "YouTube did not respond in time. Try again shortly." : "Could not reach YouTube. Check the server connection and try again." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
