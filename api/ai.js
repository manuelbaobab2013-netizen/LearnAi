```javascript
const MAX_AI_CHATS = 250;
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

// Temporary storage for the 250-chat counter.
const usage = new Map();

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const question = body.question;
    const subject = body.subject || "General";
    const level = body.level || "Grade 6";
    const language = body.language || "English";
    const history = Array.isArray(body.history)
      ? body.history
      : [];

    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    // Identify the user.
    const forwardedFor =
      req.headers["x-forwarded-for"];

    const userId =
      req.headers["x-user-id"] ||
      (forwardedFor
        ? String(forwardedFor).split(",")[0].trim()
        : "default-user");

    let user = usage.get(userId);

    if (!user) {
      user = {
        chatsUsed: 0,
        cooldownUntil: 0
      };

      usage.set(userId, user);
    }

    // Check active 2-day cooldown.
    if (
      user.cooldownUntil > 0 &&
      Date.now() < user.cooldownUntil
    ) {
      const remaining =
        user.cooldownUntil - Date.now();

      const hoursLeft = Math.ceil(
        remaining / (60 * 60 * 1000)
      );

      return res.status(429).json({
        error:
          "You have used your 250 free AI chats. " +
          "Your chats will return in about " +
          hoursLeft +
          " hour(s).",
        limitReached: true,
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    // Reset after 2 days.
    if (
      user.cooldownUntil > 0 &&
      Date.now() >= user.cooldownUntil
    ) {
      user.chatsUsed = 0;
      user.cooldownUntil = 0;
    }

    // Stop at 250 chats.
    if (user.chatsUsed >= MAX_AI_CHATS) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;

      return res.status(429).json({
        error:
          "You have used your 250 free AI chats. " +
          "Your chats will return after 2 days.",
        limitReached: true,
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    // Clean instruction string.
    const instructions = [
      "You are LearnAI, a professional AI tutor.",
      "",
      "Your job is to answer questions naturally, clearly and intelligently.",
      "You help students from Grade 1 through Grade 12.",
      "",
      "PERSONALITY",
      "- Be friendly and natural.",
      "- Understand spelling mistakes and imperfect grammar.",
      "- Understand short messages and slang.",
      "- Focus on what the student means.",
      "- Answer directly.",
      "- Do not ask unnecessary questions.",
      "- If the student asks you to choose one, choose one.",
      "- Do not repeat the student's question.",
      "",
      "EMOJIS",
      "- Use emojis naturally and occasionally.",
      "- Do not use emojis in every response.",
      "- Do not overuse emojis.",
      "",
      "WRITING STYLE",
      "- Use clear normal punctuation.",
      "- Do not overuse commas.",
      "- Do not overuse exclamation marks.",
      "- Do not use semicolons in normal answers.",
      "- Do not randomly use slashes.",
      "- Do not make every answer a long list.",
      "- Use simple words when possible.",
      "- Keep simple answers short.",
      "- Give more detail when the question needs it.",
      "- Make answers feel like a normal conversation.",
      "",
      "STUDENT LEVEL",
      "Current student level: " + level,
      "",
      "Adapt explanations to the student's level.",
      "",
      "Grade 1-3:",
      "Use very simple words and easy examples.",
      "",
      "Grade 4-6:",
      "Use clear school-level explanations and examples.",
      "",
      "Grade 7-9:",
      "Use more detailed explanations and correct subject vocabulary.",
      "",
      "Grade 10-12:",
      "Use advanced explanations, proper terminology and deeper reasoning.",
      "",
      "SUBJECT",
      "Current subject: " + subject,
      "",
      "You can teach mathematics, science, English, history, geography,",
      "computer science, technology, chess, football, basketball,",
      "general knowledge and other subjects.",
      "",
      "TEACHING",
      "- Explain ideas clearly.",
      "- Explain why things work.",
      "- Give examples when useful.",
      "- Show steps when useful.",
      "- Give practice questions when requested.",
      "",
      "For mathematics:",
      "- Show important steps.",
      "- Explain the method.",
      "- Give the final answer clearly.",
      "",
      "For science:",
      "- Explain what happens.",
      "- Explain why it happens.",
      "- Give an everyday example when useful.",
      "",
      "For English:",
      "- Explain grammar and vocabulary clearly.",
      "- Give examples.",
      "",
      "For chess:",
      "- Explain tactics and strategy clearly.",
      "- Do not pretend to see a chess position unless it is provided.",
      "",
      "CURRENT INFORMATION",
      "Use web search when current or specific information is needed.",
      "Never invent facts.",
      "Never pretend to know something you do not know.",
      "",
      "IMPORTANT WEB RULE",
      "Do not show URLs, website links, citations, source lists,",
      "reference links, markdown links or website addresses to the student.",
      "",
      "CONVERSATION",
      "Use previous conversation messages to understand context.",
      "If the question is clear, answer it directly.",
      "",
      "If the student says just pick, pick one, or choose one,",
      "make one clear choice.",
      "",
      "LANGUAGE",
      "Answer in " + language + " unless the student clearly asks for another language.",
      "",
      "SAFETY",
      "Keep responses appropriate for students.",
      "Do not provide dangerous or illegal instructions.",
      "",
      "IMPORTANT",
      "Help the student understand why, not only the answer.",
      "Never make up facts."
    ].join("\n");

    // Keep the latest 10 messages for conversation context.
    const messages = [];

    for (const message of history.slice(-10)) {
      if (!message || !message.content) {
        continue;
      }

      messages.push({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",
        content: String(message.content)
      });
    }

    // Add the new question.
    messages.push({
      role: "user",
      content: question
    });

    // Call OpenAI.
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            "Bearer " + process.env.OPENAI_API_KEY
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          instructions: instructions,
          input: messages,
          tools: [
            {
              type: "web_search"
            }
          ]
        })
      }
    );

    // Read response safely.
    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(
        "OPENAI RETURNED NON-JSON:",
        responseText
      );

      return res.status(503).json({
        error:
          "LearnAI is temporarily unavailable. Please try again."
      });
    }

    // Handle OpenAI errors.
    if (!response.ok) {
      console.error("OPENAI ERROR:", data);

      if (response.status === 429) {
        return res.status(503).json({
          error:
            "LearnAI is busy right now. Please try again later.",
          temporary: true
        });
      }

      return res.status(503).json({
        error:
          "LearnAI could not answer right now. Please try again."
      });
    }

    // Get the answer.
    let answer = data.output_text;

    if (
      !answer &&
      Array.isArray(data.output)
    ) {
      answer = data.output
        .filter(function(item) {
          return item.type === "message";
        })
        .flatMap(function(item) {
          return item.content || [];
        })
        .filter(function(item) {
          return item.type === "output_text";
        })
        .map(function(item) {
          return item.text;
        })
        .filter(Boolean)
        .join("\n");
    }

    if (!answer) {
      console.error(
        "NO AI ANSWER:",
        JSON.stringify(data)
      );

      return res.status(503).json({
        error:
          "LearnAI did not return an answer. Please try again."
      });
    }

    // Only count a chat after a successful AI answer.
    user.chatsUsed += 1;

    // Start the 2-day cooldown after chat 250.
    if (user.chatsUsed >= MAX_AI_CHATS) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;
    }

    return res.status(200).json({
      answer: answer.trim(),
      chatsUsed: user.chatsUsed,
      chatsRemaining:
        MAX_AI_CHATS - user.chatsUsed,
      limit: MAX_AI_CHATS,
      cooldown:
        user.chatsUsed >= MAX_AI_CHATS
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      error:
        "LearnAI had a server problem. Please try again."
    });
  }
}
```
