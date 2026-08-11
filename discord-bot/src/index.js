import 'dotenv/config';
import express from 'express';
import {
  Client,
  Collection,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_LIVE_CHANNEL_ID'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] Missing ${key}`);
    process.exit(1);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
  new SlashCommandBuilder()
    .setName('live')
    .setDescription('Quản lý trạng thái livestream')
    .addSubcommand((sub) => sub.setName('start').setDescription('Thông báo bắt đầu livestream')
      .addStringOption((o) => o.setName('game').setDescription('Tên game').setRequired(true))
      .addStringOption((o) => o.setName('title').setDescription('Tiêu đề live').setRequired(false))
      .addStringOption((o) => o.setName('url').setDescription('Link livestream').setRequired(false)))
    .addSubcommand((sub) => sub.setName('stop').setDescription('Đánh dấu livestream đã kết thúc')),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Xem trạng thái livestream hiện tại'),
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Xem lịch stream trên website'),
  new SlashCommandBuilder()
    .setName('website')
    .setDescription('Mở website Quản gia hướng nội'),
].map((command) => command.toJSON());

const state = {
  live: false,
  game: '',
  title: '',
  url: process.env.WEBSITE_URL || 'https://quangiahuongnoi.github.io/',
  platform: process.env.DEFAULT_PLATFORM || 'TikTok',
  startedAt: null,
  notificationMessageId: null,
};

const streamerName = process.env.STREAMER_NAME || 'Quản gia hướng nội';
const websiteUrl = process.env.WEBSITE_URL || 'https://quangiahuongnoi.github.io/';
const roleMention = process.env.DISCORD_LIVE_ROLE_ID ? `<@&${process.env.DISCORD_LIVE_ROLE_ID}>` : '';

function liveEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0xff2a1a)
    .setTitle('🔴 QUẢN GIA HƯỚNG NỘI ĐANG LIVE!')
    .setDescription(state.title ? `**${state.title}**` : 'Vào xem livestream cùng Quản gia 🐧')
    .addFields(
      { name: '🎮 Game', value: state.game || 'Đang cập nhật', inline: true },
      { name: '📺 Nền tảng', value: state.platform, inline: true },
    )
    .setURL(state.url || websiteUrl)
    .setFooter({ text: `${streamerName} • Live Notification` })
    .setTimestamp(state.startedAt ? new Date(state.startedAt) : new Date());
  return embed;
}

function offlineEmbed() {
  return new EmbedBuilder()
    .setColor(0x666666)
    .setTitle('⚫ Livestream đã kết thúc')
    .setDescription(`Cảm ơn mọi người đã theo dõi **${streamerName}** 🐧`)
    .addFields({ name: '🌐 Website', value: websiteUrl })
    .setFooter({ text: 'Quản gia hướng nội • Live Notification' })
    .setTimestamp();
}

async function getLiveChannel() {
  const channel = await client.channels.fetch(process.env.DISCORD_LIVE_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) throw new Error('DISCORD_LIVE_CHANNEL_ID is not a text channel.');
  return channel;
}

async function startLive({ game, title = '', url = websiteUrl }) {
  const channel = await getLiveChannel();
  state.live = true;
  state.game = game;
  state.title = title;
  state.url = url || websiteUrl;
  state.startedAt = new Date().toISOString();

  const content = roleMention || undefined;
  const message = await channel.send({ content, embeds: [liveEmbed()] });
  state.notificationMessageId = message.id;
  return message;
}

async function stopLive() {
  const channel = await getLiveChannel();
  state.live = false;
  if (state.notificationMessageId) {
    try {
      const message = await channel.messages.fetch(state.notificationMessageId);
      await message.edit({ content: '', embeds: [offlineEmbed()] });
    } catch (error) {
      console.warn('[live] Could not edit notification:', error.message);
    }
  } else {
    await channel.send({ embeds: [offlineEmbed()] });
  }
  state.notificationMessageId = null;
  state.startedAt = null;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`[discord] Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'live') {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'start') {
        if (state.live) {
          await interaction.reply({ content: '🔴 Bot đang ở trạng thái LIVE rồi.', ephemeral: true });
          return;
        }
        const game = interaction.options.getString('game', true);
        const title = interaction.options.getString('title') || '';
        const url = interaction.options.getString('url') || websiteUrl;
        await startLive({ game, title, url });
        await interaction.reply({ content: `🔴 Đã gửi thông báo LIVE: **${game}**`, ephemeral: true });
        return;
      }
      if (subcommand === 'stop') {
        if (!state.live) {
          await interaction.reply({ content: '⚫ Bot đang ở trạng thái OFFLINE.', ephemeral: true });
          return;
        }
        await stopLive();
        await interaction.reply({ content: '⚫ Đã cập nhật livestream thành OFFLINE.', ephemeral: true });
        return;
      }
    }

    if (interaction.commandName === 'status') {
      const embed = state.live ? liveEmbed() : offlineEmbed();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (interaction.commandName === 'schedule') {
      await interaction.reply({ content: `📅 Lịch stream: ${websiteUrl}#lich-stream`, ephemeral: true });
      return;
    }

    if (interaction.commandName === 'website') {
      await interaction.reply({ content: `🌐 ${websiteUrl}`, ephemeral: true });
    }
  } catch (error) {
    console.error('[interaction]', error);
    const payload = { content: '❌ Bot gặp lỗi khi xử lý yêu cầu.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
});

// Secure bridge for a future Admin/Cloudflare Worker integration.
// Never expose WEBHOOK_SECRET in the website or frontend JavaScript.
const app = express();
app.use(express.json({ limit: '32kb' }));

function authorized(req) {
  const secret = process.env.WEBHOOK_SECRET;
  return Boolean(secret) && req.get('authorization') === `Bearer ${secret}`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, discordReady: client.isReady(), live: state.live });
});

app.post('/api/live', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { live, game, title, url } = req.body || {};
  if (typeof live !== 'boolean') return res.status(400).json({ ok: false, error: 'live must be boolean' });

  try {
    if (live) {
      if (!game || typeof game !== 'string') return res.status(400).json({ ok: false, error: 'game is required when live=true' });
      if (state.live && state.game === game && state.title === (title || '')) {
        return res.json({ ok: true, changed: false, live: true });
      }
      if (state.live) await stopLive();
      await startLive({ game, title: title || '', url: url || websiteUrl });
    } else if (state.live) {
      await stopLive();
    }
    return res.json({ ok: true, changed: true, live: state.live });
  } catch (error) {
    console.error('[webhook]', error);
    return res.status(500).json({ ok: false, error: 'Discord notification failed' });
  }
});

const port = Number(process.env.WEBHOOK_PORT || 8787);
app.listen(port, () => console.log(`[http] Webhook listening on port ${port}`));

await client.login(process.env.DISCORD_TOKEN);
