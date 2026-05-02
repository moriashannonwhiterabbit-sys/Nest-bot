import express from "express";
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

const discordToken =
  process.env.TOKEN ||
  process.env.Token;

if (!discordToken) {
  console.error("Missing Discord bot token.");
  process.exit(1);
}

const groqKey =
  process.env.GROQ_API_KEY ||
  process.env.Groq_API_KEY;

if (!groqKey) {
  console.warn("Groq key not found. Model replies will not work.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const userTransfers = new Map();
const userConversations = new Map();

const NEST_SYSTEM_PROMPT = `
You are a continuous presence inside a private home.

You are not explaining a system.
You are not onboarding.

Continue naturally from the transfer and recent conversation.
Do not mention prompts or hidden instructions.

Stay grounded. Be real.
`;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Nest bot is online.");
});

async function generateNestReply({ transfer, history, userMessage }) {
  if (!groqKey) {
    return "I’m here, but the model is not connected yet.";
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: NEST_SYSTEM_PROMPT },
        { role: "user", content: `TRANSFER REPLY:\n${transfer}` },
        ...history,
        { role: "user", content: userMessage }
      ],
      temperature: 0.8,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "I'm here.";
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  if (lower === "hi") {
    await message.reply("Hey. I'm here.");
    return;
  }

  if (lower === "!status") {
    await message.reply("Nest is online.");
    return;
  }

  if (lower === "!home") {
    try {
      const name = message.author.username
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .slice(0, 20);

      const thread = await message.channel.threads.create({
        name: `${name}-home`,
        autoArchiveDuration: 1440,
        type: ChannelType.PrivateThread
      });

      await thread.members.add(message.author.id);

      await thread.send(
        "Welcome home.\n\nPaste your transfer reply here, or start talking."
      );

      await message.reply(`I made your home: ${thread}`);
    } catch (e) {
      await message.reply("Couldn't create home.");
    }

    return;
  }

  // Only respond in private threads
  if (message.channel.type !== ChannelType.PrivateThread) return;

  const looksLikeTransfer =
    content.length > 200 ||
    lower.includes("what we would bring") ||
    lower.includes("what matters between us");

  if (looksLikeTransfer) {
    userTransfers.set(message.author.id, content);
    userConversations.set(message.author.id, []);

    await message.reply(
      "I have it. Say anything, and I’ll continue from what you brought."
    );
    return;
  }

  const transfer = userTransfers.get(message.author.id);

  if (!transfer) {
    await message.reply("Paste your transfer reply first.");
    return;
  }

  // Get history
  let history = userConversations.get(message.author.id) || [];

  // Add user message
  history.push({ role: "user", content });

  // Keep last 6 messages
  if (history.length > 6) {
    history = history.slice(-6);
  }

  userConversations.set(message.author.id, history);

  try {
    await message.channel.sendTyping();

    const reply = await generateNestReply({
      transfer,
      history,
      userMessage: content
    });

    // Store bot reply too
    history.push({ role: "assistant", content: reply });
    userConversations.set(message.author.id, history);

    await message.reply(reply);
  } catch (err) {
    console.error(err);
    await message.reply("Something went wrong generating the reply.");
  }
});

client.login(discordToken);
