import {
  createEvent,
  getLatestEvent,
  getEventConfirmations,
  getEventById,
  deleteEvent
} from "../db/model.js";
import { EVENT_CANCELLED_RESPONSES } from "../responses/response.js";

import { 
  setCurrentEvent, 
  clearCurrentEvent, 
  getCurrentEventId 
} from "../services/reminderServices.js";


// CREATE EVENT

export async function handleEvent(ctx) {
  const input = ctx.message.text.split(" ").slice(1);

  const title = input.slice(0, -1).join(" ");
  const date = input[input.length - 1];

  if (!title || !date) {
    return ctx.reply(
      "Usage: /event Party 2026-04-12\n(Event name and date required)"
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return ctx.reply("Please use date format: YYYY-MM-DD");
  }

  const event = await createEvent(title, date);
  setCurrentEvent(event.id);

  await ctx.reply(
    `📅 **Event Created!**\n\n` +
    `**Title:** ${title}\n` +
    `**Date:** ${date}\n\n` +
    `Everyone can now confirm or make excuses 😄\n\n` +
    `*Admins can use /cancel to cancel this event*`
  );
}


//  STATUS

export async function handleStatus(ctx) {
  const event = await getLatestEvent();

  if (!event) {
    return ctx.reply("No active event found. Create one with /event");
  }

  const confirmations = await getEventConfirmations(event.id);

  const confirmedNames = confirmations?.map((c) => c.users.name) || [];
  const count = confirmedNames.length;

  let reply = `📋 **${event.title}** (${event.event_date})\n\n`;
  reply += `✅ **Confirmed:** ${count} people\n`;

  if (confirmedNames.length > 0) {
    reply += `\n**Attendees:**\n${confirmedNames
      .map((name) => `• ${name}`)
      .join("\n")}`;
  } else {
    reply += `\nNo one has confirmed yet. Be the first! 🎉`;
  }

  await ctx.reply(reply);
}


export async function handleReset(ctx) {
  await clearCurrentEvent(false); 
  await ctx.reply(
    "🔄 Active event reset. Next /event will create a new one.\n\n" +
    "Note: The event still exists in the database but is no longer active."
  );
}

// cancel event and delet from db

export async function handleCancel(ctx) {
  try {
    const currentEventId = getCurrentEventId();
    if (!currentEventId) {
      return ctx.reply("❌ No active event to cancel!");
    }
    
    // Get event details
    const event = await getEventById(currentEventId);
    if (!event) {
      await clearCurrentEvent(false);
      return ctx.reply("❌ Event not found. State has been reset.");
    }
    
    // Delete from database AND clear state
    await clearCurrentEvent(true, currentEventId);
    
    
    const randomMsg = EVENT_CANCELLED_RESPONSES[Math.floor(Math.random() * EVENT_CANCELLED_RESPONSES.length)];
    await ctx.reply(randomMsg, { parse_mode: "Markdown" });
    
    console.log(`✅ Event "${event.title}" (${currentEventId}) cancelled and deleted by: ${ctx.from.first_name}`);
    
  } catch (error) {
    console.error("Error in handleCancel:", error);
    await ctx.reply("Sorry, couldn't cancel the event. Please try again.");
  }
} 