import cron from "node-cron";
import {
  getAllUsers,
  getLatestEvent,
  getEventConfirmations,
  getConfirmationCount
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

  console.log(
    `📅 Reminder service started (${config.reminderHour}:${config.reminderMinute})`
  );
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
    console.log("🕐 Running daily reminders...");

    const event = await getLatestEvent();
    if (!event) {
      console.log("No active event found, skipping reminders");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const eventDate = new Date(event.event_date);
    eventDate.setHours(0, 0, 0, 0);
    
    const daysUntil = Math.ceil(
      (eventDate - today) / (1000 * 60 * 60 * 24)
    );

    if (daysUntil < 0) {
      console.log(`Event "${event.title}" is in the past`);
      return;
    }

    const users = await getAllUsers();
    const confirmations = await getEventConfirmations(event.id);
    const confirmedUserIds = new Set(confirmations?.map((c) => c.user_id) || []);
    
    const confirmedCount = confirmedUserIds.size;
    const totalUsers = users.length;
    const pendingCount = totalUsers - confirmedCount;

    console.log(`Sending reminders for "${event.title}" (${daysUntil} days away)`);
    console.log(`Confirmed: ${confirmedCount}/${totalUsers}, Pending: ${pendingCount}`);

    let sentCount = 0;
    let failedCount = 0;

    for (const user of users) {
      const isConfirmed = confirmedUserIds.has(user.id);
      
      try {
        const message = getPersonalizedReminder(event, daysUntil, isConfirmed, confirmedCount, pendingCount, user);
        
        await bot.telegram.sendMessage(user.telegram_id, message, {
          parse_mode: "Markdown",
        });
        
        sentCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failedCount++;
        console.error(`Failed to send to ${user.telegram_id} (${user.name}):`, error.message);
      }
    }

    console.log(`✅ Sent ${sentCount} reminders, failed: ${failedCount}`);
    
  } catch (error) {
    console.error("Error in sendDailyReminders:", error);
  }
}

function getPersonalizedReminder(event, daysUntil, isConfirmed, confirmedCount, pendingCount, user) {
  const username = user.telegram_id;
  const dateStr = new Date(event.event_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  
  if (isConfirmed) {
    const hypeMessages = [
      `🎉 @${username}! Get ready for ${event.title} ${getDayString(daysUntil)}! 🎉\n\n${confirmedCount} people are joining you! This is going to be LIT! 🔥`,
      `🚀 @${username}, the hype is REAL! ${event.title} is ${getDayString(daysUntil)} and ${confirmedCount} legends are confirmed! 🚀`,
      `✨ @${username}, your presence has been requested! ${event.title} ${getDayString(daysUntil)}. ${confirmedCount} others are waiting for you! ✨`,
      `💪 @${username}, you're confirmed for ${event.title}! ${pendingCount > 0 ? `We need ${pendingCount} more to join!` : "EVERYONE IS COMING! 🎊"}`
    ];
    return hypeMessages[Math.floor(Math.random() * hypeMessages.length)] + `\n\n📅 *When:* ${dateStr}`;
  } else {
    const guiltMessages = [
      `👀 @${username}... ${confirmedCount} people are coming to ${event.title} ${getDayString(daysUntil)}.\n\n*You're missing out!* 😏\n\nStill time to join! 🎉`,
      `😱 @${username}! ${confirmedCount} people confirmed for ${event.title} and you're NOT one of them?\n\n*FOMO is real!* Join now! 🚀`,
      `🔔 @${username}, this is your friendly reminder that ${event.title} is ${getDayString(daysUntil)}.\n\n${confirmedCount} people said yes. What about you? 🤔`,
      `🎯 *CHALLENGE* 🎯\n\n@${username}, be the ${confirmedCount + 1}th person to confirm for ${event.title}! Don't let FOMO win! 💪`,
      `👋 Hey @${username}! ${event.title} ${getDayString(daysUntil)}!\n\n${confirmedCount} amazing people are going.\n\n*Join the party!* 🎊`
    ];
    return guiltMessages[Math.floor(Math.random() * guiltMessages.length)] + `\n\n📅 *When:* ${dateStr}\n\n_Reply with "coming" to join!_`;
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
  console.log(`Current event set to: ${eventId}`);
}

export function getCurrentEventId() {
  return currentEventId;
}

export function clearCurrentEvent() {
  currentEventId = null;
  console.log("Current event cleared");
}