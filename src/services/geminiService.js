import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";
import Groq from "groq-sdk";
import {
  CONFIRMATION_RESPONSES,
  EXCUSE_BLOCK_RESPONSES,
  PROPOSAL_DETECT_RESPONSES,
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
      },
    );
  });
};

export async function analyzeMessageGemini(message, userName = "User") {
  // Try Gemini first
  try {
    if (!message || typeof message !== "string") {
      return fallbackResponse();
    }

    const lowerMsg = message.toLowerCase().trim();
    if (lowerMsg.length < 5) return fallbackResponse();

    const trimmedMessage =
      message.length > 300 ? message.substring(0, 300) + "..." : message;
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
  const trimmedMessage =
    message.length > 300 ? message.substring(0, 300) + "..." : message;
  const prompt = getAnalysisPrompt(trimmedMessage, userName);

  // Fallback models in case the primary groq model hits a rate limit
  const fallbackModels = [
    groqModel,
    "openai/gpt-oss-120b",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ];

  // Remove duplicates
  const modelsToTry = [...new Set(fallbackModels)];

  for (const currentModel of modelsToTry) {
    try {
      const completion = await timeoutPromise(
        10000,
        groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that analyzes messages and returns ONLY valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          model: currentModel,
          temperature: 0.7,
          max_tokens: 150,
          response_format: { type: "json_object" },
        }),
      );

      const text = completion.choices[0]?.message?.content || "";
      console.log(`✅ Groq response received using model: ${currentModel}`);
      return parseResponse(text);
    } catch (error) {
      console.error(
        `⚠️ Groq error with model ${currentModel}: ${error.message}`,
      );
      // Continue to try the next model
    }
  }

  throw new Error("All Groq fallback models failed.");
}

function getAnalysisPrompt(message, userName) {
  return `
You are analyzing messages in a Telegram group chat. The chat might be english or amharic but your response must be in english. Your task is to classify the intent of the message and generate a response based on that intent.

User: ${userName}
Message: "${message}"

Classify into ONE category:
- CONFIRMING: saying YES (coming, yes, im in, count me in, lets go, im there)
- EXCUSE: saying NO (cant, busy, maybe next time, sorry, no, not today)
- PROPOSAL: suggesting a completely NEW activity or plan when none is established (lets eat, lets go out, beers on me, anyone down for, how about dinner)
- RESCHEDULE: suggesting to change the date or time of the existing plan (e.g., "let's make it on Saturday", "push it", "make it tomorrow", "can we do friday instead", "postpond")
- QUERY: asking specifically about details of the CURRENT PLAN or trip schedule (when is it, where, what time, what's the plan, are we going). Do NOT classify as QUERY if they are asking about random things (e.g. physical objects, questions unrelated to hanging out) - those must be OFF_TOPIC.
- NEUTRAL: unrecognized language, meaning or some thing that you can not realy understand or vague response or anything else talking about the plan but not confirming or denying or asking a specific query (still on-topic).
- OFF_TOPIC: talking about unrelated subjects

If CONFIRMING: enthusiastic and encouraging response (max 12 words)
If EXCUSE: very funny sarcastic and roasting response (max 15 words)
If PROPOSAL: excited response encouraging others (max 12 words)
If RESCHEDULE: helpful response proposing a vote to change the date (max 12 words)
If QUERY: helpful response confirming we have a plan or checking details (max 12 words)
If NEUTRAL: say nothing

For PROPOSAL or RESCHEDULE, also extract the suggested date/time if mentioned (e.g., "beers", "next Friday", "tomorrow").

Return ONLY JSON:
{
  "intent": "CONFIRMING|EXCUSE|PROPOSAL|RESCHEDULE|QUERY|NEUTRAL|OFF_TOPIC",
  "response": "your funny or helpful response",
  "activity": "clean short activity name (e.g., 'Beers', 'Movie Night', 'Gym') - PROPOSAL only",
  "extracted_date": "extracted date/time (PROPOSAL/RESCHEDULE only, e.g., 'next Tuesday', 'tomorrow at 8pm')"
}`;
}

function parseResponse(text) {
  try {
    const parsed = JSON.parse(text);

    if (parsed.intent && parsed.response) {
      parsed.intent = parsed.intent.toUpperCase();

      if (
        [
          "CONFIRMING",
          "EXCUSE",
          "PROPOSAL",
          "RESCHEDULE",
          "QUERY",
          "NEUTRAL",
          "OFF_TOPIC",
        ].includes(parsed.intent)
      ) {
        return {
          intent: parsed.intent,
          response: parsed.response ? parsed.response.substring(0, 150) : "",
          activity: parsed.activity,
          extracted_date: parsed.extracted_date,
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
          if (
            [
              "CONFIRMING",
              "EXCUSE",
              "PROPOSAL",
              "RESCHEDULE",
              "QUERY",
              "NEUTRAL",
              "OFF_TOPIC",
            ].includes(parsed.intent)
          ) {
            return {
              intent: parsed.intent,
              response: parsed.response
                ? parsed.response.substring(0, 150)
                : "",
              activity: parsed.activity,
              extracted_date: parsed.extracted_date,
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
      response: getRandomFromArray(CONFIRMATION_RESPONSES, userName),
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
      response: getRandomFromArray(EXCUSE_BLOCK_RESPONSES, userName),
    };
  }

  if (
    lowerMsg.includes("push") ||
    lowerMsg.includes("reschedule") ||
    lowerMsg.includes("instead") ||
    lowerMsg.includes("can we do") ||
    lowerMsg.includes("make it on") ||
    lowerMsg.includes("delay") ||
    lowerMsg.includes("move it to")
  ) {
    return {
      intent: "RESCHEDULE",
      response: "A date change? Let me ask the others. 🤔",
    };
  }

  if (
    lowerMsg.includes("let") ||
    lowerMsg.includes("lets") ||
    lowerMsg.includes("how about") ||
    lowerMsg.includes("wanna") ||
    lowerMsg.includes("want to") ||
    lowerMsg.includes("anyone") ||
    lowerMsg.includes("anybody") ||
    lowerMsg.includes("down for") ||
    lowerMsg.includes("who's up") ||
    lowerMsg.includes("who is up") ||
    lowerMsg.includes("takers") ||
    lowerMsg.includes("on me")
  ) {
    return {
      intent: "PROPOSAL",
      response: getRandomFromArray(PROPOSAL_DETECT_RESPONSES, userName),
    };
  }

  if (
    lowerMsg.includes("when") ||
    lowerMsg.includes("what time") ||
    lowerMsg.includes("where") ||
    lowerMsg.includes("date") ||
    lowerMsg.includes("what is the plan") ||
    lowerMsg.includes("are we going") ||
    lowerMsg.includes("what's the plan")
  ) {
    return {
      intent: "QUERY",
      response: "Checking the details for you! 🕵️‍♂️",
    };
  }

  return fallbackResponse();
}

function fallbackResponse() {
  return {
    intent: "OFF_TOPIC",
    response: "",
  };
}

function getRandomFromArray(arr, userName = "") {
  let response = arr[Math.floor(Math.random() * arr.length)];
  response = response.replace(/{userName}/g, userName);
  return response;
}
