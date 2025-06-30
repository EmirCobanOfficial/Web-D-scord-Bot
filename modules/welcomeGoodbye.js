const { Events } = require('discord.js');

module.exports = {
    name: 'welcomeGoodbye',
    // Varsayılan ayarları güncelleyerek mesaj kutularını dolduruyoruz
    getSettings: () => ({
        welcomeEnabled: false,
        welcomeChannelId: '',
        welcomeMessage: "Sunucumuza hoş geldin, {user}! Seni aramızda görmek çok güzel.", // Varsayılan hoş geldin mesajı
        goodbyeEnabled: false,
        goodbyeChannelId: '',
        goodbyeMessage: "**{user_tag}** aramızdan ayrıldı. Görüşmek üzere!" // Varsayılan güle güle mesajı
    }),
    init: (client, allSettings) => {
        // Yeni üye katıldığında...
        client.on(Events.GuildMemberAdd, (member) => {
            const settings = allSettings[member.guild.id]?.welcomeGoodbye;
            if (!settings || !settings.welcomeEnabled || !settings.welcomeChannelId) return;

            const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
            if (!channel) return;

            const message = settings.welcomeMessage.replace('{user}', member.toString());
            channel.send(message);
        });

        // Üye ayrıldığında...
        client.on(Events.GuildMemberRemove, (member) => {
            const settings = allSettings[member.guild.id]?.welcomeGoodbye;
            if (!settings || !settings.goodbyeEnabled || !settings.goodbyeChannelId) return;

            const channel = member.guild.channels.cache.get(settings.goodbyeChannelId);
            if (!channel) return;

            const message = settings.goodbyeMessage
                .replace('{user_tag}', member.user.tag)
                .replace('{user_name}', member.user.username);

            channel.send(message);
        });
    }
};