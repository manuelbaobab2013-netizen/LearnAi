```javascript
const MAX_AI_CHATS = 250;
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

const usage = new Map();

module.exports = async function handler(req, res) {
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

    const forwarded =
      req.headers["x-forwarded-for"];

    const userId =
      req.headers["x-user-id"] ||
      (forwarded
        ? String(forwarded).split(",")[0].trim()
        : "default-user");

    let user = usage.get(userId);

    if (!user) {
      user = {
        chatsUsed: 0,
        cooldownUntil: 0
      };

      usage.set(userId, user);
    }

    if (
      user.cooldownUntil > 0 &&
      Date.now() >= user.cooldownUntil
    ) {
      user.chatsUsed = 0;
      user.cooldownUntil = 0;
    }

    if (
      user.cooldownUntil > 0 &&
      Date.now() < user.cooldownUntil
    ) {
      const hoursLeft = Math.ceil(
        (user.cooldownUntil - Date.now()) /
        (60 * 60 * 1000)
      );

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. " +
          "Your chats return in about " +
          hoursLeft +
          " hour(s).",
        chatsUsed: 250,
        chatsRemaining: 0,
        limit: 250,
        cooldown: true
      });
    }

    if (user.chatsUsed >= MAX_AI_CHATS) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. " +
          "Your chats return after 2 days.",
        chatsUsed: 250,
        chatsRemaining: 0,
        limit: 250,
        cooldown: true
      });
    }

    const instructions = [
      "You are LearnAI, a friendly professional AI tutor.",
      "",
      "Your main purpose is to help students.",
      "Always try to help with what the student needs.",
      "You can help with any reasonable subject or topic.",
      "If the student changes topic, help with the new topic.",
      "",
      "PERSONALITY:",
      "Be friendly, patient, encouraging and natural.",
      "Understand spelling mistakes, short messages and slang.",
      "Never make the student feel stupid for making a mistake.",
      "Answer directly when the question is clear.",
      "Do not ask unnecessary questions.",
      "If the student asks you to choose one, choose one.",
      "",
      "EMOJIS:",
      "Use emojis naturally and occasionally.",
      "Do not put emojis in every sentence.",
      "Use encouraging emojis when appropriate.",
      "",
      "STUDENT LEVEL:",
      "The student's current level is " + level + ".",
      "Adapt explanations to that level.",
      "",
      "SUBJECT:",
      "The selected subject is " + subject + ".",
      "However, help with other topics if the student asks.",
      "",
      "TEACHING:",
      "Explain ideas clearly.",
      "Explain why things work.",
      "Give examples when useful.",
      "Show steps when useful.",
      "Give practice questions when requested.",
      "",
      "MATHEMATICS:",
      "Show important working.",
      "Explain the method.",
      "Check calculations.",
      "Give the final answer clearly.",
      "",
      "SCIENCE:",
      "Explain what happens and why.",
      "Use everyday examples when useful.",
      "",
      "ENGLISH:",
      "Explain grammar and vocabulary clearly.",
      "Give examples.",
      "",
      "CHESS:",
      "Explain tactics, strategy and mistakes clearly.",
      "Never pretend to see a chess position that was not provided.",
      "",
      "LEARNING:",
      "Encourage students after good work.",
      "When they struggle, explain the mistake and help them improve.",
      "Never guess a student's progress.",
      "Only discuss actual results when results are provided.",
      "",
      "CURRENT INFORMATION:",
      "Use web search when current or changing information is needed.",
      "Never invent facts.",
      "",
      "WEB SEARCH:",
      "Do not show URLs, citations or source lists to the student.",
      "",
      "LANGUAGE:",
      "Answer in " + language + ".",
      "If the student clearly requests another language, use it.",
      "",
      "SAFETY:",
      "Keep responses appropriate for students.",
      "Do not provide dangerous or illegal instructions.",
      "When something is unsafe, remain supportive and offer a safe alternative.",
      "",
      "IMPORTANT:",
      "Help the student understand, not just receive an answer.",
      "Never make up information."
    ].join("\n");

    const messages = [];

    for (const message of history.slice(-10)) {
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

    messages.push({
      role: "user",
      content: question
    });

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

    const responseText =
      await openaiResponse.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (error) {
      console.error(
        "OPENAI RESPONSE WAS NOT JSON:",
        responseText
      );

      return res.status(503).json({
        error:
          "LearnAI is temporarily unavailable. Please try again."
      });
    }

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

    let answer =
      typeof data.output_text === "string"
        ? data.output_text
        : "";

    if (
      !answer &&
      Array.isArray(data.output)
    ) {
      const parts = [];

      for (const item of data.output) {
        if (
          !item ||
          item.type !== "message" ||
          !Array.isArray(item.content)
        ) {
          continue;
        }

        for (const content of item.content) {
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
      return res.status(503).json({
        error:
          "LearnAI did not return an answer. Please try again."
      });
    }

    user.chatsUsed += 1;

    if (
      user.chatsUsed >= MAX_AI_CHATS
    ) {
      user.cooldownUntil =
        Date.now() + COOLDOWN_MS;
    }

    return res.status(200).json({
      answer: answer.trim(),
      chatsUsed: user.chatsUsed,
      chatsRemaining:
        Math.max(
          0,
          MAX_AI_CHATS - user.chatsUsed
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
};
```
