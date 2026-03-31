import { Telegraf, Markup } from "telegraf";
import { config } from "./config/index.js";
import { handleText } from "./handlers/messageHandler.js";
import {
  handleEvent,
  handleStatus,
  handleReset,
  handleCancel
} from "./handlers/commandHandler.js";
import { findOrCreateUser, getEventById, getEventConfirmations, deleteEvent } from "./db/model.js";
import { clearCurrentEvent, getCurrentEventId } from "./services/reminderServices.js";
import { getStatusKeyboard } from "./utils/keyboard.js";
import { getRandomResponse, EVENT_CANCELLED_RESPONSES } from "./responses/response.js";
import { escapeMarkdown } from "./utils/helper.js";

export const bot = new Telegraf(config.botToken);

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
        `https://t.me/${ctx.botInfo.username}?startgroup=true`
      )
    ]
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
    ...keyboard
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
    } else {
      await ctx.answerCbQuery("❌ Invalid action");
      return;
    }
    
    console.log(`📱 Callback in chat ${chatId}: action=${action}, eventId=${eventId}, from=${ctx.from.first_name}`);
    
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
        await ctx.editMessageText("❌ This event no longer exists.", { parse_mode: "Markdown" });
      }
      return;
    }
    
    if (!event) {
      await ctx.answerCbQuery("❌ Event not found!");
      if (message) {
        await ctx.editMessageText("❌ This event no longer exists.", { parse_mode: "Markdown" });
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
        name: ctx.from.first_name
      });
      
      await ctx.answerCbQuery("🚫 Event cancelled!");
      
      if (message) {
        await ctx.editMessageText(cancelMsg, { parse_mode: "Markdown" });
      } else {
        await ctx.reply(cancelMsg, { parse_mode: "Markdown" });
      }
      
      console.log(`✅ Event "${event.title}" cancelled in chat ${chatId} by: ${ctx.from.first_name}`);
    }
    
    // Handle STATUS action
    else if (action === "status") {
      const confirmations = await getEventConfirmations(eventId);
      const confirmedNames = confirmations?.map(c => c.users.name) || [];
      const count = confirmedNames.length;
      
      let statusMsg = `📋 *${event.title}* (${event.event_date})\n\n`;
      statusMsg += `✅ *Confirmed:* ${count} people\n`;
      
      if (confirmedNames.length > 0) {
        statusMsg += `\n*Attendees:*\n${confirmedNames.map(name => `• ${name}`).join("\n")}`;
      } else {
        statusMsg += `\nNo one has confirmed yet. Be the first! 🎉`;
      }
      
      await ctx.answerCbQuery();
      
      const currentText = message?.text;
      if (currentText !== statusMsg) {
        await ctx.editMessageText(statusMsg, {
          parse_mode: "Markdown",
          ...getStatusKeyboard(eventId)
        });
      } else {
        await ctx.answerCbQuery("Status is up to date!");
      }
    }
    
  } catch (error) {
    console.error("Callback query error:", error);
    if (!error.message?.includes("message is not modified")) {
      try {
        await ctx.answerCbQuery("❌ Something went wrong!");
      } catch (e) {
        console.error("Failed to answer callback:", e);
      }
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

bot.on("text", handleText);
bot.command("event", handleEvent);
bot.command("status", handleStatus);
bot.command("reset", handleReset);
bot.command("cancel", handleCancel);