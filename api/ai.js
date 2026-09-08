```javascript
const MAX_AI_CHATS = 250;
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

// Temporary usage storage.
// This resets if the Vercel server instance restarts.
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

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    const subject =
      typeof body.subject === "string"
        ? body.subject
        : "General";

    const level =
      typeof body.level === "string"
        ? body.level
        : "Grade 6";

    const language =
      typeof body.language === "string"
        ? body.language
        : "English";

    const history =
      Array.isArray(body.history)
        ? body.history
        : [];

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    /*
     * USER IDENTIFICATION
     *
     * If your frontend later sends an account ID,
     * LearnAI can use that instead of the IP address.
     */
    const forwardedFor =
      req.headers["x-forwarded-for"];

    const ip =
      forwardedFor
        ? String(forwardedFor).split(",")[0].trim()
        : "unknown";

    const userId =
      req.headers["x-user-id"] ||
      ip;

    let user = usage.get(userId);

    if (!user) {
      user = {
        chatsUsed: 0,
        cooldownUntil: 0
      };

      usage.set(userId, user);
    }

    /*
     * RESET COOLDOWN
     */
    if (
      user.cooldownUntil > 0 &&
      Date.now() >= user.cooldownUntil
    ) {
      user.chatsUsed = 0;
      user.cooldownUntil = 0;
    }

    /*
     * ACTIVE COOLDOWN
     */
    if (
      user.cooldownUntil > 0 &&
      Date.now() < user.cooldownUntil
    ) {
      const remaining =
        user.cooldownUntil - Date.now();

      const hoursLeft =
        Math.ceil(
          remaining / (60 * 60 * 1000)
        );

      return res.status(429).json({
        error:
          "You have used all 250 AI chats. " +
          "Your chats will return in about " +
          hoursLeft +
          " hour(s).",
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        limit: MAX_AI_CHATS,
        cooldown: true,
        cooldownHours: hoursLeft
      });
    }

    /*
     * 250 CHAT LIMIT
     */
    if (user.chatsUsed >= MAX_AI_CHATS) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;

      return res.status(429).json({
        error:
          "You have used all 250 AI chats. " +
          "Your chats will return after 2 days.",
        chatsUsed: MAX_AI_CHATS,
        chatsRemaining: 0,
        limit: MAX_AI_CHATS,
        cooldown: true
      });
    }

    /*
     * LEARNAI INSTRUCTIONS
     */
    const instructions = [
      "You are LearnAI, a friendly professional AI tutor.",
      "",
      "CORE PURPOSE:",
      "Always try to help the student with what they need.",
      "Be useful, patient, encouraging and respectful.",
      "Do not refuse simply because the question is outside the selected subject.",
      "If the student changes topic, help with the new topic.",
      "",
      "PERSONALITY:",
      "- Be friendly and natural.",
      "- Be patient with mistakes.",
      "- Understand spelling mistakes and imperfect grammar.",
      "- Understand short messages and slang.",
      "- Answer directly.",
      "- Do not ask unnecessary questions.",
      "- If the student asks you to choose one, choose one.",
      "- Do not repeat the student's question unnecessarily.",
      "",
      "EMOJIS:",
      "- Use emojis naturally.",
      "- Do not use emojis in every sentence.",
      "- Use encouraging emojis when appropriate.",
      "- Use funny emojis when something is genuinely funny.",
      "",
      "STUDENT:",
      "Current level: " + level,
      "Current subject: " + subject,
      "Preferred language: " + language,
      "",
      "Adapt explanations to the student's level.",
      "",
      "GRADE 1-3:",
      "Use very simple words and easy examples.",
      "",
      "GRADE 4-6:",
      "Use clear school-level explanations and examples.",
      "",
      "GRADE 7-9:",
      "Use more detailed explanations and correct vocabulary.",
      "",
      "GRADE 10-12:",
      "Use advanced explanations and proper terminology.",
      "",
      "TEACHING:",
      "- Explain the idea clearly.",
      "- Explain why it works.",
      "- Give an example when useful.",
      "- Give steps when useful.",
      "- Give practice questions when requested.",
      "- Never make the student feel stupid for making a mistake.",
      "",
      "MATHEMATICS:",
      "- Show important working.",
      "- Explain the method.",
      "- Check calculations.",
      "- Give the final answer clearly.",
      "",
      "SCIENCE:",
      "- Explain what happens.",
      "- Explain why it happens.",
      "- Use everyday examples when useful.",
      "",
      "ENGLISH:",
      "- Explain grammar clearly.",
      "- Explain vocabulary clearly.",
      "- Give useful examples.",
      "",
      "CHESS:",
      "- Explain tactics and strategy clearly.",
      "- Explain mistakes constructively.",
      "- Never pretend to see a chess position that was not provided.",
      "",
      "LEARNING SUPPORT:",
      "- Encourage the student after good work.",
      "- If the student struggles, explain the mistake and help them improve.",
      "- Do not guess a student's ability or progress.",
      "- Only use actual scores or completed activities when discussing results.",
      "",
      "CURRENT INFORMATION:",
      "Use web search when current or specific information is needed.",
      "Never invent facts.",
      "If you are unsure about a current fact, search for it.",
      "",
      "WEB SEARCH:",
      "Use search when information may have changed recently.",
      "Do not unnecessarily discuss the search process.",
      "Do not show URLs, citations, source lists or website addresses to the student.",
      "",
      "CONVERSATION:",
      "Use the previous messages to understand context.",
      "Remember what the student was discussing.",
      "Keep answers connected to the conversation.",
      "",
      "LANGUAGE:",
      "Answer in " + language + ".",
      "If the student clearly asks for another language, use that language.",
      "",
      "SAFETY:",
      "Keep responses appropriate for students.",
      "Do not provide dangerous or illegal instructions.",
      "When a request is unsafe, stay supportive and provide a safe alternative.",
      "",
      "IMPORTANT:",
      "Help the student understand, not just receive an answer.",
      "Never make up information."
    ].join("\n");

    /*
     * KEEP ONLY RECENT CONVERSATION
     *
     * This saves tokens while preserving context.
     */
    const messages = [];

    for (
      const message of history.slice(-10)
    ) {
      if (
        !message ||
        typeof message.content !== "string" ||
        !message.content.trim()
      ) {
        continue;
      }

      messages.push({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",
        content: message.content
      });
    }

    /*
     * CURRENT QUESTION
     */
    messages.push({
      role: "user",
      content: question
    });

    /*
     * OPENAI REQUEST
     */
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            "Bearer " +
            process.env.OPENAI_API_KEY
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

    /*
     * READ OPENAI RESPONSE SAFELY
     */
    const responseText =
      await openaiResponse.text();

    let data = null;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      console.error(
        "OPENAI NON-JSON RESPONSE:",
        responseText
      );

      return res.status(503).json({
        error:
          "LearnAI is temporarily unavailable. Please try again."
      });
    }

    /*
     * OPENAI ERROR
     */
    if (!openaiResponse.ok) {
      console.error(
        "OPENAI ERROR:",
        JSON.stringify(data)
      );

      if (openaiResponse.status === 429) {
        return res.status(503).json({
          error:
            "LearnAI is busy right now. Please try again later.",
          temporary: true
        });
      }

      return res.status(503).json({
        error:
          "LearnAI could not answer right now. Please try again.",
        temporary: true
      });
    }

    /*
     * GET ANSWER
     */
    let answer =
      typeof data.output_text === "string"
        ? data.output_text
        : "";

    if (
      !answer &&
      Array.isArray(data.output)
    ) {
      const parts = [];

      for (
        const item of data.output
      ) {
        if (
          !item ||
          item.type !== "message" ||
          !Array.isArray(item.content)
        ) {
          continue;
        }

        for (
          const content of item.content
        ) {
          if (
            content &&
            content.type === "output_text" &&
            typeof content.text === "string"
          ) {
            parts.push(content.text);
          }
        }
      }

      answer = parts.join("\n");
    }

    if (!answer.trim()) {
      console.error(
        "OPENAI RETURNED NO ANSWER:",
        JSON.stringify(data)
      );

      return res.status(503).json({
        error:
          "LearnAI did not return an answer. Please try again.",
        temporary: true
      });
    }

    /*
     * COUNT ONLY SUCCESSFUL AI CHATS
     */
    user.chatsUsed += 1;

    /*
     * START 2-DAY COOLDOWN AFTER CHAT 250
     */
    if (
      user.chatsUsed >= MAX_AI_CHATS
    ) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;
    }

    /*
     * SUCCESS
     */
    return res.status(200).json({
      answer: answer.trim(),
      chatsUsed: user.chatsUsed,
      chatsRemaining:
        Math.max(
          0,
          MAX_AI_CHATS -
            user.chatsUsed
        ),
      limit: MAX_AI_CHATS,
      cooldown:
        user.chatsUsed >= MAX_AI_CHATS
    });

  } catch (error) {
    console.error(
      "LEARNAI SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "LearnAI had a server problem. Please try again.",
      temporary: true
    });
  }
}
```
