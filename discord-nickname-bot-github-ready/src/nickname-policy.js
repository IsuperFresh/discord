export function buildNicknamePattern(config) {
  return new RegExp(config.nicknameRegex, "u");
}

export function getMemberNickname(member) {
  return member.nickname || member.user.globalName || member.user.username;
}

export function isExempt(member, config) {
  if (member.user.bot) {
    return true;
  }

  const hasExemptRoleId = config.exemptRoleIds.some((roleId) => member.roles.cache.has(roleId));
  const hasExemptRoleName = config.exemptRoleNames.some((roleName) =>
    member.roles.cache.some((role) => role.name.toLowerCase() === roleName.toLowerCase())
  );

  return hasExemptRoleId || hasExemptRoleName;
}

export function validateNickname(member, config) {
  const nickname = getMemberNickname(member);
  const pattern = buildNicknamePattern(config);

  return {
    nickname,
    isValid: pattern.test(nickname)
  };
}

export function buildWarningMessage(config, nickname) {
  return [
    "Вітаю у гільдії Award of Light!",
    "",
    "Для доступу до всіх каналів потрібно вказати nickname у форматі:",
    "ігровий нік + реальне ім'я в дужках.",
    "",
    `Твій нік зараз: "${nickname}".`,
    `Приклад правильного формату: ${config.validExample}`,
    "",
    "Натисни кнопку нижче, щоб ввести свій ігровий нік та ім'я."
  ].join("\n");
}
