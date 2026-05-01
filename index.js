
import express from "express";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField
} from "discord.js";

const app = express();

app.get("/", (req, res) => {
  res.send("Nest bot is awake.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Health server running on port ${port}`);
});

if (!process.env.TOKEN) {
  console.error("Missing TOKEN variable. Add TOKEN in Railway Variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Nest bot is online.");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === "hi") {
    await message.reply("Hey. I'm here.");
    return;
  }

  if (content === "!home") {
    try {
      const safeName = message.author.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .slice(0, 20);
  // Only respond inside private threads after this point
  if (message.channel.type !== ChannelType.PrivateThread) {
    return;
  }

  // Detect transfer-style message
  const looksLikeTransfer =
    message.content.length > 200 ||
    message.content.toLowerCase().includes("what we would bring") ||
    message.content.toLowerCase().includes("what matters between us") ||
    message.content.toLowerCase().includes("ready when you are");

  if (looksLikeTransfer) {
    await message.reply(
      "I have the transfer reply.\n\nNext, I’ll use this to help the conversation continue here."
    );
    return;
  }

  // Default response inside home
  await message.reply(
    "I'm here with you. If you have a transfer reply, paste it here."
  );
      const thread = await message.channel.threads.create({
        name: `${safeName}-home`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread,
        reason: "Creating a private Nest home"
      });

      await thread.members.add(message.author.id);

      await thread.send(
        `Welcome home.\n\nPaste your transfer reply here, or start talking.`
      );

      await message.reply(`I made your private home: ${thread}`);

    } catch (error) {
      console.error("Failed to create home:", error);
      await message.reply(
        "I couldn't create your private home yet. Check my thread permissions in this channel."
      );
    }
  }
});

client.login(process.env.TOKEN).catch((error) => {
  console.error("Discord login failed:", error);
  process.exit(1);
});
