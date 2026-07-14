import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const checknamesCommand = new SlashCommandBuilder()
  .setName("checknames")
  .setDescription("Перевірити nickname всіх учасників сервера")
  .addBooleanOption((option) =>
    option
      .setName("notify")
      .setDescription("Надіслати DM учасникам з неправильним nickname")
      .setRequired(false)
  );

const setnickCommand = new SlashCommandBuilder()
  .setName("setnick")
  .setDescription("Встановити nickname у форматі GameNick (Ім'я)")
  .addStringOption((option) =>
    option
      .setName("gamenick")
      .setDescription("Ігровий нік, наприклад Owlbeback")
      .setRequired(true)
      .setMaxLength(24)
  )
  .addStringOption((option) =>
    option
      .setName("realname")
      .setDescription("Реальне ім'я, наприклад Рома")
      .setRequired(true)
      .setMaxLength(24)
  );

const nicknameWarnCommand = new SlashCommandBuilder()
  .setName("nickname-warn")
  .setDescription("Надіслати DM-попередження учасникам без правильного nickname");

const nicknameLockCommand = new SlashCommandBuilder()
  .setName("nickname-lock")
  .setDescription("Увімкнути або вимкнути lock для учасників без правильного nickname")
  .addBooleanOption((option) =>
    option
      .setName("enabled")
      .setDescription("True - увімкнути lock, False - вимкнути")
      .setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName("exempt_channel")
      .setDescription("Канал, який лишиться відкритим для /setnick")
      .setRequired(false)
  );

const requiredEnvVars = ["DISCORD_TOKEN", "CLIENT_ID"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} is missing. Create .env from .env.example first.`);
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  {
    body: [
      checknamesCommand.toJSON(),
      setnickCommand.toJSON(),
      nicknameWarnCommand.toJSON(),
      nicknameLockCommand.toJSON()
    ]
  }
);

console.log("Global slash commands deployed.");
