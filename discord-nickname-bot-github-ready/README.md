# Discord Nickname Bot

Бот перевіряє nickname учасників Discord-сервера у форматі:

```text
GameNick (РеальнеІмя)
```

Наприклад:

```text
Owlbeback (Рома)
```

## Що він робить

- перевіряє nickname, коли людина заходить на сервер;
- перевіряє nickname після зміни server nickname;
- може писати користувачу в DM;
- може писати в модераторський канал;
- може видавати/знімати роль `needs fix`;
- має slash-команду `/checknames` для ручної перевірки всіх учасників;
- має `/setnick`, щоб користувач сам ввів ігровий нік та реальне ім'я;
- має `/nickname-warn`, щоб тільки попередити людей у DM;
- має `/nickname-lock`, щоб окремо обмежити канали для людей без правильного nickname.

У lock-режимі бот також може тимчасово переводити учасників з основних ролей у `Pug`, запам'ятовувати попередню роль і повертати її після правильного nickname. Новачкам з правильним nickname видається `Депутат`. Ролі `Dota`, `Guider`, `Server Booster`, `FlaviBot`, `Raid-Helper`, `Jockie Music` не чіпаються.

## Налаштування Discord

1. Створи application у Discord Developer Portal.
2. Додай Bot.
3. У Bot settings увімкни `SERVER MEMBERS INTENT`.
4. Запроси бота на сервер з правами:
   - `View Channels`
   - `Send Messages`
   - `Use Application Commands`
   - `Manage Nicknames`
   - `Manage Roles`, якщо використовуєш lock-роль
   - `Manage Channels`, якщо використовуєш `/nickname-lock`
5. Роль бота має бути вище ролі, яку він видає.

## Локальний запуск

```bash
npm install
cp .env.example .env
cp config.example.json config.json
```

Заповни `.env`:

```env
DISCORD_TOKEN=...
CLIENT_ID=...
```

`GUILD_ID` більше не потрібен для звичайного запуску: команди реєструються глобально і працюють на всіх серверах, куди додано бота.

За потреби заповни `config.json`:

```json
{
  "nicknameRegex": "^.{2,24}\\s?\\([\\p{L}][\\p{L}'ʼ -]{1,24}\\)$",
  "validExample": "Owlbeback (Рома)",
  "logChannelId": "",
  "needsFixRoleId": "",
  "needsFixRoleIdsByGuild": {},
  "needsFixRoleName": "Fix nickname",
  "exemptRoleIds": [],
  "dmUsers": true
}
```

Потім зареєструй slash-команду:

```bash
npm run deploy:commands
```

Глобальні slash-команди можуть з'являтися на нових серверах з невеликою затримкою.

І запусти бота:

```bash
npm start
```

## Хостинг

Так, бот має десь хоститись, бо його процес повинен бути онлайн постійно.

Варіанти:

- локально на твоєму компі: добре для тесту, але бот офлайн, коли комп вимкнений;
- VPS: найстабільніше і недорого;
- Railway, Fly.io, Render або схожий сервіс: простіше стартувати, але дивись ліміти free-tier;
- Docker на домашньому сервері/NAS: норм, якщо він працює 24/7.

Для продакшну я б радив VPS або Railway/Fly.io.

## Підготовка до GitHub

У GitHub заливай тільки код і приклади конфігів. Не заливай секрети та локальні файли:

- не заливай `.env`;
- не заливай `config.json`;
- не заливай `node_modules/`;
- заливай `package.json`, `package-lock.json`, `src/`, `README.md`, `.env.example`, `config.example.json`, `.gitignore`.

Після клонування на хостингу зроби:

```bash
npm install
cp config.example.json config.json
```

На хостингу не обов'язково створювати `.env` файлом. Краще додай змінні середовища в панелі хостингу:

```env
DISCORD_TOKEN=твій_bot_token
CLIENT_ID=application_id_бота
```

Команди для хостингу:

```bash
# install/build command
npm install

# start command
npm start
```

Якщо ти змінював slash-команди в коді, один раз виконай:

```bash
npm run deploy:commands
```

Потім запускай бота через `npm start`.

## Важливо для ролей

Щоб бот міг змінювати nickname і ролі:

- у Discord Developer Portal має бути увімкнений `SERVER MEMBERS INTENT`;
- роль бота на сервері має бути вище ролей `Pug`, `Депутат`, `Спікер` та інших ролей, які бот має видавати/знімати;
- у запрошенні бота мають бути права `Manage Nicknames`, `Manage Roles`, `Manage Channels`, `View Channels`, `Send Messages`, `Use Application Commands`.
