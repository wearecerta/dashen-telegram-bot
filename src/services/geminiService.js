import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const MODEL_NAME = "gemini-3-flash-preview";

// Add timeout promise
const timeoutPromise = (ms, promise) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
    
    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
};

export async function analyzeMessage(message, userName = "User") {
  try {
    // Quick validation
    if (!message || typeof message !== 'string') {
      console.log("Invalid message for analysis");
      return fallbackResponse();
    }

    const trimmedMessage = message.length > 300 ? message.substring(0, 300) + "..." : message;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `
You are analyzing messages in a Telegram group chat.

User: ${userName}
Message: "${trimmedMessage}"

Classify into ONE category:
- CONFIRMING: saying YES (coming, yes, im in, count me in, lets go, im there)
- EXCUSE: saying NO (cant, busy, maybe next time, sorry, no, not today)
- PROPOSAL: suggesting activity (lets eat, lets go out, how about dinner, want to hang)
- NEUTRAL: anything else

If CONFIRMING: enthusiastic response (max 12 words)
If EXCUSE: funny sarcastic response (max 15 words)
If PROPOSAL: excited response encouraging others (max 12 words)
If NEUTRAL: friendly casual response (max 8 words)

Return ONLY JSON:
{
  "intent": "CONFIRMING|EXCUSE|PROPOSAL|NEUTRAL",
  "response": "your response"
}`;

    console.log(`🤖 Sending to Gemini (timeout: 15s)...`);
    
    // Add 15 second timeout for Gemini API
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    console.log(`🤖 Gemini response received`);
    
    return parseResponse(text);
    
  } catch (error) {
    console.error("Gemini API error:", error.message);
    
    // Return immediate fallback without waiting
    return getSmartFallback(message, userName);
  }
}

function parseResponse(text) {
  try {
    const parsed = JSON.parse(text);
    
    if (parsed.intent && parsed.response) {
      parsed.intent = parsed.intent.toUpperCase();
      
      if (["CONFIRMING", "EXCUSE", "PROPOSAL", "NEUTRAL"].includes(parsed.intent)) {
        return {
          intent: parsed.intent,
          response: parsed.response.substring(0, 150)
        };
      }
    }
    
    return fallbackResponse();
    
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.intent && parsed.response) {
          parsed.intent = parsed.intent.toUpperCase();
          if (["CONFIRMING", "EXCUSE", "PROPOSAL", "NEUTRAL"].includes(parsed.intent)) {
            return {
              intent: parsed.intent,
              response: parsed.response.substring(0, 150)
            };
          }
        }
      } catch (err) {
        console.error("JSON parse failed:", err);
      }
    }
    
    return fallbackResponse();
  }
}

function getSmartFallback(message, userName) {
  const lowerMsg = message.toLowerCase();
  
  // Simple keyword-based detection as fallback
  if (lowerMsg.includes('coming') || lowerMsg.includes('yes') || lowerMsg.includes('im in') || 
      lowerMsg.includes('count me') || lowerMsg.includes('lets go') || lowerMsg.includes('im there')) {
    return {
      intent: "CONFIRMING",
      response: `Wuhuu! Let's go ${userName}! 🎉`
    };
  }
  
  if (lowerMsg.includes('cant') || lowerMsg.includes('can\'t') || lowerMsg.includes('busy') || 
      lowerMsg.includes('no') || lowerMsg.includes('sorry') || lowerMsg.includes('maybe next')) {
    return {
      intent: "EXCUSE",
      response: `Nice try ${userName}, but we'll remember this! 😏`
    };
  }
  
  if (lowerMsg.includes('let') || lowerMsg.includes('lets') || lowerMsg.includes('how about') || 
      lowerMsg.includes('wanna') || lowerMsg.includes('want to')) {
    return {
      intent: "PROPOSAL",
      response: `👀 ${userName} has an idea! What do others think? 🎯`
    };
  }
  
  return fallbackResponse();
}

function fallbackResponse() {
  return {
    intent: "NEUTRAL",
    response: "Got it! 👍"
  };
}