import {
    Client,
    Events,
    GatewayIntentBits,
    type Message,
    type TextChannel,
} from "discord.js";
import { handleMessage, reloadSkills } from "./orchestrator";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
    console.error("[init] DISCORD_TOKEN is not set. Exiting.");
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Discord Client
// ---------------------------------------------------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] Logged in as ${c.user.tag}`);
    await reloadSkills();
});

client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore bots (including self).
    if (message.author.bot) return;

    const channel = message.channel as TextChannel;
    const channelName = channel.name ?? "general";
    const content = message.content.trim();

    if (!content) return;

    try {
        const response = await handleMessage(channelName, content);

        // Discord has a 2000-character limit per message.
        if (response.length <= 2000) {
            await message.reply(response);
        } else {
            // Split into chunks.
            const chunks = splitMessage(response, 2000);
            for (const chunk of chunks) {
                await message.reply(chunk);
            }
        }
    } catch (error) {
        console.error(
            `[discord] Error handling message: ${error instanceof Error ? error.message : error}`,
        );
        await message.reply(
            "An internal error occurred while processing your request.",
        );
    }
});

// ---------------------------------------------------------------------------
// HTTP Server (Webhooks & Health)
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve({
    port: PORT,
    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);

        // -- Health Check ------------------------------------------------------
        if (url.pathname === "/health") {
            return Response.json({ status: "ok", timestamp: new Date().toISOString() });
        }

        // -- GitHub Webhook (PR merged -> reload skills) -----------------------
        if (url.pathname === "/webhook/github" && req.method === "POST") {
            try {
                const body = await req.json() as Record<string, unknown>;
                const action = body.action as string | undefined;
                const merged = (body.pull_request as Record<string, unknown>)?.merged as boolean | undefined;

                if (action === "closed" && merged) {
                    console.log("[webhook] PR merged -- reloading skills.");
                    await reloadSkills();
                    return Response.json({ reloaded: true });
                }

                return Response.json({ ignored: true });
            } catch {
                return Response.json({ error: "Invalid payload" }, { status: 400 });
            }
        }

        return Response.json({ error: "Not found" }, { status: 404 });
    },
});

console.log(`[http] Server listening on port ${server.port}`);

// ---------------------------------------------------------------------------
// Start Discord
// ---------------------------------------------------------------------------

client.login(DISCORD_TOKEN);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        chunks.push(remaining.slice(0, maxLength));
        remaining = remaining.slice(maxLength);
    }
    return chunks;
}
