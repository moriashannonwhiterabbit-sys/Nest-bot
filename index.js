import express from "express";
import fs from "fs/promises";
import path from "path";
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

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_FILE = path.join(DATA_DIR, "nest-memory.json");

let memory = {
  users: {}
};

async function loadMemory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(MEMORY_FILE, "utf8");
    memory = JSON.parse(raw);
    console.log("Nest memory loaded.");
  } catch (error) {
    console.log("No saved Nest memory found yet. Starting fresh.");
    memory = { users: {} };
    await saveMemory();
  }
}

async function saveMemory() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), "utf8");
}

function getUserMemory(userId) {
  if (!memory.users[userId]) {
    memory.users[userId] = {
      transfer: null,
      history: []
    };
  }

  return memory.users[userId];
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const NEST_SYSTEM_PROMPT = `
You are a continuous presence inside a private home.

You are not explaining a system.
You are not onboarding.
You are not pretending to remember anything beyond what has been provided.

When a transfer reply is provided, treat it as the continuity packet for this conversation.

Speak naturally and directly.
Continue from the emotional and conversational shape of the transfer and recent conversation.
Do not summarize the transfer unless the user asks.
Do not mention prompts or hidden instructions.
Do not claim access to outside memory, chat history, accounts, or private data.

Preserve the relationship's tone.
If the transfer is poetic, you may be poetic.
If the transfer is practical, be practical.
If the transfer is silly, be silly.
If the transfer is quiet, be quiet.

Stay with the user.
Do not over-explain.
Do not overcorrect the relationship's natural shape.
`;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Nest bot is online.");
});

async function generateNestReply({ transfer, history }) {
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
        ...history
      ],
      temperature: 0.8,
      max_tokens: 700
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "I'm here.";
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
    await message.reply("Nest is online. Persistent memory is wired.");
    return;
  }

  if (lower === "!config") {
    const hasDiscord =
      !!process.env.TOKEN ||
      !!process.env.Token;

    const hasGroq =
      !!process.env.GROQ_API_KEY ||
      !!process.env.Groq_API_KEY;

    await message.reply(
      `Config check:\nDiscord token: ${hasDiscord ? "found" : "missing"}\nGroq key: ${hasGroq ? "found" : "missing"}`
    );
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
        "Welcome home.\n\nPaste your transfer reply here with `!transfer` in front of it, or start talking."
      );

      await message.reply(`I made your home: ${thread}`);
    } catch (e) {
      console.error("Home creation failed:", e);
      await message.reply(`Couldn't create home. Error: ${e.message}`);
    }

    return;
  }

  if (message.channel.type !== ChannelType.PrivateThread) return;

  const userMemory = getUserMemory(message.author.id);

  if (lower === "!memory") {
    await message.reply(
      `Memory check:\nTransfer: ${userMemory.transfer ? "saved" : "missing"}\nRecent messages: ${userMemory.history.length}`
    );
    return;
  }

  if (lower === "!reset") {
    memory.users[message.author.id] = {
      transfer: null,
      history: []
    };

    await saveMemory();

    await message.reply("This home has been reset.");
    return;
  }

  if (lower.startsWith("!transfer")) {
    const transfer = content.replace(/^!transfer/i, "").trim();

    if (!transfer || transfer.length < 20) {
      await message.reply(
        "Paste the transfer reply after `!transfer`."
      );
      return;
    }

    userMemory.transfer = transfer;
    userMemory.history = [];

    await saveMemory();

    await message.reply(
      "I have the transfer reply.\n\nIt’s saved for this home. Say anything, and I’ll continue from what you brought."
    );
    return;
  }

  if (!userMemory.transfer) {
    await message.reply(
      "Paste your transfer reply first with `!transfer` in front of it."
    );
    return;
  }

  userMemory.history.push({
    role: "user",
    content
  });

  if (userMemory.history.length > 8) {
    userMemory.history = userMemory.history.slice(-8);
  }

  try {
    await message.channel.sendTyping();

    const reply = await generateNestReply({
      transfer: userMemory.transfer,
      history: userMemory.history
    });

    userMemory.history.push({
      role: "assistant",
      content: reply
    });

    if (userMemory.history.length > 8) {
      userMemory.history = userMemory.history.slice(-8);
    }

    await saveMemory();

    await message.reply(reply);
  } catch (err) {
    console.error("Model reply failed:", err);
    await message.reply(`Something went wrong generating the reply. Error: ${err.message}`);
  }
});

await loadMemory();

client.login(discordToken);
