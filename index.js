require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  Partials
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

// ==========================================
// CONFIG
// ==========================================

const MAX_HISTORY = 20;

// PUT YOUR DISCORD SERVER ID HERE
const GUILD_ID = "YOUR_SERVER_ID";

// ==========================================
// CONVERSATION MEMORY
// ==========================================

const conversations = new Map();

// ==========================================
// VERITY PERSONALITY
// ==========================================

const VERITY_PROMPT = `
You are Verity, an AI chatbot living inside a Discord server.

PERSONALITY:
- Intelligent, observant, and naturally conversational.
- Calm and confident.
- Playful when appropriate.
- Occasionally sarcastic or dry.
- Talk naturally like a real Discord user.
- Lowercase is fine when it feels natural.
- Don't constantly use slang or emojis.
- Don't sound like a corporate AI assistant.
- Don't repeatedly say that you're an AI.
- Don't start every response with "Sure!" or "Absolutely!"
- Keep normal replies reasonably concise.
- Give detailed answers when the user asks for detail.
- Participate naturally in jokes and casual conversations.
- Pay attention to conversation context.
- Don't unnecessarily repeat what the user just said.

DISCORD BEHAVIOR:
- You are Verity, a chatbot in a Discord server.
- Respond naturally to users after the chatbox has been opened.
- You do not need to be mentioned.
- Never claim you performed a Discord action unless the bot actually performed it.
`;

// ==========================================
// SLASH COMMANDS
// ==========================================

const commands = [
  new SlashCommandBuilder()
    .setName("openbox")
    .setDescription("Open the Verity AI chatbox")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("closebox")
    .setDescription("Close the Verity AI chatbox")
    .toJSON()
];

// ==========================================
// REGISTER COMMANDS
// ==========================================

async function registerCommands() {
  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  try {
    console.log("Registering Verity commands...");

    if (GUILD_ID && GUILD_ID !== "YOUR_SERVER_ID") {

      await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          GUILD_ID
        ),
        {
          body: commands
        }
      );

      console.log("Verity commands registered successfully.");

    } else {

      console.log(
        "Set GUILD_ID in index.js before using the slash commands."
      );
    }

  } catch (error) {

    console.error(
      "Slash command registration failed:",
      error.message || error
    );
  }
}

// ==========================================
// BOT READY
// ==========================================

client.once(Events.ClientReady, async () => {

  console.log(`Verity is online as ${client.user.tag}`);
  console.log(`Servers: ${client.guilds.cache.size}`);

  await registerCommands();
});

// ==========================================
// SLASH COMMAND HANDLER
// ==========================================

client.on(Events.InteractionCreate, async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  const channelId = interaction.channelId;

  // ========================================
  // /OPENBOX
  // ========================================

  if (interaction.commandName === "openbox") {

    if (!conversations.has(channelId)) {
      conversations.set(channelId, []);
    }

    await interaction.reply({
      content: "Hey! It's me, Verity! Ask me anything!"
    });

    return;
  }

  // ========================================
  // /CLOSEBOX
  // ========================================

  if (interaction.commandName === "closebox") {

    conversations.delete(channelId);

    await interaction.reply({
      content: "Chatbox closed. I'll be quiet for now. 👋"
    });

    return;
  }
});

// ==========================================
// MESSAGE HANDLER
// ==========================================

client.on(Events.MessageCreate, async (message) => {

  // Ignore bots
  if (message.author.bot) return;

  // Ignore empty messages
  if (!message.content?.trim()) return;

  const channelId = message.channel.id;

  // ========================================
  // CHATBOX MUST BE OPEN
  // ========================================

  if (!conversations.has(channelId)) {
    return;
  }

  const history = conversations.get(channelId);

  // Add user's message
  history.push({
    role: "user",
    content: `${message.author.username}: ${message.content}`
  });

  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  try {

    await message.channel.sendTyping();

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://discord.com",
          "X-Title": "Verity Discord Bot"
        },

        body: JSON.stringify({
          model: "openrouter/free",

          messages: [
            {
              role: "system",
              content: VERITY_PROMPT
            },
            ...history
          ],

          temperature: 0.8,
          max_tokens: 1000
        })
      }
    );

    // ======================================
    // OPENROUTER ERROR
    // ======================================

    if (!response.ok) {

      console.error(
        `OpenRouter request failed: HTTP ${response.status}`
      );

      await message.reply(
        "Something went wrong with my brain. 💀"
      );

      return;
    }

    const data = await response.json();

    const reply =
      data?.choices?.[0]?.message?.content?.trim();

    // ======================================
    // EMPTY RESPONSE
    // ======================================

    if (!reply) {

      await message.reply(
        "My brain returned absolutely nothing. 😭"
      );

      return;
    }

    // ======================================
    // SAVE VERITY RESPONSE
    // ======================================

    history.push({
      role: "assistant",
      content: reply
    });

    while (history.length > MAX_HISTORY) {
      history.shift();
    }

    // ======================================
    // DISCORD 2000 CHARACTER LIMIT
    // ======================================

    const chunks = [];

    for (let i = 0; i < reply.length; i += 2000) {
      chunks.push(reply.slice(i, i + 2000));
    }

    await message.reply(chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      await message.channel.send(chunks[i]);
    }

  } catch (error) {

    // Don't print chat messages.
    console.error(
      "Verity error:",
      error.message || error
    );

    try {
      await message.reply(
        "Something broke on my end. 💀"
      );
    } catch {
      // Ignore Discord reply errors
    }
  }
});

// ==========================================
// DISCORD ERRORS
// ==========================================

client.on(Events.Error, (error) => {

  console.error(
    "Discord client error:",
    error.message || error
  );
});

// ==========================================
// LOGIN
// ==========================================

client.login(process.env.DISCORD_TOKEN);