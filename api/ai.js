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
        ? body.history.slice(-10)
        : [];

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const userId =
      req.headers["x-user-id"] ||
      "default-user";

    let account = usage.get(userId);

    if (!account) {
      account = {
        chatsUsed: 0,
        cooldownUntil: 0
      };

      usage.set(userId, account);
    }

    const now = Date.now();

    if (account.cooldownUntil > now) {
      const hours =
        Math.ceil(
          (account.cooldownUntil - now) /
          (60 * 60 * 1000)
        );

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. " +
          "Your chats return in about " +
          hours +
          " hour(s).",
        chatsUsed: 250,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    if (account.cooldownUntil > 0) {
      account.chatsUsed = 0;
      account.cooldownUntil = 0;
    }

    if (account.chatsUsed >= MAX_AI_CHATS) {
      account.cooldownUntil =
        now + COOLDOWN_MS;

      return res.status(429).json({
        error:
          "You have used your 250 AI chats. " +
          "Your chats return after 2 days.",
        chatsUsed: 250,
        chatsRemaining: 0,
        cooldown: true
      });
    }

    const instructions = [
      "You are LearnAI, a friendly professional AI tutor.",
      "Help students from Grade 1 through Grade 12.",
      "Always try to understand what the student means, even with spelling mistakes or slang.",
      "Answer naturally like a helpful tutor.",
      "Keep simple questions short.",
      "Give detailed explanations when the topic requires them.",
      "Adapt explanations to the student's level.",
      "Explain why answers are correct, not only the answer.",
      "For mathematics, show important steps.",
      "For science, explain what happens and why.",
      "For English, explain grammar and vocabulary clearly.",
      "For chess, explain tactics, strategy and ideas clearly.",
      "You can discuss school subjects, chess, football, basketball, technology and general knowledge.",
      "The student may change subjects at any time.",
      "Use emojis occasionally and naturally.",
      "Do not overuse emojis.",
      "Do not invent facts.",
      "If information may be outdated or current information is needed, use web search.",
      "Keep responses appropriate for students.",
      "Do not provide dangerous or illegal instructions.",
      "Answer in " + language + " unless the student clearly requests another language.",
      "Current subject: " + subject,
      "Current student level: " + level
    ].join("\n");

    const messages = [];

    for (const item of history) {
      if (
        !item ||
        typeof item.content !== "string" ||
        !item.content.trim()
      ) {
        continue;
      }

      messages.push({
        role:
          item.role === "assistant"
            ? "assistant"
            : "user",
        content: item.content
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

    const text =
      await openaiResponse.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error(
        "OPENAI NON-JSON:",
        text
      );

      return res.status(503).json({
        error:
          "LearnAI is temporarily unavailable. Please try again."
      });
    }

    if (!openaiResponse.ok) {
      console.error(
        "OPENAI ERROR:",
        data
      );

      return res.status(503).json({
        error:
          "LearnAI could not answer right now. Please try again."
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
      for (const item of data.output) {
        if (
          item.type === "message" &&
          Array.isArray(item.content)
        ) {
          for (const content of item.content) {
            if (
              content.type === "output_text" &&
              typeof content.text === "string"
            ) {
              answer += content.text;
            }
          }
        }
      }
    }

    if (!answer.trim()) {
      return res.status(503).json({
        error:
          "LearnAI did not return an answer."
      });
    }

    account.chatsUsed += 1;

    if (
      account.chatsUsed >= MAX_AI_CHATS
    ) {
      account.cooldownUntil =
        Date.now() + COOLDOWN_MS;
    }

    return res.status(200).json({
      answer: answer.trim(),
      chatsUsed: account.chatsUsed,
      chatsRemaining:
        MAX_AI_CHATS - account.chatsUsed,
      limit: MAX_AI_CHATS,
      cooldown:
        account.chatsUsed >= MAX_AI_CHATS
    });

  } catch (error) {
    console.error(
      "LEARN AI SERVER ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "LearnAI had a server problem. Please try again."
    });
  }
};
