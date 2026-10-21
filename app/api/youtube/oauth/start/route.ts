import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getYoutubeOAuthConfig, oauthCookieOptions, seal, YOUTUBE_OAUTH_SCOPES, YOUTUBE_STATE_COOKIE } from "../../oauth-lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if ((request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "YouTube connection must be started from this site." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const config = getYoutubeOAuthConfig();
  if (!config) {
    return NextResponse.json({ error: "YouTube connection is not configured yet. Add the Google OAuth settings on the server first." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: YOUTUBE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.json({ authorizationUrl: authorization.toString() }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(YOUTUBE_STATE_COOKIE, seal({ state, verifier }, config.encryptionKey), oauthCookieOptions(10 * 60));
  return response;
}

