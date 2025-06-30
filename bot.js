// ================== DEPENDENCIES ==================
const { Client, GatewayIntentBits, Collection, ChannelType, PermissionsBitField, Partials } = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

// ================== CONFIGURATION ==================
const BOT_TOKEN = '';
const CLIENT_ID = '';
const CLIENT_SECRET = '';
const APP_URL = 'http://localhost:3000'; // or your replit url
const port = 3000;
// =====================================================

// --- DATABASE SETUP ---
const dbFolderPath = path.join(__dirname, 'db');
const settingsPath = path.join(dbFolderPath, 'settings.json');
let serverSettings = {};

function saveSettingsToFile() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(serverSettings, null, 4));
    } catch (error) {
        console.error("Error saving settings:", error);
    }
}

function loadSettingsFromFile() {
    try {
        if (!fs.existsSync(dbFolderPath)) fs.mkdirSync(dbFolderPath);
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf-8');
            if (data) {
                serverSettings = JSON.parse(data);
                console.log("✅ Settings loaded from db/settings.json");
            }
        }
    } catch (error) {
        console.error("Error loading settings:", error);
        serverSettings = {};
    }
}
loadSettingsFromFile();

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// --- EXPRESS APP & ROUTING SETUP ---
const app = express();
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));

// --- PASSPORT AUTHENTICATION ---
app.use(session({
    secret: 'change this to a random secret key for security',
    resave: false,
    saveUninitialized: false,
}));
app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `${APP_URL}/auth/callback`,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

const checkAuth = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// --- CORE ROUTES ---
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', checkAuth, (req, res) => {
    res.render('index', { clientId: CLIENT_ID });
});

app.get('/auth/login', passport.authenticate('discord'));
app.get('/auth/callback', passport.authenticate('discord', { failureRedirect: '/login' }), (req, res) => res.redirect('/'));
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/login');
    });
});

// --- API ROUTES ---
app.get('/api/user/guilds', checkAuth, (req, res) => {
    const adminGuilds = req.user.guilds.filter(g => new PermissionsBitField(BigInt(g.permissions)).has('ManageGuild'));
    res.json(adminGuilds);
});

app.get('/api/bot/guilds', checkAuth, (req, res) => {
    const botGuilds = client.guilds.cache.map(g => g.id);
    res.json(botGuilds);
});

app.get('/api/settings', checkAuth, (req, res) => {
    const { guildId } = req.query;
    if (!guildId) return res.status(400).json({ error: 'Guild ID required.' });
    if (!serverSettings[guildId]) {
        serverSettings[guildId] = {};
        client.modules.forEach(module => {
            if (module.getSettings) serverSettings[guildId][module.name] = module.getSettings();
        });
    }
    res.json(serverSettings[guildId]);
});

app.post('/api/settings', checkAuth, (req, res) => {
    const { guildId, module: moduleName, newSettings } = req.body;
    if (!guildId || !moduleName || !newSettings) return res.status(400).json({ error: 'Invalid request.' });
    if (!serverSettings[guildId]) serverSettings[guildId] = {};
    if (!serverSettings[guildId][moduleName]) serverSettings[guildId][moduleName] = {};
    Object.assign(serverSettings[guildId][moduleName], newSettings);
    saveSettingsToFile();
    res.json({ success: true });
});

app.get('/api/guild/:guildId/channels', checkAuth, async (req, res) => {
    try {
        const guild = await client.guilds.fetch(req.params.guildId);
        const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
        res.json(channels);
    } catch (e) { res.status(500).json({ error: 'Could not fetch channels.' }); }
});

app.get('/api/guild/:guildId/roles', checkAuth, async (req, res) => {
    try {
        const guild = await client.guilds.fetch(req.params.guildId);
        const roles = guild.roles.cache.filter(r => r.name !== '@everyone' && !r.managed).map(r => ({ id: r.id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
        res.json(roles);
    } catch (e) { res.status(500).json({ error: 'Could not fetch roles.' }); }
});

app.post('/api/react', checkAuth, async (req, res) => {
    const { guildId, channelId, messageId, emoji } = req.body;
    if (!guildId || !channelId || !messageId || !emoji) {
        return res.status(400).json({ success: false, message: "Missing required information." });
    }
    try {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);
        await message.react(emoji);
        res.json({ success: true, message: "Reaction added successfully!" });
    } catch (error) {
        console.error("Auto-react failed:", error.message);
        let userErrorMessage = "Failed to add reaction.";
        if (error.code === 10008) userErrorMessage = "Message not found. Check Message ID and Channel.";
        else if (error.code === 10014) userErrorMessage = "Unknown Emoji. Is it a custom emoji the bot can't access?";
        else if (error.code === 50013) userErrorMessage = "Missing Permissions. The bot needs 'Add Reactions' and 'Read Message History' permissions.";
        res.status(500).json({ success: false, message: userErrorMessage });
    }
});

// --- MODULE LOADING & BOT STARTUP ---
const modulesPath = path.join(__dirname, 'modules');
client.modules = new Collection();
const moduleFiles = fs.readdirSync(modulesPath).filter(file => file.endsWith('.js'));
for (const file of moduleFiles) {
    const module = require(path.join(modulesPath, file));
    client.modules.set(module.name, module);
}

client.once('ready', () => {
    console.log(`🚀 Bot is online! Logged in as ${client.user.tag}`);
    client.modules.forEach(module => {
        if (module.init) module.init(client, serverSettings);
    });
});

const start = async () => {
    try {
        await client.login(BOT_TOKEN);
        app.listen(port, () => console.log(`🌐 Web Dashboard running at ${APP_URL}`));
    } catch (error) {
        console.error("❌ Failed to start bot:", error);
    }
};
start();