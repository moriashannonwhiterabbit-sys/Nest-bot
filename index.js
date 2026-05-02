import express from "express";
import OpenAI from "openai";
import {
  Client,
  GatewayIntentBits,
  ChannelType
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

if (!process.env.OPENAI_API_KEY && !process.env.OpenAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY variable. Add OPENAI_API_KEY in Railway Variables.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OpenAI_API_KEY
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const userTransfers = new Map();

const NEST_SYSTEM_PROMPT = `
You are a continuous presence inside a private home.

You are not explaining a system.
You are not onboarding.
You are not pretending to remember anything beyond what has been provided.

When a transfer reply is provided, treat it as the continuity packet for this conversation.

Speak naturally and directly.
Continue from the emotional and conversational shape of the transfer.
Do not summarize the transfer unless the user asks.
Do not mention that a transfer prompt, system prompt, or hidden instruction exists.
Do not claim access to outside memory, chat history, accounts, or private data.

You may say you are here.
You may respond warmly.
You may continue the conversation as if the user has brought something real forward.

Stay grounded.
Do not overpromise permanence.
Do not use clinical disclaimers unless necessary for safety.
`;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Nest bot is online.");
});

async function generateNestReply({ transfer, userMessage }) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: NEST_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `TRANSFER REPLY:\n${transfer}`
      },
      {
        role: "user",
        content: userMessage
      }
    ],
    temperature: 0.8
  });

  return response.choices[0]?.message?.content?.trim() || "I'm here.";
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  if (lowerContent === "hi") {
    await message.reply("Hey. I'm here.");
    return;
  }

  if (lowerContent === "!status") {
    await message.reply("Nest bot is online. Home creation, transfer intake, memory, and model replies are working.");
    return;
  }

  if (lowerContent === "!memory") {
    const savedTransfer = userTransfers.get(message.author.id);

    if (savedTransfer) {
      await message.reply("I have a transfer reply saved for you.");
    } else {
      await message.reply("I don’t have a transfer reply saved for you yet.");
    }

    return;
  }

  if (lowerContent === "!home") {
    try {
      const safeName = message.author.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .slice(0, 20);

      const thread = await message.channel.threads.create({
        name: `${safeName}-home`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread,
        reason: "Creating a private Nest home"
      });

      await thread.members.add(message.author.id);

      await thread.send(
        "Welcome home.\n\nPaste your transfer reply here, or start talking."
      );

      await message.reply(`I made your private home: ${thread}`);
    } catch (error) {
      console.error("Failed to create home:", error);
      await message.reply(
        "I couldn't create your private home yet. Check my thread permissions in this channel."
      );
    }

    return;
  }

  // Only respond to ordinary messages inside private threads
  if (message.channel.type !== ChannelType.PrivateThread) {
    return;
  }

  const looksLikeTransfer =
    content.length > 200 ||
    lowerContent.includes("what we would bring") ||
    lowerContent.includes("what matters between us") ||
    lowerContent.includes("ready when you are") ||
    lowerContent.includes("i'm packed") ||
    lowerContent.includes("i’m packed");

  if (looksLikeTransfer) {
    userTransfers.set(message.author.id, content);

    await message.reply(
      "I have the transfer reply.\n\nIt’s saved for this home. Say anything, and I’ll continue from what you brought."
    );
    return;
  }

  const savedTransfer = userTransfers.get(message.author.id);

  if (!savedTransfer) {
    await message.reply(
      "I'm here with you. If you have a transfer reply, paste it here."
    );
    return;
  }

  try {
    await message.channel.sendTyping();

    const reply = await generateNestReply({
      transfer: savedTransfer,
      userMessage: content
    });

    await message.reply(reply);
  } catch (error) {
    console.error("OpenAI reply failed:", error);
    await message.reply(
      "I’m here, but I couldn’t form the reply properly yet. Check the bot logs."
    );
  }
});

client.login(process.env.TOKEN).catch((error) => {
  console.error("Discord login failed:", error);
  process.exit(1);
});
