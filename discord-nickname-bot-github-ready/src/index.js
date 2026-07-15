import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { loadConfig, saveConfig } from "./config.js";
import {
  buildNicknamePattern,
  buildWarningMessage,
  getMemberNickname,
  isExempt,
  validateNickname
} from "./nickname-policy.js";

const config = loadConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const nicknameButtonPrefix = "nickname:open-modal";
const nicknameModalPrefix = "nickname:submit";
const gameNickInputId = "nickname:gamenick";
const realNameInputId = "nickname:realname";
const syncIntervalMs = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchGuildMembers(guild, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await guild.members.fetch();
    } catch (error) {
      const retryAfterSeconds = error?.data?.retry_after || error?.retry_after;

      if (attempt === attempts || !retryAfterSeconds) {
        throw error;
      }

      await sleep((retryAfterSeconds * 1000) + 500);
    }
  }

  return guild.members.cache;
}

function buildDesiredNickname(gameNick, realName) {
  return `${gameNick.trim()} (${realName.trim()})`;
}

function buildNicknameButtonRow(guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${nicknameButtonPrefix}:${guildId}`)
      .setLabel("Ввести nickname")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildNicknameModal(guildId) {
  return new ModalBuilder()
    .setCustomId(`${nicknameModalPrefix}:${guildId}`)
    .setTitle("Змінити nickname")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(gameNickInputId)
          .setLabel("Ігровий нік")
          .setPlaceholder("Owlbeback")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(24)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(realNameInputId)
          .setLabel("Реальне ім'я")
          .setPlaceholder("Рома")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(24)
          .setRequired(true)
      )
    );
}

function getGuildIdFromCustomId(customId, prefix) {
  return customId.startsWith(`${prefix}:`) ? customId.slice(prefix.length + 1) : null;
}

function findRoleByName(guild, roleName) {
  return guild.roles.cache.find((role) => role.name.toLowerCase() === roleName.toLowerCase());
}

function getManagedRoles(member) {
  return member.roles.cache.filter((role) =>
    config.managedRoleNames.some((roleName) => role.name.toLowerCase() === roleName.toLowerCase())
  );
}

function getNeedsFixRoleId(guild) {
  return config.needsFixRoleIdsByGuild[guild.id] || config.needsFixRoleId;
}

function hasHumanAssignedRole(member) {
  const fallbackRole = findRoleByName(member.guild, config.fallbackRoleName);
  const needsFixRoleId = getNeedsFixRoleId(member.guild);

  return member.roles.cache.some((role) =>
    role.id !== member.guild.id &&
    role.id !== fallbackRole?.id &&
    role.id !== needsFixRoleId
  );
}

function getStoredRoleIds(guildId, userId) {
  return config.storedRoleIdsByGuild[guildId]?.[userId] || [];
}

function storeRoleIds(guildId, userId, roleIds) {
  config.storedRoleIdsByGuild[guildId] = config.storedRoleIdsByGuild[guildId] || {};
  config.storedRoleIdsByGuild[guildId][userId] = roleIds;
  saveConfig(config);
}

function clearStoredRoleIds(guildId, userId) {
  if (!config.storedRoleIdsByGuild[guildId]?.[userId]) {
    return;
  }

  delete config.storedRoleIdsByGuild[guildId][userId];
  saveConfig(config);
}

async function setMemberNicknameFromInput(interaction, gameNick, realName, guildId = null) {
  const nickname = buildDesiredNickname(gameNick, realName);
  const pattern = buildNicknamePattern(config);

  if (!pattern.test(nickname)) {
    await interaction.reply({
      content: `Цей nickname не проходить формат. Приклад: ${config.validExample}`,
      ephemeral: true
    });
    return;
  }

  const guild = interaction.guild || await client.guilds.fetch(guildId);
  const member = interaction.member || await guild.members.fetch(interaction.user.id);

  await member.setNickname(nickname, "Member submitted nickname")
    .then(async () => {
      await updateNeedsFixRole(member, true);
      await interaction.reply({
        content: `Готово, твій nickname змінено на: ${nickname}`,
        ephemeral: true
      });
    })
    .catch(async () => {
      await interaction.reply({
        content: "Не вдалося змінити nickname. Перевір, чи роль бота вище твоєї ролі і чи бот має право Manage Nicknames.",
        ephemeral: true
      });
    });
}

async function notifyMember(member, nickname, reason = "default") {
  const warningMessage = buildWarningMessage(config, nickname, reason);
  let dmSent = false;

  if (config.dmUsers) {
    dmSent = await member.send({
      content: warningMessage,
      components: [buildNicknameButtonRow(member.guild.id)]
    })
      .then(() => true)
      .catch(() => false);
  }

  if (config.logChannelId) {
    const channel = await member.guild.channels.fetch(config.logChannelId).catch(() => null);

    if (channel?.isTextBased()) {
      await channel.send({
        content: `${member} має неправильний nickname.\n${warningMessage}`
      });
    }
  }

  return { dmSent };
}

async function ensureNeedsFixRole(guild) {
  const configuredRoleId = getNeedsFixRoleId(guild);

  if (configuredRoleId) {
    const configuredRole = await guild.roles.fetch(configuredRoleId).catch(() => null);

    if (configuredRole) {
      return configuredRole;
    }
  }

  const existingRole = guild.roles.cache.find((role) => role.name === config.needsFixRoleName);
  const role = existingRole || await guild.roles.create({
    name: config.needsFixRoleName,
    reason: "Role for members with invalid nickname format"
  });

  config.needsFixRoleIdsByGuild[guild.id] = role.id;
  saveConfig(config);

  return role;
}

async function updateNeedsFixRole(member, isValid) {
  const roleId = getNeedsFixRoleId(member.guild);

  if (!roleId) {
    return;
  }

  const role = await member.guild.roles.fetch(roleId).catch(() => null);

  if (!role) {
    return;
  }

  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role, "Nickname format is valid");
  }
}

async function enforceNicknameLockRolePolicy(member, isValid) {
  if (!config.nicknameLockEnabledByGuild[member.guild.id]) {
    return;
  }

  const fallbackRole = findRoleByName(member.guild, config.fallbackRoleName);

  if (fallbackRole && member.roles.cache.has(fallbackRole.id)) {
    await member.roles.remove(fallbackRole, "Nickname lock: remove fallback role")
      .catch((error) => console.warn(`Failed to remove fallback role from ${member.user.tag}: ${error.message}`));
  }

  if (!isValid) {
    const managedRoles = getManagedRoles(member);

    if (managedRoles.size && !getStoredRoleIds(member.guild.id, member.id).length) {
      storeRoleIds(member.guild.id, member.id, managedRoles.map((role) => role.id));
    }

    if (managedRoles.size) {
      await member.roles.remove(managedRoles.map((role) => role), "Nickname lock: temporary role downgrade")
        .catch((error) => console.warn(`Failed to remove managed roles from ${member.user.tag}: ${error.message}`));
    }

    return;
  }

  const storedRoleIds = getStoredRoleIds(member.guild.id, member.id);

  if (storedRoleIds.length) {
    const rolesToRestore = storedRoleIds
      .map((roleId) => member.guild.roles.cache.get(roleId))
      .filter(Boolean);

    if (rolesToRestore.length) {
      await member.roles.add(rolesToRestore, "Nickname lock: restore previous roles")
        .catch((error) => console.warn(`Failed to restore roles for ${member.user.tag}: ${error.message}`));
    }

    clearStoredRoleIds(member.guild.id, member.id);
    return;
  }

  const hasManagedRole = getManagedRoles(member).size > 0;

  if (!hasManagedRole && !hasHumanAssignedRole(member)) {
    const defaultRole = findRoleByName(member.guild, config.defaultValidRoleName);

    if (defaultRole && !member.roles.cache.has(defaultRole.id)) {
      await member.roles.add(defaultRole, "Nickname lock: valid newcomer nickname")
        .catch((error) => console.warn(`Failed to add default role to ${member.user.tag}: ${error.message}`));
    }
  }
}

async function syncNeedsFixRoles(guild, shouldNotify = false, reason = "default") {
  const members = await fetchGuildMembers(guild);
  let checkedCount = 0;
  let invalidCount = 0;

  for (const member of members.values()) {
    const result = await checkMember(member, shouldNotify, reason);

    if (!result.checked) {
      continue;
    }

    checkedCount += 1;

    if (!result.isValid) {
      invalidCount += 1;
    }
  }

  return { checkedCount, invalidCount };
}

async function syncAllGuilds(reason) {
  const guilds = await client.guilds.fetch();

  for (const partialGuild of guilds.values()) {
    const guild = await partialGuild.fetch().catch(() => null);

    if (!guild) {
      continue;
    }

    const roleId = getNeedsFixRoleId(guild);
    const lockEnabled = config.nicknameLockEnabledByGuild[guild.id];

    if (!roleId && !lockEnabled) {
      continue;
    }

    await syncNeedsFixRoles(guild, false)
      .then((result) => {
        console.log(
          `${reason}: synced ${guild.name} (${guild.id}); checked=${result.checkedCount}; invalid=${result.invalidCount}`
        );
      })
      .catch((error) => {
        console.warn(`${reason}: failed to sync ${guild.name} (${guild.id}): ${error.message}`);
      });
  }
}

async function applyNicknameLock(guild) {
  config.nicknameLockEnabledByGuild[guild.id] = true;
  saveConfig(config);

  const syncResult = await syncNeedsFixRoles(guild, true, "lock");

  return { ...syncResult };
}

async function removeNicknameLock(guild) {
  config.nicknameLockEnabledByGuild[guild.id] = false;
  saveConfig(config);

  const roleId = getNeedsFixRoleId(guild);
  const role = roleId ? await guild.roles.fetch(roleId).catch(() => null) : null;
  let unlockedCount = 0;
  let failedCount = 0;

  if (role) {
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
      try {
        const overwrite = channel?.permissionOverwrites?.cache.get(role.id);

        if (overwrite) {
          await overwrite.delete("Disable nickname lock");
          unlockedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }
  }

  const members = await fetchGuildMembers(guild);
  let removedRoleCount = 0;

  for (const member of members.values()) {
    if (role && !member.roles.cache.has(role.id)) {
      const storedRoleIds = getStoredRoleIds(guild.id, member.id);

      if (!storedRoleIds.length) {
        continue;
      }
    }

    const storedRoleIds = getStoredRoleIds(guild.id, member.id);
    const rolesToRestore = storedRoleIds
      .map((storedRoleId) => guild.roles.cache.get(storedRoleId))
      .filter(Boolean);
    const fallbackRole = findRoleByName(guild, config.fallbackRoleName);

    if (rolesToRestore.length) {
      await member.roles.add(rolesToRestore, "Disable nickname lock: restore roles").catch(() => null);
      clearStoredRoleIds(guild.id, member.id);
    }

    if (fallbackRole && member.roles.cache.has(fallbackRole.id)) {
      await member.roles.remove(fallbackRole, "Disable nickname lock: remove fallback role").catch(() => null);
    }

    if (role && member.roles.cache.has(role.id)) {
      await member.roles.remove(role, "Disable nickname lock").then(() => {
        removedRoleCount += 1;
      }).catch(() => null);
    }
  }

  return { unlockedCount, failedCount, removedRoleCount };
}

async function checkMember(member, shouldNotify = true, reason = "default") {
  if (isExempt(member, config)) {
    return { checked: false, isValid: true, nickname: getMemberNickname(member) };
  }

  const result = validateNickname(member, config);
  await updateNeedsFixRole(member, result.isValid);
  await enforceNicknameLockRolePolicy(member, result.isValid);

  let notification = { dmSent: false };

  if (!result.isValid && shouldNotify) {
    notification = await notifyMember(member, result.nickname, reason);
  }

  return { checked: true, ...result, ...notification };
}

async function collectInvalidMembers(guild, shouldNotify = false, reason = "default") {
  const members = await fetchGuildMembers(guild);
  const invalidMembers = [];
  let dmSentCount = 0;
  let dmFailedCount = 0;

  for (const member of members.values()) {
    const result = await checkMember(member, shouldNotify, reason);

    if (result.checked && !result.isValid) {
      invalidMembers.push(`${member.user.tag}: ${result.nickname}`);

      if (shouldNotify && config.dmUsers) {
        if (result.dmSent) {
          dmSentCount += 1;
        } else {
          dmFailedCount += 1;
        }
      }
    }
  }

  return { invalidMembers, dmSentCount, dmFailedCount };
}

function buildInvalidMembersReply(result, shouldNotify) {
  const invalidPreview = result.invalidMembers.slice(0, 30).join("\n");
  const extraCount = Math.max(result.invalidMembers.length - 30, 0);
  const suffix = extraCount ? `\n...і ще ${extraCount}` : "";

  if (!result.invalidMembers.length) {
    return "Усі перевірені nickname виглядають правильно.";
  }

  const notificationSummary = shouldNotify
    ? `\n\nDM відправлено: ${result.dmSentCount}. Не вдалося відправити: ${result.dmFailedCount}.`
    : "\n\nЩоб одразу написати цим людям у приватні, запусти `/nickname-warn`.";

  return `Знайшов неправильні nickname:\n${invalidPreview}${suffix}${notificationSummary}`;
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  await syncAllGuilds("startup");
  setInterval(() => {
    syncAllGuilds("interval").catch((error) => {
      console.warn(`interval: failed to sync guilds: ${error.message}`);
    });
  }, syncIntervalMs);
});

client.on(Events.Error, (error) => {
  console.warn(`Discord client error: ${error.message}`);
});

process.on("unhandledRejection", (error) => {
  console.warn(`Unhandled rejection: ${error?.message || error}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  await checkMember(member, true, "join");
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (getMemberNickname(oldMember) === getMemberNickname(newMember)) {
    await checkMember(newMember, false);
    return;
  }

  await checkMember(newMember, true, "changed");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton() && interaction.customId.startsWith(`${nicknameButtonPrefix}:`)) {
    const guildId = getGuildIdFromCustomId(interaction.customId, nicknameButtonPrefix);
    await interaction.showModal(buildNicknameModal(guildId));
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith(`${nicknameModalPrefix}:`)) {
    const guildId = getGuildIdFromCustomId(interaction.customId, nicknameModalPrefix);
    const gameNick = interaction.fields.getTextInputValue(gameNickInputId);
    const realName = interaction.fields.getTextInputValue(realNameInputId);
    await setMemberNicknameFromInput(interaction, gameNick, realName, guildId);
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === "setnick") {
    const gameNick = interaction.options.getString("gamenick", true);
    const realName = interaction.options.getString("realname", true);
    await setMemberNicknameFromInput(interaction, gameNick, realName);
    return;
  }

  if (interaction.commandName === "nickname-lock") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "Ця команда доступна тільки адміністраторам або модераторам з правом Manage Server.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const enabled = interaction.options.getBoolean("enabled", true);

    if (!enabled) {
      const result = await removeNicknameLock(interaction.guild);
      await interaction.editReply(
        `Lock вимкнено. Очищено каналів: ${result.unlockedCount}. Помилок: ${result.failedCount}. Роль знято з учасників: ${result.removedRoleCount}.`
      );
      return;
    }

    const result = await applyNicknameLock(interaction.guild);

    await interaction.editReply(
      `Lock увімкнено. Бот більше не видає Pug/Fix nickname, а тимчасово забирає керовані ролі. ` +
        `Перевірено учасників: ${result.checkedCount}. З неправильним ніком: ${result.invalidCount}.`
    );
    return;
  }

  if (interaction.commandName === "nickname-warn") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "Ця команда доступна тільки адміністраторам або модераторам з правом Manage Server.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await collectInvalidMembers(interaction.guild, true, "warn");
    await interaction.editReply(buildInvalidMembersReply(result, true));
    return;
  }

  if (interaction.commandName === "checknames") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "Ця команда доступна тільки адміністраторам або модераторам з правом Manage Server.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const shouldNotify = interaction.options.getBoolean("notify") ?? false;
    const result = await collectInvalidMembers(interaction.guild, shouldNotify, "check");
    await interaction.editReply(buildInvalidMembersReply(result, shouldNotify));
  }
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN is missing. Create .env from .env.example first.");
}

client.login(process.env.DISCORD_TOKEN);

export const checknamesCommand = new SlashCommandBuilder()
  .setName("checknames")
  .setDescription("Перевірити nickname всіх учасників сервера")
  .addBooleanOption((option) =>
    option
      .setName("notify")
      .setDescription("Надіслати DM учасникам з неправильним nickname")
      .setRequired(false)
  );

export const setnickCommand = new SlashCommandBuilder()
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

export const nicknameWarnCommand = new SlashCommandBuilder()
  .setName("nickname-warn")
  .setDescription("Надіслати DM-попередження учасникам без правильного nickname");

export const nicknameLockCommand = new SlashCommandBuilder()
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