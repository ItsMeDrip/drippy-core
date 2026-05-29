// ─── MESSAGE COMMANDS ─────────────────────────────────────────────
client.on('messageCreate', async (message) => {

  if (message.author.bot) return

  // USER PANEL
  if (message.content === '!panel') {

    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('register')
          .setLabel('Register')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('start')
          .setLabel('Start')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('stop')
          .setLabel('Stop')
          .setStyle(ButtonStyle.Danger)
      )

    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('status')
          .setLabel('Status')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('delete')
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger)
      )

    const embed = new EmbedBuilder()
      .setTitle('🔥 Drippy Core Panel')
      .setDescription(
        '**Keep your Aternos server online 24/7!**\n\n' +
        '• Register your bot\n' +
        '• Start/Stop bot anytime\n' +
        '• Auto reconnect enabled\n' +
        '• AFK jump system built-in\n'
      )
      .setColor(0x9B59B6)

    await message.channel.send({
      embeds: [embed],
      components: [row1, row2]
    })
  }

  // STAFF PANEL
  if (
    message.content === '!staffpanel' &&
    message.channel.id === ADMIN_CHANNEL_ID
  ) {

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('staff_start')
          .setLabel('Force Start')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('staff_stop')
          .setLabel('Force Stop')
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId('staff_delete')
          .setLabel('Force Delete')
          .setStyle(ButtonStyle.Secondary)
      )

    const embed = new EmbedBuilder()
      .setTitle('👮 Staff Panel')
      .setDescription('Manage registered bots')
      .setColor(0xFF0000)

    await message.channel.send({
      embeds: [embed],
      components: [row]
    })
  }
})

// ─── INTERACTIONS ─────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // BUTTONS
  if (interaction.isButton()) {

    const userId = interaction.user.id

    // REGISTER
    if (interaction.customId === 'register') {

      const modal = new ModalBuilder()
        .setCustomId('registerModal')
        .setTitle('Register Bot')

      modal.addComponents(

        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId('botName')
              .setLabel('Bot Username')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),

        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId('botIp')
              .setLabel('Server IP')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),

        new ActionRowBuilder()
          .addComponents(
            new TextInputBuilder()
              .setCustomId('botPort')
              .setLabel('Server Port')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
      )

      return interaction.showModal(modal)
    }

    // START
    if (interaction.customId === 'start') {

      if (!bots[userId]) {
        return interaction.reply({
          content: '❌ Register first!',
          ephemeral: true
        })
      }

      if (bots[userId].bot) {
        return interaction.reply({
          content: '⚠️ Bot already online!',
          ephemeral: true
        })
      }

      startBot(userId)

      return interaction.reply({
        content: '🚀 Starting bot...',
        ephemeral: true
      })
    }

    // STOP
    if (interaction.customId === 'stop') {

      if (!bots[userId] || !bots[userId].bot) {
        return interaction.reply({
          content: '❌ Bot not running!',
          ephemeral: true
        })
      }

      cleanupBot(userId)

      scheduleDashboardUpdate()

      return interaction.reply({
        content: '🛑 Bot stopped!',
        ephemeral: true
      })
    }

    // STATUS
    if (interaction.customId === 'status') {

      if (!bots[userId]) {
        return interaction.reply({
          content: '❌ No bot registered!',
          ephemeral: true
        })
      }

      const status =
        bots[userId].bot
          ? '🟢 Online'
          : '🔴 Offline'

      return interaction.reply({
        content: `📶 ${status}`,
        ephemeral: true
      })
    }

    // DELETE
    if (interaction.customId === 'delete') {

      if (!bots[userId]) {
        return interaction.reply({
          content: '❌ No bot registered!',
          ephemeral: true
        })
      }

      cleanupBot(userId)

      delete bots[userId]

      await BotModel.deleteOne({ userId })

      scheduleDashboardUpdate()

      return interaction.reply({
        content: '🗑️ Bot deleted!',
        ephemeral: true
      })
    }
  }

  // MODALS
  if (interaction.isModalSubmit()) {

    // REGISTER MODAL
    if (interaction.customId === 'registerModal') {

      const userId = interaction.user.id

      const name =
        interaction.fields.getTextInputValue('botName')

      const ip =
        interaction.fields.getTextInputValue('botIp')

      const port = parseInt(
        interaction.fields.getTextInputValue('botPort')
      )

      if (isNaN(port)) {
        return interaction.reply({
          content: '❌ Invalid port!',
          ephemeral: true
        })
      }

      const existing =
        await BotModel.findOne({ userId })

      if (existing) {
        return interaction.reply({
          content: '❌ You already registered a bot!',
          ephemeral: true
        })
      }

      bots[userId] = {
        name,
        ip,
        port,
        bot: null,
        afkInterval: null
      }

      await BotModel.findOneAndUpdate(
        { userId },
        {
          userId,
          name,
          ip,
          port
        },
        { upsert: true }
      )

      scheduleDashboardUpdate()

      return interaction.reply({
        content:
          `✅ Registered!\n` +
          `🤖 ${name}\n` +
          `🌐 ${ip}:${port}`,
        ephemeral: true
      })
    }
  }
})

// ─── CLEANUP BOT ──────────────────────────────────────────────────
function cleanupBot(userId) {

  if (!bots[userId]) return

  const data = bots[userId]

  // CLEAR AFK
  if (data.afkInterval) {
    clearInterval(data.afkInterval)
    data.afkInterval = null
  }

  // DESTROY BOT
  if (data.bot) {

    data.bot.removeAllListeners()

    try {
      data.bot.quit()
    } catch {}

    data.bot = null
  }
}

// ─── START BOT ────────────────────────────────────────────────────
function startBot(userId) {

  if (!bots[userId]) return

  cleanupBot(userId)

  const {
    name,
    ip,
    port
  } = bots[userId]

  const bot = mineflayer.createBot({
    host: ip,
    port: port,
    username: name,
    version: '1.20.1',
    auth: 'offline'
  })

  bots[userId].bot = bot

  let reconnecting = false

  // SPAWN
  bot.once('spawn', () => {

    console.log(`🟢 ${name} joined server`)

    scheduleDashboardUpdate()

    // AUTO LOGIN
    setTimeout(() => {

      bot.chat('/register pass123 pass123')

      setTimeout(() => {

        bot.chat('/login pass123')

        // AFK SYSTEM
        bots[userId].afkInterval =
          setInterval(() => {

            bot.setControlState('jump', true)

            setTimeout(() => {
              bot.setControlState('jump', false)
            }, 500)

          }, 30000)

      }, 2000)

    }, 3000)
  })

  // DISCONNECT
  const handleDisconnect = (reason) => {

    if (reconnecting) return

    reconnecting = true

    console.log(`🔴 ${name} disconnected:`)

    cleanupBot(userId)

    scheduleDashboardUpdate()

    setTimeout(() => {

      reconnecting = false

      if (bots[userId]) {
        startBot(userId)
      }

    }, 60000)
  }

  bot.on('kicked', reason => {
    handleDisconnect(reason)
  })

  bot.on('error', err => {
    handleDisconnect(err.message)
  })

  bot.on('end', () => {
    handleDisconnect('Connection ended')
  })
}
