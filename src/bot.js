import { Telegraf } from "telegraf";
import { config } from "./config/index.js";
import { handleText } from "./handlers/messageHandler.js";
import {
  handleEvent,
  handleStatus,
  handleReset
} from "./handlers/commandHandler.js";

export const bot = new Telegraf(config.botToken);

bot.on("text", handleText);

bot.command("event", handleEvent);
bot.command("status", handleStatus);
bot.command("reset", handleReset);