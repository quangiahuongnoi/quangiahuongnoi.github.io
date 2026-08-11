import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required.');
}

const commands = [
  {
    name: 'live',
    description: 'Quản lý trạng thái livestream',
    options: [
      {
        type: 1,
        name: 'start',
        description: 'Thông báo bắt đầu livestream',
        options: [
          { type: 3, name: 'game', description: 'Tên game', required: true },
          { type: 3, name: 'title', description: 'Tiêu đề live', required: false },
          { type: 3, name: 'url', description: 'Link livestream', required: false },
        ],
      },
      { type: 1, name: 'stop', description: 'Đánh dấu livestream đã kết thúc' },
    ],
  },
  { name: 'status', description: 'Xem trạng thái livestream hiện tại' },
  { name: 'schedule', description: 'Xem lịch stream trên website' },
  { name: 'website', description: 'Mở website Quản gia hướng nội' },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = DISCORD_GUILD_ID
  ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
  : Routes.applicationCommands(DISCORD_CLIENT_ID);

await rest.put(route, { body: commands });
console.log(DISCORD_GUILD_ID ? 'Guild slash commands registered.' : 'Global slash commands registered.');
