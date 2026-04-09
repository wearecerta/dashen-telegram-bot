import { Telegraf, Markup } from "telegraf";
import { config } from "./config/index.js";
import { handleText } from "./handlers/messageHandler.js";
import {
  handleEvent,
  handleStatus,
  handleReset,
  handleCancel,
  handleCountdown,
} from "./handlers/commandHandler.js";
import {
  getEventById,
  getEventConfirmations,
  deleteEvent,
  updateEventDate,
  getAllUsers,
  createConfirmation,
  getUserConfirmation,
  findOrCreateUser,
} from "./db/model.js";
import {
  clearCurrentEvent,
  getCurrentEventId,
} from "./services/reminderServices.js";
import { getStatusKeyboard } from "./utils/keyboard.js";
import {
  getRandomResponse,
  EVENT_CANCELLED_RESPONSES,
} from "./responses/response.js";
import { escapeMarkdown, formatDateHuman } from "./utils/helper.js";

export const bot = new Telegraf(config.botToken);

// Display commands in the Telegram bot menu
bot.telegram.setMyCommands([
  { command: "status", description: "📋 View current plan, dates & attendees" },
  { command: "countdown", description: "⏳ See how much time is left" },
  { command: "cancel", description: "🚫 Delete the current active plan" },
]);

// Track reschedule poll votes
const pollVotes = new Map();

// Handle /start
bot.start(async (ctx) => {
  const name = ctx.from.first_name;
  const telegramId = ctx.from.id.toString();
  const chatId = ctx.chat.id.toString();

  await findOrCreateUser(telegramId, name, chatId);

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url(
        "➕ Add Bot to Group",
        `https://t.me/${ctx.botInfo.username}?startgroup=true`,
      ),
    ],
  ]);

  const welcomeMessage =
    `🎉 *Welcome to Dashen Gather Bot, ${escapeMarkdown(name)}!* 🎉\n\n` +
    `*What I can do:*\n` +
    `• 🎯 Detect activity suggestions\n` +
    `• ✅ Track attendance\n` +
    `• 😄 Funny responses\n` +
    `• 📅 Daily reminders\n\n` +
    `*Get started:*\n` +
    `1️⃣ Add me to group\n` +
    `2️⃣ Make me admin\n` +
    `3️⃣ Say "let's eat"`;

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    ...keyboard,
  });
});

// Handle callback queries from buttons
bot.on("callback_query", async (ctx) => {
  try {
    const callbackData = ctx.callbackQuery.data;
    const message = ctx.callbackQuery.message;
    const chatId = message?.chat?.id?.toString();

    if (!chatId) {
      await ctx.answerCbQuery("❌ Invalid chat!");
      return;
    }

    let action = "";
    let eventId = "";

    // Parse callback data
    if (callbackData.startsWith("cancel_event_")) {
      action = "cancel_event";
      eventId = callbackData.replace("cancel_event_", "");
    } else if (callbackData.startsWith("status_")) {
      action = "status";
      eventId = callbackData.replace("status_", "");
    } else if (callbackData.startsWith("vote_r_")) {
      action = "poll_vote";
      // Format: vote_r_y_eventId_newDate or vote_r_n_eventId
      const split = callbackData.split("_");
      eventId = split[3];
    } else {
      await ctx.answerCbQuery("❌ Invalid action");
      return;
    }

    console.log(
      `📱 Callback in chat ${chatId}: action=${action}, eventId=${eventId}, from=${ctx.from.first_name}`,
    );

    if (!eventId || eventId.length < 10) {
      await ctx.answerCbQuery("❌ Invalid event ID!");
      return;
    }

    // Verify this event belongs to this chat
    let event;
    try {
      event = await getEventById(eventId);
    } catch (error) {
      console.error("Error fetching event:", error);
      await ctx.answerCbQuery("❌ Event not found!");
      if (message) {
        await ctx.editMessageText("❌ This event no longer exists.", {
          parse_mode: "Markdown",
        });
      }
      return;
    }

    if (!event) {
      await ctx.answerCbQuery("❌ Event not found!");
      if (message) {
        await ctx.editMessageText("❌ This event no longer exists.", {
          parse_mode: "Markdown",
        });
      }
      return;
    }

    // Verify event belongs to this chat
    if (event.chat_id !== chatId) {
      await ctx.answerCbQuery("❌ This event belongs to a different group!");
      return;
    }

    // Handle CANCEL EVENT - Anyone can cancel
    if (action === "cancel_event") {
      // Delete event from database
      await deleteEvent(eventId);
      await clearCurrentEvent(true, chatId, eventId);

      const cancelMsg = getRandomResponse(EVENT_CANCELLED_RESPONSES, {
        event: event.title,
        name: ctx.from.first_name,
      });

      await ctx.answerCbQuery("🚫 Event cancelled!");

      if (message) {
        await ctx.editMessageText(cancelMsg, { parse_mode: "Markdown" });
      } else {
        await ctx.reply(cancelMsg, { parse_mode: "Markdown" });
      }

      console.log(
        `✅ Event "${event.title}" cancelled in chat ${chatId} by: ${ctx.from.first_name}`,
      );
    }

    // Handle STATUS action
    else if (action === "status") {
      const confirmations = await getEventConfirmations(eventId);
      const confirmedNames = confirmations?.map((c) => c.users.name) || [];
      const count = confirmedNames.length;

      let statusMsg = `📋 *${event.title}*\n`;
      statusMsg += `⏳ *When:* ${formatDateHuman(event.event_date)}\n\n`;
      statusMsg += `✅ *Confirmed:* ${count} people\n`;

      if (confirmedNames.length > 0) {
        statusMsg += `\n*Attendees:*\n${confirmedNames.map((name) => `• ${name}`).join("\n")}`;
      } else {
        statusMsg += `\nNo one has confirmed yet. Be the first! 🎉`;
      }

      await ctx.answerCbQuery();

      const currentText = message?.text;
      if (currentText !== statusMsg) {
        await ctx.editMessageText(statusMsg, {
          parse_mode: "Markdown",
          ...getStatusKeyboard(eventId),
        });
      } else {
        await ctx.answerCbQuery("Status is up to date!");
      }
    }

    // Handle POLL VOTES action
    else if (action === "poll_vote") {
      const split = callbackData.split("_");
      const voteType = split[2]; // 'y' or 'n'
      const eId = split[3];
      const newDate = split[4]; // might be undefined for 'n'

      const tgId = ctx.from.id.toString();
      const userName = ctx.from.first_name;
      const chatId = ctx.chat?.id?.toString();

      if (voteType === "n") {
        const pollNoKey = `no_${eId}_${newDate}`;
        if (!pollVotes.has(pollNoKey)) {
          pollVotes.set(pollNoKey, new Set());
        }
        
        const noVotes = pollVotes.get(pollNoKey);
        
        if (noVotes.has(tgId)) {
          await ctx.answerCbQuery("ℹ️ You already voted NO!");
          return;
        }
        
        noVotes.add(tgId);
        await ctx.answerCbQuery("👎 You voted NO.");
        
        if (message && message.text) {
          try {
            await ctx.editMessageText(message.text + `\n• ${userName} disagreed`, {
              parse_mode: "Markdown",
              reply_markup: message.reply_markup,
            });
          } catch (e) {
            // Ignore if message not modified
          }
        }
        return;
      }

      // Automatically confirm the user for the event since they are voting YES for a new date
      let dbUser;
      try {
        dbUser = await findOrCreateUser(tgId, userName, chatId);
        if (dbUser && dbUser.id) {
          const existingConf = await getUserConfirmation(dbUser.id, eId);
          if (!existingConf) {
            await createConfirmation(dbUser.id, eId);
          }
        }
      } catch (e) {
        console.error("Could not auto-confirm voter:", e);
      }

      const pollKey = `${eId}_${newDate}`;
      if (!pollVotes.has(pollKey)) {
        pollVotes.set(pollKey, new Set());
      }

      const votes = pollVotes.get(pollKey);

      if (votes.has(tgId)) {
        await ctx.answerCbQuery("ℹ️ You already voted YES!");
        return;
      }

      votes.add(tgId);

      // Check if we reached majority (50% + 1 of the group)
      const allUsers = await getAllUsers(chatId);
      const totalUsers = allUsers?.length || 0;
      const requiredVotes = Math.max(2, Math.floor(totalUsers / 2) + 1);

      if (votes.size >= requiredVotes) {
        await updateEventDate(eId, newDate);
        pollVotes.delete(pollKey);

        await ctx.answerCbQuery("✅ Majority reached! Date updated.");
        if (message) {
          await ctx.editMessageText(
            `🎉 **The people have spoken!**\n\nThe plan has been officially pushed to *${formatDateHuman(newDate)}*!`,
            { parse_mode: "Markdown" },
          );
        } else {
          await ctx.reply(
            `🎉 **The people have spoken!**\n\nThe plan has been officially pushed to *${formatDateHuman(newDate)}*!`,
            { parse_mode: "Markdown" },
          );
        }
      } else {
        await ctx.answerCbQuery(
          `✅ Voted YES! (${votes.size} / ${requiredVotes} required)`,
        );
        if (message && message.text) {
          // Add voter name without duplicating the main text if we can just append
          try {
            await ctx.editMessageText(message.text + `\n• ${userName} agreed`, {
              parse_mode: "Markdown",
              reply_markup: message.reply_markup,
            });
          } catch (e) {
            // Ignore if message not modified error
          }
        }
      }
    }
  } catch (error) {
    if (error.message?.includes("message is not modified")) {
      // Telegram throws an error if we try to edit a message but nothing actually changed. This is safe to ignore.
      return;
    }
    console.error("Callback query error:", error);
    try {
      await ctx.answerCbQuery("❌ Something went wrong!");
    } catch (e) {
      console.error("Failed to answer callback:", e);
    }
  }
});

// Ask to be admin when added to group
bot.on("new_chat_members", async (ctx) => {
  const me = await ctx.getChatMember(ctx.botInfo.id);
  if (me.status !== "administrator") {
    await ctx.reply("⚠️ Please make me an admin so I can work properly 🙏");
  }
});

bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  ctx.reply("An error occurred. Please try again later.").catch(() => {});
});

bot.command("event", handleEvent);
bot.command("status", handleStatus);
bot.command("countdown", handleCountdown);
bot.command("reset", handleReset);
bot.command("cancel", handleCancel);
bot.command("help", async (ctx) => {
  const helpMessage = `
*Dashen Gather Bot Help*

*What I can do:*
• 🎯 Detect activity suggestions
• ✅ Track attendance
• 😄 Funny responses
• 📅 Daily reminders

*Get started:*
1️⃣ Add me to group
2️⃣ Make me admin
3️⃣ Say "let's eat"`;

  await ctx.reply(helpMessage, { parse_mode: "Markdown" });
});

// ALWAYS register .on("text") last so it doesn't swallow commands
bot.on("text", handleText);
