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
  deleteConfirmation,
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
  getReschedulePollKeyboard,
} from "../utils/keyboard.js";
import {
  escapeMarkdown,
  getFallbackAnalysis,
  safeSend,
  formatDateHuman,
} from "../utils/helper.js";
import * as chrono from "chrono-node";

// Track excuse attempts per user per event: key = "eventId:userId", value = count
const excuseCounts = new Map();
const userNeutralCount = new Map();
const MAX_EXCUSE_FORCES = 2; // Force them twice, then accept on 3rd attempt for non confirming
const MAX_EXCUSE_FORCES_CONFIRM = 3; // Force them thrice, then accept on 4th attempt for confirming users

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

// Track cancellation attempts after confirming
const cancelCounts = new Map();
function incrementCancelCount(eventId, userId) {
  const key = getExcuseKey(eventId, userId);
  const count = (cancelCounts.get(key) || 0) + 1;
  cancelCounts.set(key, count);
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

    const analysis = await analyzeMessageGemini(message, name);

    if (event) {
      if (analysis.intent === "QUERY") {
        await handleQuery(ctx, event, name, username, chatId);
        return;
      }

      if (analysis.intent === "RESCHEDULE") {
        await handleReschedule(ctx, event, name, username, chatId, analysis);
        return;
      }

      await handleEventResponse(
        ctx,
        user,
        event,
        message,
        name,
        username,
        chatId,
        analysis,
      );
      return;
    }

    if (analysis.intent === "QUERY") {
      await handleQuery(ctx, null, name, username, chatId);
      return;
    }

    if (analysis.intent === "PROPOSAL") {
      await handleProposal(
        ctx,
        user,
        message,
        name,
        username,
        chatId,
        analysis,
      );
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

async function handleQuery(ctx, event, name, username, chatId) {
  if (!event) {
    await safeSend(
      ctx,
      "There are no active plans yet! Why don't you propose something? 💡",
    );
    return;
  }

  const confirmations = await getEventConfirmations(event.id);
  const count = confirmations?.length || 0;

  let responseText = `📍 *Current Plan:* ${escapeMarkdown(event.title)}\n`;
  responseText += `📅 *Date:* ${escapeMarkdown(formatDateHuman(event.event_date))}\n`;
  responseText += `👥 *Total Confirmed:* ${count}\n\n`;

  if (count > 0) {
    const names = confirmations
      .map((c) => escapeMarkdown(c.users?.name || "Someone"))
      .join(", ");
    responseText += `✅ *Who's in:* ${names}`;
  } else {
    responseText += `⭕ *No one has confirmed yet.* Don't be the one to miss out!`;
  }

  await safeSend(ctx, responseText, getEventActionKeyboard(event.id, false));
}

async function handleNeutral(ctx, event, name, username, chatId, analysis) {
  await safeSend(
    ctx,
    analysis.response,
    getEventActionKeyboard(event.id, false),
  );
}

async function handleReschedule(ctx, event, name, username, chatId, analysis) {
  let suggestedDate = analysis?.extracted_date;
  if (!suggestedDate) {
    await safeSend(
      ctx,
      "I didn't catch the new date. Please try again specifying a timeline, like 'can we push it to tomorrow?'.",
    );
    return;
  }

  // Parse with chrono
  const parsedDate = chrono.parseDate(suggestedDate);
  if (parsedDate) {
    suggestedDate = parsedDate.toISOString().split("T")[0];
  } else {
    await safeSend(
      ctx,
      `@${username} I couldn't understand your suggested date. could you tell me the exact date?.`,
    );
    return;
  }

  const allUsers = await getAllUsers(chatId);
  const totalUsers = allUsers?.length || 0;
  const requiredVotes = Math.max(2, Math.floor(totalUsers / 2) + 1);

  const responseText = `${analysis.response}\n\n*${escapeMarkdown(name)}* suggested pushing the plan to *${escapeMarkdown(formatDateHuman(suggestedDate))}*.\n\n_Do we agree?_ (Needs ${requiredVotes} Yes votes)`;

  await safeSend(
    ctx,
    responseText,
    getReschedulePollKeyboard(event.id, suggestedDate),
  );
}

async function handleProposal(
  ctx,
  user,
  message,
  name,
  username,
  chatId,
  analysis = null,
) {
  try {
    let activity = analysis?.activity || message;
    let suggestedDate = analysis?.extracted_date || "Today";

    // Backup manual extraction if LLM failed
    if (!analysis?.activity) {
      // Better extraction of activity
      const proposalPhrases = [
        /^let's\s+/i,
        /^lets\s+/i,
        /^let us\s+/i,
        /^how about\s+/i,
        /^want to\s+/i,
        /^wanna\s+/i,
        /^shall we\s+/i,
        /^anyone\s+down\s+for\s+/i,
        /^who'?s?\s+down\s+for\s+/i,
        /^any\s+takers\s+for\s+/i,
      ];

      for (const pattern of proposalPhrases) {
        activity = activity.replace(pattern, "");
      }

      activity = activity.trim();
      activity = activity.replace(/^[,\s]+/, "");
      activity = activity.replace(/,?(\s+)?any takers\s*\??$/i, "");
      activity = activity.replace(/,?(\s+)?anyone\s*\??$/i, "");
      activity = activity.replace(/[?.,!]$/, "");
    }

    if (activity.length > 0) {
      activity = activity.charAt(0).toUpperCase() + activity.slice(1);
    }

    if (activity.length < 2) {
      activity = "hang out";
    }

    // Default suggested date extraction if AI didn't provide one
    if (suggestedDate === "Today") {
      suggestedDate = new Date().toISOString().split("T")[0];
    } else {
      // Parse human friendy date into ISO format for DB
      const parsedDate = chrono.parseDate(suggestedDate);
      if (parsedDate) {
        suggestedDate = parsedDate.toISOString().split("T")[0];
      }
    }

    const event = await createEvent(activity, suggestedDate, chatId);
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
  analysis,
) {
  try {
    let existingConfirmation;
    try {
      existingConfirmation = await getUserConfirmation(user.id, event.id);
    } catch (error) {
      existingConfirmation = null;
    }

    if (!analysis) {
      try {
        analysis = await analyzeMessageGemini(message, name);
      } catch (error) {
        analysis = getFallbackAnalysis(message, name);
      }
    }

    const allConfirmations = await getEventConfirmations(event.id);
    const confirmedUserIds = new Set(
      allConfirmations?.map((c) => c.user_id) || [],
    );
    const confirmedCount = confirmedUserIds.size;
    const totalUsers = (await getAllUsers(chatId)).length;

    // Reset clarification count if they had a clear intent
    if (analysis.intent !== "NEUTRAL") {
      userNeutralCount.delete(`${chatId}:${user.id}`);
    }

    if (analysis.intent === "CONFIRMING" && !existingConfirmation) {
      await createConfirmation(user.id, event.id);
      confirmedUserIds.add(user.id);
      const newCount = confirmedUserIds.size;

      const allUsers = await getAllUsers(chatId);
      const unconfirmedUsers = allUsers.filter(
        (u) => !confirmedUserIds.has(u.id),
      );

      const vibeResponse = analysis.response;
      let responseText = `${vibeResponse}\n\n✅ *${escapeMarkdown(name)}* confirmed!\n\n`;

      if (unconfirmedUsers.length === 1) {
        const u = unconfirmedUsers[0];
        responseText += `Hey @${u.username}, you are the only one left! Just come, we really want you there! 😊`;
      }

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
      const cancelAttempt = incrementCancelCount(event.id, user.id);

      if (cancelAttempt <= 2) {
        // Attempts 1-2: Roast and deny cancellation
        const attemptsLeft = MAX_EXCUSE_FORCES_CONFIRM - cancelAttempt;
        const warning =
          attemptsLeft === 1
            ? `\n\n⚠️ _One more complaint and I'll actually kick you out._`
            : `\n\n⚠️ _Nice try. Keep crying if you really want out._`;

        const baseResponse = getRandomResponse(
          ALREADY_CONFIRMED_EXCUSE_RESPONSES,
          {
            name: escapeMarkdown(name),
            event: escapeMarkdown(event.title),
          },
        );
        const responseText = `${baseResponse}${warning}`;
        await safeSend(
          ctx,
          responseText,
          getEventActionKeyboard(event.id, true),
        );
      } else {
        // Attempt 3: Accept termination
        await deleteConfirmation(user.id, event.id);
        const responseText = `Fine, *${escapeMarkdown(name)}* cried enough. You are officially OUT of the plan. 🚪👋\n\n📊 *${confirmedCount - 1} people are still coming!*`;
        await safeSend(
          ctx,
          responseText,
          getEventActionKeyboard(event.id, true),
        );
      }
    } else if (analysis.intent === "PROPOSAL") {
      await safeSend(
        ctx,
        `Hold up, *${escapeMarkdown(name)}*! 🛑 We already have an active plan: *${escapeMarkdown(event.title)}*.\n\nPlease cancel or finish the current plan before proposing a new one!`,
        getEventActionKeyboard(event.id, false),
      );
    } else if (analysis.intent === "NEUTRAL") {
      const clarityKey = `${chatId}:${user.id}`;
      const count = userNeutralCount.get(clarityKey) || 0;

      if (count === 0) {
        userNeutralCount.set(clarityKey, 1);
        await safeSend(
          ctx,
          `Hey *${escapeMarkdown(name)}*, what do you mean by that? 🤔 Please clarify if you are IN or OUT for the plan!`,
        );
      } else {
        console.log(`🔇 Ignoring subsequent NEUTRAL message from ${name}`);
      }
    }
  } catch (error) {
    console.error("Error handling event response:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}
