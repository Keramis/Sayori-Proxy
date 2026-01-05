/**
 * Discord OAuth utility functions
 * Handles all Discord OAuth API interactions
 */

// Discord API base URLs
const DISCORD_API_BASE = 'https://discord.com/api';
const DISCORD_OAUTH_BASE = 'https://discord.com/oauth2';

// OAuth scopes required for the application
const OAUTH_SCOPES = ['identify', 'guilds', 'email'];

/**
 * Response from Discord's token endpoint
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Discord user information from /users/@me endpoint
 */
export interface DiscordUserInfo {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  email?: string;
  avatar?: string;
  verified?: boolean;
}

/**
 * Discord guild (server) information
 */
export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

/**
 * Build the Discord OAuth authorization URL
 * @param state - CSRF protection state token
 * @returns Full authorization URL to redirect the user to
 */
export function buildAuthorizationUrl(state: string): string {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('CLIENT_ID and REDIRECT_URI must be set in environment variables');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    state: state,
  });

  return `${DISCORD_OAUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for access and refresh tokens
 * @param code - Authorization code from Discord callback
 * @returns Token response with access_token and refresh_token
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI must be set in environment variables');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord token exchange failed:', errorText);
      throw new Error(`Failed to exchange code for tokens: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as TokenResponse;
    return data;
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

/**
 * Refresh an expired access token using a refresh token
 * @param refreshToken - The refresh token from a previous token exchange
 * @returns New token response with fresh access_token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('CLIENT_ID and CLIENT_SECRET must be set in environment variables');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord token refresh failed:', errorText);
      throw new Error(`Failed to refresh access token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as TokenResponse;
    return data;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

/**
 * Fetch the authenticated user's information from Discord
 * @param accessToken - Valid Discord access token
 * @returns User information including ID, username, email, etc.
 */
export async function fetchUserInfo(accessToken: string): Promise<DiscordUserInfo> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord user info fetch failed:', errorText);
      throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as DiscordUserInfo;
    return data;
  } catch (error) {
    console.error('Error fetching user info:', error);
    throw error;
  }
}

/**
 * Fetch the list of guilds (servers) the user is a member of
 * @param accessToken - Valid Discord access token
 * @returns Array of guild objects
 */
export async function fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord guilds fetch failed:', errorText);
      throw new Error(`Failed to fetch user guilds: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as DiscordGuild[];
    return data;
  } catch (error) {
    console.error('Error fetching user guilds:', error);
    throw error;
  }
}