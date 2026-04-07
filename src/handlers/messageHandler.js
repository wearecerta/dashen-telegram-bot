import {
  findOrCreateUser,
  getLatestEvent,
  getEventById,
  createEvent,
  createConfirmation,
  getUserConfirmation,
  getConfirmationCount,
  getEventConfirmations,
  getAllUsers,
} from "../db/model.js";

import { analyzeMessageGemini } from "../services/geminiService.js";
import {
  PROPOSAL_INTRO_RESPONSES,
  CONFIRMATION_RESPONSES,
  EVERYONE_CONFIRMED_RESPONSES,
  DOUBLE_CONFIRMATION_RESPONSES,
  EXCUSE_BLOCK_RESPONSES,
  EXCUSE_ACCEPTED_RESPONSES,
  ALREADY_CONFIRMED_EXCUSE_RESPONSES,
  HYPE_RESPONSES,
  getRandomResponse,
} from "../responses/response.js";

import {
  getCurrentEventId,
  setCurrentEvent,
} from "../services/reminderServices.js";

import {
  getEventActionKeyboard,
  getAfterCreationKeyboard,
} from "../utils/keyboard.js";
import {
  escapeMarkdown,
  getFallbackAnalysis,
  safeSend,
} from "../utils/helper.js";

// Track excuse attempts per user per event: key = "eventId:userId", value = count
const excuseCounts = new Map();
const MAX_EXCUSE_FORCES = 2; // Force/roast them twice, then accept on 3rd attempt

function getExcuseKey(eventId, userId) {
  return `${eventId}:${userId}`;
}

function getExcuseCount(eventId, userId) {
  return excuseCounts.get(getExcuseKey(eventId, userId)) || 0;
}

function incrementExcuseCount(eventId, userId) {
  const key = getExcuseKey(eventId, userId);
  const count = (excuseCounts.get(key) || 0) + 1;
  excuseCounts.set(key, count);
  return count;
}

// Clean up excuse counts for an event (call when event is cancelled/cleared)
export function clearExcuseCounts(eventId) {
  for (const key of excuseCounts.keys()) {
    if (key.startsWith(`${eventId}:`)) {
      excuseCounts.delete(key);
    }
  }
}

export async function handleText(ctx) {
  try {
    if (ctx.message.text.startsWith("/")) return;

    // Get chat ID for isolation
    const chatId = ctx.message.chat.id.toString();
    const telegramId = ctx.from.id.toString();
    const name = ctx.from.first_name;
    const username = ctx.from.username || name;
    const message = ctx.message.text;

    console.log(
      `📝 Processing message in chat ${chatId} from ${name}: "${message}"`,
    );

    // Get or create user for this specific chat
    const user = await findOrCreateUser(telegramId, name, chatId);

    // Check if there's an active event for this chat
    let eventId = getCurrentEventId(chatId);
    let event;

    if (eventId) {
      event = await getEventById(eventId);
    } else {
      event = await getLatestEvent(chatId);
      if (event) setCurrentEvent(event.id, chatId);
    }

    if (event) {
      await handleEventResponse(
        ctx,
        user,
        event,
        message,
        name,
        username,
        chatId,
      );
      return;
    }

    const isProposing = await detectProposal(message, name);

    if (isProposing) {
      await handleProposal(ctx, user, message, name, username, chatId);
    }
  } catch (error) {
    console.error("🔥 Unhandled error in handleText:", error);
    try {
      await ctx.reply("Sorry, something went wrong. Please try again.");
    } catch (replyError) {
      console.error("Failed to send error message:", replyError);
    }
  }
}

async function detectProposal(message, name) {
  try {
    const messageLower = message.toLowerCase().trim();

    // Skip very short messages or questions-only
    if (messageLower.length < 5) return false;

    // Strong proposal patterns — these are almost certainly proposals, no AI needed
    const strongPatterns = [
      /\blet'?s\s+(go|eat|play|watch|meet|hang|grab|get|do|have|try|visit|check out)/i,
      /\bhow about\s+(we|going|eating|playing|watching|meeting|hanging|grabbing)/i,
      /\bshall we\s+\w+/i,
      /\bwanna\s+(go|eat|play|watch|meet|hang|grab|get|do|have)/i,
      /\bwant to\s+(go|eat|play|watch|meet|hang|grab|get|do|have)/i,
      /\bwho'?s?\s+(down|in)\s+(for|to)\b/i,
      /\banyone\s+(down|want|wanna|interested|up)\s+(for|to|in)\b/i,
      /\bwe should\s+(go|eat|play|watch|meet|hang|grab|get|do|have|try)/i,
      /\bwhat do you think\b/i,
      /\bwhat do you guys think\b/i,
      /\bplanning to\b/i,
      /\bplanning on\b/i,
      /\bbeers next week anyone\b/i,
    ];

    if (strongPatterns.some((pattern) => pattern.test(messageLower))) {
      console.log(`🎯 Strong proposal detected: "${message}"`);
      return true;
    }

    // Weak signals — could be proposals, need AI to confirm
    const weakPatterns = [
      /\blet'?s\b/i,
      /\btonight\b/i,
      /\bplaning to\b/i,
      /\bplanned to\b/i,
      /\bplanned on\b/i,
      /\bthis weekend\b/i,
      /\btomorrow\b/i,
      /\bplan\s+(something|a|an|the)/i,
      /\borganize\s+(a|an|the|something)/i,
      /\banybody\s+free\b/i,
      /\banyone\s+free\b/i,
      /\bfree\s+(tonight|today|tomorrow|this)/i,
      // next week
      /\bnext week\b/i,
      /\bany one\b/i,
      /\bon\b/i,
      /\bbeers\b/i,
      /\banyone\b/i,
      /\bhang out\b/i,
    ];

    const hasWeakSignal = weakPatterns.some((pattern) =>
      pattern.test(messageLower),
    );

    if (!hasWeakSignal) return false;

    // Use AI to verify weak signals
    console.log(`🤔 Weak proposal signal, verifying with AI: "${message}"`);
    const analysis = await analyzeMessageGemini(message, name);
    return analysis.intent === "PROPOSAL";
  } catch (error) {
    console.error("Error detecting proposal:", error);
    // Safe fallback — only match strong patterns
    const safePatterns = [
      /\blet'?s\s+(go|eat|play|watch|meet|hang|grab)/i,
      /\bhow about\s+(we|going|eating)/i,
      /\bwanna\s+(go|eat|play|hang)/i,
      /\bplaning to\b/i,
      /\bplanned to\b/i,
    ];
    return safePatterns.some((pattern) => pattern.test(message));
  }
}

async function handleProposal(ctx, user, message, name, username, chatId) {
  try {
    let activity = message;

    // Better extraction of activity
    const proposalPhrases = [
      /^let's\s+/i,
      /^lets\s+/i,
      /^let us\s+/i,
      /^how about\s+/i,
      /^want to\s+/i,
      /^wanna\s+/i,
      /^shall we\s+/i,
    ];

    for (const pattern of proposalPhrases) {
      activity = activity.replace(pattern, "");
    }

    activity = activity.trim();
    activity = activity.replace(/^[,\s]+/, "");
    activity = activity.replace(/[?.,!]$/, "");

    if (activity.length > 0) {
      activity = activity.charAt(0).toUpperCase() + activity.slice(1);
    }

    if (activity.length < 2) {
      activity = "hang out";
    }

    const today = new Date().toISOString().split("T")[0];
    const event = await createEvent(activity, today, chatId);
    setCurrentEvent(event.id, chatId);

    // Proposer automatically confirms
    await createConfirmation(user.id, event.id);

    const funnyIntro = getRandomResponse(PROPOSAL_INTRO_RESPONSES, {
      name: escapeMarkdown(name),
      username: username,
      activity: escapeMarkdown(activity),
    });

    const responseText = `${funnyIntro}\n\nWhat Do you Think Guys?`;

    await safeSend(ctx, responseText, getAfterCreationKeyboard(event.id));
  } catch (error) {
    console.error("Error handling proposal:", error);
    await ctx.reply("Sorry, I couldn't create the event. Please try again.");
  }
}

async function handleEventResponse(
  ctx,
  user,
  event,
  message,
  name,
  username,
  chatId,
) {
  try {
    let existingConfirmation;
    try {
      existingConfirmation = await getUserConfirmation(user.id, event.id);
    } catch (error) {
      existingConfirmation = null;
    }

    let analysis;
    try {
      analysis = await analyzeMessageGemini(message, name);
    } catch (error) {
      analysis = getFallbackAnalysis(message, name);
    }

    const allConfirmations = await getEventConfirmations(event.id);
    const confirmedUserIds = new Set(
      allConfirmations?.map((c) => c.user_id) || [],
    );
    const confirmedCount = confirmedUserIds.size;
    const totalUsers = (await getAllUsers(chatId)).length;

    if (analysis.intent === "CONFIRMING" && !existingConfirmation) {
      await createConfirmation(user.id, event.id);
      const newCount = confirmedCount + 1;

      // let vibeResponse;
      // if (newCount === totalUsers && totalUsers > 1) {
      //   vibeResponse = getRandomResponse(EVERYONE_CONFIRMED_RESPONSES, { username });
      // } else {
      //   vibeResponse = getRandomResponse(CONFIRMATION_RESPONSES, { username });
      // }
      const vibeResponse = analysis.response;
      const responseText = `${vibeResponse}\n\n✅ *${escapeMarkdown(name)}* confirmed!\n\n📊 *${newCount} people confirmed so far* 🎉`;
      await safeSend(ctx, responseText, getEventActionKeyboard(event.id, true));
    } else if (analysis.intent === "EXCUSE" && !existingConfirmation) {
      const excuseAttempt = incrementExcuseCount(event.id, user.id);

      if (excuseAttempt <= MAX_EXCUSE_FORCES) {
        // Attempts 1-2: Roast and reject the excuse, try to force them in
        const funnyBlock = analysis.response;
        const attemptsLeft = MAX_EXCUSE_FORCES - excuseAttempt;
        const warningText =
          attemptsLeft > 0
            ? `\n\n⚠️ _${attemptsLeft} more excuse${attemptsLeft > 1 ? "s" : ""} before we give up on you!_`
            : `\n\n⚠️ _Last chance! One more excuse and you're officially OUT!_`;
        const responseText = `😏 ${funnyBlock}\n\n*${escapeMarkdown(name)}* tried to escape with: "${escapeMarkdown(message)}"${warningText}\n\n📊 *${confirmedCount} people are still coming* 🎉`;
        await safeSend(
          ctx,
          responseText,
          getEventActionKeyboard(event.id, false),
        );
      } else {
        // Attempt 3+: Accept the excuse with a final devastating roast
        const finalRoast = getRandomResponse(EXCUSE_ACCEPTED_RESPONSES, {
          username,
          name: escapeMarkdown(name),
        });
        const responseText = `${finalRoast}\n\n❌ *${escapeMarkdown(name)}* is officially *NOT COMING*\n\n📊 *${confirmedCount} people are still coming* (without ${escapeMarkdown(name)} 😢)`;
        await safeSend(
          ctx,
          responseText,
          getEventActionKeyboard(event.id, false),
        );

        console.log(
          `📝 ${name} excused after ${excuseAttempt} attempts for event "${event.title}"`,
        );
      }
    } else if (existingConfirmation && analysis.intent === "CONFIRMING") {
      const hypeResponse = getRandomResponse(DOUBLE_CONFIRMATION_RESPONSES, {
        username,
      });
      const responseText = `${hypeResponse}\n\n*${escapeMarkdown(name)}* is already confirmed! 🔥\n\n📊 *${confirmedCount} people confirmed so far*`;
      await safeSend(ctx, responseText, getEventActionKeyboard(event.id, true));
    } else if (existingConfirmation && analysis.intent === "EXCUSE") {
      const responseText = getRandomResponse(
        ALREADY_CONFIRMED_EXCUSE_RESPONSES,
        {
          name: escapeMarkdown(name),
          event: escapeMarkdown(event.title),
        },
      );
      await safeSend(ctx, responseText, getEventActionKeyboard(event.id, true));
    }
  } catch (error) {
    console.error("Error handling event response:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}
