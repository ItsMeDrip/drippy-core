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

const CORE_ID = parseInt(process.env.CORE_ID) || 1

const botSchema = new mongoose.Schema({
  userId: String,
  name: String,
  ip: String,
  port: Number,
  owner: { type: Number, default: 1 }
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

let dashboardTimeout = null
function scheduleDashboardUpdate() {
  if (dashboardTimeout) return
  dashboardTimeout = setTimeout(async () => {
    dashboardTimeout = null
    await updateDashboard()
  }, 2000)
}

async function loadBotsFromDB() {
  const saved = await BotModel.find({ owner: CORE_ID })
  for (const b of saved) {
    bots[b.userId] = { name: b.name, ip: b.ip, port: b.port, bot: null }
    setTimeout(() => startBot(b.userId), 3000)
    console.log(`Auto-starting bot for ${b.name} on Core ${CORE_ID}!`)
  }
  console.log(`Loaded ${saved.length} bots on Core ${CORE_ID}!`)
}

async function pollForNewBots() {
  const myBots = await BotModel.find({ owner: CORE_ID })
  for (const b of myBots) {
    if (!bots[b.userId]) {
      console.log(`New bot assigned to Core ${CORE_ID}: ${b.name}`)
      bots[b.userId] = { name: b.name, ip: b.ip, port: b.port, bot: null }
      startBot(b.userId)
    }
  }
  // Remove bots no longer assigned to this core
  for (const userId of Object.keys(bots)) {
    const found = myBots.find(b => b.userId === userId)
    if (!found) {
      console.log(`Bot removed from Core ${CORE_ID}`)
      cleanupBot(userId)
      delete bots[userId]
    }
  }
  scheduleDashboardUpdate()
}

client.on('ready', async () => {
  console.log(`Drippy Core ${CORE_ID} is online as ${client.user.tag}!`)
  const savedConfig = await ConfigModel.findOne({ key: `dashboardMessageId_${CORE_ID}` })
  if (savedConfig) dashboardMessageId = savedConfig.value
  await loadBotsFromDB()
  setInterval(scheduleDashboardUpdate, 60000)
  setInterval(pollForNewBots, 120000)
})

async function updateDashboard() {
  const channel = client.channels.cache.get(STATUS_CHANNEL_ID)
  if (!channel) return
  const activeBots = Object.entries(bots).filter(([, data]) => data.bot)
  const totalBots = Object.keys(bots).length
  let desc = ''
  if (totalBots === 0) {
    desc = `No bots on Core ${CORE_ID} yet!`
  } else {
    for (const [userId, data] of Object.entries(bots)) {
      const status = data.bot ? '🟢 Online' : '🔴 Offline'
      desc += `╔══════════════════════╗\n  🤖 **${data.name}**\n  🌐 ${data.ip}:${data.port}\n  👤 Registered by <@${userId}>\n  📶 ${status}\n╚══════════════════════╝\n\n`
    }
  }
  const embed = new EmbedBuilder()
    .setTitle(`🤖 Drippy Core ${CORE_ID} — Live Bot Dashboard`)
    .setDescription(desc)
    .addFields(
      { name: '📊 Total Registered', value: `${totalBots}`, inline: true },
      { name: '🟢 Active Bots', value: `${activeBots.length}`, inline: true },
      { name: '⚙️ Core', value: `Core ${CORE_ID}`, inline: true }
    )
    .setColor(CORE_ID === 1 ? 0x9B59B6 : 0xFF6600)
    .setFooter({ text: `Drippy Core ${CORE_ID} | Updates every 60 seconds` })
    .setTimestamp()
  try {
    if (dashboardMessageId) {
      const msg = await channel.messages.fetch(dashboardMessageId)
      await msg.edit({ embeds: [embed] })
    } else {
      const msg = await channel.send({ embeds: [embed] })
      dashboardMessageId = msg.id
      await ConfigModel.findOneAndUpdate({ key: `dashboardMessageId_${CORE_ID}` }, { key: `dashboardMessageId_${CORE_ID}`, value: msg.id }, { upsert: true })
    }
  } catch {
    const msg = await channel.send({ embeds: [embed] })
    dashboardMessageId = msg.id
    await ConfigModel.findOneAndUpdate({ key: `dashboardMessageId_${CORE_ID}` }, { key: `dashboardMessageId_${CORE_ID}`, value: msg.id }, { upsert: true })
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return

  if (message.content === '!panel' && CORE_ID === 1) {
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

  if (message.content === '!staffpanel' && message.channel.id === ADMIN_CHANNEL_ID && CORE_ID === 1) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('staff_configure').setLabel('🔧 Configure').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('staff_start').setLabel('▶️ Force Start').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('staff_stop').setLabel('⏹️ Force Stop').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('staff_delete').setLabel('🗑️ Force Delete').setStyle(ButtonStyle.Danger)
    )
    const embed = new EmbedBuilder()
      .setTitle(`👮 Drippy Core ${CORE_ID} — Staff Panel`)
      .setDescription('Manage any registered bot from here!')
      .setColor(0xFF0000)
    await message.channel.send({ embeds: [embed], components: [row1] })
  }

  if (message.content === '!overallpanel' && message.channel.id === ADMIN_CHANNEL_ID && CORE_ID === 1) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('balance_all').setLabel('🔀 Balance All Cores').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('stop_all_backup').setLabel('⏹️ Stop All Backup').setStyle(ButtonStyle.Danger)
    )
    const embed = new EmbedBuilder()
      .setTitle('🌐 Drippy Core — Overall Panel')
      .setDescription('Control all cores from here!\n\n🔀 **Balance All** — splits bots evenly across all 3 cores!\n⏹️ **Stop All Backup** — moves everything back to Core 1!')
      .setColor(0x9B59B6)
    await message.channel.send({ embeds: [embed], components: [row] })
  }
})

client.on('interactionCreate', async (interaction) => {
  if (CORE_ID !== 1) return
  if (interaction.isButton()) {
    const userId = interaction.user.id

    if (interaction.customId === 'register') {
      const modal = new ModalBuilder().setCustomId('registerModal').setTitle('Register Your Bot')
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botName').setLabel('Bot Username').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botAddress').setLabel('Server Address (e.g name.aternos.me:12345)').setStyle(TextInputStyle.Short).setRequired(true))
      )
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'start') {
      const userBot = await BotModel.findOne({ userId })
      if (!userBot) return interaction.reply({ content: 'You are not registered! Click Register first.', ephemeral: true })
      if (!bots[userId]) {
        bots[userId] = { name: userBot.name, ip: userBot.ip, port: userBot.port, bot: null }
      }
      if (bots[userId].bot) return interaction.reply({ content: 'Bot is already running!', ephemeral: true })
      startBot(userId)
      interaction.reply({ content: 'Bot is starting! 🚀', ephemeral: true })
    }

    if (interaction.customId === 'status') {
      const userBot = await BotModel.findOne({ userId })
      if (!userBot && !bots[userId]) return interaction.reply({ content: 'You are not registered!', ephemeral: true })
      const status = bots[userId].bot ? '🟢 Online' : '🔴 Offline'
      interaction.reply({ content: `Bot Status: ${status}`, ephemeral: true })
    }

    if (interaction.customId === 'stop') {
      if (!bots[userId] || !bots[userId].bot) return interaction.reply({ content: 'Bot is not running!', ephemeral: true })
      cleanupBot(userId)
      interaction.reply({ content: 'Bot stopped! 🔴', ephemeral: true })
    }

    if (interaction.customId === 'delete') {
      const userBot = await BotModel.findOne({ userId })
      if (!userBot && !bots[userId]) return interaction.reply({ content: 'You are not registered!', ephemeral: true })
      cleanupBot(userId)
      delete bots[userId]
      await BotModel.deleteOne({ userId })
      interaction.reply({ content: 'Bot deleted! You can register again.', ephemeral: true })
      scheduleDashboardUpdate()
    }

    if (interaction.customId === 'balance_all') {
      await interaction.reply({ content: '🔀 Balancing bots across all 3 cores...', ephemeral: true })
      const allBots = await BotModel.find()
      const total = allBots.length
      for (let i = 0; i < total; i++) {
        const core = (i % 3) + 1
        await BotModel.findOneAndUpdate({ userId: allBots[i].userId }, { owner: core })
      }
      await interaction.followUp({ content: `✅ Done! Bots balanced across Core 1, 2 and 3!`, ephemeral: true })
    }

    if (interaction.customId === 'stop_all_backup') {
      await interaction.reply({ content: '⏹️ Moving all bots back to Core 1...', ephemeral: true })
      await BotModel.updateMany({}, { owner: 1 })
      await interaction.followUp({ content: `✅ Done! All bots moved back to Core 1!`, ephemeral: true })
    }

    if (interaction.customId === 'staff_configure') {
      const modal = new ModalBuilder().setCustomId('staffConfigureModal').setTitle('Configure Bot')
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to configure').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botName').setLabel('New Bot Username').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('botAddress').setLabel('New Server Address (e.g name.aternos.me:12345)').setStyle(TextInputStyle.Short).setRequired(true))
      )
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'staff_start') {
      const modal = new ModalBuilder().setCustomId('staffStartModal').setTitle('Force Start Bot')
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to start bot for').setStyle(TextInputStyle.Short).setRequired(true)))
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'staff_stop') {
      const modal = new ModalBuilder().setCustomId('staffStopModal').setTitle('Force Stop Bot')
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to stop bot for').setStyle(TextInputStyle.Short).setRequired(true)))
      await interaction.showModal(modal)
    }

    if (interaction.customId === 'staff_delete') {
      const modal = new ModalBuilder().setCustomId('staffDeleteModal').setTitle('Force Delete Bot')
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('targetUserId').setLabel('User ID to delete bot for').setStyle(TextInputStyle.Short).setRequired(true)))
      await interaction.showModal(modal)
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'registerModal') {
      const userId = interaction.user.id
      const name = interaction.fields.getTextInputValue('botName')
      const address = interaction.fields.getTextInputValue('botAddress')
      const [ip, portStr] = address.split(':')
      const port = parseInt(portStr)
      if (!ip || !port) return interaction.reply({ content: '❌ Invalid address format! Use: name.aternos.me:12345', ephemeral: true })

      const userExisting = await BotModel.findOne({ userId })
      if (userExisting) {
        return interaction.reply({ content: '❌ You already have a bot registered! Delete it first!', ephemeral: true })
      }

      const existing = await BotModel.findOne({ ip })
      if (existing && existing.userId !== userId) {
        return interaction.reply({ content: '❌ This server IP is already registered by someone else!', ephemeral: true })
      }

      bots[userId] = { name, ip, port, bot: null }
      await BotModel.findOneAndUpdate({ userId }, { userId, name, ip, port, owner: CORE_ID }, { upsert: true })
      interaction.reply({ content: `Registered! Name: ${name} | IP: ${ip} | Port: ${port}`, ephemeral: true })
      scheduleDashboardUpdate()
    }

    if (interaction.customId === 'staffConfigureModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      const name = interaction.fields.getTextInputValue('botName')
      const address = interaction.fields.getTextInputValue('botAddress')
      const [ip, portStr] = address.split(':')
      const port = parseInt(portStr)
      cleanupBot(targetId)
      bots[targetId] = { name, ip, port, bot: null }
      await BotModel.findOneAndUpdate({ userId: targetId }, { userId: targetId, name, ip, port }, { upsert: true })
      interaction.reply({ content: `✅ Configured bot for <@${targetId}>!`, ephemeral: true })
      scheduleDashboardUpdate()
    }

    if (interaction.customId === 'staffStartModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      const userBot = await BotModel.findOne({ userId: targetId })
      if (!userBot && !bots[targetId]) return interaction.reply({ content: '❌ No bot registered for that user!', ephemeral: true })
      if (!bots[targetId]) {
        bots[targetId] = { name: userBot.name, ip: userBot.ip, port: userBot.port, bot: null }
      }
      if (bots[targetId].bot) return interaction.reply({ content: '❌ Bot is already running!', ephemeral: true })
      startBot(targetId)
      interaction.reply({ content: `✅ Force started bot for <@${targetId}>!`, ephemeral: true })
    }

    if (interaction.customId === 'staffStopModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      if (!bots[targetId] || !bots[targetId].bot) return interaction.reply({ content: '❌ Bot is not running!', ephemeral: true })
      cleanupBot(targetId)
      interaction.reply({ content: `✅ Force stopped bot for <@${targetId}>!`, ephemeral: true })
      scheduleDashboardUpdate()
    }

    if (interaction.customId === 'staffDeleteModal') {
      const targetId = interaction.fields.getTextInputValue('targetUserId')
      const userBotDel = await BotModel.findOne({ userId: targetId })
      if (!userBotDel && !bots[targetId]) return interaction.reply({ content: '❌ No bot registered for that user!', ephemeral: true })
      cleanupBot(targetId)
      delete bots[targetId]
      await BotModel.deleteOne({ userId: targetId })
      interaction.reply({ content: `✅ Force deleted bot for <@${targetId}>!`, ephemeral: true })
      scheduleDashboardUpdate()
    }
  }
})

function cleanupBot(userId) {
  if (!bots[userId]) return
  const data = bots[userId]
  if (data.afkInterval) {
    clearInterval(data.afkInterval)
    data.afkInterval = null
  }
  if (data.bot) {
    data.bot.removeAllListeners()
    try { data.bot.quit() } catch {}
    data.bot = null
  }
}

function startBot(userId) {
  if (!bots[userId]) return
  cleanupBot(userId)
  const { name, ip, port } = bots[userId]
  const bot = mineflayer.createBot({
    host: ip,
    port: port,
    username: name,
    version: '1.20.1',
    auth: 'offline'
  })
  bots[userId].bot = bot
  bot.once('spawn', async () => {
    console.log(`${name} is online on Core ${CORE_ID}!`)
    scheduleDashboardUpdate()
    try {
      const alertChannel = client.channels.cache.get('1510334072533291089')
      if (alertChannel) {
        const isReconnect = bots[userId].hasConnectedBefore || false
        bots[userId].hasConnectedBefore = true
        const spawnEmbed = new EmbedBuilder()
          .setTitle(isReconnect ? '🟢 Bot Reconnected Successfully!' : '🟢 Bot Started Successfully!')
          .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Bot', value: name, inline: true },
            { name: 'Server', value: `${ip}:${port}`, inline: false }
          )
          .setColor(0x00FF00)
          .setFooter({ text: 'Drippy Core System' })
          .setTimestamp()
        await alertChannel.send({ embeds: [spawnEmbed] })
      }
    } catch {}
    setTimeout(() => {
      bot.chat('/register pass123 pass123')
      setTimeout(() => {
        bot.chat('/login pass123')
        setTimeout(() => {
          bots[userId].afkInterval = setInterval(() => {
            bot.setControlState('jump', true)
            setTimeout(() => bot.setControlState('jump', false), 500)
          }, 30000)
        }, 2000)
      }, 2000)
    }, 3000)
  })
  bot.on('kicked', async (reason) => {
    const cleanReason = typeof reason === 'string' ? reason : JSON.stringify(reason)
    console.log(`${name} got kicked: ${cleanReason}`)
    cleanupBot(userId)
    scheduleDashboardUpdate()
    // Only notify if kicked by server not by us
    const ignoredReasons = ['disconnect.quitting', 'disconnect.genericReason']
    const isOurFault = ignoredReasons.some(r => cleanReason.includes(r))
    if (!isOurFault) {
      try {
        const alertChannel = client.channels.cache.get('1510334072533291089')
        if (alertChannel) {
        const kickEmbed = new EmbedBuilder()
          .setTitle('🔴 Bot Kicked!')
          .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Bot', value: name, inline: true },
            { name: 'Server', value: `${ip}:${port}`, inline: false },
            { name: 'Reason', value: cleanReason, inline: false }
          )
          .setColor(0xFF0000)
          .setFooter({ text: 'Drippy Core System' })
          .setTimestamp()
        await alertChannel.send({ content: `<@${userId}>`, embeds: [kickEmbed] })
        }
      } catch {}
    }
    setTimeout(() => { if (bots[userId]) startBot(userId) }, 60000)
  })
  bot.on('error', () => {
    cleanupBot(userId)
    scheduleDashboardUpdate()
    setTimeout(() => { if (bots[userId]) startBot(userId) }, 60000)
  })
  bot.on('end', () => {
    cleanupBot(userId)
    scheduleDashboardUpdate()
    setTimeout(() => { if (bots[userId]) startBot(userId) }, 60000)
  })
}

client.login(process.env.TOKEN)
