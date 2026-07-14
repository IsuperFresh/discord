import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events
} from "discord.js";
import { loadConfig } from "./config.js";
import {
  getMemberNickname,
  isExempt,
  validateNickname
} from "./nickname-policy.js";

const config = loadConfig();
const nicknameButtonPrefix = "nickname:open-modal";

function findRoleByName(guild, roleName) {
  return guild.roles.cache.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
}

function getManagedRoles(member) {
  return member.roles.cache.filter((role) =>
    config.managedRoleNames.some((roleName) => role.name.toLowerCase() === roleName.toLowerCase())
  );
}

function buildNicknameButtonRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${nicknameButtonPrefix}:${guildId}`)
      .setLabel("Ввести nickname")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildOnboardingMessage() {
  return [
    "Вітаю на сервері!",
    "Щоб отримати доступ і правильну роль, введи свій nickname у форматі:",
    "ігровий нік + реальне ім'я в дужках.",
    `Приклад: ${config.validExample}`,
    "",
    "Натисни кнопку нижче і заповни два поля."
  ].join("\n");
}

async function sendOnboardingMessage(member) {
  if (!config.dmUsers || member.user.bot) {
    return;
  }

  await member.send({
    content: buildOnboardingMessage(),
    components: [buildNicknameButtonRow(member.guild.id)]
  }).catch(() => null);
}

async function ensureDefaultValidRole(member) {
  if (isExempt(member, config)) {
    return;
  }

  const result = validateNickname(member, config);

  if (!result.isValid || getManagedRoles(member).size > 0) {
    return;
  }

  const defaultRole = findRoleByName(member.guild, config.defaultValidRoleName);

  if (defaultRole && !member.roles.cache.has(defaultRole.id)) {
    await member.roles.add(defaultRole, "Nickname format is valid: assign default role").catch(() => null);
  }

  const fallbackRole = findRoleByName(member.guild, config.fallbackRoleName);

  if (fallbackRole && member.roles.cache.has(fallbackRole.id)) {
    await member.roles.remove(fallbackRole, "Nickname format is valid").catch(() => null);
  }
}

async function ensureDefaultValidRoleForInteraction(interaction) {
  const guild = interaction.guild || await interaction.client.guilds.fetch(
    interaction.customId?.split(":").at(-1)
  ).catch(() => null);

  if (!guild) {
    return;
  }

  const member = interaction.member || await guild.members.fetch(interaction.user.id).catch(() => null);

  if (member) {
    await ensureDefaultValidRole(member);
  }
}

const originalOn = Client.prototype.on;

Client.prototype.on = function patchedOn(event, listener) {
  if (event === Events.GuildMemberAdd) {
    return originalOn.call(this, event, async (member) => {
      await sendOnboardingMessage(member);
      await listener(member);
      await ensureDefaultValidRole(member);
    });
  }

  if (event === Events.GuildMemberUpdate) {
    return originalOn.call(this, event, async (oldMember, newMember) => {
      await listener(oldMember, newMember);

      if (getMemberNickname(oldMember) !== getMemberNickname(newMember)) {
        await ensureDefaultValidRole(newMember);
      }
    });
  }

  if (event === Events.InteractionCreate) {
    return originalOn.call(this, event, async (interaction) => {
      await listener(interaction);

      if (
        (interaction.isModalSubmit?.() && interaction.customId?.startsWith("nickname:submit:")) ||
        (interaction.isChatInputCommand?.() && interaction.commandName === "setnick")
      ) {
        await ensureDefaultValidRoleForInteraction(interaction);
      }
    });
  }

  return originalOn.call(this, event, listener);
};

await import("./index.js");
