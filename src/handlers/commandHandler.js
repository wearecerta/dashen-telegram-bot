import {
  createEvent,
  getLatestEvent,
  getEventConfirmations
} from "../db/model.js";

import { setCurrentEvent } from "../services/reminderServices.js";

//
// 📅 CREATE EVENT
//
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
    `📅 Event Created!\n\nTitle: ${title}\nDate: ${date}\n\nEveryone can now confirm or make excuses 😄`
  );
}

//
// 📊 STATUS
//
export async function handleStatus(ctx) {
  const event = await getLatestEvent();

  if (!event) {
    return ctx.reply("No active event found. Create one with /event");
  }

  const confirmations = await getEventConfirmations(event.id);

  const confirmedNames = confirmations?.map((c) => c.users.name) || [];
  const count = confirmedNames.length;

  let reply = `📋 ${event.title} (${event.event_date})\n\n`;
  reply += `✅ Confirmed: ${count} people\n`;

  if (confirmedNames.length > 0) {
    reply += `\nAttendees:\n${confirmedNames
      .map((name) => `• ${name}`)
      .join("\n")}`;
  } else {
    reply += `\nNo one has confirmed yet. Be the first! 🎉`;
  }

  await ctx.reply(reply);
}

//
// 🔄 RESET
//
export async function handleReset(ctx) {
  setCurrentEvent(null);
  await ctx.reply(
    "🔄 Active event reset. Next /event will create a new one."
  );
}