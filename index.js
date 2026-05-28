const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js')
const mineflayer = require('mineflayer')
const http = require('http')

http.createServer((req, res) => {
  res.write('Drippy Core is alive! 🔥')
  res.end()
}).listen(3000)

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
})

const bots = {}

client.on('ready', () => {
  console.log(`Drippy Core is online as ${client.user.tag}!`)
})

client.on('messageCreate', async (message) => {
  if (message.content === '!panel') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('register').setLabel('Register').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('start').setLabel('Start Bot').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('status').setLabel('Status').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('Stop Bot').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('delete').setLabel('Delete').setStyle(ButtonStyle.Danger)
    )
    const embed = new EmbedBuilder()
      .setTitle('Drippy Core Control Panel 🔥')
      .setDescription('Use the buttons below to manage your Minecraft bot!')
      .setColor(0x9B59B6)
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
      interaction.reply({ content: 'Bot deleted! You can register again.', ephemeral: true })
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'registerModal') {
    const userId = interaction.user.id
    const name = interaction.fields.getTextInputValue('botName')
    const ip = interaction.fields.getTextInputValue('botIp')
    const port = parseInt(interaction.fields.getTextInputValue('botPort'))
    bots[userId] = { name, ip, port, bot: null }
    interaction.reply({ content: `Registered! Name: ${name} | IP: ${ip} | Port: ${port}`, ephemeral: true })
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
  bot.on('kicked', () => { bots[userId].bot = null })
  bot.on('error', () => { bots[userId].bot = null })
  bot.on('end', () => { bots[userId].bot = null })
}

client.login(process.env.TOKEN)
