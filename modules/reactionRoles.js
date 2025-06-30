const { Events, Partials } = require('discord.js');

// Bu fonksiyon, bir tepki eklendiğinde veya kaldırıldığında çalışır.
async function handleReaction(reaction, user, allSettings, isAdding) {
    // Botun kendi tepkilerini veya eksik veriyi yoksay
    if (user.bot) return;
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Tepki verisi çekilirken hata oluştu:', error);
            return;
        }
    }

    // Doğru sunucunun ayarlarına eriş
    const guildSettings = allSettings[reaction.message.guildId];
    if (!guildSettings) return;

    // Modülün ayarlarına eriş
    const rrSettings = guildSettings.reactionRoles;
    if (!rrSettings || !rrSettings.enabled || !rrSettings.messageId || !rrSettings.emoji || !rrSettings.roleId) {
        return;
    }

    // Sadece belirlenen mesaj ve emoji için işlem yap
    if (reaction.message.id === rrSettings.messageId && reaction.emoji.name === rrSettings.emoji) {
        try {
            const member = await reaction.message.guild.members.fetch(user.id);
            const role = await reaction.message.guild.roles.fetch(rrSettings.roleId);
            if (!member || !role) return;

            if (isAdding) {
                await member.roles.add(role);
                console.log(`[Reaction Roles] ${user.tag} kullanıcısına ${role.name} rolü verildi.`);
            } else {
                await member.roles.remove(role);
                console.log(`[Reaction Roles] ${user.tag} kullanıcısından ${role.name} rolü alındı.`);
            }
        } catch (error) {
            console.error("Rol ekleme/kaldırma hatası:", error);
        }
    }
}

module.exports = {
    name: 'reactionRoles',
    // Gerekli ayarlar
    getSettings: () => ({
        enabled: false,
        messageId: '',
        emoji: '',
        roleId: ''
    }),
    // Bot başlatıldığında olay dinleyicilerini kur
    init: (client, allSettings) => {
        client.on(Events.MessageReactionAdd, (reaction, user) => handleReaction(reaction, user, allSettings, true));
        client.on(Events.MessageReactionRemove, (reaction, user) => handleReaction(reaction, user, allSettings, false));
    }
};