import cron from "node-cron";
import {
  getAllUsers,
  getLatestEvent,
  getEventConfirmations,
  getEventById
} from "../db/model.js";
import { config } from "../config/index.js";
import { bot } from "../bot.js";

let currentEventId = null;
let cronJob = null;

export function startReminderService() {
  if (cronJob) {
    cronJob.stop();
  }

  cronJob = cron.schedule(
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

export function stopReminderService() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log("📅 Reminder service stopped");
  }
}

export async function sendDailyReminders() {
  try {
    // Don't send reminders if no active event
    if (!currentEventId) {
      console.log("No active event, skipping reminders");
      return;
    }
    
    // Verify event still exists in DB
    const event = await getEventById(currentEventId).catch(() => null);
    if (!event) {
      console.log("Current event no longer exists in DB, clearing state");
      currentEventId = null;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const eventDate = new Date(event.event_date);
    eventDate.setHours(0, 0, 0, 0);
    
    const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return;

    const users = await getAllUsers();
    const confirmations = await getEventConfirmations(event.id);
    const confirmedUserIds = new Set(confirmations?.map((c) => c.user_id) || []);
    
    const confirmedCount = confirmedUserIds.size;
    const totalUsers = users.length;
    const pendingCount = totalUsers - confirmedCount;

    console.log(`Sending reminders for "${event.title}" (${daysUntil} days away)`);

    let sentCount = 0;
    let failedCount = 0;

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
        sentCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failedCount++;
        console.error(`Failed to send to ${user.telegram_id}:`, error.message);
      }
    }

    console.log(`✅ Sent ${sentCount} reminders, failed: ${failedCount}`);
    
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

export function setCurrentEvent(eventId) {
  currentEventId = eventId;
  console.log(`✅ Current event set to: ${eventId}`);
}

export function getCurrentEventId() {
  return currentEventId;
}

export async function clearCurrentEvent(deleteFromDb = false, eventId = null) {
  const idToDelete = eventId || currentEventId;
  
  if (deleteFromDb && idToDelete) {
    const { deleteEvent } = await import("../db/model.js");
    try {
      await deleteEvent(idToDelete);
      console.log(`🗑️ Event ${idToDelete} deleted from database`);
    } catch (error) {
      console.error("Error deleting event from DB:", error);
    }
  }
  
  currentEventId = null;
  console.log("❌ Current event cleared");
}