import {
  findOrCreateUser,
  getLatestEvent,
  getEventById,
  createEvent,
  createConfirmation,
  getUserConfirmation,
  getConfirmationCount,
  getEventConfirmations,
  getAllUsers
} from "../db/model.js";

import { analyzeMessageGemini } from "../services/geminiService.js";
import {
  PROPOSAL_INTRO_RESPONSES,
  CONFIRMATION_RESPONSES,
  EVERYONE_CONFIRMED_RESPONSES,
  DOUBLE_CONFIRMATION_RESPONSES,
  EXCUSE_BLOCK_RESPONSES,
  ALREADY_CONFIRMED_EXCUSE_RESPONSES,
  HYPE_RESPONSES,
  getRandomResponse
} from "../responses/response.js";

import {
  getCurrentEventId,
  setCurrentEvent
} from "../services/reminderServices.js";

import { 
  getEventActionKeyboard, 
  getAfterCreationKeyboard
} from "../utils/keyboard.js";
import { escapeMarkdown, getFallbackAnalysis, safeSend } from "../utils/helper.js";

let activeProposal = null;


export async function handleText(ctx) {
  try {
    if (ctx.message.text.startsWith("/")) return;

    // Get chat ID for isolation
    const chatId = ctx.message.chat.id.toString();
    const telegramId = ctx.from.id.toString();
    const name = ctx.from.first_name;
    const username = ctx.from.username || name;
    const message = ctx.message.text;

    console.log(`📝 Processing message in chat ${chatId} from ${name}: "${message}"`);

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
      await handleEventResponse(ctx, user, event, message, name, username, chatId);
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
    const proposalKeywords = ['let', 'lets', 'let us', 'how about', 'want to', 'wanna', 'shall we', 'plan', 'organize'];
    const messageLower = message.toLowerCase();
    const hasProposalKeyword = proposalKeywords.some(keyword => messageLower.includes(keyword));
    
    if (!hasProposalKeyword) return false;
    
    const analysis = await analyzeMessageGemini(message, name);
    return analysis.intent === "PROPOSAL" || hasProposalKeyword;
  } catch (error) {
    console.error("Error detecting proposal:", error);
    const proposalKeywords = ['let', 'lets', 'let us', 'how about', 'want to', 'wanna'];
    return proposalKeywords.some(keyword => message.toLowerCase().includes(keyword));
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
      /^shall we\s+/i
    ];
    
    for (const pattern of proposalPhrases) {
      activity = activity.replace(pattern, '');
    }
    
    activity = activity.trim();
    activity = activity.replace(/^[,\s]+/, '');
    activity = activity.replace(/[?.,!]$/, '');
    
    if (activity.length > 0) {
      activity = activity.charAt(0).toUpperCase() + activity.slice(1);
    }
    
    if (activity.length < 2) {
      activity = "hang out";
    }
    
    const today = new Date().toISOString().split('T')[0];
    const event = await createEvent(activity, today, chatId);
    setCurrentEvent(event.id, chatId);
    
    // Proposer automatically confirms
    await createConfirmation(user.id, event.id);
    
    const funnyIntro = getRandomResponse(PROPOSAL_INTRO_RESPONSES, {
      name: escapeMarkdown(name),
      username: username,
      activity: escapeMarkdown(activity)
    });
    
    const responseText = `${funnyIntro}\n\nWhat Do you Think Guys?`;
    
    await safeSend(ctx, responseText, getAfterCreationKeyboard(event.id));
    
    activeProposal = {
      eventId: event.id,
      proposer: name,
      activity: activity,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error("Error handling proposal:", error);
    await ctx.reply("Sorry, I couldn't create the event. Please try again.");
  }
}

async function handleEventResponse(ctx, user, event, message, name, username, chatId) {
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
    const confirmedUserIds = new Set(allConfirmations?.map(c => c.user_id) || []);
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
    } 
    else if (analysis.intent === "EXCUSE" && !existingConfirmation) {
      const funnyBlock = analysis.response/*getRandomResponse(EXCUSE_BLOCK_RESPONSES, { username })*/;
      const responseText = `😏 ${funnyBlock}\n\n*${escapeMarkdown(name)}* tried to escape with: "${escapeMarkdown(message)}"\n\n📊 *${confirmedCount} people are still coming* 🎉`;
      await safeSend(ctx, responseText, getEventActionKeyboard(event.id, false));
    } 
    else if (existingConfirmation && analysis.intent === "CONFIRMING") {
      const hypeResponse = analysis.response/* getRandomResponse(DOUBLE_CONFIRMATION_RESPONSES, { username });*/
      const responseText = `${hypeResponse}\n\n*${escapeMarkdown(name)}* is already confirmed! 🔥\n\n📊 *${confirmedCount} people confirmed so far*`;
      await safeSend(ctx, responseText, getEventActionKeyboard(event.id, true));
    }
    else if (existingConfirmation && analysis.intent === "EXCUSE") {
      const responseText = analysis.response/*getRandomResponse(ALREADY_CONFIRMED_EXCUSE_RESPONSES, {
        name: escapeMarkdown(name),
        event: escapeMarkdown(event.title)
      });*/
      await safeSend(ctx, responseText, getEventActionKeyboard(event.id, true));
    }
    
  } catch (error) {
    console.error("Error handling event response:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}

