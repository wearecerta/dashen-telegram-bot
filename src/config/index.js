

import dotenv from "dotenv";
dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-pro",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  
  // Bot settings
  reminderHour: parseInt(process.env.REMINDER_HOUR) || 9,
  reminderMinute: parseInt(process.env.REMINDER_MINUTE) || 0,
  maxReminderDays: parseInt(process.env.MAX_REMINDER_DAYS) || 14,
};