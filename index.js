import { bot } from "./src/bot.js";
import { startReminderService } from "./src/services/reminderServices.js";

startReminderService();

bot.launch();

console.log("🤖 Bot is running...");

function stopBot(signal) {
  console.log(`Stopping bot (${signal})...`);
  bot.stop(signal);
  process.exit(0);
}

process.once("SIGINT", () => stopBot("SIGINT"));
process.once("SIGTERM", () => stopBot("SIGTERM"));