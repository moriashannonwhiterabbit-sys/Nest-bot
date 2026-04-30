import express from "express";
import { Client, GatewayIntentBits } from "discord.js";

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

  if (message.content.toLowerCase() === "hi") {
    await message.reply("Hey. I'm here.");
  }
});

client.login(process.env.TOKEN).catch((error) => {
  console.error("Discord login failed:", error);
  process.exit(1);
});
