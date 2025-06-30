const { Events, EmbedBuilder, AuditLogEvent, PermissionsBitField } = require('discord.js');

const processing = new Set();

module.exports = {
    name: 'moderation',
    getSettings: () => ({
        enabled: false,
        logChannelId: '',
        protectedChannelIds: [], // Sadece korumalı kanal ayarı kaldı
    }),
    init: (client, allSettings) => {

        // Mesaj Silme Logu
        client.on(Events.MessageDelete, async (message) => {
            if (message.author?.bot) return;
            const settings = allSettings[message.guild.id]?.moderation;
            if (!settings || !settings.enabled || !settings.logChannelId) return;

            const logChannel = await client.channels.fetch(settings.logChannelId).catch(() => null);
            if (!logChannel) return;

            const fetchedLogs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
            const deleteLog = fetchedLogs.entries.first();

            const embed = new EmbedBuilder()
                .setColor(0xFF474D) // Red
                .setTitle('Message Deleted')
                .addFields(
                    { name: 'Author', value: message.author?.tag || 'Unknown', inline: true },
                    { name: 'Channel', value: `<#${message.channel.id}>`, inline: true }
                )
                .setTimestamp();

            if (message.content) {
                embed.setDescription(message.content.slice(0, 4096));
            } else {
                embed.setDescription("*Message did not contain text (it might have been an image or embed).*");
            }

            if (deleteLog) {
                const { executor, target } = deleteLog;
                if (target.id === message.author.id) {
                    embed.addFields({ name: 'Deleted By', value: executor.tag, inline: true });
                }
            }
            logChannel.send({ embeds: [embed] });
        });

        // Kanal Silme Koruması
        client.on(Events.ChannelDelete, async (channel) => {
            const settings = allSettings[channel.guild.id]?.moderation;
            if (!settings || !settings.enabled || !settings.logChannelId || !settings.protectedChannelIds?.includes(channel.id)) return;

            if (processing.has(`ch-${channel.id}`)) return;
            processing.add(`ch-${channel.id}`);

            const cleanup = () => setTimeout(() => processing.delete(`ch-${channel.id}`), 3000);

            const logChannel = await client.channels.fetch(settings.logChannelId).catch(() => null);
            if (!logChannel) return cleanup();

            const fetchedLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete });
            const deleteLog = fetchedLogs.entries.first();
            if (!deleteLog) return cleanup();

            const { executor } = deleteLog;
            const member = await channel.guild.members.fetch(executor.id).catch(() => null);

            const isOwner = executor.id === channel.guild.ownerId;
            const isAdmin = member && member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (isOwner || isAdmin) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`Protected Channel Deleted by Admin/Owner`)
                    .setDescription(`An authorized user, **${executor.tag}**, deleted the protected channel \`${channel.name}\`. No action taken.`)
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] });
                return cleanup();
            }

            await channel.clone({ name: channel.name }).catch(console.error);

            let punishmentLog = "The user was punished.";
            if (member) {
                if (member.manageable) {
                    await member.roles.set([], `Unauthorized deletion of protected channel: #${channel.name}`).catch(console.error);
                    if (member.kickable) {
                        await member.kick(`Unauthorized deletion of protected channel: #${channel.name}`).catch(console.error);
                    } else {
                        punishmentLog = "User's roles were removed, but they could not be kicked.";
                    }
                } else {
                    punishmentLog = `⚠️ **Punishment Failed:** Could not manage user ${member.user.tag}. **Bot's role must be higher.**`;
                }
            } else {
                punishmentLog = "Could not fetch the member to punish them.";
            }

            const embed = new EmbedBuilder()
                .setColor(0xDC143C)
                .setTitle('🚨 PROTECTED CHANNEL ALERT 🚨')
                .setDescription(`User **${executor.tag}** performed an unauthorized action.`)
                .addFields(
                    { name: 'Deleted Channel', value: `\`#${channel.name}\``, inline: false },
                    { name: 'Bot Response', value: `Channel was restored. ${punishmentLog}`, inline: false }
                )
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });

            cleanup();
        });

        // ROL SİLME KORUMASI İLE İLGİLİ HER ŞEY SİLİNDİ.
    }
};