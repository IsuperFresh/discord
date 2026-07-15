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

function buildFormatHelp(config, nickname) {
  return [
    `Твій нік зараз: "${nickname}".`,
    "Потрібний формат: ігровий нік + реальне ім'я в дужках.",
    `Приклад правильного формату: ${config.validExample}`,
    "",
    "Натисни кнопку нижче, щоб ввести свій ігровий нік та ім'я."
  ];
}

export function buildWarningMessage(config, nickname, reason = "default") {
  const formatHelp = buildFormatHelp(config, nickname);

  if (reason === "join") {
    return [
      "Вітаю у гільдії Award of Light!",
      "",
      "Для доступу до всіх каналів потрібно вказати nickname у правильному форматі.",
      "",
      ...formatHelp
    ].join("\n");
  }

  if (reason === "changed") {
    return [
      "Твій nickname більше не відповідає правилам гільдії.",
      "",
      "Якщо режим lock увімкнений, доступ до каналів може бути тимчасово обмежений до виправлення nickname.",
      "",
      ...formatHelp
    ].join("\n");
  }

  if (reason === "lock") {
    return [
      "Доступ до каналів тимчасово обмежено, бо nickname не відповідає формату гільдії.",
      "",
      "Після правильного nickname бот автоматично поверне твою роль.",
      "",
      ...formatHelp
    ].join("\n");
  }

  if (reason === "warn") {
    return [
      "Нагадування від гільдії Award of Light.",
      "",
      "Будь ласка, зміни nickname на сервері у правильному форматі.",
      "",
      ...formatHelp
    ].join("\n");
  }

  if (reason === "check") {
    return [
      "Під час перевірки nickname твій нік не пройшов формат гільдії.",
      "",
      ...formatHelp
    ].join("\n");
  }

  return [
    "Потрібно оновити nickname на сервері.",
    "",
    ...formatHelp
  ].join("\n");
}
