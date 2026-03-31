import cron from "node-cron";
import {
  getAllUsers,
  getLatestEvent,
  getEventConfirmations,
  getEventById
} from "../db/model.js";
import { config } from "../config/index.js";
import { bot } from "../bot.js";

const currentEvents = new Map(); // key: chatId, value: eventId

export function startReminderService() {
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

      const users = await getAllUsers(chatId);
      const confirmations = await getEventConfirmations(event.id);
      const confirmedUserIds = new Set(confirmations?.map((c) => c.user_id) || []);
      
      const confirmedCount = confirmedUserIds.size;
      const totalUsers = users.length;

      console.log(`Sending reminders for "${event.title}" in chat ${chatId} (${daysUntil} days away)`);

      for (const user of users) {
        const isConfirmed = confirmedUserIds.has(user.id);
        
        try {
          const daysUntilStr = getDayString(daysUntil);
          const username = user.telegram_id;
          
          let message;
          if (isConfirmed) {
            message = `🎉 @${username}! Reminder: ${event.title} is ${daysUntilStr}!\n\n${confirmedCount} people confirmed! See you there! 🎊`;
          } else {
            message = `👀 @${username}! ${event.title} is ${daysUntilStr}!\n\n${confirmedCount} people are coming. Don't miss out! Join now! 🎉`;
          }
          
          const dateStr = new Date(event.event_date).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          });
          
          message += `\n\n📅 Date: ${dateStr}`;
          
          await bot.telegram.sendMessage(user.telegram_id, message);
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Failed to send to ${user.telegram_id}:`, error.message);
        }
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