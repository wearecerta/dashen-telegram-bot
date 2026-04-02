import cron from "node-cron";
import {
  getAllUsers,
  getLatestEvent,
  getEventConfirmations,
  getEventById,
  deleteEvent,
  getAllEvents
} from "../db/model.js";
import { config } from "../config/index.js";
import { bot } from "../bot.js";

const currentEvents = new Map(); // key: chatId, value: eventId

export async function startReminderService() {
  // 1. Initialize currentEvents from the database
  try {
    const allEvents = await getAllEvents();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allEvents.forEach(event => {
      const eventDate = new Date(event.event_date);
      eventDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      
      // Only track future or current events
      if (daysUntil >= 0) {
        // Only track the "latest" version for each chat
        const existing = currentEvents.get(event.chat_id);
        if (!existing || new Date(event.created_at) > new Date(allEvents.find(e => e.id === existing)?.created_at || 0)) {
          currentEvents.set(event.chat_id, event.id);
        }
      }
    });
    console.log(`📡 Loaded ${currentEvents.size} active events into reminder service`);
  } catch (error) {
    console.error("Error initializing reminder service from DB:", error);
  }

  // 2. Schedule the daily job
  cron.schedule(
    `${config.reminderMinute} ${config.reminderHour} * * *`,
    async () => {
      try {
        await sendDailyReminders();
      } catch (error) {
        console.error("Error in daily reminder job:", error);
      }
    }
  );

  console.log(`📅 Reminder service started (${config.reminderHour}:${config.reminderMinute})`);
}

export async function sendDailyReminders() {
  try {
    // Send reminders for each chat that has an active event
    for (const [chatId, eventId] of currentEvents.entries()) {
      const event = await getEventById(eventId);
      if (!event) {
        currentEvents.delete(chatId);
        continue;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const eventDate = new Date(event.event_date);
      eventDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
      if (daysUntil < 0) {
        currentEvents.delete(chatId);
        continue;
      }

      const confirmations = await getEventConfirmations(event.id);
      const confirmedUserIds = new Set(confirmations?.map((c) => c.user_id) || []);
      const confirmedNames = confirmations?.map(c => c.users?.name).filter(Boolean) || [];
      const confirmedCount = confirmedUserIds.size;

      console.log(`Sending reminder for "${event.title}" to chat ${chatId} (${daysUntil} days away)`);

      try {
        const daysUntilStr = getDayString(daysUntil);
        const dateStr = new Date(event.event_date).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });

        let message = `📢 *Daily Reminder*\n\n`;
        message += `🎯 *${event.title}* is ${daysUntilStr}!\n`;
        message += `📅 ${dateStr}\n\n`;
        message += `✅ *${confirmedCount} confirmed:*\n`;

        if (confirmedNames.length > 0) {
          message += confirmedNames.map(name => `• ${name}`).join("\n");
        } else {
          message += `No one yet — be the first! 🎉`;
        }

        message += `\n\nDon't miss out! Confirm now! 🚀`;

        await bot.telegram.sendMessage(chatId, message, { parse_mode: "Markdown" });
      } catch (error) {
        console.error(`Failed to send reminder to chat ${chatId}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error("Error in sendDailyReminders:", error);
  }
}

function getDayString(daysUntil) {
  if (daysUntil === 0) return "TODAY! 🚨";
  if (daysUntil === 1) return "tomorrow";
  if (daysUntil < 7) return `in ${daysUntil} days`;
  const weeks = Math.floor(daysUntil / 7);
  const remainder = daysUntil % 7;
  return `in ${weeks} week${weeks > 1 ? 's' : ''}${remainder > 0 ? ` and ${remainder} day${remainder > 1 ? 's' : ''}` : ''}`;
}

export function setCurrentEvent(eventId, chatId) {
  currentEvents.set(chatId, eventId);
  console.log(`✅ Current event set for chat ${chatId}: ${eventId}`);
}

export function getCurrentEventId(chatId) {
  return currentEvents.get(chatId);
}

export async function clearCurrentEvent(deleteFromDb = false, chatId, eventId = null) {
  const idToDelete = eventId || currentEvents.get(chatId);
  
  if (deleteFromDb && idToDelete) {
    try {
      await deleteEvent(idToDelete);
      console.log(`🗑️ Event ${idToDelete} deleted from database`);
    } catch (error) {
      console.error("Error deleting event from DB:", error);
    }
  }
  
  currentEvents.delete(chatId);
  console.log(`❌ Current event cleared for chat ${chatId}`);
}