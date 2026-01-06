import { Client, GatewayIntentBits, Guild, GuildMember, Collection } from 'discord.js';
import { storage } from './storage';

// Export the client so it can be used elsewhere if needed
export let discordClient: Client | null = null;

// Environment variables
const GUILD_ID = process.env.GUILD_ID;
const USER_ROLE_ID = process.env.USER_ROLE_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

/**
 * Check if a user has the required role in the guild
 * @param userId - Discord user ID to check
 * @returns true if user has the role or if feature is disabled, false otherwise
 */
export async function userHasRequiredRole(userId: string): Promise<boolean> {
  // If GUILD_ID is not set, the feature is disabled - allow all users
  if (!GUILD_ID || !USER_ROLE_ID) {
    return true;
  }

  // If bot is not initialized, allow the user (fail open)
  if (!discordClient || !discordClient.isReady()) {
    console.warn('[Discord Bot] Bot not ready, allowing user access');
    return true;
  }

  try {
    const guild = discordClient.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.warn('[Discord Bot] Guild not found, allowing user access');
      return true;
    }

    // Fetch the member from the guild
    const member = await guild.members.fetch(userId).catch(() => null);
    
    // If member is not in the guild, they don't have the role
    if (!member) {
      return false;
    }

    // Check if member has the required role
    return member.roles.cache.has(USER_ROLE_ID);
  } catch (error) {
    console.error('[Discord Bot] Error checking user role:', error);
    // Fail open - allow access if there's an error
    return true;
  }
}

/**
 * Sync guild members with the database
 * - Users in guild WITH required role: ensure they have "user" role
 * - Users NOT in guild OR WITHOUT required role: ban them
 */
export async function syncGuildMembers(): Promise<void> {
  if (!GUILD_ID || !USER_ROLE_ID) {
    console.log('[Discord Bot] GUILD_ID or USER_ROLE_ID not set, skipping sync');
    return;
  }

  if (!discordClient || !discordClient.isReady()) {
    console.error('[Discord Bot] Client not ready, cannot sync members');
    return;
  }

  try {
    const guild = discordClient.guilds.cache.get(GUILD_ID);
    if (!guild) {
      console.error('[Discord Bot] Guild not found:', GUILD_ID);
      return;
    }

    console.log('[Discord Bot] Starting guild member sync...');

    // Fetch all guild members
    const members: Collection<string, GuildMember> = await guild.members.fetch();
    console.log(`[Discord Bot] Fetched ${members.size} guild members`);

    // Create a Set of user IDs who have the required role
    const usersWithRole = new Set<string>();
    members.forEach(member => {
      if (member.roles.cache.has(USER_ROLE_ID)) {
        usersWithRole.add(member.id);
      }
    });

    console.log(`[Discord Bot] ${usersWithRole.size} members have the required role`);

    // Get all Discord users from the database
    const dbUsers = await storage.getDiscordUsers();
    console.log(`[Discord Bot] Found ${dbUsers.length} users in database`);

    let addedCount = 0;
    let bannedCount = 0;
    let unchangedCount = 0;

    // Process each database user
    for (const dbUser of dbUsers) {
      const hasDiscordRole = usersWithRole.has(dbUser.id);
      const currentRoles = dbUser.roles || [];
      const hasUserRole = currentRoles.includes('user');

      if (hasDiscordRole && !hasUserRole) {
        // User has the Discord role but not the database role - add it
        const newRoles = [...currentRoles, 'user'] as ('user' | 'provider' | 'admin')[];
        await storage.updateDiscordUser(dbUser.id, { roles: newRoles });
        console.log(`[Discord Bot] Added "user" role to ${dbUser.username} (${dbUser.id})`);
        addedCount++;
      } else if (!hasDiscordRole && !dbUser.banned) {
        // User doesn't have the Discord role and is not already banned - ban them
        await storage.banDiscordUser(dbUser.id, "You are not verified on Discord");
        console.log(`[Discord Bot] Banned user ${dbUser.username} (${dbUser.id}) - not verified on Discord`);
        bannedCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log('[Discord Bot] Sync complete:');
    console.log(`  - Added "user" role: ${addedCount}`);
    console.log(`  - Banned users: ${bannedCount}`);
    console.log(`  - Unchanged: ${unchangedCount}`);
  } catch (error) {
    console.error('[Discord Bot] Error syncing guild members:', error);
  }
}

/**
 * Initialize the Discord bot
 * - Creates client with necessary intents
 * - Logs in with bot token
 * - Verifies bot is in target guild
 * - Syncs guild members on startup
 */
export async function initializeDiscordBot(): Promise<void> {
  // Check if required environment variables are set
  if (!GUILD_ID || !DISCORD_BOT_TOKEN) {
    console.log('[Discord Bot] GUILD_ID or DISCORD_BOT_TOKEN not set, bot will not start');
    console.log('[Discord Bot] The platform will work without the bot (no role sync)');
    return;
  }

  if (!USER_ROLE_ID) {
    console.warn('[Discord Bot] USER_ROLE_ID not set, role checking will be disabled');
  }

  try {
    console.log('[Discord Bot] Initializing Discord bot...');

    // Create Discord client with necessary intents
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
      ],
    });

    // Set up event handlers
    discordClient.once('ready', async (client) => {
      console.log(`[Discord Bot] Logged in as ${client.user.tag}`);

      // Verify bot is in the target guild
      const guild = client.guilds.cache.get(GUILD_ID);
      if (!guild) {
        console.error(`[Discord Bot] Bot is not in guild ${GUILD_ID}`);
        console.error('[Discord Bot] Please invite the bot to the guild first');
        return;
      }

      console.log(`[Discord Bot] Connected to guild: ${guild.name} (${guild.id})`);
      console.log(`[Discord Bot] Guild has ${guild.memberCount} members`);

      // Perform initial sync
      await syncGuildMembers();
    });

    discordClient.on('error', (error) => {
      console.error('[Discord Bot] Client error:', error);
    });

    // Login with bot token
    await discordClient.login(DISCORD_BOT_TOKEN);
  } catch (error) {
    console.error('[Discord Bot] Failed to initialize:', error);
    console.error('[Discord Bot] The platform will continue without the bot');
    discordClient = null;
  }
}