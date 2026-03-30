import dotenv from "dotenv";
dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  
  reminderHour: process.env.REMINDER_HOUR || 9,
  reminderMinute: process.env.REMINDER_MINUTE || 0,
};