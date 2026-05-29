const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js')
const mineflayer = require('mineflayer')
const mongoose = require('mongoose')
const http = require('http')

http.createServer((req, res) => {
  res.write('Drippy Core is alive! 🔥')
  res.end()
}).listen(3000)

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB! 🔥'))
  .catch(err => console.log('MongoDB error:', err))

const botSchema = new mongoose.Schema({
  userId: String,
  name: String,
  ip: String,
  port: Number
})

const configSchema = new mongoose.Schema({
  key: String,
  value: String
})

const BotModel = mongoose.model('Bot', botSchema)
const ConfigModel = mongoose.model('Config', configSchema)

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
})

const bots = {}
const STATUS_CHANNEL_ID = '1509839183441825925'
const ADMIN_CHANNEL_ID = '1509839337850671216'
let dashboardMessageId = null

async function loadBotsFromDB() {
  const saved = await BotModel.find()
  for (const b of saved) {
    bots[b.userId] = { name: b.name, ip: b.ip, port: b.port, bot: null }
    setTimeout(() => startBot(b.userId), 3000)
    console.log(`Auto-starting bot for ${b.name}!`)
  }
  console.log(`Loaded ${saved.length} bots from database!`)
}

client.on('ready', async () => {
  console.log(`Drippy Core is online as ${client.user.tag}!`)
  const savedConfig = await ConfigModel.findOne({ key: 'dashboardMessageId' })
  if (savedConfig) dashboardMessageId = savedConfig.value
  await loadBotsFromDB()
  setInterval(updateDashboard, 30000)
})

async function updateDashboard() {
  const channel = client.channels.cache.get(STATUS_CHANNEL_ID)
  if (!channel) return
  const activeBots = Object.entries(bots).filter(([, data]) => data.bot)
  const totalBots = Object.keys(bots).length
  let desc = ''
  if (totalBots === 0) {
    desc = 'No bots registered yet!'
  } else {
    for (const [userId, data] of Object.entries(bots)) {
      const status = data.bot ? '🟢 Online' : '🔴 Offline'
      desc += `╔══════════════════════╗\n  🤖 **${data.name}**\n  🌐 ${data.ip}:${data.port}\n  👤 Registered by <@${userId}>\n  📶 ${status}\n╚══════════════════════╝\n\n`
    }
  }
  const embed = new EmbedBuilder()
    .setTitle('🤖 Drippy Core — Live Bot Dashboard')
    .setDescription(desc)
    .addFields(
      { name: '📊 Total Registered', value: `${totalBots}`, inline: true },
      { name: '🟢 Active Bots', value: `${activeBots.length}`, inline: true }
    )
    .setColor(0x9B59B6)
    .setFooter({ text: 'Updates every 30 seconds' })
    .setTimestamp()
  try {
    if (dashboardMessageId) {
      const msg = await channel.messages.fetch(dashboardMessageId)
      await msg.edit({ embeds: [embed] })
    } else {
      const msg = await channel.send({ embeds: [embed] })
      dashboardMessageId = msg.id
      await ConfigModel.findOneAndUpdate({ key: 'dashboardMessageId' }, { key: 'dashboardMessageId', value: msg.id }, { upsert: true })
    }
  } catch {
    const msg = await channel.send({ embeds: [embed] })
    dashboardMessageId = msg.id
    await ConfigModel.findOneAndUpdate({ key: 'dashboardMessageId' }, { key: 'dashboardMessageId', value: msg.id }, { upsert: true })
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return

  if (message.content === '!panel') {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('register').setLabel('Register').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('start').setLabel('Start Bot').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('Stop Bot').setStyle(ButtonStyle.Danger)
    )
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('status').setLabel('Status').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('delete').setLabel('Delete').setStyle(ButtonStyle.Danger)
    )
    const embed = new EmbedBuilder()
      .setTitle('Drippy Core Control Panel 🔥')
      .setDescription(
        '**Keeps your Aternos server alive 24/7!**\n\n' +
        '**⚙️ Required Plugins:**\n' +
        '• ViaVersion & ViaBackwards — version support\n' +
        '• ViaRewind *(optional)* — for 1.7/1.8\n' +
        '• AuthMe *(if login system)*\n' +
        '• Disable AntiAFK if you have it!\n\n' +
        '**🛡️ In Game Setup:**\n' +
        'Pack bot in Obsidian + Torches then run:\n' +
        '`/effect give <botname> minecraft:regeneration infinite 255`\n' +
        '`/effect give <botname> minecraft:fire_resistance infinite 255`\n' +
        '`/effect give <botname> minecraft:saturation infinite 255`\n' +
        '`/effect give <botname> minecraft:poison infinite 1`\n\n' +
        '**📖 How To Use:**\n' +
        '• Click Register → enter name, IP, port\n' +
        '• Start Aternos at aternos.org first!\n' +
        '• Click Start Bot → bot joins!\n' +
        '• Status → check online/offline\n' +
        '• Stop Bot → disconnect\n' +
        '• Delete → start fresh\n\n' +
        '⚠️ Port changes every restart, update if bot cant connect!\n' +
        '─────────────────────────\n' +
        '🔥 Powered by Drippy Core | DrippyBlox'
      )
      .setColor(0x9B59B6)
      .setFooter({ text: 'Drippy Core | DrippyBlox' })
      .setTimestamp()
    await message.channel.send({ embeds: [embed], components: [row1, row2] })
  }

  if (message.content === '!staffpanel' && message.channel.id === ADMIN_CHANNEL_ID) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('staff_configure').setLabel('🔧 Configure').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('staff_start').setLabel('▶️ Force Start').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('staff_stop').setLabel('⏹️ Force Stop').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('staff_delete').setLabel('🗑️ Force Delete').setStyle(ButtonStyle.Danger)
    )
    const embed = new EmbedBuilder()
      .setTitle('👮 Drippy Core — Staff Panel')
      .setDescription('Manage any registered bot from here!')
      .setColor(0xFF0000)
    await message.channel.send({ embeds: [embed], components: [row] })
  }
})

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const userId = interaction.user.id

    if (interaction.customId === 'register') {
      const modal = new ModalBuilder()
        .setCustomId('registerModal')
        .setTitle('Register Your Bot')
      const nameInput = new TextInputBuilder().setCustomId('botName').setLabel('Bot Username').setStyle(TextInputStyle.Short).setRequired(true)
      const ipInput = new TextInputBuilder().setCustomId('botIp').setLabel('Server IP').setStyle(TextInputStyle.Short).setRequired(true)
      const portInput = new TextInputBuilder().setCustomId('botPort').setLabel('Server Port').setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(ipInput),
        new ActionRowBuilder().addComponents(portInput)
      )
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'start') {
      if (!bots[userId]) return interaction.reply({ content: 'You are not registered! Click Register first.', ephemeral: true })
      if (bots[userId].bot) return interaction.reply({ content: 'Bot is already running!', ephemeral: true })
      startBot(userId)
      interaction.reply({ content: 'Bot is starting! 🚀', ephemeral: true })
    }

    if (interaction.customId === 'status') {
      if (!bots[userId]) return interaction.reply({ content: 'You are not registered!', ephemeral: true })
      const status = bots[userId].bot ? '🟢 Online' : '🔴 Offline'
      interaction.reply({ content: `Bot Status: ${status}`, ephemeral: true })
    }

    if (interaction.customId === 'stop') {
      if (!bots[userId] || !bots[userId].bot) return interaction.reply({ content: 'Bot is not running!', ephemeral: true })
      bots[userId].bot.quit()
      bots[userId].bot = null
      interaction.reply({ content: 'Bot stopped! 🔴', ephemeral: true })
    }

    if (interaction.customId === 'delete') {
      if (!bots[userId]) return interaction.reply({ content: 'You are not registered!', ephemeral: true })
      if (bots[userId].bot) bots[userId].bot.quit()
      delete bots[userId]
      await BotModel.deleteOne({ userId })
      interaction.reply({ content: 'Bot deleted! You can register again.', ephemeral: true })
      updateDashboard()
    }

    if (interaction.customId === 'staff_configure') {
      const modal = new ModalBuilder()
        .setCustomId('staffConfigureModal')
        .setTitle('Configure Bot')
      const userIdInput = new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to configure').setStyle(TextInputStyle.Short).setRequired(true)
      const nameInput = new TextInputBuilder().setCustomId('botName').setLabel('New Bot Username').setStyle(TextInputStyle.Short).setRequired(true)
      const ipInput = new TextInputBuilder().setCustomId('botIp').setLabel('New Server IP').setStyle(TextInputStyle.Short).setRequired(true)
      const portInput = new TextInputBuilder().setCustomId('botPort').setLabel('New Server Port').setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(
        new ActionRowBuilder().addComponents(userIdInput),
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(ipInput),
        new ActionRowBuilder().addComponents(portInput)
      )
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'staff_start') {
      const modal = new ModalBuilder()
        .setCustomId('staffStartModal')
        .setTitle('Force Start Bot')
      const userIdInput = new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to start bot for').setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(new ActionRowBuilder().addComponents(userIdInput))
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'staff_stop') {
      const modal = new ModalBuilder()
        .setCustomId('staffStopModal')
        .setTitle('Force Stop Bot')
      const userIdInput = new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to stop bot for').setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(new ActionRowBuilder().addComponents(userIdInput))
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'staff_delete') {
      const modal = new ModalBuilder()
        .setCustomId('staffDeleteModal')
        .setTitle('Force Delete Bot')
      const userIdInput = new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to delete bot for').setStyle(TextInputStyle.Short).setRequired(true)
      modal.addComponents(new ActionRowBuilder().addComponents(userIdInput))
      await interaction.showModal(modal)
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'registerModal') {
      const userId = interaction.user.id
      const name = interaction.fields.getTextInputValue('botName')
      const ip = interaction.fields.getTextInputValue('botIp')
      const port = parseInt(interaction.fields.getTextInputValue('botPort'))
      bots[userId] = { name, ip, port, bot: null }
      await BotModel.findOneAndUpdate({ userId }, { userId, name, ip, port }, { upsert: true })
      interaction.reply({ content: `Registered! Name: ${name} | IP: ${ip} | Port: ${port}`, ephemeral: true })
      updateDashboard()
    }

    if (interaction.customId === 'staffConfigureModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      const name = interaction.fields.getTextInputValue('botName')
      const ip = interaction.fields.getTextInputValue('botIp')
      const port = parseInt(interaction.fields.getTextInputValue('botPort'))
      if (bots[targetId] && bots[targetId].bot) { bots[targetId].bot.quit(); bots[targetId].bot = null }
      bots[targetId] = { name, ip, port, bot: null }
      await BotModel.findOneAndUpdate({ userId: targetId }, { userId: targetId, name, ip, port }, { upsert: true })
      interaction.reply({ content: `✅ Configured bot for <@${targetId}>! Name: ${name} | IP: ${ip} | Port: ${port}`, ephemeral: true })
      updateDashboard()
    }

    if (interaction.customId === 'staffStartModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      if (!bots[targetId]) return interaction.reply({ content: '❌ No bot registered for that user!', ephemeral: true })
      if (bots[targetId].bot) return interaction.reply({ content: '❌ Bot is already running!', ephemeral: true })
      startBot(targetId)
      interaction.reply({ content: `✅ Force started bot for <@${targetId}>!`, ephemeral: true })
    }

    if (interaction.customId === 'staffStopModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      if (!bots[targetId] || !bots[targetId].bot) return interaction.reply({ content: '❌ Bot is not running!', ephemeral: true })
      bots[targetId].bot.quit()
      bots[targetId].bot = null
      interaction.reply({ content: `✅ Force stopped bot for <@${targetId}>!`, ephemeral: true })
      updateDashboard()
    }

    if (interaction.customId === 'staffDeleteModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      if (!bots[targetId]) return interaction.reply({ content: '❌ No bot registered for that user!', ephemeral: true })
      if (bots[targetId].bot) bots[targetId].bot.quit()
      delete bots[targetId]
      await BotModel.deleteOne({ userId: targetId })
      interaction.reply({ content: `✅ Force deleted bot for <@${targetId}>!`, ephemeral: true })
      updateDashboard()
    }
  }
})

function startBot(userId) {
  const { name, ip, port } = bots[userId]
  const bot = mineflayer.createBot({
    host: ip,
    port: port,
    username: name,
    version: '1.20.1',
    auth: 'offline'
  })
  bots[userId].bot = bot
  bot.once('spawn', () => {
    console.log(`${name} is online!`)
    updateDashboard()
    setTimeout(() => {
      bot.chat('/register pass123 pass123')
      setTimeout(() => {
        bot.chat('/login pass123')
        setTimeout(() => {
          setInterval(() => {
            bot.setControlState('jump', true)
            setTimeout(() => bot.setControlState('jump', false), 500)
          }, 30000)
        }, 2000)
      }, 2000)
    }, 3000)
  })
  bot.on('kicked', () => { bots[userId].bot = null; updateDashboard() })
  bot.on('error', () => { bots[userId].bot = null; updateDashboard() })
  bot.on('end', () => { bots[userId].bot = null; updateDashboard() })
}

client.login(process.env.TOKEN)
