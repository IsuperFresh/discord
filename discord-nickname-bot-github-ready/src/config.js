import fs from "node:fs";
import path from "node:path";

const defaultConfig = {
  nicknameRegex: "^.{2,24}\\s?\\([\\p{L}][\\p{L}'ʼ -]{1,24}\\)$",
  validExample: "Owlbeback (Рома)",
  logChannelId: "",
  needsFixRoleId: "",
  needsFixRoleIdsByGuild: {},
  needsFixRoleName: "Fix nickname",
  exemptRoleIds: [],
  exemptRoleNames: [
    "Dota",
    "Guider",
    "Server Booster",
    "FlaviBot",
    "Raid-Helper",
    "Jockie Music",
    "Jockie Music (1)"
  ],
  managedRoleNames: [
    "Президент",
    "Прем'єр-міністр",
    "Голова Ради",
    "Спікер",
    "Міністр",
    "Ветеран фракції",
    "Депутат"
  ],
  fallbackRoleName: "Pug",
  defaultValidRoleName: "Депутат",
  nicknameLockEnabledByGuild: {},
  storedRoleIdsByGuild: {},
  dmUsers: true
};

const configPath = path.resolve("config.json");

export function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    ...defaultConfig,
    ...rawConfig,
    exemptRoleIds: rawConfig.exemptRoleIds || defaultConfig.exemptRoleIds,
    exemptRoleNames: rawConfig.exemptRoleNames || defaultConfig.exemptRoleNames,
    managedRoleNames: rawConfig.managedRoleNames || defaultConfig.managedRoleNames,
    needsFixRoleIdsByGuild: rawConfig.needsFixRoleIdsByGuild || defaultConfig.needsFixRoleIdsByGuild,
    nicknameLockEnabledByGuild: rawConfig.nicknameLockEnabledByGuild || defaultConfig.nicknameLockEnabledByGuild,
    storedRoleIdsByGuild: rawConfig.storedRoleIdsByGuild || defaultConfig.storedRoleIdsByGuild
  };
}

export function saveConfig(config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
