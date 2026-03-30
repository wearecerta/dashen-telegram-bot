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

import { analyzeMessage } from "../services/geminiService.js";
import {
  getCurrentEventId,
  setCurrentEvent,
  clearCurrentEvent
} from "../services/reminderServices.js";

// Store active proposals that are waiting for responses
let activeProposal = null;

// Helper function to escape Markdown special characters
function escapeMarkdown(text) {
  if (!text) return '';
  const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = text;
  for (const char of specialChars) {
    escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
  }
  return escaped;
}

// Helper to safely send messages without Markdown issues
async function safeSend(ctx, text, options = {}) {
  try {
    await ctx.reply(text, { ...options, parse_mode: "Markdown" });
  } catch (error) {
    if (error.message.includes("can't parse entities")) {
      console.log("Markdown failed, sending plain text");
      await ctx.reply(text.replace(/[*_`]/g, ''), { parse_mode: undefined });
    } else {
      throw error;
    }
  }
}

export async function handleText(ctx) {
  try {
    // Ignore commands
    if (ctx.message.text.startsWith("/")) return;

    const telegramId = ctx.from.id.toString();
    const name = ctx.from.first_name;
    const username = ctx.from.username || name;
    const message = ctx.message.text;

    console.log(`📝 Processing message from ${name}: "${message}"`);

    // Get or create user
    const user = await findOrCreateUser(telegramId, name);

    // Check if there's an active event
    let eventId = getCurrentEventId();
    let event;

    if (eventId) {
      event = await getEventById(eventId);
    } else {
      event = await getLatestEvent();
      if (event) setCurrentEvent(event.id);
    }

    // If there's an active event, handle confirmations/excuses
    if (event) {
      await handleEventResponse(ctx, user, event, message, name, username);
      return;
    }

    // No active event - check if user is proposing an activity
    const isProposing = await detectProposal(message, name);
    
    if (isProposing) {
      await handleProposal(ctx, user, message, name, username);
    } else {
      // If no event and not a proposal, just respond casually
      const casualResponse = await getCasualResponse(message, name);
      if (casualResponse) {
        await safeSend(ctx, casualResponse);
      }
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
    // Quick keyword check first to avoid unnecessary API calls
    const proposalKeywords = ['let', 'lets', 'let us', 'how about', 'want to', 'wanna', 'shall we', 'plan', 'organize'];
    const messageLower = message.toLowerCase();
    const hasProposalKeyword = proposalKeywords.some(keyword => messageLower.includes(keyword));
    
    if (!hasProposalKeyword) return false;
    
    // Only call Gemini if keyword matches
    const analysis = await analyzeMessage(message, name);
    return analysis.intent === "PROPOSAL" || hasProposalKeyword;
  } catch (error) {
    console.error("Error detecting proposal:", error);
    // Fallback to keyword detection
    const proposalKeywords = ['let', 'lets', 'let us', 'how about', 'want to', 'wanna'];
    return proposalKeywords.some(keyword => message.toLowerCase().includes(keyword));
  }
}

async function handleProposal(ctx, user, message, name, username) {
  try {
    // Extract the activity from the message
    let activity = message;
    
    // Remove proposal keywords
    const proposalKeywords = ['let', 'lets', 'let us', 'how about', 'want to', 'wanna', 'shall we'];
    for (const keyword of proposalKeywords) {
      activity = activity.replace(new RegExp(keyword, 'gi'), '').trim();
    }
    
    // Clean up the activity text
    activity = activity.replace(/[?.,!]$/, '').trim();
    
    // If activity is too short or empty, use a default
    if (activity.length < 2) {
      activity = "hang out";
    }
    
    // Create event with today's date
    const today = new Date().toISOString().split('T')[0];
    const event = await createEvent(activity, today);
    setCurrentEvent(event.id);
    
    // Get all users to tag them
    const allUsers = await getAllUsers();
    const userMentions = allUsers
      .filter(u => u.telegram_id !== ctx.from.id.toString())
      .map(u => `@${u.telegram_id}`)
      .join(' ');
    
    // Proposer automatically confirms
    await createConfirmation(user.id, event.id);
    
    // Get funny responses based on the activity
    const funnyIntro = getFunnyIntro(activity, name, username);
    
    const responseText = `${funnyIntro}\n\n` +
      `🎉 *${escapeMarkdown(name)}* has proposed: *${escapeMarkdown(activity)}* 🎉\n\n` +
      `Who's in? ${userMentions || "everyone!"}\n\n` +
      `Reply with:\n` +
      `✅ "coming" or "yes" to join the fun\n` +
      `❌ "can't" or "excuse" to explain why you're missing out\n` +
      `🤔 or just chat normally!`;
    
    await safeSend(ctx, responseText);
    
    // Store the proposal context
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

async function handleEventResponse(ctx, user, event, message, name, username) {
  try {
    // Check if user already confirmed
    let existingConfirmation;
    try {
      existingConfirmation = await getUserConfirmation(user.id, event.id);
    } catch (error) {
      console.error("Error checking confirmation:", error);
      existingConfirmation = null;
    }
    
    // Analyze message with timeout protection
    let analysis;
    try {
      analysis = await analyzeMessage(message, name);
    } catch (error) {
      console.error("Gemini analysis error:", error);
      // Use keyword-based detection as fallback
      analysis = getFallbackAnalysis(message, name);
    }
    
    // Get all confirmations
    const allConfirmations = await getEventConfirmations(event.id);
    const confirmedUserIds = new Set(allConfirmations?.map(c => c.user_id) || []);
    const confirmedCount = confirmedUserIds.size;
    const totalUsers = (await getAllUsers()).length;
    
    // Handle CONFIRMING
    if (analysis.intent === "CONFIRMING" && !existingConfirmation) {
      await createConfirmation(user.id, event.id);
      const newCount = confirmedCount + 1;
      
      // Get other confirmed users to tag
      const otherConfirmed = allConfirmations
        ?.filter(c => c.user_id !== user.id)
        .map(c => `@${c.users.telegram_id}`) || [];
      
      const othersTag = otherConfirmed.length > 0 ? ` ${otherConfirmed.join(' ')}` : '';
      
      // Generate vibe response
      const vibeResponse = getVibeResponse(name, username, newCount, totalUsers);
      
      const responseText = `${vibeResponse}\n\n` +
        `✅ *${escapeMarkdown(name)}* confirmed!${othersTag}\n\n` +
        `_${newCount} people confirmed so far_ 🎉\n\n` +
        `Who else is coming? 👇`;
      
      await safeSend(ctx, responseText);
      
      // If almost everyone confirmed, send encouragement
      if (newCount >= totalUsers - 1 && totalUsers > 1) {
        await safeSend(ctx, 
          `🎊 *ALMOST EVERYONE IS CONFIRMED!* 🎊\n\n` +
          `Just a few more and we're ready to party! Let's gooooo! 🚀`
        );
      }
      
    } 
    // Handle EXCUSE
    else if (analysis.intent === "EXCUSE" && !existingConfirmation) {
      // Generate funny blocking message
      const funnyBlock = getFunnyBlockMessage(name, username);
      
      // Get confirmed users to encourage them
      const confirmedUsers = allConfirmations
        ?.map(c => `@${c.users.telegram_id}`)
        .join(' ') || '';
      
      const responseText = 
        `😏 ${funnyBlock}\n\n` +
        `*${escapeMarkdown(name)}* tried to escape with: "${escapeMarkdown(message)}"\n\n` +
        `But the party must go on! 🎉\n\n` +
        `${confirmedUsers ? `Already confirmed: ${confirmedUsers}\n\n` : ''}` +
        `Anyone else want to join the fun? ✨`;
      
      await safeSend(ctx, responseText);
      
    } 
    // Already confirmed trying to confirm again
    else if (existingConfirmation && analysis.intent === "CONFIRMING") {
      const hypeResponse = getHypeResponse(name, username);
      const responseText = 
        `${hypeResponse}\n\n` +
        `*${escapeMarkdown(name)}* is so excited they confirmed twice! 🔥\n\n` +
        `That's the energy we need! Who's next? 🚀`;
      
      await safeSend(ctx, responseText);
    } 
    // Already confirmed trying to make excuse
    else if (existingConfirmation && analysis.intent === "EXCUSE") {
      await safeSend(ctx,
        `🤔 Nice try *${escapeMarkdown(name)}*, but you're already locked in for *${escapeMarkdown(event.title)}*!\n\n` +
        `No take backs! The party needs you! 🎉\n\n` +
        `_Your commitment has been noted_ 📝`
      );
    }
    // Neutral messages - respond to questions
    else if (analysis.intent === "NEUTRAL") {
      if (message.toLowerCase().includes('when') || message.toLowerCase().includes('where')) {
        await safeSend(ctx,
          `📅 *${escapeMarkdown(event.title)}* is happening *TODAY*!\n\n` +
          `Location: TBD (suggestions welcome!)\n\n` +
          `Time: Whenever everyone's ready!\n\n` +
          `${confirmedUserIds.size} people confirmed so far! 🎉`
        );
      }
    }
    
  } catch (error) {
    console.error("Error handling event response:", error);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
}

// Fallback analysis using simple keyword matching
function getFallbackAnalysis(message, name) {
  const lowerMsg = message.toLowerCase();
  
  if (lowerMsg.includes('coming') || lowerMsg.includes('yes') || lowerMsg.includes('im in') || 
      lowerMsg.includes('count me') || lowerMsg.includes('lets go') || lowerMsg.includes('im there')) {
    return {
      intent: "CONFIRMING",
      response: `Wuhuu! Let's go ${name}! 🎉`
    };
  }
  
  if (lowerMsg.includes('cant') || lowerMsg.includes('can\'t') || lowerMsg.includes('busy') || 
      lowerMsg.includes('no') || lowerMsg.includes('sorry') || lowerMsg.includes('maybe next')) {
    return {
      intent: "EXCUSE",
      response: `Nice try ${name}, but we'll remember this! 😏`
    };
  }
  
  return {
    intent: "NEUTRAL",
    response: "Got it! 👍"
  };
}

// Helper functions
function getVibeResponse(name, username, confirmedCount, totalUsers) {
  const responses = [
    `WUHUUU LET'S GOOO @${username}! 🚀🎉`,
    `YASSS @${username}! That's the energy we need! 🔥`,
    `@${username} is IN! Party level: 📈📈📈`,
    `@${username} bringing the vibes! Let's gooo! 🕺💃`
  ];
  
  if (confirmedCount === totalUsers && totalUsers > 1) {
    responses.push(`🚨 EVERYONE IS CONFIRMED! 🚨 @${username} completes the squad! 🎉`);
  }
  
  return responses[Math.floor(Math.random() * responses.length)];
}

function getHypeResponse(name, username) {
  const responses = [
    `🔥 DOUBLE CONFIRMED! @${username} is HYPED! 🔥`,
    `@${username} is so ready they confirmed twice! That's dedication! 💪`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function getFunnyBlockMessage(name, username) {
  const funnyBlocks = [
    `Nice excuse @${username}, but we've seen better! 😏`,
    `The excuse committee has reviewed and... DENIED! 🚫`,
    `Your excuse has been logged in the *Hall of Weak Excuses* 🏆 @${username}`,
    `pretends to be convinced ...Nope, not buying it! 😏 @${username}`
  ];
  return funnyBlocks[Math.floor(Math.random() * funnyBlocks.length)];
}

function getFunnyIntro(activity, name, username) {
  const intros = [
    `🍽️ *BREAKING NEWS* 🍽️\n\n${escapeMarkdown(name)} is organizing a ${escapeMarkdown(activity)}!`,
    `🎯 *ATTENTION EVERYONE* 🎯\n\n${escapeMarkdown(name)} has spoken! ${escapeMarkdown(activity)} it is!`,
    `👀 *SOMEONE'S PLANNING SOMETHING* 👀\n\n@${username} wants to ${escapeMarkdown(activity)}!`
  ];
  return intros[Math.floor(Math.random() * intros.length)];
}

async function getCasualResponse(message, name) {
  const casualResponses = [
    `👀 Interesting... ${escapeMarkdown(name)} has thoughts!`,
    `🤔 Hmm, tell me more ${escapeMarkdown(name)}!`,
    `😄 Living for this conversation!`
  ];
  
  if (Math.random() > 0.3) return null;
  return casualResponses[Math.floor(Math.random() * casualResponses.length)];
}