document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const modal = document.getElementById('server-select-modal');
    const serverListContainer = document.getElementById('server-list');
    const mainContent = document.querySelector('.main-content');
    const currentServerIcon = document.getElementById('current-server-icon');
    const currentServerName = document.getElementById('current-server-name');
    const logoutBtn = document.getElementById('logout-btn');
    const addServerBtn = document.getElementById('add-server-btn');

    // --- State ---
    let selectedGuildId = null;
    let guildData = { channels: [], roles: [] };

    // --- Safety Check ---
    if (!modal || !serverListContainer || !mainContent || !logoutBtn || !addServerBtn || !currentServerIcon || !currentServerName) {
        console.error("CRITICAL ERROR: One or more essential dashboard elements could not be found. Please check your index.ejs file's element IDs.");
        return;
    }

    // --- Core Functions ---
    const showServerSelector = async () => {
        try {
            const [userGuildsRes, botGuildsRes] = await Promise.all([fetch('/api/user/guilds'), fetch('/api/bot/guilds')]);
            if (!userGuildsRes.ok || !botGuildsRes.ok) throw new Error('Failed to fetch server lists.');
            const userGuilds = await userGuildsRes.json();
            const botGuildIds = await botGuildsRes.json();
            serverListContainer.innerHTML = '';
            userGuilds.forEach(guild => {
                const icon = guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
                const card = document.createElement('div');
                card.className = 'server-card';
                card.dataset.guildId = guild.id; card.dataset.guildName = guild.name; card.dataset.guildIcon = icon;
                const isBotInGuild = botGuildIds.includes(guild.id);
                if (isBotInGuild) {
                    card.innerHTML = `<img class="server-icon" src="${icon}" alt="icon"><span class="server-name">${guild.name}</span>`;
                } else {
                    card.classList.add('not-in-server');
                    card.innerHTML = `<img class="server-icon" src="${icon}" alt="icon"><div class="server-info-with-warning"><span class="server-name">${guild.name}</span><span class="warning-text"><i class="fa-solid fa-triangle-exclamation"></i> Bot not in server. Click to add.</span></div>`;
                }
                serverListContainer.appendChild(card);
            });
            modal.style.display = 'flex';
        } catch (error) {
            console.error('Failed to show server selector:', error);
        }
    };

    const loadDashboardForGuild = async (guildId) => {
        try {
            const [settingsRes, channelsRes, rolesRes] = await Promise.all([
                fetch(`/api/settings?guildId=${guildId}`),
                fetch(`/api/guild/${guildId}/channels`),
                fetch(`/api/guild/${guildId}/roles`)
            ]);
            guildData.settings = await settingsRes.json();
            guildData.channels = await channelsRes.json();
            guildData.roles = await rolesRes.json();
            updateDashboardUI();
        } catch (error) {
            console.error("Failed to load dashboard data:", error);
        }
    };

    const populateSelect = (select, items, selectedId) => {
        select.innerHTML = '<option value="">Select an option...</option>';
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                const option = new Option(item.name, item.id);
                option.selected = item.id === selectedId;
                select.add(option);
            });
        }
    };

    function renderProtectedChannelsList(allChannels, protectedIds = []) {
        const listContainer = document.getElementById('protected-channels-list');
        const selectDropdown = document.getElementById('channel-to-protect-select');
        if (!listContainer || !selectDropdown) return;
        listContainer.innerHTML = '';
        if (!Array.isArray(protectedIds)) protectedIds = [];
        populateSelect(selectDropdown, allChannels);
        Array.from(selectDropdown.options).forEach(opt => { opt.disabled = protectedIds.includes(opt.value); });
        protectedIds.forEach(id => {
            const channel = allChannels.find(c => c.id === id);
            if (channel) {
                const item = document.createElement('div');
                item.className = 'protected-item';
                item.innerHTML = `<span>#${channel.name}</span><button type="button" class="remove-item-btn" data-id="${id}">&times;</button>`;
                listContainer.appendChild(item);
            }
        });
    }

    const updateDashboardUI = () => {
        const { settings, channels, roles } = guildData;
        document.querySelectorAll('.plugin-card').forEach(card => {
            const moduleName = card.dataset.module;
            const moduleSettings = settings[moduleName];
            if (!moduleSettings) return;
            card.querySelectorAll('[data-setting]').forEach(input => {
                const settingName = input.dataset.setting;
                const savedValue = moduleSettings[settingName] ?? (input.type === 'checkbox' ? false : '');
                if (input.type === 'checkbox') {
                    input.checked = savedValue;
                    const container = input.closest('.plugin-card, .sub-plugin');
                    if (container) container.classList.toggle('enabled', savedValue);
                } else if (input.tagName.toLowerCase() === 'select') {
                    const isRoleSelect = settingName.toLowerCase().includes('role');
                    populateSelect(input, isRoleSelect ? roles : channels, savedValue);
                } else {
                    input.value = savedValue;
                }
            });
        });
        if (settings.moderation) {
            renderProtectedChannelsList(guildData.channels, settings.moderation.protectedChannelIds);
        }
    };

    async function handleSave(button) {
        const card = button.closest('.plugin-card');
        if (!card) return;
        const moduleName = card.dataset.module;
        const settings = {};
        card.querySelectorAll('[data-setting]').forEach(input => {
            settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : input.value;
        });
        if (moduleName === 'moderation') {
            settings.protectedChannelIds = Array.from(document.querySelectorAll('#protected-channels-list .remove-item-btn')).map(btn => btn.dataset.id);
        }
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId: selectedGuildId, module: moduleName, newSettings: settings }),
        });
        alert(`${moduleName} settings saved successfully!`);
        if (moduleName === 'reactionRoles' && settings.enabled) {
            if (!settings.channelId || !settings.messageId || !settings.emoji) {
                alert("To add the reaction, please select a channel, and enter a message ID and emoji.");
                return;
            }
            try {
                const res = await fetch('/api/react', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        guildId: selectedGuildId,
                        channelId: settings.channelId,
                        messageId: settings.messageId,
                        emoji: settings.emoji
                    })
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.message || 'An unknown error occurred.');
                alert('Bot successfully added the reaction to your message!');
            } catch (error) {
                console.error("Auto-react request failed:", error);
                alert(`Could not add reaction: ${error.message}`);
            }
        }
    }

    // --- Event Listeners ---
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('.server-card')) {
            const card = target.closest('.server-card');
            if (card.classList.contains('not-in-server')) {
                const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${card.dataset.guildId}&disable_guild_select=true`;
                window.open(inviteUrl, '_blank');
                alert("Please authorize the bot, then refresh this page to manage the server.");
                return;
            }
            selectedGuildId = card.dataset.guildId;
            currentServerIcon.src = card.dataset.guildIcon;
            currentServerName.textContent = card.dataset.guildName;
            modal.style.display = 'none';
            mainContent.style.display = 'block';
            loadDashboardForGuild(selectedGuildId);
        }
        else if (target.id === 'add-protected-channel-btn') {
            const select = document.getElementById('channel-to-protect-select');
            const list = document.getElementById('protected-channels-list');
            const idToAdd = select.value;
            if (!idToAdd || list.querySelector(`.remove-item-btn[data-id="${idToAdd}"]`)) return;
            const name = select.options[select.selectedIndex].text;
            const listItem = document.createElement('div');
            listItem.className = 'protected-item';
            listItem.innerHTML = `<span>#${name}</span><button type="button" class="remove-item-btn" data-id="${idToAdd}">&times;</button>`;
            list.appendChild(listItem);
            select.options[select.selectedIndex].disabled = true;
            select.selectedIndex = 0;
        }
        else if (target.classList.contains('remove-item-btn')) {
            const idToRemove = target.dataset.id;
            const list = target.closest('.protected-list');
            let select;
            if (list.id === 'protected-channels-list') {
                select = document.getElementById('channel-to-protect-select');
            }
            if (select) {
                const optionToEnable = select.querySelector(`option[value="${idToRemove}"]`);
                if (optionToEnable) optionToEnable.disabled = false;
            }
            target.parentElement.remove();
        }
        else if (target.classList.contains('save-button')) {
            handleSave(target);
        }
        else if (target.id === 'logout-btn' || target.closest('#logout-btn')) {
            window.location.href = '/auth/logout';
        }
        else if (target.id === 'add-server-btn' || target.closest('#add-server-btn')) {
            const redirectUri = encodeURIComponent(window.location.origin);
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands&redirect_uri=${redirectUri}&response_type=code`;
            window.open(inviteUrl, '_blank');
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('enable-toggle')) {
            const container = e.target.closest('.plugin-card, .sub-plugin');
            if (container) container.classList.toggle('enabled', e.target.checked);
        }
    });

    // --- Initial Load ---
    mainContent.style.display = 'none';
    showServerSelector();
});