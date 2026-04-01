import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";
import Groq from "groq-sdk";
import {
  CONFIRMATION_RESPONSES,
  EXCUSE_BLOCK_RESPONSES,
  PROPOSAL_DETECT_RESPONSES
} from "../responses/response.js";

// primary llm
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const MODEL_NAME = config.geminiModel;

// fallback 
const groq = new Groq({ apiKey: config.groqApiKey });
const groqModel = config.groqModel;

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

export async function analyzeMessageGemini(message, userName = "User") {
  // Try Gemini first
  try {
    if (!message || typeof message !== 'string') {
      return fallbackResponse();
    }

    const trimmedMessage = message.length > 300 ? message.substring(0, 300) + "..." : message;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = getAnalysisPrompt(trimmedMessage, userName);

    console.log(`🤖 Sending to Gemini (timeout: 10s)...`);
    
    const result = await timeoutPromise(10000, model.generateContent(prompt));
    const text = result.response.text();
    
    console.log(`✅ Gemini response received`);
    return parseResponse(text);
    
  } catch (error) {
    console.error("Gemini API error:", error.message);
    console.log("🔄 Falling back to Groq...");
    
    // Try Groq as fallback
    try {
      return await analyzeWithGroq(message, userName);
    } catch (groqError) {
      console.error("Groq API error:", groqError.message);
      return getSmartFallback(message, userName);
    }
  }
}

async function analyzeWithGroq(message, userName) {
  const trimmedMessage = message.length > 300 ? message.substring(0, 300) + "..." : message;
  const prompt = getAnalysisPrompt(trimmedMessage, userName);
  
  const completion = await timeoutPromise(10000, groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that analyzes messages and returns ONLY valid JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    model: groqModel, 
    temperature: 0.7,
    max_tokens: 150,
    response_format: { type: "json_object" }
  }));
  
  const text = completion.choices[0]?.message?.content || "";
  console.log(`✅ Groq response received`);
  return parseResponse(text);
}

function getAnalysisPrompt(message, userName) {
  return `
You are analyzing messages in a Telegram group chat. The chat might be english or amharic but your response must be in english. Your task is to classify the intent of the message and generate a response based on that intent.

User: ${userName}
Message: "${message}"

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
  "response": "your very funny and roasting based on their excuse response and forcing and convincing them to show up"
}`;
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
  
  if (lowerMsg.includes('coming') || lowerMsg.includes('yes') || lowerMsg.includes('im in') || 
      lowerMsg.includes('count me') || lowerMsg.includes('lets go') || lowerMsg.includes('im there')) {
    return {
      intent: "CONFIRMING",
      response: getRandomFromArray(CONFIRMATION_RESPONSES, userName)
    };
  }
  
  if (lowerMsg.includes('cant') || lowerMsg.includes('can\'t') || lowerMsg.includes('busy') || 
      lowerMsg.includes('no') || lowerMsg.includes('sorry') || lowerMsg.includes('maybe next')) {
    return {
      intent: "EXCUSE",
      response: getRandomFromArray(EXCUSE_BLOCK_RESPONSES, userName)
    };
  }
  
  if (lowerMsg.includes('let') || lowerMsg.includes('lets') || lowerMsg.includes('how about') || 
      lowerMsg.includes('wanna') || lowerMsg.includes('want to')) {
    return {
      intent: "PROPOSAL",
      response: getRandomFromArray(PROPOSAL_DETECT_RESPONSES, userName)
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

function getRandomFromArray(arr, userName = "") {
  let response = arr[Math.floor(Math.random() * arr.length)];
  response = response.replace(/{userName}/g, userName);
  return response;
}
