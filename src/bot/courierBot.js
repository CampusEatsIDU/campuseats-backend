/**
 * CampusEats Courier Telegram Bot
 * Full implementation with inline keyboards ONLY (no reply keyboards)
 * Features: Login, Online/Offline, Order State Machine, SLA, Rating, SOS, Cash
 */

const TelegramBot = require('node-telegram-bot-api');
const courierService = require('../services/courier.service');
const pool = require('../config/db');

// ──────────────────────────────────────────────
// BOT INITIALIZATION
// ──────────────────────────────────────────────
const token = process.env.COURIER_BOT_TOKEN || '8712157596:AAFQLeLB8dwf0Gz7kP69ocxyiiYwX2SMaQQ';
const CASH_LIMIT = parseInt(process.env.COURIER_CASH_LIMIT || '500000');
const COURIER_EARNINGS = parseInt(process.env.COURIER_EARNINGS_PER_ORDER || '15000');

// Detect environment: use webhook on Vercel/production, polling locally
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const WEBHOOK_URL = process.env.WEBHOOK_URL; // e.g. https://your-app.vercel.app

let bot;
if (token && token.includes(':')) {
    if (IS_PRODUCTION && WEBHOOK_URL) {
        // Webhook mode — works on Vercel / any serverless platform
        bot = new TelegramBot(token, { webHook: false });
        bot.setWebHook(`${WEBHOOK_URL}/api/courier-bot/webhook`)
            .then(() => console.log('[CourierBot] Webhook set:', `${WEBHOOK_URL}/api/courier-bot/webhook`))
            .catch(err => console.error('[CourierBot] Webhook set failed:', err.message));
        console.log('[CourierBot] Started in WEBHOOK mode');
    } else {
        // Polling mode — works locally
        bot = new TelegramBot(token, { polling: true });
        console.log('[CourierBot] Started in POLLING mode (local dev)');
    }
} else {
    console.warn('[CourierBot] No valid COURIER_BOT_TOKEN. Bot is disabled.');
    // Mock bot to avoid crashes
    bot = {
        sendMessage: () => Promise.resolve({}),
        editMessageText: () => Promise.resolve({}),
        answerCallbackQuery: () => Promise.resolve({}),
        deleteMessage: () => Promise.resolve({}),
        processUpdate: () => { },
        on: () => { },
        onText: () => { },
    };
}

// ──────────────────────────────────────────────
// SESSION MANAGEMENT (stateless via DB)
// ──────────────────────────────────────────────

async function getSession(chatId) {
    const s = await courierService.getBotSession(chatId);
    return s || { chat_id: chatId, step: null, data: {} };
}

async function setSessionStep(chatId, step, data = {}) {
    await courierService.upsertBotSession(chatId, step, data);
}

async function clearSession(chatId) {
    await courierService.clearBotSession(chatId);
}

// ──────────────────────────────────────────────
// KEYBOARD BUILDERS
// ──────────────────────────────────────────────
const buildMainMenuKeyboard = (courier) => ({
    inline_keyboard: [
        [
            {
                text: courier.is_online ? '🔴 Go Offline' : '🟢 Go Online',
                callback_data: courier.is_online ? 'go_offline' : 'go_online'
            },
            { text: '📦 Active Order', callback_data: 'active_order' }
        ],
        [
            { text: '📊 My Stats', callback_data: 'my_stats' },
            { text: '💰 Cash On Hand', callback_data: 'cash_info' }
        ],
        [
            { text: '🏦 Submit Cash', callback_data: 'submit_cash' },
            { text: '👤 Profile', callback_data: 'my_profile' }
        ],
        [
            { text: '🚨 SOS Emergency', callback_data: 'sos_menu' }
        ]
    ]
});

const buildOrderActionsKeyboard = (order) => {
    const buttons = [];
    const ds = order.delivery_status;

    if (ds === 'accepted') {
        buttons.push([{ text: '📍 Picked Up from Restaurant', callback_data: `status_picked_up_${order.id}` }]);
    }
    if (ds === 'picked_up') {
        buttons.push([{ text: '🚗 On the Way to Client', callback_data: `status_on_way_${order.id}` }]);
    }
    if (ds === 'on_way') {
        if (order.payment_method === 'cash' && order.payment_status !== 'paid') {
            buttons.push([{ text: '💵 Cash Received from Client', callback_data: `cash_recv_${order.id}_${order.total_price}` }]);
        }
        buttons.push([{ text: '✅ Order Delivered', callback_data: `status_delivered_${order.id}` }]);
    }
    buttons.push([{ text: '🚨 SOS - Need Help', callback_data: `sos_order_${order.id}` }]);
    buttons.push([{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]);

    return { inline_keyboard: buttons };
};

const buildSOSKeyboard = (orderId = 'none') => ({
    inline_keyboard: [
        [{ text: '📵 Client Not Responding', callback_data: `sos_reason_${orderId}_client_unresponsive` }],
        [{ text: '📍 Wrong Address', callback_data: `sos_reason_${orderId}_wrong_address` }],
        [{ text: '🚗 Accident / Vehicle Issue', callback_data: `sos_reason_${orderId}_accident` }],
        [{ text: '❌ Cancel Order', callback_data: `sos_reason_${orderId}_cancel_order` }],
        [{ text: '🆘 Other Emergency', callback_data: `sos_reason_${orderId}_other` }],
        [{ text: '🔙 Back', callback_data: 'main_menu' }]
    ]
});

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
async function sendMainMenu(chatId, messageId = null) {
    try {
        const courier = await courierService.getCourierByTelegramId(chatId);
        if (!courier) return;

        const statusEmoji = courier.is_online ? '🟢' : '🔴';
        const cashStr = Number(courier.cash_on_hand || 0).toLocaleString('uz-UZ');

        const text = [
            `🏠 *CampusEats Courier Dashboard*`,
            ``,
            `👤 ${courier.full_name || courier.phone}`,
            `📱 ${courier.phone}`,
            `${statusEmoji} Status: *${courier.is_online ? 'ONLINE' : 'OFFLINE'}*`,
            `⭐ Rating: *${Number(courier.rating || 5).toFixed(1)}* (${courier.total_ratings || 0} reviews)`,
            `✅ Completed: *${courier.completed_orders || 0}* orders`,
            `💵 Cash on hand: *${cashStr} UZS*`,
        ].join('\n');

        const opts = {
            parse_mode: 'Markdown',
            reply_markup: buildMainMenuKeyboard(courier)
        };

        if (messageId) {
            await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }).catch(() => { });
        } else {
            await bot.sendMessage(chatId, text, opts);
        }
    } catch (err) {
        console.error('[sendMainMenu]', err.message);
    }
}

function formatOrderCard(order, courierEarnings = COURIER_EARNINGS) {
    const paymentIcon = order.payment_method === 'cash' ? '💵 Cash' : '🏦 Bank Transfer';
    const slaMin = 35;
    const earnStr = Number(courierEarnings).toLocaleString('uz-UZ');
    const totalStr = Number(order.total_price || 0).toLocaleString('uz-UZ');
    const addr = order.delivery_address || 'N/A';

    return [
        `📦 *New Order #${order.id}*`,
        ``,
        `🍽 Restaurant: *${order.restaurant_name || `ID: ${order.restaurant_id}`}*`,
        `👤 Client: *${order.client_name || order.user_phone || 'Unknown'}*`,
        `📍 Delivery: ${addr}`,
        `💰 Total: *${totalStr} UZS*`,
        `💳 Payment: ${paymentIcon}`,
        `🚴 Courier Earnings: *${earnStr} UZS*`,
        `⏱ SLA: *${slaMin} minutes*`,
    ].join('\n');
}

// ──────────────────────────────────────────────
// /start HANDLER
// ──────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const courier = await courierService.getCourierByTelegramId(chatId);
        if (courier) {
            if (courier.status === 'blocked') {
                return bot.sendMessage(chatId, '🚫 Your account has been *blocked*.\nContact SuperAdmin for assistance.', { parse_mode: 'Markdown' });
            }
            await clearSession(chatId);
            return sendMainMenu(chatId);
        }

        // Not registered — start login
        await clearSession(chatId);
        await setSessionStep(chatId, 'awaiting_phone');

        bot.sendMessage(chatId, [
            `👋 *Welcome to CampusEats Courier Bot!*`,
            ``,
            `Please enter your *phone number* to login:`,
            `(Example: +998901234567)`,
        ].join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('[/start]', err.message);
        bot.sendMessage(chatId, '❌ Server error. Please try again later.');
    }
});

// ──────────────────────────────────────────────
// TEXT MESSAGE HANDLER (login flow + submit cash amount)
// ──────────────────────────────────────────────
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text || msg.text.startsWith('/')) return;

    try {
        const courier = await courierService.getCourierByTelegramId(chatId);
        const s = await getSession(chatId);

        if (courier) {
            // Already logged in — handle submit cash amount input
            if (s.step === 'awaiting_amount') {
                const amount = parseFloat(msg.text.replace(/[^\d.]/g, ''));
                if (isNaN(amount) || amount <= 0) {
                    return bot.sendMessage(chatId, '❌ Invalid amount. Please enter a positive number:');
                }
                if (amount > Number(courier.cash_on_hand)) {
                    return bot.sendMessage(chatId, `❌ You only have *${Number(courier.cash_on_hand).toLocaleString('uz-UZ')} UZS* on hand.`, { parse_mode: 'Markdown' });
                }

                const res = await courierService.submitCash(courier.id, amount);
                await clearSession(chatId);

                if (res.success) {
                    await bot.sendMessage(chatId, [
                        `✅ *Cash Submission Request Sent!*`,
                        ``,
                        `Amount: *${amount.toLocaleString('uz-UZ')} UZS*`,
                        `Status: Pending admin confirmation`,
                    ].join('\n'), { parse_mode: 'Markdown' });
                    // Notify superadmin
                    await notifySuperAdminCashSubmit(courier, amount);
                } else {
                    await bot.sendMessage(chatId, `❌ Failed: ${res.message}`);
                }
                return sendMainMenu(chatId);
            }
            return; // ignore other messages when logged in
        }

        // Login flow
        if (s.step === 'awaiting_phone') {
            const phone = msg.text.trim();
            await setSessionStep(chatId, 'awaiting_password', { phone });
            return bot.sendMessage(chatId, '🔑 Now enter your *password*:', { parse_mode: 'Markdown' });
        }

        if (s.step === 'awaiting_password') {
            const pw = msg.text.trim();
            const phone = s.data?.phone;

            // Delete the password message for security
            bot.deleteMessage(chatId, msg.message_id).catch(() => { });

            if (!phone) {
                await setSessionStep(chatId, 'awaiting_phone');
                return bot.sendMessage(chatId, '❌ Error: Phone not found. Please enter phone again:');
            }

            const res = await courierService.login(phone, pw, chatId);
            if (res.success) {
                await clearSession(chatId);
                await bot.sendMessage(chatId, `✅ *Login successful!*\nWelcome, ${res.courier.phone}!`, { parse_mode: 'Markdown' });
                return sendMainMenu(chatId);
            } else {
                await setSessionStep(chatId, 'awaiting_phone');
                return bot.sendMessage(chatId, `❌ *Login failed:* ${res.message}\n\nPlease enter your phone number again:`, { parse_mode: 'Markdown' });
            }
        }
    } catch (err) {
        console.error('[message handler]', err.message);
    }
});

// ──────────────────────────────────────────────
// CALLBACK QUERY HANDLER
// ──────────────────────────────────────────────
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
        const courier = await courierService.getCourierByTelegramId(chatId);

        // Rating handler (no auth needed — customer rates courier)
        if (data.startsWith('rate_')) {
            return handleRating(query, data);
        }

        if (!courier) {
            return bot.answerCallbackQuery(query.id, { text: '❌ Please /start and login first.', show_alert: true });
        }
        if (courier.status === 'blocked') {
            return bot.answerCallbackQuery(query.id, { text: '🚫 Your account is blocked.', show_alert: true });
        }

        await bot.answerCallbackQuery(query.id); // acknowledge to remove loading

        // ── MAIN MENU ──
        if (data === 'main_menu') {
            return sendMainMenu(chatId, messageId);
        }

        // ── ONLINE/OFFLINE ──
        if (data === 'go_online') {
            if (Number(courier.cash_on_hand) >= CASH_LIMIT) {
                return bot.answerCallbackQuery(query.id, {
                    text: `⚠️ Cash limit exceeded (${Number(courier.cash_on_hand).toLocaleString('uz-UZ')} UZS). Submit cash first!`,
                    show_alert: true
                });
            }
            await courierService.setOnline(courier.id, true);
            return sendMainMenu(chatId, messageId);
        }

        if (data === 'go_offline') {
            await courierService.setOnline(courier.id, false);
            return sendMainMenu(chatId, messageId);
        }

        // ── ACTIVE ORDER ──
        if (data === 'active_order') {
            const order = await courierService.getActiveOrder(courier.id);
            if (!order) {
                await bot.answerCallbackQuery(query.id, { text: '📭 No active orders right now.', show_alert: false });
                return sendMainMenu(chatId, messageId);
            }

            const slaLeft = order.sla_delivery_deadline
                ? Math.max(0, Math.round((new Date(order.sla_delivery_deadline) - Date.now()) / 60000))
                : null;

            const payStr = order.payment_method === 'cash' ? `💵 Cash (${order.payment_status === 'paid' ? '✅ Paid' : '⏳ Unpaid'})` : '🏦 Bank Transfer';
            const totalStr = Number(order.total_price || 0).toLocaleString('uz-UZ');
            const slaStr = slaLeft !== null ? `⏱ SLA Remaining: *${slaLeft} min*${slaLeft <= 5 ? ' ⚠️' : ''}` : '';

            const text = [
                `📦 *Active Order #${order.id}*`,
                ``,
                `📍 Delivery: ${order.delivery_address || 'N/A'}`,
                `💰 Total: *${totalStr} UZS*`,
                `💳 Payment: ${payStr}`,
                `📊 Status: *${order.delivery_status}*`,
                slaStr,
            ].filter(Boolean).join('\n');

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: buildOrderActionsKeyboard(order)
            }).catch(() => {
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: buildOrderActionsKeyboard(order) });
            });
        }

        // ── MY STATS ──
        if (data === 'my_stats') {
            const stats = await courierService.getCourierStats(courier.id);
            const earningsStr = Number(stats.total_earnings || 0).toLocaleString('uz-UZ');
            const cashStr = Number(stats.cash_on_hand || 0).toLocaleString('uz-UZ');

            const text = [
                `📊 *My Statistics*`,
                ``,
                `⭐ Rating: *${Number(stats.rating || 5).toFixed(2)}* (${stats.total_ratings || 0} reviews)`,
                `✅ Completed Orders: *${stats.completed_orders || 0}*`,
                `💰 Total Earnings: *${earningsStr} UZS*`,
                `💵 Cash on Hand: *${cashStr} UZS*`,
                ``,
                `📅 Member since: ${new Date(stats.created_at).toLocaleDateString('en-GB')}`,
            ].join('\n');

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]] }
            }).catch(() => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }));
        }

        // ── CASH INFO ──
        if (data === 'cash_info') {
            const cashStr = Number(courier.cash_on_hand || 0).toLocaleString('uz-UZ');
            const limitStr = CASH_LIMIT.toLocaleString('uz-UZ');
            const pct = Math.min(100, Math.round((Number(courier.cash_on_hand) / CASH_LIMIT) * 100));
            const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

            const text = [
                `💵 *Cash on Hand*`,
                ``,
                `Current: *${cashStr} UZS*`,
                `Limit: *${limitStr} UZS*`,
                ``,
                `[${bar}] ${pct}%`,
                pct >= 80 ? `\n⚠️ *Warning: Near limit! Submit cash soon.*` : '',
            ].join('\n');

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🏦 Submit Cash', callback_data: 'submit_cash' }],
                        [{ text: '🔙 Back', callback_data: 'main_menu' }]
                    ]
                }
            }).catch(() => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }));
        }

        // ── SUBMIT CASH ──
        if (data === 'submit_cash') {
            if (Number(courier.cash_on_hand) <= 0) {
                return bot.editMessageText('💵 You have no cash to submit.', {
                    chat_id: chatId, message_id: messageId,
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]] }
                }).catch(() => { });
            }
            await setSessionStep(chatId, 'awaiting_amount');
            return bot.editMessageText(
                `🏦 *Submit Cash to Admin*\n\nCurrent balance: *${Number(courier.cash_on_hand).toLocaleString('uz-UZ')} UZS*\n\nEnter the amount to submit (type number):`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            ).catch(() => bot.sendMessage(chatId, `Enter the amount to submit:`));
        }

        // ── PROFILE ──
        if (data === 'my_profile') {
            const text = [
                `👤 *My Profile*`,
                ``,
                `📱 Phone: \`${courier.phone}\``,
                `🆔 Courier ID: \`${courier.id}\``,
                `⭐ Rating: *${Number(courier.rating || 5).toFixed(1)}*`,
                `${courier.is_online ? '🟢' : '🔴'} Status: *${courier.is_online ? 'Online' : 'Offline'}*`,
                `🔒 Account: *${courier.status}*`,
            ].join('\n');

            return bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'main_menu' }]] }
            }).catch(() => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }));
        }

        // ── SOS MENU ──
        if (data === 'sos_menu') {
            const activeOrder = await courierService.getActiveOrder(courier.id);
            const oid = activeOrder ? activeOrder.id : 'none';
            return bot.editMessageText(`🚨 *SOS Emergency Menu*\n\nSelect the type of emergency:`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: buildSOSKeyboard(oid)
            }).catch(() => bot.sendMessage(chatId, '🚨 SOS - Select reason:', { reply_markup: buildSOSKeyboard(oid) }));
        }

        if (data.startsWith('sos_order_')) {
            const orderId = data.replace('sos_order_', '');
            return bot.editMessageText(`🚨 *SOS for Order #${orderId}*\n\nSelect the emergency type:`, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: buildSOSKeyboard(orderId)
            }).catch(() => { });
        }

        if (data.startsWith('sos_reason_')) {
            const parts = data.split('_');
            // Format: sos_reason_<orderId>_<reason_words>
            // Split after "sos_reason_" -> "orderId_reason"
            const afterPrefix = data.replace('sos_reason_', '');
            const firstUnderscore = afterPrefix.indexOf('_');
            const orderId = afterPrefix.substring(0, firstUnderscore);
            const reason = afterPrefix.substring(firstUnderscore + 1).replace(/_/g, ' ');

            const res = await courierService.createSOS(courier.id, orderId !== 'none' ? orderId : null, reason);

            if (res.success) {
                await notifySuperAdminSOS(courier, orderId !== 'none' ? orderId : null, reason);
                return bot.editMessageText(
                    `🚨 *SOS Logged Successfully*\n\nReason: *${reason}*\nOrder: ${orderId !== 'none' ? `#${orderId}` : 'N/A'}\n\nA SuperAdmin has been notified and will contact you shortly.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]] }
                    }
                ).catch(() => { });
            }
        }

        // ── ORDER OFFER: ACCEPT / SKIP ──
        if (data.startsWith('offer_accept_')) {
            const orderId = data.replace('offer_accept_', '');
            const res = await courierService.acceptOffer(orderId, courier.id);

            if (res.success) {
                await bot.editMessageText(
                    `✅ *Order #${orderId} Accepted!*\n\nHead to the restaurant to pick up the order.\nSLA timer: 35 minutes started.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '📦 View Order Details', callback_data: 'active_order' }]] }
                    }
                ).catch(() => { });
                return sendMainMenu(chatId);
            } else {
                return bot.editMessageText(
                    `❌ *Could not accept Order #${orderId}*\n\nReason: ${res.message}\n(Order may have been taken by another courier)`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]] }
                    }
                ).catch(() => { });
            }
        }

        if (data.startsWith('offer_skip_')) {
            const orderId = data.replace('offer_skip_', '');
            return bot.editMessageText(
                `⏭ *Order #${orderId} Skipped*`,
                { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
            ).catch(() => { });
        }

        // ── ORDER STATUS UPDATES ──
        if (data.startsWith('status_')) {
            const parts = data.split('_');
            const orderId = parts[parts.length - 1];
            const newStatus = parts.slice(1, parts.length - 1).join('_'); // e.g. picked_up, on_way, delivered

            const res = await courierService.updateOrderStatus(orderId, courier.id, newStatus);

            if (!res.success) {
                return bot.sendMessage(chatId, `❌ Failed to update: ${res.message}`);
            }

            const statusMessages = {
                picked_up: `📍 *Picked Up!*\nYou've picked up Order #${orderId} from the restaurant.\nNow head to the delivery address.`,
                on_way: `🚗 *On the Way!*\nOrder #${orderId} is on its way to the client.`,
                delivered: `✅ *Delivered!*\nOrder #${orderId} has been delivered successfully!\n\n🎉 Great work! Earnings added to your account.`,
            };

            const text = statusMessages[newStatus] || `✅ Status updated to: ${newStatus}`;

            if (newStatus === 'delivered') {
                // Send rating request to customer
                await sendRatingRequestToCustomer(orderId, courier);

                await bot.editMessageText(text, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🏠 Back to Menu', callback_data: 'main_menu' }]] }
                }).catch(() => { });
                return sendMainMenu(chatId);
            }

            // Reload order for updated status
            const updatedOrder = await courierService.getActiveOrder(courier.id);

            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: updatedOrder ? buildOrderActionsKeyboard(updatedOrder) : { inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'main_menu' }]] }
            }).catch(() => bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }));
        }

        // ── CASH RECEIVED ──
        if (data.startsWith('cash_recv_')) {
            const parts = data.split('_');
            // Format: cash_recv_<orderId>_<amount>
            const orderId = parts[2];
            const amount = parseFloat(parts[3]);

            const res = await courierService.markCashReceived(orderId, courier.id, amount);

            if (res.success) {
                const amtStr = amount.toLocaleString('uz-UZ');
                const updatedOrder = await courierService.getActiveOrder(courier.id);

                await bot.editMessageText(
                    `💵 *Cash Received: ${amtStr} UZS*\n\nOrder #${orderId} payment logged.\nYour cash balance updated.`,
                    {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: updatedOrder ? buildOrderActionsKeyboard(updatedOrder) : { inline_keyboard: [[{ text: '🏠 Menu', callback_data: 'main_menu' }]] }
                    }
                ).catch(() => { });
            } else {
                bot.sendMessage(chatId, `❌ Failed: ${res.message}`);
            }
        }

    } catch (err) {
        console.error('[callback_query]', err.message, err.stack);
        bot.answerCallbackQuery(query.id, { text: '❌ Server error. Please try again.', show_alert: true }).catch(() => { });
    }
});

// ──────────────────────────────────────────────
// RATING SYSTEM: Send rating request to CUSTOMER
// ──────────────────────────────────────────────
async function sendRatingRequestToCustomer(orderId, courier) {
    try {
        // Get order + user telegram_id
        const orderRes = await pool.query(`
            SELECT o.*, u.telegram_id as user_telegram_id, u.full_name as user_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.id = $1
        `, [orderId]);

        if (orderRes.rows.length === 0) return;
        const order = orderRes.rows[0];

        if (!order.user_telegram_id) return; // Customer not on Telegram

        const courierName = courier.full_name || courier.phone;
        const text = [
            `⭐ *Rate Your Delivery*`,
            ``,
            `Order #${orderId} was delivered by *${courierName}*.`,
            `How was your delivery experience?`,
        ].join('\n');

        const sentMsg = await bot.sendMessage(order.user_telegram_id, text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⭐ 1', callback_data: `rate_${orderId}_${courier.id}_1` },
                        { text: '⭐⭐ 2', callback_data: `rate_${orderId}_${courier.id}_2` },
                        { text: '⭐⭐⭐ 3', callback_data: `rate_${orderId}_${courier.id}_3` },
                        { text: '⭐⭐⭐⭐ 4', callback_data: `rate_${orderId}_${courier.id}_4` },
                        { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rate_${orderId}_${courier.id}_5` },
                    ]
                ]
            }
        }).catch(() => null);

        if (sentMsg) {
            // Store rating request
            await pool.query(`
                INSERT INTO courier_rating_requests (order_id, courier_id, user_telegram_id, rating_message_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT DO NOTHING
            `, [orderId, courier.id, order.user_telegram_id, sentMsg.message_id]);
        }
    } catch (err) {
        console.error('[sendRatingRequestToCustomer]', err.message);
    }
}

async function handleRating(query, data) {
    // Format: rate_<orderId>_<courierId>_<stars>
    const parts = data.split('_');
    const orderId = parts[1];
    const courierId = parts[2];
    const stars = parseInt(parts[3]);
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
        await bot.answerCallbackQuery(query.id);

        // Check if already rated
        const ratingReq = await pool.query(
            `SELECT * FROM courier_rating_requests WHERE order_id = $1 AND courier_id = $2`,
            [orderId, courierId]
        );

        if (ratingReq.rows.length > 0 && ratingReq.rows[0].status === 'rated') {
            return bot.editMessageText('✅ You have already rated this delivery.', {
                chat_id: chatId, message_id: messageId
            }).catch(() => { });
        }

        // Apply rating
        await courierService.applyRating(courierId, stars);

        // Update rating request
        await pool.query(
            `UPDATE courier_rating_requests SET rating = $1, status = 'rated', rated_at = NOW() WHERE order_id = $2 AND courier_id = $3`,
            [stars, orderId, courierId]
        );

        const starEmojis = '⭐'.repeat(stars);
        await bot.editMessageText(
            `${starEmojis}\n\n*Thank you for your rating!*\nYou gave ${stars} star${stars > 1 ? 's' : ''} to your courier.\nThis helps us improve our service.`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        ).catch(() => { });

    } catch (err) {
        console.error('[handleRating]', err.message);
    }
}

// ──────────────────────────────────────────────
// SUPERADMIN NOTIFICATIONS
// ──────────────────────────────────────────────
async function getSuperAdminTelegramIds() {
    try {
        const res = await pool.query(`SELECT telegram_id FROM users WHERE role = 'superadmin' AND telegram_id IS NOT NULL`);
        return res.rows.map(r => r.telegram_id).filter(Boolean);
    } catch {
        return [];
    }
}

async function notifySuperAdminSOS(courier, orderId, reason) {
    const admins = await getSuperAdminTelegramIds();
    const text = [
        `🚨 *SOS ALERT!*`,
        ``,
        `Courier: *${courier.full_name || courier.phone}* (ID: ${courier.id})`,
        `Order: ${orderId ? `#${orderId}` : 'N/A'}`,
        `Reason: *${reason}*`,
        `Time: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Tashkent' })}`,
    ].join('\n');

    for (const adminId of admins) {
        bot.sendMessage(adminId, text, { parse_mode: 'Markdown' }).catch(() => { });
    }
}

async function notifySuperAdminSLABreach(order, courierTelegramId) {
    const admins = await getSuperAdminTelegramIds();
    const text = [
        `⚠️ *SLA Breach Detected!*`,
        ``,
        `Order: *#${order.id}*`,
        `Courier ID: *${order.courier_id}*`,
        `Deadline was: ${new Date(order.sla_delivery_deadline).toLocaleString('en-GB', { timeZone: 'Asia/Tashkent' })}`,
        `Status: ${order.delivery_status}`,
    ].join('\n');

    for (const adminId of admins) {
        bot.sendMessage(adminId, text, { parse_mode: 'Markdown' }).catch(() => { });
    }
}

async function notifySuperAdminCashSubmit(courier, amount) {
    const admins = await getSuperAdminTelegramIds();
    const text = [
        `🏦 *Cash Submission Request*`,
        ``,
        `Courier: *${courier.full_name || courier.phone}* (ID: ${courier.id})`,
        `Amount: *${amount.toLocaleString('uz-UZ')} UZS*`,
        `Awaiting your confirmation.`,
    ].join('\n');

    for (const adminId of admins) {
        bot.sendMessage(adminId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Confirm', callback_data: `admin_cash_confirm_${courier.id}_${amount}` }]
                ]
            }
        }).catch(() => { });
    }
}

// ──────────────────────────────────────────────
// BROADCAST ORDER TO COURIERS (called externally)
// ──────────────────────────────────────────────
async function broadcastOrderToCouriers(order) {
    try {
        // Get available couriers: online, active, not currently delivering, under cash limit
        const result = await pool.query(`
            SELECT c.id, c.telegram_id, c.phone, c.cash_on_hand, c.full_name
            FROM couriers c
            WHERE c.is_online = true
              AND c.status = 'active'
              AND c.cash_on_hand < $1
              AND c.id NOT IN (
                  SELECT DISTINCT courier_id FROM orders
                  WHERE delivery_status NOT IN ('delivered', 'cancelled')
                  AND courier_id IS NOT NULL
              )
            ORDER BY c.rating DESC
            LIMIT 3
        `, [CASH_LIMIT]);

        if (result.rows.length === 0) {
            console.log(`[Broadcast] No available couriers for order #${order.id}`);
            return;
        }

        // Get restaurant name for display
        let restaurantName = `ID: ${order.restaurant_id}`;
        try {
            const rRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [order.restaurant_id]);
            if (rRes.rows.length > 0) restaurantName = rRes.rows[0].full_name;
        } catch { }

        // Get customer name
        let clientName = 'Customer';
        try {
            const uRes = await pool.query('SELECT full_name, phone FROM users WHERE id = $1', [order.user_id]);
            if (uRes.rows.length > 0) clientName = uRes.rows[0].full_name || uRes.rows[0].phone;
        } catch { }

        const orderForCard = { ...order, restaurant_name: restaurantName, client_name: clientName };
        const text = formatOrderCard(orderForCard);

        const opts = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Accept Order', callback_data: `offer_accept_${order.id}` },
                    { text: '❌ Skip', callback_data: `offer_skip_${order.id}` }
                ]]
            }
        };

        console.log(`[Broadcast] Sending order #${order.id} to ${result.rows.length} couriers`);
        for (const c of result.rows) {
            if (c.telegram_id) {
                bot.sendMessage(c.telegram_id, text, opts).catch(err =>
                    console.error(`[Broadcast] Failed to notify courier ${c.id}:`, err.message)
                );
            }
        }
    } catch (err) {
        console.error('[Broadcast] Error:', err.message);
    }
}

// ──────────────────────────────────────────────
// EXPORTS
// ──────────────────────────────────────────────
module.exports = {
    bot,
    broadcastOrderToCouriers,
    notifySuperAdminSLABreach,
    sendMainMenu,
};
