import { formatDistanceToNow, parseISO, isValid } from "date-fns";

export function escapeMarkdown(text) {
  if (!text) return "";
  const specialChars = [
    "_",
    "*",
    "[",
    "]",
    "(",
    ")",
    "~",
    "`",
    ">",
    "#",
    "+",
    "-",
    "=",
    "|",
    "{",
    "}",
    ".",
    "!",
  ];
  let escaped = text;
  for (const char of specialChars) {
    escaped = escaped.replace(new RegExp("\\" + char, "g"), "\\" + char);
  }
  return escaped;
}

export async function safeSend(ctx, text, keyboard = null, options = {}) {
  try {
    if (keyboard) {
      await ctx.reply(text, {
        ...options,
        parse_mode: "Markdown",
        ...keyboard,
      });
    } else {
      await ctx.reply(text, { ...options, parse_mode: "Markdown" });
    }
  } catch (error) {
    if (error.message.includes("can't parse entities")) {
      console.log("Markdown failed, sending plain text");
      if (keyboard) {
        await ctx.reply(text.replace(/[*_`]/g, ""), {
          ...options,
          parse_mode: undefined,
          ...keyboard,
        });
      } else {
        await ctx.reply(text.replace(/[*_`]/g, ""), {
          ...options,
          parse_mode: undefined,
        });
      }
    } else {
      throw error;
    }
  }
}

export function formatDateHuman(dateStr) {
  if (!dateStr) return "Not set";

  // If it's already a human phrase (like "next week"), just return it
  if (dateStr.toLowerCase().match(/[a-z]/i) && !dateStr.includes("-")) {
    return dateStr;
  }

  try {
    const date = parseISO(dateStr);
    if (isValid(date)) {
      const today = new Date().toISOString().split("T")[0];
      if (dateStr === today) return "Today";

      // Use formatDistanceToNow to get a natural phrase
      return formatDistanceToNow(date, { addSuffix: true });
    }
  } catch (e) {
    // Ignore and fallback
  }

  return dateStr;
}

export function getFallbackAnalysis(message, name) {
  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes("coming") ||
    lowerMsg.includes("yes") ||
    lowerMsg.includes("im in") ||
    lowerMsg.includes("count me") ||
    lowerMsg.includes("lets go") ||
    lowerMsg.includes("im there")
  ) {
    return {
      intent: "CONFIRMING",
      response: `Wuhuu! Let's go ${name}! 🎉`,
    };
  }

  if (
    lowerMsg.includes("cant") ||
    lowerMsg.includes("can't") ||
    lowerMsg.includes("busy") ||
    lowerMsg.includes("no") ||
    lowerMsg.includes("sorry") ||
    lowerMsg.includes("maybe next")
  ) {
    return {
      intent: "EXCUSE",
      response: `Nice try ${name}, but we'll remember this! 😏`,
    };
  }

  return {
    intent: "NEUTRAL",
    response: "Got it! 👍",
  };
}
