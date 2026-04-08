import {
  createEvent,
  getEventConfirmations,
  getEventById,
  deleteEvent,
} from "../db/model.js";
import { EVENT_CANCELLED_RESPONSES } from "../responses/response.js";

import {
  setCurrentEvent,
  clearCurrentEvent,
  getCurrentEventId,
} from "../services/reminderServices.js";

import { formatDateHuman } from "../utils/helper.js";

// CREATE EVENT
export async function handleEvent(ctx) {
  const chatId = ctx.message.chat.id.toString();
  const input = ctx.message.text.split(" ").slice(1);

  const title = input.slice(0, -1).join(" ");
  const date = input[input.length - 1];

  if (!title || !date) {
    return ctx.reply(
      "Usage: /event Party 2026-04-12\n(Event name and date required)",
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return ctx.reply("Please use date format: YYYY-MM-DD");
  }

  const event = await createEvent(title, date, chatId);
  setCurrentEvent(event.id, chatId);

  await ctx.reply(
    `📅 **Event Created!**\n\n` +
      `**Title:** ${title}\n` +
      `**Date:** ${date}\n\n` +
      `Everyone can now confirm or make excuses 😄\n\n` +
      `*Use /status to see who's coming*`,
  );
}

// STATUS - Show current active event status for this chat
export async function handleStatus(ctx) {
  try {
    const chatId = ctx.message.chat.id.toString();
    const currentEventId = getCurrentEventId(chatId);

    if (!currentEventId) {
      return ctx.reply(
        "❌ No active event found in this group. Create one by saying 'let's ...' or use /event",
      );
    }

    const event = await getEventById(currentEventId);
    if (!event) {
      return ctx.reply("❌ Active event not found. Please create a new event.");
    }

    const confirmations = await getEventConfirmations(event.id);
    const confirmedNames = confirmations?.map((c) => c.users.name) || [];
    const count = confirmedNames.length;

    let reply = `📋 **${event.title}**\n\n`;
    reply += `✅ **Confirmed:** ${count} people\n`;

    if (confirmedNames.length > 0) {
      reply += `\n**Attendees:**\n${confirmedNames.map((name) => `• ${name}`).join("\n")}`;
    } else {
      reply += `\nNo one has confirmed yet. Be the first! 🎉`;
    }

    await ctx.reply(reply);
  } catch (error) {
    console.error("Error in handleStatus:", error);
    await ctx.reply("Sorry, couldn't get event status. Please try again.");
  }
}

// RESET - Clear current event state for this chat
export async function handleReset(ctx) {
  const chatId = ctx.message.chat.id.toString();
  await clearCurrentEvent(false, chatId);
  await ctx.reply(
    "🔄 Active event reset. Next /event will create a new one.\n\n" +
      "Note: The event still exists in the database but is no longer active.",
  );
}

// CANCEL - Delete current event from DB and clear state for this chat
export async function handleCancel(ctx) {
  try {
    const chatId = ctx.message.chat.id.toString();
    const currentEventId = getCurrentEventId(chatId);

    if (!currentEventId) {
      return ctx.reply("❌ No active event to cancel!");
    }

    const event = await getEventById(currentEventId);
    if (!event) {
      await clearCurrentEvent(false, chatId);
      return ctx.reply("❌ Event not found. State has been reset.");
    }

    await clearCurrentEvent(true, chatId, currentEventId);

    const randomMsg =
      EVENT_CANCELLED_RESPONSES[
        Math.floor(Math.random() * EVENT_CANCELLED_RESPONSES.length)
      ];
    const finalMsg = randomMsg
      .replace(/{event}/g, event.title)
      .replace(/{name}/g, ctx.from.first_name);
    await ctx.reply(finalMsg, { parse_mode: "Markdown" });

    console.log(
      `✅ Event "${event.title}" cancelled in chat ${chatId} by: ${ctx.from.first_name}`,
    );
  } catch (error) {
    console.error("Error in handleCancel:", error);
    await ctx.reply("Sorry, couldn't cancel the event. Please try again.");
  }
}

export async function handleCountdown(ctx) {
  try {
    const chatId = ctx.message.chat.id.toString();
    const currentEventId = getCurrentEventId(chatId);

    if (!currentEventId) {
      return ctx.reply("❌ There's no active plan right now!");
    }

    const event = await getEventById(currentEventId);
    if (!event) {
      return ctx.reply("❌ Active event not found.");
    }

    const timeRemaining = formatDateHuman(event.event_date);
    const text = `⏳ *${event.title}* is happening *${timeRemaining}*!`;
    
    await ctx.reply(text, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in handleCountdown:", error);
    await ctx.reply("Sorry, couldn't get the countdown. Please try again.");
  }
}
